import { httpClient } from './http-client';
import type { ApiPlayerCard } from './players.service';

/**
 * Historial de cartas adquiridas (por sobre o por compra) y vendidas del usuario de la sesión.
 * Contrato en .specify/specs/10-historial-operaciones/contracts/history.openapi.yaml.
 */

export type OperationKind = 'sobre' | 'compra' | 'venta';

/** `acquired`: sobres y compras. `sold`: ventas. */
export type HistoryFilter = 'all' | 'acquired' | 'sold';

export type PackTypeKey = 'common' | 'rare' | 'epic' | 'legendary';

/** La cotización que fijó el precio de una compra o venta, con su estrategia y versión. */
export interface OperationQuote {
  id: string;
  calculatedAt: string;
  strategy: { key: string; name: string; version: number };
}

/**
 * Una carta que el usuario adquirió o vendió. Los campos de compra y venta son nulos en las
 * entradas de sobre: una carta de sobre no tiene precio de compra (FR-005).
 */
export interface OperationEntry {
  id: string;
  kind: OperationKind;
  at: string;
  tokenId: string;
  serial: number;
  /** La rareza de ese instante. */
  rarity: string;
  player: ApiPlayerCard;
  packType: PackTypeKey | null;
  /** Cotización del jugador en ese instante (09 FR-017). */
  price: number | null;
  balanceBefore: number | null;
  balanceAfter: number | null;
  counterparty: 'plataforma' | 'otro_usuario' | null;
  /** Nulo en sobres, y en compras y ventas cuando no se puede determinar (FR-016). */
  quote: OperationQuote | null;
}

export interface OperationsPage {
  data: OperationEntry[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export const HISTORY_PAGE_SIZE = 20;

export async function getOperations(filter: HistoryFilter, page: number, limit: number = HISTORY_PAGE_SIZE): Promise<OperationsPage> {
  const { data } = await httpClient.get<OperationsPage>('/history/operations', {
    params: { type: filter, page, limit },
  });
  return data;
}

const HISTORY_MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: 'No se pudo pedir el historial con esos datos. Recargá la página e intentá de nuevo.',
  INTERNAL_ERROR: 'Ocurrió un error inesperado. Intentá de nuevo.',
};

/** Mensaje para cada código de error del historial; cualquier otro, o un corte de red, es genérico. */
export function historyErrorMessage(code: string | null): string {
  if (code && code in HISTORY_MESSAGES) return HISTORY_MESSAGES[code];
  return 'No pudimos cargar tu historial. Revisá tu conexión e intentá de nuevo.';
}
