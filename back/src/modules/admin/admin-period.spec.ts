import { bucketStart, bucketUnit, fillBuckets, isValidDay, todayIn, validatePeriod } from './admin-period';

const NOW = new Date('2026-10-31T12:00:00Z');

describe('admin-period', () => {
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
