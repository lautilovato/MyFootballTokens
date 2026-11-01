import { todayLocal, validateRange } from './date-filter';
import type { AdminPeriodQuery } from '../services/admin.service';

/**
 * Atajos del selector de fechas del panel (11-admin-panel FR-036). Funciones puras: los días son
 * `YYYY-MM-DD` en la zona horaria del navegador, como en `date-filter.ts`.
 */

export type AdminPreset = '7d' | '30d' | '90d' | 'all';

export const ADMIN_PRESETS: { key: AdminPreset; label: string }[] = [
  { key: '7d', label: '7 días' },
  { key: '30d', label: '30 días' },
  { key: '90d', label: '90 días' },
  { key: 'all', label: 'Todo' },
];

const PRESET_DAYS: Record<Exclude<AdminPreset, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 };

/** El período de un atajo, con hoy incluido: «7 días» son hoy y los 6 anteriores. */
export function presetPeriod(preset: AdminPreset, now: Date = new Date()): AdminPeriodQuery {
  if (preset === 'all') return { from: null, to: null };
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (PRESET_DAYS[preset] - 1));
  return { from: todayLocal(from), to: todayLocal(now) };
}

/** Mensaje si el rango no se puede aplicar; nulo si es válido (FR-039). */
export function validateCustomRange(from: string, to: string, today: string = todayLocal()): string | null {
  if (from === '' || to === '') return 'Elegí las dos fechas del período.';
  return validateRange(from, to, today);
}

const dayFormat = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** `2026-10-31` → `31/10/2026`. Se arma con la hora local para no correr el día. */
export function formatDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return dayFormat.format(new Date(year, month - 1, date));
}

/** El período que se está mostrando, en palabras (FR-036). */
export function periodLabel({ from, to }: AdminPeriodQuery): string {
  return from && to ? `Del ${formatDay(from)} al ${formatDay(to)}` : 'Toda la historia';
}
