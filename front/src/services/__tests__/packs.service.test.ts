import { beforeEach, describe, expect, it, vi } from 'vitest';
import { httpClient } from '../http-client';
import {
  extractApiErrorCode,
  getPackCatalog,
  openPack,
  openPackErrorMessage,
  type PackCatalog,
} from '../packs.service';
import { getBalance } from '../credits.service';
import { getInventory } from '../inventory.service';

vi.mock('../http-client', () => ({ httpClient: { get: vi.fn(), post: vi.fn() } }));

const get = vi.mocked(httpClient.get);
const post = vi.mocked(httpClient.post);

/** 08-sobres T052 — llamadas de la pantalla de sobres e inventario y mensajes por código (FR-060). */
describe('packs.service', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it('getPackCatalog pide /packs/types y devuelve el catálogo', async () => {
    const catalog: PackCatalog = {
      stockGenerated: true,
      types: [
        {
          type: 'common',
          price: 100,
          cards: 3,
          remaining: 10,
          probabilities: { common: 0.7, rare: 0.2, epic: 0.09, legendary: 0.01 },
        },
      ],
    };
    get.mockResolvedValue({ data: catalog });

    await expect(getPackCatalog()).resolves.toEqual(catalog);
    expect(get).toHaveBeenCalledWith('/packs/types');
  });

  it('openPack envía solo el tipo: el usuario sale de la sesión (FR-025)', async () => {
    post.mockResolvedValue({ data: { id: 'o1' } });
    await openPack('rare');
    expect(post).toHaveBeenCalledWith('/packs/openings', { type: 'rare' });
  });

  it('getBalance devuelve los créditos de /credits', async () => {
    get.mockResolvedValue({ data: { credits: 1800 } });
    await expect(getBalance()).resolves.toBe(1800);
    expect(get).toHaveBeenCalledWith('/credits');
  });

  it('getInventory pagina /inventory', async () => {
    get.mockResolvedValue({ data: { data: [], meta: { total: 0, page: 2, limit: 12, totalPages: 0 } } });
    await getInventory(2, 12);
    expect(get).toHaveBeenCalledWith('/inventory', { params: { page: 2, limit: 12 } });
  });

  describe('errores de la apertura', () => {
    it('lee el código del formato estándar', () => {
      expect(extractApiErrorCode({ response: { data: { code: 'PACK_SOLD_OUT', message: 'x' } } })).toBe(
        'PACK_SOLD_OUT',
      );
      expect(extractApiErrorCode(new Error('red caída'))).toBeNull();
      expect(extractApiErrorCode({ response: { data: { message: 'sin código' } } })).toBeNull();
    });

    it.each(['INSUFFICIENT_CREDITS', 'PACK_SOLD_OUT', 'PACKS_NOT_AVAILABLE', 'PACK_TYPE_NOT_FOUND', 'INTERNAL_ERROR'])(
      'tiene un mensaje propio para %s',
      (code) => {
        const message = openPackErrorMessage(code);
        expect(message).not.toBe(openPackErrorMessage(null));
        expect(message.length).toBeGreaterThan(10);
      },
    );

    it('los mensajes de cada código son distintos entre sí', () => {
      const codes = ['INSUFFICIENT_CREDITS', 'PACK_SOLD_OUT', 'PACKS_NOT_AVAILABLE', 'PACK_TYPE_NOT_FOUND', 'INTERNAL_ERROR'];
      expect(new Set(codes.map(openPackErrorMessage)).size).toBe(codes.length);
    });

    it('un código desconocido o ausente da un mensaje genérico', () => {
      expect(openPackErrorMessage('OTRO')).toBe(openPackErrorMessage(null));
    });
  });
});
