import type {
  Metric,
  StrategyPositionKey,
  StrategyWeights,
  Weights,
} from '../../infrastructure/database/entities/valuation-strategy-version.entity';
import type { NormalizationBounds } from '../../infrastructure/database/entities/quote-run.entity';
import type { BreakdownItem } from '../../infrastructure/database/entities/player-quote.entity';

export const PERCENTILE_METRICS = [
  'goals',
  'assists',
  'shots',
  'keyPasses',
  'dribbles',
  'tackles',
  'rating',
] as const satisfies readonly Metric[];

const PER_GAME_METRICS: ReadonlySet<Metric> = new Set(['shots', 'keyPasses', 'dribbles', 'tackles']);

const BREAKDOWN_ORDER: readonly Metric[] = [...PERCENTILE_METRICS, 'absence', 'worldReputation'];

const LOWER_PERCENTILE = 0.05;
const UPPER_PERCENTILE = 0.95;

export type ProfileKey = 'GENERAL' | StrategyPositionKey;

export interface PlayerMetricsRow {
  playerId: string;
  position: string;
  leagueId: number;
  matchesPlayed: number | null;
  goals: number;
  assists: number;
  shots: number;
  keyPasses: number;
  dribbles: number;
  tackles: number;
  rating: number;
  worldReputation: number | null;
}

export interface ScoringConfig {
  weights: StrategyWeights;
  baseValue: number;
  scaleFactor: number;
  minPrice: number;
  defaultReputation: number;
}

export interface CalculatedQuote {
  playerId: string;
  score: number;
  rawScore: number;
  price: number;
  positionProfile: ProfileKey;
  positiveWeightSum: number;
  breakdown: BreakdownItem[];
  usedDefaultReputation: boolean;
  missingMatchesPlayed: boolean;
}

export interface MetricValue {
  raw: number | null;
  normalized: number;
}

export type NormalizedMetrics = Record<Metric, MetricValue>;

export function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = p * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

/** Valor que se usa en el cálculo: las métricas por partido valen 0 sin dato de partidos. */
function effectiveValue(row: PlayerMetricsRow, metric: (typeof PERCENTILE_METRICS)[number]): number {
  if (row.matchesPlayed === null && PER_GAME_METRICS.has(metric)) return 0;
  return row[metric];
}

/** Percentiles 5 y 95 de cada métrica de rendimiento sobre todo el lote (research #4). */
export function computeBounds(rows: readonly PlayerMetricsRow[]): NormalizationBounds {
  const bounds: NormalizationBounds = {};
  for (const metric of PERCENTILE_METRICS) {
    const values = rows.map((row) => effectiveValue(row, metric));
    bounds[metric] = {
      p5: round(percentile(values, LOWER_PERCENTILE), 6),
      p95: round(percentile(values, UPPER_PERCENTILE), 6),
    };
  }
  return bounds;
}

/** Máximo de partidos jugados por liga en el lote (research #5). */
export function computeLeagueMaxMatches(rows: readonly PlayerMetricsRow[]): Map<number, number> {
  const max = new Map<number, number>();
  for (const row of rows) {
    if (row.matchesPlayed === null) continue;
    max.set(row.leagueId, Math.max(max.get(row.leagueId) ?? 0, row.matchesPlayed));
  }
  return max;
}

export function normalizeByBounds(value: number, bounds: { p5: number; p95: number }): number {
  const range = bounds.p95 - bounds.p5;
  if (range <= 1e-12) return 0;
  return Math.max(0, (value - bounds.p5) / range);
}

export function normalizeRow(
  row: PlayerMetricsRow,
  bounds: NormalizationBounds,
  leagueMaxMatches: ReadonlyMap<number, number>,
  defaultReputation: number,
): { values: NormalizedMetrics; usedDefaultReputation: boolean; missingMatchesPlayed: boolean } {
  const values = {} as NormalizedMetrics;

  for (const metric of PERCENTILE_METRICS) {
    const metricBounds = bounds[metric] ?? { p5: 0, p95: 0 };
    values[metric] = {
      raw: row[metric],
      normalized: normalizeByBounds(effectiveValue(row, metric), metricBounds),
    };
  }

  const missingMatchesPlayed = row.matchesPlayed === null;
  const leagueMax = leagueMaxMatches.get(row.leagueId) ?? 0;
  values.absence = {
    raw: row.matchesPlayed,
    normalized:
      missingMatchesPlayed || leagueMax === 0
        ? 0
        : clamp01(1 - (row.matchesPlayed as number) / leagueMax),
  };

  const usedDefaultReputation = row.worldReputation === null;
  const reputation = row.worldReputation ?? defaultReputation;
  values.worldReputation = { raw: reputation, normalized: clamp01(reputation / 100) };

  return { values, usedDefaultReputation, missingMatchesPlayed };
}

export function selectProfile(
  position: string,
  weights: StrategyWeights,
): { profile: ProfileKey; weights: Weights } {
  const byPosition = weights.byPosition?.[position as StrategyPositionKey];
  if (byPosition) return { profile: position as StrategyPositionKey, weights: byPosition };
  return { profile: 'GENERAL', weights: weights.general };
}

export function scoreFromNormalized(
  values: NormalizedMetrics,
  weights: Weights,
): { score: number; rawScore: number; positiveWeightSum: number; breakdown: BreakdownItem[] } {
  const positiveWeightSum = Object.values(weights).reduce(
    (sum, weight) => (weight !== undefined && weight > 0 ? sum + weight : sum),
    0,
  );

  const breakdown: BreakdownItem[] = BREAKDOWN_ORDER.map((metric) => {
    const weight = weights[metric] ?? 0;
    const { raw, normalized } = values[metric];
    const contribution = positiveWeightSum > 0 ? (weight * normalized) / positiveWeightSum : 0;
    return {
      metric,
      raw,
      normalized: round(normalized, 6),
      weight,
      contribution: round(contribution, 6),
    };
  });

  const rawScore = breakdown.reduce((sum, item) => sum + item.contribution, 0);
  return {
    // Piso en 0, sin tope superior: el score solo difiere de `rawScore` cuando éste es negativo.
    score: round(Math.max(0, rawScore), 4),
    rawScore: round(rawScore, 4),
    positiveWeightSum: round(positiveWeightSum, 4),
    breakdown,
  };
}

/** `max(minPrice, round(baseValue + score × scaleFactor))`, en créditos enteros (FR-002). */
export function priceFromScore(
  score: number,
  config: Pick<ScoringConfig, 'baseValue' | 'scaleFactor' | 'minPrice'>,
): number {
  return Math.max(config.minPrice, Math.round(config.baseValue + score * config.scaleFactor));
}

/** Calcula la cotización de todo el lote con una versión de estrategia. */
export function calculateQuotes(
  rows: readonly PlayerMetricsRow[],
  config: ScoringConfig,
): { quotes: CalculatedQuote[]; bounds: NormalizationBounds } {
  const bounds = computeBounds(rows);
  const leagueMaxMatches = computeLeagueMaxMatches(rows);

  const quotes = rows.map((row) => {
    const { values, usedDefaultReputation, missingMatchesPlayed } = normalizeRow(
      row,
      bounds,
      leagueMaxMatches,
      config.defaultReputation,
    );
    const { profile, weights } = selectProfile(row.position, config.weights);
    const result = scoreFromNormalized(values, weights);

    return {
      playerId: row.playerId,
      score: result.score,
      rawScore: result.rawScore,
      price: priceFromScore(result.score, config),
      positionProfile: profile,
      positiveWeightSum: result.positiveWeightSum,
      breakdown: result.breakdown,
      usedDefaultReputation,
      missingMatchesPlayed,
    };
  });

  return { quotes, bounds };
}
