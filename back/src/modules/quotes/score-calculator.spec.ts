import type { StrategyWeights } from '../../infrastructure/database/entities/valuation-strategy-version.entity';
import {
  NormalizedMetrics,
  PlayerMetricsRow,
  ScoringConfig,
  calculateQuotes,
  computeBounds,
  normalizeByBounds,
  percentile,
  priceFromScore,
  scoreFromNormalized,
  selectProfile,
} from './score-calculator';

// Pesos de performance sembrados por la migración (data-model.md «Valores sembrados»).
const PERFORMANCE: StrategyWeights = {
  general: {
    goals: 0.25, assists: 0.15, shots: 0.1, keyPasses: 0.1, dribbles: 0.1, tackles: 0.1,
    rating: 0.2, absence: -0.1,
  },
  byPosition: {
    DF: {
      goals: 0.05, assists: 0.05, keyPasses: 0.1, dribbles: 0.05, tackles: 0.4, rating: 0.35,
      absence: -0.1,
    },
  },
};

const CONFIG: ScoringConfig = {
  weights: PERFORMANCE,
  baseValue: 100,
  scaleFactor: 900,
  minPrice: 10,
  defaultReputation: 20,
};

function normalized(values: Partial<Record<keyof NormalizedMetrics, number>>): NormalizedMetrics {
  const metrics = [
    'goals', 'assists', 'shots', 'keyPasses', 'dribbles', 'tackles', 'rating', 'absence',
    'worldReputation',
  ] as const;
  return Object.fromEntries(
    metrics.map((m) => [m, { raw: null, normalized: values[m] ?? 0 }]),
  ) as NormalizedMetrics;
}

function row(overrides: Partial<PlayerMetricsRow> & { playerId: string }): PlayerMetricsRow {
  return {
    position: 'FW',
    leagueId: 1,
    matchesPlayed: 30,
    goals: 10,
    assists: 5,
    shots: 2,
    keyPasses: 1.5,
    dribbles: 1,
    tackles: 0.5,
    rating: 7,
    worldReputation: null,
    ...overrides,
  };
}

function sumContributions(breakdown: { contribution: number }[]): number {
  return breakdown.reduce((sum, item) => sum + item.contribution, 0);
}

describe('score-calculator', () => {
  describe('ejemplo trabajado de la spec («Cómo se calcula el score»)', () => {
    it('reproduce score 0,693 y precio de 724 créditos para el delantero', () => {
      const values = normalized({
        goals: 0.9, assists: 0.6, shots: 0.8, keyPasses: 0.5, dribbles: 0.7, tackles: 0.2,
        rating: 0.85, absence: 0.12,
      });

      const result = scoreFromNormalized(values, PERFORMANCE.general);

      expect(result.positiveWeightSum).toBe(1);
      expect(result.score).toBe(0.693);
      expect(priceFromScore(result.score, CONFIG)).toBe(724);
      expect(result.breakdown.find((b) => b.metric === 'absence')?.contribution).toBeCloseTo(-0.012, 6);
    });
  });

  describe('percentile', () => {
    it('interpola linealmente entre los dos valores vecinos', () => {
      expect(percentile([0, 10], 0.05)).toBeCloseTo(0.5);
      expect(percentile([0, 10], 0.95)).toBeCloseTo(9.5);
      expect(percentile([5, 1, 3], 0.5)).toBe(3);
    });

    it('no depende del orden de entrada', () => {
      expect(percentile([9, 1, 5, 3, 7], 0.95)).toBe(percentile([1, 3, 5, 7, 9], 0.95));
    });
  });

  describe('normalización (research #4)', () => {
    it('una métrica sin variación vale 0 para todos', () => {
      expect(normalizeByBounds(7, { p5: 7, p95: 7 })).toBe(0);

      const rows = [row({ playerId: 'a', rating: 7 }), row({ playerId: 'b', rating: 7 })];
      const { quotes } = calculateQuotes(rows, CONFIG);
      for (const quote of quotes) {
        expect(quote.breakdown.find((b) => b.metric === 'rating')?.normalized).toBe(0);
      }
    });

    it('un valor extremo supera 1 sin aplastar al resto de la escala', () => {
      const rows = [
        ...Array.from({ length: 19 }, (_, i) => row({ playerId: `p${i}`, goals: i })),
        row({ playerId: 'crack', goals: 300 }),
      ];
      const bounds = computeBounds(rows);
      const { quotes } = calculateQuotes(rows, CONFIG);
      const goalsOf = (id: string) =>
        quotes.find((q) => q.playerId === id)?.breakdown.find((b) => b.metric === 'goals')?.normalized;

      // Sin tope: el crack queda muy por encima de la escala de referencia (p95 → 1).
      expect(goalsOf('crack')).toBeGreaterThan(5);
      // Con min-max puro, 18 goles valdría 18/300 = 0,06. Con p5–p95 sigue arriba en la escala.
      expect(goalsOf('p18')).toBeGreaterThan(0.5);
      expect(bounds.goals?.p95).toBeLessThan(300);
    });

    it('el precio no tiene techo: un jugador muy por encima del p95 supera baseValue + scaleFactor', () => {
      const rows = [
        ...Array.from({ length: 19 }, (_, i) => row({ playerId: `p${i}`, goals: i, rating: 7 })),
        row({ playerId: 'crack', goals: 300, rating: 7 }),
      ];
      const { quotes } = calculateQuotes(rows, CONFIG);
      const crack = quotes.find((q) => q.playerId === 'crack');

      expect(crack?.score).toBeGreaterThan(1);
      expect(crack?.price).toBeGreaterThan(CONFIG.baseValue + CONFIG.scaleFactor);
    });

    it('dos jugadores por encima del p95 no empatan: se diferencian entre sí', () => {
      const rows = [
        ...Array.from({ length: 18 }, (_, i) => row({ playerId: `p${i}`, goals: i })),
        row({ playerId: 'bueno', goals: 40 }),
        row({ playerId: 'mejor', goals: 80 }),
      ];
      const { quotes } = calculateQuotes(rows, CONFIG);
      const priceOf = (id: string) => quotes.find((q) => q.playerId === id)?.price ?? 0;

      expect(priceOf('mejor')).toBeGreaterThan(priceOf('bueno'));
    });

    it('con dos jugadores el menor queda en 0 y el mayor queda por encima del p95 (más de 1)', () => {
      const { quotes } = calculateQuotes(
        [row({ playerId: 'low', rating: 6.5 }), row({ playerId: 'high', rating: 7.5 })],
        CONFIG,
      );
      const rating = (id: string) =>
        quotes.find((q) => q.playerId === id)?.breakdown.find((b) => b.metric === 'rating')?.normalized;
      expect(rating('low')).toBe(0);
      expect(rating('high')).toBeGreaterThan(1);
    });
  });

  describe('fórmula del score', () => {
    it('re-escala por la suma de pesos positivos cuando no suman 1 (FR-007)', () => {
      const values = normalized({ goals: 1, rating: 0.5 });
      const result = scoreFromNormalized(values, { goals: 1, rating: 1 });

      expect(result.positiveWeightSum).toBe(2);
      expect(result.score).toBe(0.75);
    });

    it('la suma del desglose coincide con rawScore (FR-002b, SC-002a)', () => {
      const rows = [
        row({ playerId: 'a', goals: 3, rating: 6.8, matchesPlayed: 12 }),
        row({ playerId: 'b', goals: 15, rating: 7.4, matchesPlayed: 30 }),
        row({ playerId: 'c', goals: 8, rating: 7.1, matchesPlayed: 25 }),
      ];
      for (const quote of calculateQuotes(rows, CONFIG).quotes) {
        expect(Math.abs(sumContributions(quote.breakdown) - quote.rawScore)).toBeLessThan(0.0001);
      }
    });

    it('si las penalizaciones superan a los aportes el score es 0 y el precio el valor base', () => {
      const result = scoreFromNormalized(normalized({ absence: 1 }), PERFORMANCE.general);

      expect(result.rawScore).toBeLessThan(0);
      expect(result.score).toBe(0);
      expect(priceFromScore(result.score, CONFIG)).toBe(100);
    });

    it('si la suma excede 1 el score es 1', () => {
      const result = scoreFromNormalized(normalized({ goals: 1 }), { goals: 1, assists: -0.5 });
      expect(result.score).toBe(1);
    });

    it('el precio nunca baja del mínimo configurado', () => {
      expect(priceFromScore(0, { baseValue: 0, scaleFactor: 900, minPrice: 10 })).toBe(10);
    });

    it('mismo score, misma estrategia y versión ⇒ mismo precio (FR-002a)', () => {
      const values = normalized({ goals: 0.4, rating: 0.6 });
      const a = scoreFromNormalized(values, PERFORMANCE.general);
      const b = scoreFromNormalized(values, PERFORMANCE.general);
      expect(priceFromScore(a.score, CONFIG)).toBe(priceFromScore(b.score, CONFIG));
    });
  });

  describe('ausencia y datos incompletos (research #5)', () => {
    it('se mide contra el máximo de partidos de su propia liga', () => {
      const rows = [
        row({ playerId: 'liga1-titular', leagueId: 1, matchesPlayed: 30 }),
        row({ playerId: 'liga1-suplente', leagueId: 1, matchesPlayed: 15 }),
        row({ playerId: 'liga2-titular', leagueId: 2, matchesPlayed: 20 }),
      ];
      const absence = (id: string) =>
        calculateQuotes(rows, CONFIG).quotes.find((q) => q.playerId === id)
          ?.breakdown.find((b) => b.metric === 'absence')?.normalized;

      expect(absence('liga1-titular')).toBe(0);
      expect(absence('liga1-suplente')).toBe(0.5);
      // 20 partidos es el máximo de su liga: no se lo compara contra los 30 de la otra.
      expect(absence('liga2-titular')).toBe(0);
    });

    it('el que menos jugó, con lo demás igual, puntúa menos (US1-3)', () => {
      // Un tercero con peores números da variación: sin ella, ambos quedarían en score 0 por el
      // recorte inferior y la penalización no se vería.
      const rows = [
        row({ playerId: 'jugo', matchesPlayed: 30 }),
        row({ playerId: 'no-jugo', matchesPlayed: 10 }),
        row({ playerId: 'referencia', matchesPlayed: 30, goals: 0, assists: 0, rating: 6 }),
      ];
      const { quotes } = calculateQuotes(rows, CONFIG);
      const score = (id: string) => quotes.find((q) => q.playerId === id)?.score ?? NaN;
      expect(score('no-jugo')).toBeLessThan(score('jugo'));
    });

    it('sin partidos jugados no se penaliza por ausencia y las métricas por partido valen 0', () => {
      const rows = [
        row({ playerId: 'sin-dato', matchesPlayed: null, shots: 5, tackles: 5 }),
        row({ playerId: 'con-dato', matchesPlayed: 30, shots: 1, tackles: 1 }),
      ];
      const quote = calculateQuotes(rows, CONFIG).quotes.find((q) => q.playerId === 'sin-dato');
      const metric = (m: string) => quote?.breakdown.find((b) => b.metric === m);

      expect(quote?.missingMatchesPlayed).toBe(true);
      expect(metric('absence')?.normalized).toBe(0);
      expect(metric('shots')?.normalized).toBe(0);
      expect(metric('tackles')?.normalized).toBe(0);
    });
  });

  describe('reputación mundial', () => {
    it('sin reputación cargada usa la de por defecto y lo deja registrado (FR-025)', () => {
      const { quotes } = calculateQuotes([row({ playerId: 'x', worldReputation: null })], CONFIG);
      const reputation = quotes[0].breakdown.find((b) => b.metric === 'worldReputation');

      expect(quotes[0].usedDefaultReputation).toBe(true);
      expect(reputation?.raw).toBe(20);
      expect(reputation?.normalized).toBe(0.2);
    });

    it('la reputación cargada se divide por 100', () => {
      const { quotes } = calculateQuotes([row({ playerId: 'x', worldReputation: 95 })], CONFIG);
      expect(quotes[0].usedDefaultReputation).toBe(false);
      expect(quotes[0].breakdown.find((b) => b.metric === 'worldReputation')?.normalized).toBe(0.95);
    });
  });

  describe('perfil por posición (research #7)', () => {
    it('DF usa su perfil; FW y UNKNOWN usan el general', () => {
      expect(selectProfile('DF', PERFORMANCE).profile).toBe('DF');
      expect(selectProfile('FW', PERFORMANCE).profile).toBe('GENERAL');
      expect(selectProfile('UNKNOWN', PERFORMANCE).profile).toBe('GENERAL');
    });

    it('el defensor con más entradas puntúa por sus pesos propios', () => {
      const rows = [
        row({ playerId: 'df', position: 'DF', goals: 0, tackles: 4 }),
        row({ playerId: 'fw', position: 'FW', goals: 20, tackles: 0.2 }),
      ];
      const df = calculateQuotes(rows, CONFIG).quotes.find((q) => q.playerId === 'df');
      expect(df?.positionProfile).toBe('DF');
      expect(df?.breakdown.find((b) => b.metric === 'tackles')?.weight).toBe(0.4);
    });
  });
});
