import { httpClient } from './http-client';
import type { ApiPlayerCard, Rarity } from './players.service';

/**
 * Sobres: catálogo y apertura. Contrato en
 * .specify/specs/08-sobres/contracts/packs.openapi.yaml.
 *
 * Toda la red de la pantalla de sobres pasa por acá (constitución §7).
 */

export type PackTypeKey = 'common' | 'rare' | 'epic' | 'legendary';

export const PACK_TYPE_ORDER: PackTypeKey[] = ['common', 'rare', 'epic', 'legendary'];

export type RarityProbabilities = Record<Rarity, number>;

export interface PackTypeInfo {
  type: PackTypeKey;
  price: number;
  cards: number;
  /** Sobres sin abrir del tipo. */
  remaining: number;
  /** Composición de los sobres sin abrir; nula si el tipo está agotado (FR-010). */
  probabilities: RarityProbabilities | null;
}

export interface PackCatalog {
  /** Falso mientras no se generó ningún sobre (FR-061). */
  stockGenerated: boolean;
  types: PackTypeInfo[];
}

export interface OpeningCard {
  tokenId: string;
  serial: number;
  /** Rareza en el momento cero. */
  rarity: Rarity;
  /** Cotización del jugador en el momento cero, en créditos. */
  quotePrice: number;
  /** Carta del jugador como la devuelve el listado (OVR, rareza y cotización actuales). */
  player: ApiPlayerCard;
}

export interface PackOpening {
  id: string;
  type: PackTypeKey;
  price: number;
  cardCount: number;
  balanceBefore: number;
  balanceAfter: number;
  openedAt: string;
  cards: OpeningCard[];
}

export type OpenPackErrorCode =
  | 'INSUFFICIENT_CREDITS'
  | 'PACK_SOLD_OUT'
  | 'PACKS_NOT_AVAILABLE'
  | 'PACK_TYPE_NOT_FOUND'
  | 'INTERNAL_ERROR';

export async function getPackCatalog(): Promise<PackCatalog> {
  const { data } = await httpClient.get<PackCatalog>('/packs/types');
  return data;
}

export async function openPack(type: PackTypeKey): Promise<PackOpening> {
  const { data } = await httpClient.post<PackOpening>('/packs/openings', { type });
  return data;
}

/** Código del formato de error estándar (`{ code, message, correlationId }`), si lo hay. */
export function extractApiErrorCode(error: unknown): string | null {
  const code = (error as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === 'string' ? code : null;
}

const OPEN_PACK_MESSAGES: Record<OpenPackErrorCode, string> = {
  INSUFFICIENT_CREDITS: 'Tu saldo no alcanza para abrir este sobre.',
  PACK_SOLD_OUT: 'Se agotaron los sobres de este tipo. Probá con otro.',
  PACKS_NOT_AVAILABLE: 'Todavía no hay sobres disponibles. Volvé a intentar más tarde.',
  PACK_TYPE_NOT_FOUND: 'Ese tipo de sobre no existe.',
  INTERNAL_ERROR: 'Ocurrió un error inesperado y no se cobró nada. Intentá de nuevo.',
};

/** Mensaje propio para cada código de error de la apertura (FR-060). */
export function openPackErrorMessage(code: string | null): string {
  if (code && code in OPEN_PACK_MESSAGES) return OPEN_PACK_MESSAGES[code as OpenPackErrorCode];
  return 'No se pudo abrir el sobre. Revisá tu conexión e intentá de nuevo.';
}
