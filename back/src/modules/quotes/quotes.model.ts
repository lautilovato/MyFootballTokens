import { validateCronExpression } from 'cron';

export const DEFAULT_RECALC_CRON = '0 3 * * 1';

export const DEFAULT_HISTORY_PAGE_SIZE = 50;
export const DEFAULT_RUNS_PAGE_SIZE = 20;


/** Variables de entorno que gobiernan el scheduler. */
export interface ScheduleEnv {
  QUOTES_SCHEDULER_ENABLED?: string;
  QUOTES_RECALC_CRON?: string;
  QUOTES_RECALC_TIMEZONE?: string;
}

/** Qué hacer con el recálculo semanal según la configuración del entorno. */
export type SchedulePlan =
  | { kind: 'disabled' }
  | { kind: 'invalid'; cronTime: string; reason: string }
  | { kind: 'scheduled'; cronTime: string; timeZone: string | undefined };

export function planSchedule(env: ScheduleEnv): SchedulePlan {
  if (env.QUOTES_SCHEDULER_ENABLED === 'false') return { kind: 'disabled' };

  const cronTime = env.QUOTES_RECALC_CRON?.trim() || DEFAULT_RECALC_CRON;
  const timeZone = env.QUOTES_RECALC_TIMEZONE?.trim() || undefined;

  const validation = validateCronExpression(cronTime);
  if (!validation.valid) {
    return { kind: 'invalid', cronTime, reason: validation.error?.message ?? 'unknown error' };
  }
  return { kind: 'scheduled', cronTime, timeZone };
}

export interface RunBlocker {
  code: 'NO_SEASON_DATA' | 'RUN_IN_PROGRESS';
  message: string;
}

export const RUN_IN_PROGRESS: RunBlocker = {
  code: 'RUN_IN_PROGRESS',
  message: 'Ya hay un recálculo de cotizaciones en curso',
};

export const NO_SEASON_DATA: RunBlocker = {
  code: 'NO_SEASON_DATA',
  message: 'No hay estadísticas de temporada cargadas para cotizar',
};

export function hasSeasonData(season: string | null): season is string {
  return season !== null;
}

export function skippedCount(catalogSize: number, quotedCount: number): number {
  return catalogSize - quotedCount;
}

export interface Pagination {
  page: number;
  limit: number;
}

export function resolvePagination(
  query: { page?: number; limit?: number },
  defaultLimit: number,
): Pagination {
  return { page: query.page ?? 1, limit: query.limit ?? defaultLimit };
}

export interface DateRange {
  from?: Date;
  to?: Date;
}


export function parseHistoryRange(from?: string, to?: string): DateRange | null {
  const range: DateRange = {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  };
  if (range.from && range.to && range.from > range.to) return null;
  return range;
}

/**
 * Variación porcentual de la cotización vigente respecto de la anterior, con un decimal.
 * `null` si no hay anterior o si ésta valía 0 (no hay base contra la cual comparar).
 */
export function priceChangePct(
  latestPrice: number,
  previousPrice: number | null | undefined,
): number | null {
  if (previousPrice === null || previousPrice === undefined || previousPrice <= 0) return null;
  return Number((((latestPrice - previousPrice) / previousPrice) * 100).toFixed(1));
}

// ---------------------------------------------------------------------------------------------
// Carga de reputación mundial (FR-024)
// ---------------------------------------------------------------------------------------------

export interface ReputationItem {
  playerId: string;
  worldReputation: number | null;
}

export interface ReputationUpdate {
  playerId: string;
  value: number | null;
}

export function dedupeReputationItems(items: readonly ReputationItem[]): ReputationUpdate[] {
  const byPlayer = new Map(items.map((item) => [item.playerId, item.worldReputation]));
  return [...byPlayer].map(([playerId, value]) => ({ playerId, value }));
}

export function partitionReputationOutcome(
  requestedIds: readonly string[],
  updatedIds: readonly string[],
): { updated: string[]; notFound: string[] } {
  const updatedSet = new Set(updatedIds);
  return {
    updated: requestedIds.filter((playerId) => updatedSet.has(playerId)),
    notFound: requestedIds.filter((playerId) => !updatedSet.has(playerId)),
  };
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
