import { httpClient } from './http-client';

/**
 * Mercado: publicar, retirar, ver las cartas a la venta de un jugador y comprar. Contrato en
 * .specify/specs/09-mercado/contracts/market.openapi.yaml.
 *
 * El precio de una carta es siempre la cotización vigente de su jugador (FR-001): ningún pedido
 * lleva un precio a fijar.
 */

export type ListingStatus = 'activa' | 'vendida' | 'retirada';

export interface Listing {
  id: string;
  tokenId: string;
  serial: number;
  playerId: string;
  status: ListingStatus;
  /** Precio vigente = cotización vigente del jugador. */
  price: number;
  listedAt: string;
  closedAt: string | null;
}

export async function publishListing(tokenId: string): Promise<Listing> {
  const { data } = await httpClient.post<Listing>('/market/listings', { tokenId });
  return data;
}

export async function withdrawListing(listingId: string): Promise<Listing> {
  const { data } = await httpClient.post<Listing>(`/market/listings/${listingId}/withdraw`);
  return data;
}

export interface PlayerListing {
  listingId: string;
  tokenId: string;
  serial: number;
  /** Publicación del usuario de la sesión: no se puede comprar. */
  mine: boolean;
  listedAt: string;
}

export interface PlayerListingsPage {
  playerId: string;
  /** Precio de cada carta = cotización vigente del jugador; nulo si no tiene. */
  price: number | null;
  data: PlayerListing[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface Purchase {
  id: string;
  listingId: string;
  tokenId: string;
  serial: number;
  playerId: string;
  rarity: string;
  /** Precio cobrado = cotización vigente del jugador en ese instante. */
  price: number;
  balanceAfter: number;
  purchasedAt: string;
}

export async function fetchPlayerListings(playerId: string, page: number, limit: number): Promise<PlayerListingsPage> {
  const { data } = await httpClient.get<PlayerListingsPage>(`/market/players/${playerId}/listings`, {
    params: { page, limit },
  });
  return data;
}

/** `acceptedPrice` es el precio que el usuario vio y confirmó (FR-013). */
export async function purchaseListing(listingId: string, acceptedPrice: number): Promise<Purchase> {
  const { data } = await httpClient.post<Purchase>('/market/purchases', { listingId, acceptedPrice });
  return data;
}

const MARKET_MESSAGES: Record<string, string> = {
  OWN_LISTING: 'No podés comprar una carta tuya.',
  PRICE_CHANGED: 'El precio de la carta cambió con la última cotización. Revisalo y volvé a intentar.',
  INSUFFICIENT_CREDITS: 'Tu saldo no alcanza para comprar esta carta.',
  PLAYER_NOT_FOUND: 'Ese jugador no existe.',
  TOKEN_NOT_FOUND: 'Esa carta ya no es tuya.',
  TOKEN_ALREADY_LISTED: 'Esa carta ya está a la venta.',
  PRICE_NOT_AVAILABLE: 'El jugador todavía no tiene cotización: su carta no se puede vender ni comprar.',
  LISTING_NOT_FOUND: 'Esa publicación no existe.',
  LISTING_NOT_ACTIVE: 'Esa carta ya no está a la venta.',
  RATE_LIMITED: 'Hiciste muchas operaciones seguidas. Esperá un momento y probá de nuevo.',
  INTERNAL_ERROR: 'Ocurrió un error inesperado y no se aplicó ningún cambio. Intentá de nuevo.',
};

/** Mensaje propio para cada código de error del mercado (FR-042). */
export function marketErrorMessage(code: string | null): string {
  if (code && code in MARKET_MESSAGES) return MARKET_MESSAGES[code];
  return 'No se pudo completar la operación. Revisá tu conexión e intentá de nuevo.';
}
