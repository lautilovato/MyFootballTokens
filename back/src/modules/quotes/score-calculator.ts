/**
 * Cálculo del score y la cotización de los jugadores (07-cotizacion, research #4–#7).
 *
 * Función pura: sin NestJS, sin inyección, sin base de datos (constitución §7, excepción de
 * utilidades puras). Todo lo que necesita entra por parámetro, de modo que las fórmulas de la
 * spec —incluido su ejemplo trabajado de 724 créditos— se verifican sin levantar nada.
 *
 * Los imports son solo de tipos: cargar las entidades en runtime arrastraría los decoradores
 * de MikroORM.
 */
import type {
  Metric,
  StrategyPositionKey,
  StrategyWeights,
  Weights,
} from '../../infrastructure/database/entities/valuation-strategy-version.entity';
import type { NormalizationBounds } from '../../infrastructure/database/entities/quote-run.entity';
import type { BreakdownItem } from '../../infrastructure/database/entities/player-quote.entity';

/** Métricas de rendimiento que se normalizan por percentiles contra el universo del lote. */
export const PERCENTILE_METRICS = [
  'goals',
  'assists',
  'shots',
  'keyPasses',
  'dribbles',
  'tackles',
  'rating',
] as const satisfies readonly Metric[];

/** Métricas expresadas por partido: valen 0 si no se sabe cuántos partidos jugó (edge case). */
const PER_GAME_METRICS: ReadonlySet<Metric> = new Set(['shots', 'keyPasses', 'dribbles', 'tackles']);

/** Orden fijo del desglose: el mismo para todas las cotizaciones. */
const BREAKDOWN_ORDER: readonly Metric[] = [...PERCENTILE_METRICS, 'absence', 'worldReputation'];

const LOWER_PERCENTILE = 0.05;
const UPPER_PERCENTILE = 0.95;

/** Perfil de pesos aplicado. Coincide con el enum `PositionProfile` de la entidad. */
export type ProfileKey = 'GENERAL' | StrategyPositionKey;

/** Lo que el cálculo necesita de un jugador, ya convertido a números. */
export interface PlayerMetricsRow {
  playerId: string;
  /** GK, DF, MF, FW o UNKNOWN. */
  position: string;
  /** Liga del equipo: la ausencia se mide contra el máximo de partidos de la misma liga. */
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

/** La parte de una versión de estrategia que interviene en el cálculo. */
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

/**
 * Valor de una métrica para un jugador: el dato de origen y su versión normalizada. La
 * normalizada es ≥ 0 y NO tiene tope: un valor por encima del percentil 95 supera 1 (la
 * ausencia y la reputación sí están acotadas a [0,1]).
 */
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

/** Percentil `p` (0–1) por interpolación lineal. `values` no necesita venir ordenado. */
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

/**
 * `(x − p5) / (p95 − p5)`, con piso en 0 y SIN tope superior: el p5 y el p95 marcan la escala
 * de referencia (0 y 1), pero quien los supera sigue sumando, de modo que el precio no se
 * amontona en un máximo. Si la métrica no varía en el lote, vale 0 para todos: no hay nada que
 * distinguir y dividir por cero distorsionaría el resto.
 */
export function normalizeByBounds(value: number, bounds: { p5: number; p95: number }): number {
  const range = bounds.p95 - bounds.p5;
  if (range <= 1e-12) return 0;
  return Math.max(0, (value - bounds.p5) / range);
}

/** Lleva todas las métricas de un jugador a la escala de referencia (0 = p5, 1 = p95). */
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

  // Ausencia = qué parte de lo que se jugó en su liga se perdió. Sin dato de partidos no se
  // penaliza; con una liga en la que nadie jugó, tampoco.
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

/** El perfil de la posición si la estrategia lo define; si no, el general (research #7). */
export function selectProfile(
  position: string,
  weights: StrategyWeights,
): { profile: ProfileKey; weights: Weights } {
  const byPosition = weights.byPosition?.[position as StrategyPositionKey];
  if (byPosition) return { profile: position as StrategyPositionKey, weights: byPosition };
  return { profile: 'GENERAL', weights: weights.general };
}

/**
 * Suma ponderada re-escalada por la suma de pesos positivos `S⁺` (FR-007). Cada contribución
 * ya va dividida por `S⁺`, así la suma del desglose es exactamente `rawScore` (FR-002b).
 */
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
