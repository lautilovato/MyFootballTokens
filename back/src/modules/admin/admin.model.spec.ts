import {
  bucketStart,
  bucketUnit,
  cardsOf,
  fillBuckets,
  isValidDay,
  metricsCacheKey,
  packsOf,
  reconciliationOf,
  todayIn,
  validatePeriod,
} from './admin.model';

const NOW = new Date('2026-10-31T12:00:00Z');

describe('período del panel', () => {
  describe('isValidDay', () => {
    it.each(['2026-10-31', '2024-02-29'])('acepta %s', (day) => {
      expect(isValidDay(day)).toBe(true);
    });

    it.each(['2026-02-31', '2026-13-01', '31/10/2026', '2026-1-1', ''])('rechaza «%s»', (day) => {
      expect(isValidDay(day)).toBe(false);
    });
  });

  it('todayIn usa la zona horaria pedida', () => {
    const lateNight = new Date('2026-11-01T01:00:00Z');
    expect(todayIn('UTC', lateNight)).toBe('2026-11-01');
    expect(todayIn('America/Argentina/Buenos_Aires', lateNight)).toBe('2026-10-31');
  });

  describe('validatePeriod', () => {
    it('sin fechas es «Todo»', () => {
      expect(validatePeriod(undefined, undefined, 'UTC', NOW)).toBeNull();
    });

    it('acepta un rango que termina hoy', () => {
      expect(validatePeriod('2026-10-01', '2026-10-31', 'UTC', NOW)).toBeNull();
    });

    it.each([
      ['2026-10-01', undefined],
      [undefined, '2026-10-01'],
      ['2026-02-31', '2026-03-01'],
      ['2026-10-02', '2026-10-01'],
      ['2026-10-01', '2026-11-01'],
    ])('rechaza %s – %s', (from, to) => {
      expect(validatePeriod(from, to, 'UTC', NOW)).not.toBeNull();
    });

    it('el tope de hoy se evalúa en la zona horaria del pedido', () => {
      const lateNight = new Date('2026-11-01T01:00:00Z');
      expect(validatePeriod('2026-10-01', '2026-11-01', 'UTC', lateNight)).toBeNull();
      expect(validatePeriod('2026-10-01', '2026-11-01', 'America/Argentina/Buenos_Aires', lateNight)).not.toBeNull();
    });
  });

  describe('bucketUnit', () => {
    it.each([
      ['2026-10-01', '2026-10-31', 'day'],
      ['2026-10-01', '2026-11-01', 'week'],
      ['2026-01-01', '2026-07-01', 'week'],
      ['2026-01-01', '2026-07-02', 'month'],
    ])('%s a %s va por %s', (from, to, unit) => {
      expect(bucketUnit(from, to)).toBe(unit);
    });
  });

  describe('bucketStart', () => {
    it('la semana arranca el lunes', () => {
      expect(bucketStart('2026-10-31', 'week')).toBe('2026-10-26');
      expect(bucketStart('2026-10-26', 'week')).toBe('2026-10-26');
      expect(bucketStart('2026-10-25', 'week')).toBe('2026-10-19');
    });

    it('el mes arranca el primer día', () => {
      expect(bucketStart('2026-10-31', 'month')).toBe('2026-10-01');
    });
  });

  describe('fillBuckets', () => {
    it('rellena con ceros los días sin actividad', () => {
      const rows = [{ start: '2026-10-02', packsOpened: 1, sales: 2 }];
      expect(fillBuckets('2026-10-01', '2026-10-03', 'day', rows)).toEqual([
        { start: '2026-10-01', packsOpened: 0, sales: 0 },
        { start: '2026-10-02', packsOpened: 1, sales: 2 },
        { start: '2026-10-03', packsOpened: 0, sales: 0 },
      ]);
    });

    it('incluye la semana parcial del comienzo y la del final', () => {
      const starts = fillBuckets('2026-10-01', '2026-11-15', 'week', []).map((b) => b.start);
      expect(starts[0]).toBe('2026-09-28');
      expect(starts.at(-1)).toBe('2026-11-09');
    });

    it('cruza el fin de año por mes', () => {
      const starts = fillBuckets('2025-11-15', '2026-02-01', 'month', []).map((b) => b.start);
      expect(starts).toEqual(['2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01']);
    });
  });
});

// FR-022 a FR-025 — métricas armadas desde lo que se leyó de la base.
describe('métricas del panel', () => {
  const tokensByStatus = { de_usuario: 60, en_sobre: 30, reservado: 4, en_venta_plataforma: 6 };

  it('cardsOf suma los tokens emitidos y separa cada estado', () => {
    expect(cardsOf({ tokensByStatus, listed: 5 })).toEqual({
      issued: 100,
      inCirculation: 60,
      inPacks: 30,
      reserved: 4,
      platformSale: 6,
      listed: 5,
    });
  });

  it('packsOf informa los cuatro tipos aunque falten en la lectura, y marca los agotados', () => {
    const packs = packsOf({ packsRemaining: { common: 3, rare: 0 }, packsOpened: { common: 7 } });
    expect(packs.byType.map((row) => row.type)).toEqual(['common', 'rare', 'epic', 'legendary']);
    expect(packs.byType[0]).toEqual({ type: 'common', remaining: 3, opened: 7, soldOut: false });
    expect(packs.byType[1].soldOut).toBe(true);
    expect(packs.remaining).toBe(3);
    expect(packs.opened).toBe(7);
  });

  it('la conciliación da ok cuando cartas y créditos cierran', () => {
    const result = reconciliationOf({
      tokensByStatus,
      listed: 0,
      playersWithoutFullEmission: 0,
      creditsAllTime: { issued: 5000, collected: 1200 },
      creditsInCirculation: 3800,
    });
    expect(result.cards).toEqual({ ok: true, difference: 0, affectedPlayers: 0 });
    expect(result.credits).toEqual({ ok: true, expected: 3800, actual: 3800, difference: 0 });
  });

  it('la conciliación informa la diferencia sin corregirla (FR-025)', () => {
    const result = reconciliationOf({
      tokensByStatus: { ...tokensByStatus, quemado: 2 },
      listed: 0,
      playersWithoutFullEmission: 1,
      creditsAllTime: { issued: 5000, collected: 1200 },
      creditsInCirculation: 3700,
    });
    expect(result.cards).toEqual({ ok: false, difference: 2, affectedPlayers: 1 });
    expect(result.credits).toEqual({ ok: false, expected: 3800, actual: 3700, difference: 100 });
  });

  it('la clave de caché distingue período y zona, y «Todo» tiene la suya', () => {
    expect(metricsCacheKey({ from: null, to: null, timezone: 'UTC' })).toBe('admin:metrics:all:all:UTC');
    expect(metricsCacheKey({ from: '2026-10-01', to: '2026-10-31', timezone: 'America/Argentina/Buenos_Aires' })).toBe(
      'admin:metrics:2026-10-01:2026-10-31:America/Argentina/Buenos_Aires',
    );
  });
});
