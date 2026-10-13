import {
  DEFAULT_HISTORY_PAGE_SIZE,
  DEFAULT_RECALC_CRON,
  DEFAULT_RUNS_PAGE_SIZE,
  NO_SEASON_DATA,
  RUN_IN_PROGRESS,
  dedupeReputationItems,
  describeError,
  hasSeasonData,
  parseHistoryRange,
  partitionReputationOutcome,
  planSchedule,
  priceChangePct,
  resolvePagination,
  skippedCount,
} from './quotes.model';

describe('quotes.model', () => {
  describe('planSchedule (FR-027)', () => {
    it('sin variables usa el cron por defecto: lunes 03:00', () => {
      expect(planSchedule({})).toEqual({
        kind: 'scheduled',
        cronTime: DEFAULT_RECALC_CRON,
        timeZone: undefined,
      });
      expect(DEFAULT_RECALC_CRON).toBe('0 3 * * 1');
    });

    it('QUOTES_SCHEDULER_ENABLED=false lo deshabilita, aunque haya cron válido', () => {
      expect(planSchedule({ QUOTES_SCHEDULER_ENABLED: 'false', QUOTES_RECALC_CRON: '0 4 * * 2' })).toEqual({
        kind: 'disabled',
      });
    });

    it('cualquier otro valor de QUOTES_SCHEDULER_ENABLED lo deja habilitado', () => {
      expect(planSchedule({ QUOTES_SCHEDULER_ENABLED: 'true' }).kind).toBe('scheduled');
      expect(planSchedule({ QUOTES_SCHEDULER_ENABLED: '' }).kind).toBe('scheduled');
    });

    it('toma el cron y la zona del entorno, recortando espacios', () => {
      expect(
        planSchedule({ QUOTES_RECALC_CRON: '  30 5 * * 3 ', QUOTES_RECALC_TIMEZONE: ' America/Argentina/Buenos_Aires ' }),
      ).toEqual({
        kind: 'scheduled',
        cronTime: '30 5 * * 3',
        timeZone: 'America/Argentina/Buenos_Aires',
      });
    });

    it('un cron vacío o en blanco vuelve al valor por defecto', () => {
      expect(planSchedule({ QUOTES_RECALC_CRON: '   ' })).toMatchObject({
        kind: 'scheduled',
        cronTime: DEFAULT_RECALC_CRON,
      });
    });

    it('una expresión mal escrita se informa como inválida con el motivo, sin lanzar', () => {
      const plan = planSchedule({ QUOTES_RECALC_CRON: 'no es un cron' });
      expect(plan.kind).toBe('invalid');
      if (plan.kind === 'invalid') {
        expect(plan.cronTime).toBe('no es un cron');
        expect(plan.reason.length).toBeGreaterThan(0);
      }
    });
  });

  describe('corrida de recálculo', () => {
    it('hasSeasonData distingue la ausencia de temporada', () => {
      expect(hasSeasonData(null)).toBe(false);
      expect(hasSeasonData('2025-2026')).toBe(true);
    });

    it('los motivos de bloqueo conservan los códigos del contrato de la API', () => {
      expect(NO_SEASON_DATA.code).toBe('NO_SEASON_DATA');
      expect(RUN_IN_PROGRESS.code).toBe('RUN_IN_PROGRESS');
      expect(NO_SEASON_DATA.message).toBeTruthy();
      expect(RUN_IN_PROGRESS.message).toBeTruthy();
    });

    it('skippedCount es lo que le falta al catálogo para estar todo cotizado (FR-022)', () => {
      expect(skippedCount(2638, 1848)).toBe(790);
      expect(skippedCount(10, 10)).toBe(0);
      expect(skippedCount(0, 0)).toBe(0);
    });
  });

  describe('resolvePagination', () => {
    it('aplica página 1 y el tamaño por defecto cuando faltan', () => {
      expect(resolvePagination({}, DEFAULT_HISTORY_PAGE_SIZE)).toEqual({ page: 1, limit: 50 });
      expect(resolvePagination({}, DEFAULT_RUNS_PAGE_SIZE)).toEqual({ page: 1, limit: 20 });
    });

    it('respeta lo que pidió el cliente', () => {
      expect(resolvePagination({ page: 3, limit: 10 }, 50)).toEqual({ page: 3, limit: 10 });
    });
  });

  describe('parseHistoryRange (FR-020)', () => {
    it('sin filtros no acota nada', () => {
      expect(parseHistoryRange()).toEqual({ from: undefined, to: undefined });
    });

    it('convierte las fechas ISO 8601 a Date', () => {
      const range = parseHistoryRange('2026-10-01T00:00:00Z', '2026-10-10T00:00:00Z');
      expect(range?.from).toEqual(new Date('2026-10-01T00:00:00Z'));
      expect(range?.to).toEqual(new Date('2026-10-10T00:00:00Z'));
    });

    it('admite un solo extremo', () => {
      expect(parseHistoryRange('2026-10-01T00:00:00Z')?.to).toBeUndefined();
      expect(parseHistoryRange(undefined, '2026-10-01T00:00:00Z')?.from).toBeUndefined();
    });

    it('un rango invertido es inválido (devuelve null)', () => {
      expect(parseHistoryRange('2026-10-10T00:00:00Z', '2026-10-01T00:00:00Z')).toBeNull();
    });

    it('from igual a to es válido: ambos extremos son inclusivos', () => {
      expect(parseHistoryRange('2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z')).not.toBeNull();
    });
  });

  describe('priceChangePct (FR-019)', () => {
    it('calcula la variación con un decimal', () => {
      expect(priceChangePct(110, 100)).toBe(10);
      expect(priceChangePct(90, 100)).toBe(-10);
      expect(priceChangePct(724, 700)).toBe(3.4);
    });

    it('sin cotización anterior no hay variación', () => {
      expect(priceChangePct(500, null)).toBeNull();
      expect(priceChangePct(500, undefined)).toBeNull();
    });

    it('una anterior de 0 no sirve de base', () => {
      expect(priceChangePct(500, 0)).toBeNull();
    });

    it('sin cambio de precio, 0', () => {
      expect(priceChangePct(500, 500)).toBe(0);
    });
  });

  describe('carga de reputación (FR-024)', () => {
    it('si un id se repite gana la última aparición y se conserva el orden de la primera', () => {
      const items = [
        { playerId: 'a', worldReputation: 10 },
        { playerId: 'b', worldReputation: 20 },
        { playerId: 'a', worldReputation: 90 },
      ];
      expect(dedupeReputationItems(items)).toEqual([
        { playerId: 'a', value: 90 },
        { playerId: 'b', value: 20 },
      ]);
    });

    it('null borra la reputación y se conserva como null', () => {
      expect(dedupeReputationItems([{ playerId: 'a', worldReputation: null }])).toEqual([
        { playerId: 'a', value: null },
      ]);
    });

    it('separa los actualizados de los inexistentes sin perder el orden pedido', () => {
      expect(partitionReputationOutcome(['a', 'b', 'c', 'd'], ['c', 'a'])).toEqual({
        updated: ['a', 'c'],
        notFound: ['b', 'd'],
      });
    });

    it('si no se actualizó ninguno, todos figuran como inexistentes', () => {
      expect(partitionReputationOutcome(['a', 'b'], [])).toEqual({ updated: [], notFound: ['a', 'b'] });
    });
  });

  describe('describeError', () => {
    it('toma el mensaje de un Error y el texto de cualquier otra cosa', () => {
      expect(describeError(new Error('boom'))).toBe('boom');
      expect(describeError('texto')).toBe('texto');
      expect(describeError(42)).toBe('42');
      expect(describeError(undefined)).toBe('undefined');
    });
  });
});
