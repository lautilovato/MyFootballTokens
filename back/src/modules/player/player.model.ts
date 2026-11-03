import { priceChangePct } from '../quotes/quotes.model';
import type { GetPlayersFilterDto } from './dto/get-players-filter.dto';

export const OVR_MAX = 99;

export function ovrFromReputation(reputation: number | null | undefined): number | null {
  if (reputation === null || reputation === undefined) return null;
  if (!Number.isFinite(reputation)) return null;
  return Math.min(OVR_MAX, Math.max(0, Math.trunc(reputation)));
}

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export const RARITIES: Rarity[] = ['legendary', 'epic', 'rare', 'common'];

export const RARITY_THRESHOLDS = {
  legendary: 88,
  epic: 80,
  rare: 70,
} as const;

export interface ReputationRange {
  min: number | null;
  max: number | null;
  includeNull: boolean;
}

export function rarityFromOvr(ovr: number | null): Rarity {
  if (ovr === null) return 'common';
  if (ovr >= RARITY_THRESHOLDS.legendary) return 'legendary';
  if (ovr >= RARITY_THRESHOLDS.epic) return 'epic';
  if (ovr >= RARITY_THRESHOLDS.rare) return 'rare';
  return 'common';
}

export function raritySqlCase(column: string, whenNull: 'common' | null): { sql: string; params: number[] } {
  const nullBranch = whenNull === null ? 'null' : `'${whenNull}'`;
  return {
    sql: `(case when ${column} is null then ${nullBranch}
                when ${column} >= ? then 'legendary'
                when ${column} >= ? then 'epic'
                when ${column} >= ? then 'rare'
                else 'common' end)`,
    params: [RARITY_THRESHOLDS.legendary, RARITY_THRESHOLDS.epic, RARITY_THRESHOLDS.rare],
  };
}

export function reputationRangesForRarities(rarities?: Rarity[] | null): ReputationRange[] {
  if (!rarities || rarities.length === 0) return [];

  const { legendary, epic, rare } = RARITY_THRESHOLDS;
  const byRarity: Record<Rarity, ReputationRange> = {
    legendary: { min: legendary, max: null, includeNull: false },
    epic: { min: epic, max: legendary, includeNull: false },
    rare: { min: rare, max: epic, includeNull: false },
    common: { min: null, max: rare, includeNull: true },
  };

  return [...new Set(rarities)].map((rarity) => byRarity[rarity]).filter(Boolean);
}

export const PRICE_HISTORY_POINTS = 30;

export interface PriceMovement {
  changePct: number;
  history: number[];
}

export function priceMovement(prices: readonly number[]): PriceMovement {
  const history = prices.slice(-PRICE_HISTORY_POINTS);
  const latest = history[history.length - 1];
  const previous = history[history.length - 2];

  return {
    changePct: latest === undefined ? 0 : (priceChangePct(latest, previous) ?? 0),
    history,
  };
}

export const TOKEN_SUPPLY_TOTAL = 100;
export const TOKEN_SUPPLY_MINTED = 100;

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;

export const PLAYERS_LIST_VERSION_KEY = 'players:list:version';

export const CURRENT_SEASON_KEY = 'players:current-season';

export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function resolvePagination(filter: Pick<GetPlayersFilterDto, 'page' | 'limit'>): { page: number; limit: number } {
  return { page: filter.page ?? DEFAULT_PAGE, limit: filter.limit ?? DEFAULT_LIMIT };
}

export function pageMeta(total: number, page: number, limit: number): PageMeta {
  return { total, page, limit, totalPages: Math.ceil(total / limit) };
}

export function playersListCacheKey(
  filter: GetPlayersFilterDto,
  page: number,
  limit: number,
  version: number,
): string {

  const sorted = (values?: string[]) => (values ? [...values].sort((a, b) => a.localeCompare(b)) : null);

  return `players:list:v${version}:${JSON.stringify({
    league: sorted(filter.league),
    team: sorted(filter.team),
    position: sorted(filter.position),
    rarity: sorted(filter.rarity),
    minValue: filter.minValue ?? null,
    maxValue: filter.maxValue ?? null,
    minOvr: filter.minOvr ?? null,
    maxOvr: filter.maxOvr ?? null,
    search: filter.search?.trim().toLowerCase() ?? null,
    page,
    limit,
  })}`;
}

export function filterLogFields(filter: GetPlayersFilterDto): Record<string, unknown> {
  return {
    league: filter.league ?? null,
    team: filter.team ?? null,
    position: filter.position ?? null,
    rarity: filter.rarity ?? null,
    minValue: filter.minValue ?? null,
    maxValue: filter.maxValue ?? null,
    minOvr: filter.minOvr ?? null,
    maxOvr: filter.maxOvr ?? null,
    hasSearch: Boolean(filter.search),
  };
}
