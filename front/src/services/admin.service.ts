import { httpClient } from './http-client';
import type { PackTypeKey } from './history.service';

/**
 * Métricas del panel de administración.
 * Contrato en .specify/specs/11-admin-panel/contracts/admin.openapi.yaml.
 */

export type ActivityUnit = 'day' | 'week' | 'month';

export interface ActivityBucket {
  start: string;
  packsOpened: number;
  sales: number;
}

export interface AdminPackType {
  type: PackTypeKey;
  remaining: number;
  opened: number;
  soldOut: boolean;
}

export interface AdminMetrics {
  computedAt: string;
  period: { from: string | null; to: string | null; timezone: string };
  users: { registered: number; new: number; active: number };
  cards: { issued: number; inCirculation: number; inPacks: number; reserved: number; platformSale: number; listed: number };
  rarity: Record<PackTypeKey, number>;
  packs: { remaining: number; opened: number; byType: AdminPackType[] };
  market: {
    sales: number;
    /** Nulo sin ventas: no es un promedio de 0. */
    averagePrice: number | null;
    volume: number;
    topSale: { price: number; playerId: string; playerName: string; at: string } | null;
    topPlayers: { playerId: string; playerName: string; sales: number; volume: number }[];
  };
  credits: { issued: number; collected: number; inCirculation: number };
  activity: { unit: ActivityUnit; buckets: ActivityBucket[] };
  reconciliation: {
    cards: { ok: boolean; difference: number; affectedPlayers: number };
    credits: { ok: boolean; expected: number; actual: number; difference: number };
  };
}

/** Días `YYYY-MM-DD` en la zona del navegador. Nulos los dos, toda la historia. */
export interface AdminPeriodQuery {
  from: string | null;
  to: string | null;
}

export async function getAdminMetrics(period: AdminPeriodQuery, refresh = false): Promise<AdminMetrics> {
  const { data } = await httpClient.get<AdminMetrics>('/admin/metrics', {
    params: {
      from: period.from ?? undefined,
      to: period.to ?? undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      refresh: refresh ? 'true' : undefined,
    },
  });
  return data;
}

const ADMIN_MESSAGES: Record<string, string> = {
  FORBIDDEN: 'Esta sección es solo para administradores.',
  VALIDATION_ERROR: 'No se pudo consultar ese período. Revisá las fechas e intentá de nuevo.',
  INTERNAL_ERROR: 'Ocurrió un error inesperado. Intentá de nuevo.',
};

/** Mensaje para cada código de error del panel; cualquier otro, o un corte de red, es genérico. */
export function adminErrorMessage(code: string | null): string {
  if (code && code in ADMIN_MESSAGES) return ADMIN_MESSAGES[code];
  return 'No pudimos cargar las métricas. Revisá tu conexión e intentá de nuevo.';
}
