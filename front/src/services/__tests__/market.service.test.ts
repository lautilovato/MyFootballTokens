import { beforeEach, describe, expect, it, vi } from 'vitest';
import { httpClient } from '../http-client';
import {
  fetchPlayerListings,
  marketErrorMessage,
  publishListing,
  purchaseListing,
  withdrawListing,
  type Listing,
} from '../market.service';

vi.mock('../http-client', () => ({ httpClient: { get: vi.fn(), post: vi.fn() } }));

const get = vi.mocked(httpClient.get);
const post = vi.mocked(httpClient.post);

const listing: Listing = {
  id: 'l1',
  tokenId: 't1',
  serial: 7,
  playerId: 'p1',
  status: 'activa',
  price: 300,
  listedAt: '2026-10-20T12:00:00.000Z',
  closedAt: null,
};

/** 09-mercado — llamadas del mercado y mensajes por código de error (FR-042). */
describe('market.service', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it('publishListing envía solo el token: ni precio ni usuario (FR-002, FR-009)', async () => {
    post.mockResolvedValue({ data: listing });
    await expect(publishListing('t1')).resolves.toEqual(listing);
    expect(post).toHaveBeenCalledWith('/market/listings', { tokenId: 't1' });
  });

  it('withdrawListing retira por id de publicación', async () => {
    post.mockResolvedValue({ data: { ...listing, status: 'retirada', closedAt: '2026-10-20T13:00:00.000Z' } });
    const result = await withdrawListing('l1');
    expect(post).toHaveBeenCalledWith('/market/listings/l1/withdraw');
    expect(result.status).toBe('retirada');
  });

  it('fetchPlayerListings pagina las cartas a la venta del jugador', async () => {
    get.mockResolvedValue({ data: { playerId: 'p1', price: 300, data: [], meta: { total: 0, page: 2, limit: 5, totalPages: 0 } } });
    const page = await fetchPlayerListings('p1', 2, 5);
    expect(get).toHaveBeenCalledWith('/market/players/p1/listings', { params: { page: 2, limit: 5 } });
    expect(page.price).toBe(300);
  });

  it('purchaseListing envía la publicación y el precio aceptado, sin usuario (FR-013, FR-016)', async () => {
    post.mockResolvedValue({ data: { id: 'c1', price: 300, balanceAfter: 1700 } });
    await purchaseListing('l1', 300);
    expect(post).toHaveBeenCalledWith('/market/purchases', { listingId: 'l1', acceptedPrice: 300 });
  });

  describe('mensajes de error', () => {
    const codes = [
      'TOKEN_NOT_FOUND',
      'TOKEN_ALREADY_LISTED',
      'PRICE_NOT_AVAILABLE',
      'LISTING_NOT_FOUND',
      'LISTING_NOT_ACTIVE',
      'OWN_LISTING',
      'PRICE_CHANGED',
      'INSUFFICIENT_CREDITS',
      'PLAYER_NOT_FOUND',
      'RATE_LIMITED',
      'INTERNAL_ERROR',
    ];

    it('cada código tiene un mensaje distinto', () => {
      expect(new Set(codes.map(marketErrorMessage)).size).toBe(codes.length);
    });

    it.each(codes)('tiene un mensaje propio para %s', (code) => {
      expect(marketErrorMessage(code)).not.toBe(marketErrorMessage(null));
    });

    it('un código desconocido o ausente da un mensaje genérico', () => {
      expect(marketErrorMessage('OTRO')).toBe(marketErrorMessage(null));
    });
  });
});
