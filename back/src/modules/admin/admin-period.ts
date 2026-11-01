/**
 * Período del panel de administración y tramos del gráfico de actividad (11-admin-panel FR-036 a
 * FR-040, research #7 y #8). Funciones puras, sin NestJS ni base de datos (constitución §7): un día
 * es un `YYYY-MM-DD` en la zona horaria del administrador.
 */

export type BucketUnit = 'day' | 'week' | 'month';

export interface AdminPeriod {
  /** Nulos los dos = «Todo». */
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

/** Un `YYYY-MM-DD` que existe en el calendario (rechaza `2026-02-31`). */
export function isValidDay(value: string): boolean {
  return DAY_PATTERN.test(value) && toDay(new Date(Date.UTC(+value.slice(0, 4), +value.slice(5, 7) - 1, +value.slice(8, 10)))) === value;
}

/** El día de hoy en una zona horaria. */
export function todayIn(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Mensaje si el período no se puede aplicar; nulo si es válido (FR-039). */
export function validatePeriod(from: string | undefined, to: string | undefined, timezone: string, now: Date = new Date()): string | null {
  if (from === undefined && to === undefined) return null;
  if (from === undefined || to === undefined) return '«from» y «to» van juntos';
  if (!isValidDay(from) || !isValidDay(to)) return 'Las fechas deben ser días válidos con formato YYYY-MM-DD';
  if (from > to) return '«from» no puede ser posterior a «to»';
  if (to > todayIn(timezone, now)) return 'No se pueden pedir fechas futuras';
  return null;
}

/** Hasta 31 días, por día; hasta 26 semanas, por semana; más, por mes (FR-022). */
export function bucketUnit(from: string, to: string): BucketUnit {
  const days = (toUtc(to).getTime() - toUtc(from).getTime()) / MS_PER_DAY + 1;
  if (days <= MAX_DAYS_BY_DAY) return 'day';
  return days <= MAX_DAYS_BY_WEEK ? 'week' : 'month';
}

/** El inicio del tramo que contiene al día. Las semanas arrancan el lunes. */
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

/** Todos los tramos del período, con ceros en los que no tuvieron actividad (FR-022). */
export function fillBuckets(from: string, to: string, unit: BucketUnit, rows: ActivityBucket[]): ActivityBucket[] {
  const byStart = new Map(rows.map((row) => [row.start, row]));
  const buckets: ActivityBucket[] = [];
  for (let start = bucketStart(from, unit); start <= to; start = nextBucket(start, unit)) {
    buckets.push(byStart.get(start) ?? { start, packsOpened: 0, sales: 0 });
  }
  return buckets;
}
