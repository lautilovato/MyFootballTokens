import { httpClient } from './http-client';
import type { StrategyRef } from './quote.mapper';

/**
 * Cotizaciones de un jugador: historial completo y cotización actual. Contrato en
 * .specify/specs/07-cotizacion/contracts/quotes.openapi.yaml y
 * .specify/specs/10-historial-operaciones/contracts/history.openapi.yaml.
 */

export type QuoteOrigin = 'AUTOMATIC' | 'MANUAL';

/** Una cotización con la estrategia y versión con que se calculó (07 FR-016). Inmutable. */
export interface ApiQuote {
  price: number;
  score: number;
  rawScore: number;
  /** Instante de cálculo, ISO 8601. */
  calculatedAt: string;
  origin: QuoteOrigin;
  season: string;
  strategy: StrategyRef;
  positionProfile: string;
  usedDefaultReputation: boolean;
  missingMatchesPlayed: boolean;
}

interface QuotesHistoryPage {
  data: ApiQuote[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

/** Máximo que acepta el historial de 07 por pedido. */
export const QUOTES_PAGE_SIZE = 200;

async function fetchHistoryPage(playerId: string, page: number): Promise<QuotesHistoryPage> {
  const { data } = await httpClient.get<QuotesHistoryPage>(`/quotes/players/${playerId}/history`, {
    params: { page, limit: QUOTES_PAGE_SIZE },
  });
  return data;
}

/**
 * Todas las cotizaciones del jugador, de la más vieja a la más nueva. Pide la primera página, que
 * informa el total, y las que falten en paralelo (research #5).
 */
export async function fetchAllQuotes(playerId: string): Promise<ApiQuote[]> {
  const first = await fetchHistoryPage(playerId, 1);
  const rest = await Promise.all(
    Array.from({ length: Math.max(first.meta.totalPages - 1, 0) }, (_, i) => fetchHistoryPage(playerId, i + 2)),
  );
  return [...first.data, ...rest.flatMap((p) => p.data)];
}

/** La cotización actual del jugador; nulo si nunca fue cotizado (07 FR-018). */
export async function fetchCurrentQuote(playerId: string): Promise<ApiQuote | null> {
  const { data } = await httpClient.get<{ quoted: boolean; quote: ApiQuote | null }>(
    `/quotes/players/${playerId}/current`,
  );
  return data.quoted ? data.quote : null;
}

/** Resultado de buscar la cotización vigente en un instante (FR-028 a FR-030). */
export interface QuoteAt {
  /** Falso si el jugador no tenía cotización hasta ese instante: no es un error. */
  quoted: boolean;
  quote: ApiQuote | null;
  /** Cuándo se calculó la primera cotización; solo si `quoted` es falso. Nulo si nunca fue cotizado. */
  firstQuotedAt: string | null;
}

/**
 * La cotización vigente de un jugador en un instante: la última calculada hasta ahí, inclusive.
 * Para buscar «un día», el instante es el final de ese día en la zona del usuario.
 */
export async function fetchQuoteAt(playerId: string, at: string): Promise<QuoteAt> {
  const { data } = await httpClient.get<QuoteAt>(`/quotes/players/${playerId}/at`, { params: { at } });
  return data;
}

const QUOTE_AT_MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: 'La fecha no es válida o es futura.',
  PLAYER_NOT_FOUND: 'Ese jugador no existe.',
  INTERNAL_ERROR: 'Ocurrió un error inesperado. Intentá de nuevo.',
};

/** Mensaje para cada código de error de la búsqueda por fecha; cualquier otro caso es genérico. */
export function quoteAtErrorMessage(code: string | null): string {
  if (code && code in QUOTE_AT_MESSAGES) return QUOTE_AT_MESSAGES[code];
  return 'No se pudo buscar la cotización. Revisá tu conexión e intentá de nuevo.';
}
