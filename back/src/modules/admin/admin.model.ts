import { PACK_TYPES } from '../packs/packs.model';
import type { AdminSnapshot } from './admin.repository';
import type { AdminMetricsDto } from './dto/admin-metrics-response.dto';

export const DEFAULT_TIMEZONE = 'UTC';

export const METRICS_TTL_MS = 60_000;

export type BucketUnit = 'day' | 'week' | 'month';

export interface AdminPeriod {
  from: string | null;
  to: string | null;
  timezone: string;
}

export interface ActivityBucket {
  start: string;
  packsOpened: number;
  sales: number;
}

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;
const MAX_DAYS_BY_DAY = 31;
const MAX_DAYS_BY_WEEK = 182;

const toUtc = (day: string): Date => new Date(`${day}T00:00:00Z`);
const toDay = (date: Date): string => date.toISOString().slice(0, 10);
const addDays = (day: string, days: number): string => toDay(new Date(toUtc(day).getTime() + days * MS_PER_DAY));

export function isValidDay(value: string): boolean {
  return DAY_PATTERN.test(value) && toDay(new Date(Date.UTC(+value.slice(0, 4), +value.slice(5, 7) - 1, +value.slice(8, 10)))) === value;
}

export function todayIn(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function validatePeriod(from: string | undefined, to: string | undefined, timezone: string, now: Date = new Date()): string | null {
  if (from === undefined && to === undefined) return null;
  if (from === undefined || to === undefined) return '«from» y «to» van juntos';
  if (!isValidDay(from) || !isValidDay(to)) return 'Las fechas deben ser días válidos con formato YYYY-MM-DD';
  if (from > to) return '«from» no puede ser posterior a «to»';
  if (to > todayIn(timezone, now)) return 'No se pueden pedir fechas futuras';
  return null;
}

export function bucketUnit(from: string, to: string): BucketUnit {
  const days = (toUtc(to).getTime() - toUtc(from).getTime()) / MS_PER_DAY + 1;
  if (days <= MAX_DAYS_BY_DAY) return 'day';
  return days <= MAX_DAYS_BY_WEEK ? 'week' : 'month';
}

export function bucketStart(day: string, unit: BucketUnit): string {
  if (unit === 'day') return day;
  if (unit === 'month') return `${day.slice(0, 7)}-01`;
  const mondayOffset = (toUtc(day).getUTCDay() + 6) % 7;
  return addDays(day, -mondayOffset);
}

function nextBucket(start: string, unit: BucketUnit): string {
  if (unit === 'day') return addDays(start, 1);
  if (unit === 'week') return addDays(start, 7);
  const date = toUtc(start);
  return toDay(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)));
}

export function fillBuckets(from: string, to: string, unit: BucketUnit, rows: ActivityBucket[]): ActivityBucket[] {
  const byStart = new Map(rows.map((row) => [row.start, row]));
  const buckets: ActivityBucket[] = [];
  for (let start = bucketStart(from, unit); start <= to; start = nextBucket(start, unit)) {
    buckets.push(byStart.get(start) ?? { start, packsOpened: 0, sales: 0 });
  }
  return buckets;
}

// ── Métricas ─────────────────────────────────────────────────────────────────────────────────

export function metricsCacheKey(period: AdminPeriod): string {
  return `admin:metrics:${period.from ?? 'all'}:${period.to ?? 'all'}:${period.timezone}`;
}

export function metricsFromSnapshot(snapshot: AdminSnapshot, period: AdminPeriod, computedAt: Date): AdminMetricsDto {
  return {
    computedAt: computedAt.toISOString(),
    period,
    users: snapshot.users,
    cards: cardsOf(snapshot),
    rarity: {
      common: snapshot.rarity.common ?? 0,
      rare: snapshot.rarity.rare ?? 0,
      epic: snapshot.rarity.epic ?? 0,
      legendary: snapshot.rarity.legendary ?? 0,
    },
    packs: packsOf(snapshot),
    market: {
      ...snapshot.market,
      topSale: snapshot.topSale && { ...snapshot.topSale, at: snapshot.topSale.at.toISOString() },
      topPlayers: snapshot.topPlayers,
    },
    credits: { ...snapshot.credits, inCirculation: snapshot.creditsInCirculation },
    activity: snapshot.activity,
    reconciliation: reconciliationOf(snapshot),
  };
}

export function cardsOf({ tokensByStatus, listed }: Pick<AdminSnapshot, 'tokensByStatus' | 'listed'>): AdminMetricsDto['cards'] {
  const count = (status: string) => tokensByStatus[status] ?? 0;
  return {
    issued: Object.values(tokensByStatus).reduce((sum, n) => sum + n, 0),
    inCirculation: count('de_usuario'),
    inPacks: count('en_sobre'),
    reserved: count('reservado'),
    platformSale: count('en_venta_plataforma'),
    listed,
  };
}

export function packsOf({ packsRemaining, packsOpened }: Pick<AdminSnapshot, 'packsRemaining' | 'packsOpened'>): AdminMetricsDto['packs'] {
  const byType = PACK_TYPES.map((type) => {
    const remaining = packsRemaining[type] ?? 0;
    return { type, remaining, opened: packsOpened[type] ?? 0, soldOut: remaining === 0 };
  });
  return {
    remaining: byType.reduce((sum, row) => sum + row.remaining, 0),
    opened: byType.reduce((sum, row) => sum + row.opened, 0),
    byType,
  };
}

export function reconciliationOf(
  snapshot: Pick<
    AdminSnapshot,
    'tokensByStatus' | 'listed' | 'playersWithoutFullEmission' | 'creditsAllTime' | 'creditsInCirculation'
  >,
): AdminMetricsDto['reconciliation'] {
  const cards = cardsOf(snapshot);
  const cardsDifference = cards.issued - (cards.inCirculation + cards.inPacks + cards.reserved + cards.platformSale);
  const expected = snapshot.creditsAllTime.issued - snapshot.creditsAllTime.collected;
  const actual = snapshot.creditsInCirculation;
  return {
    cards: {
      ok: cardsDifference === 0 && snapshot.playersWithoutFullEmission === 0,
      difference: cardsDifference,
      affectedPlayers: snapshot.playersWithoutFullEmission,
    },
    credits: { ok: expected === actual, expected, actual, difference: expected - actual },
  };
}
