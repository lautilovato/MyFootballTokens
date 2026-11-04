import { beforeEach, describe, expect, it, vi } from 'vitest';
import { httpClient } from '../http-client';
import {
  fetchAllQuotes,
  fetchCurrentQuote,
  fetchQuoteAt,
  QUOTES_PAGE_SIZE,
  quoteAtErrorMessage,
  type ApiQuote,
} from '../quotes.service';

vi.mock('../http-client', () => ({ httpClient: { get: vi.fn() } }));

const get = vi.mocked(httpClient.get);

function quote(n: number): ApiQuote {
  return {
    price: 100 + n,
    score: 0.5,
    rawScore: 0.5,
    calculatedAt: new Date(Date.UTC(2026, 0, 1 + n)).toISOString(),
    origin: 'AUTOMATIC',
    season: '2025-2026',
    strategy: { key: 'performance', name: 'Performance', version: 1 },
    positionProfile: 'GENERAL',
    usedDefaultReputation: false,
    missingMatchesPlayed: false,
  };
}

const meta = (total: number, page: number, totalPages: number) => ({ total, page, limit: QUOTES_PAGE_SIZE, totalPages });

/** 10-historial-operaciones — cotizaciones del jugador para el gráfico completo (research #5). */
describe('quotes.service', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('fetchAllQuotes pide la primera página con el máximo permitido', async () => {
    get.mockResolvedValue({ data: { data: [quote(0), quote(1)], meta: meta(2, 1, 1) } });

    await expect(fetchAllQuotes('p1')).resolves.toEqual([quote(0), quote(1)]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/quotes/players/p1/history', { params: { page: 1, limit: 200 } });
  });

  it('con más de una página pide las restantes y devuelve todo en orden cronológico', async () => {
    get.mockImplementation(async (_url, config) => {
      const { page } = (config?.params ?? { page: 1 }) as { page: number };
      const start = (page - 1) * QUOTES_PAGE_SIZE;
      const size = page === 3 ? 100 : QUOTES_PAGE_SIZE;
      return { data: { data: Array.from({ length: size }, (_, i) => quote(start + i)), meta: meta(500, page, 3) } };
    });

    const all = await fetchAllQuotes('p1');

    expect(get).toHaveBeenCalledTimes(3);
    expect(all).toHaveLength(500);
    const times = all.map((q) => new Date(q.calculatedAt).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('un jugador sin cotizaciones devuelve una lista vacía', async () => {
    get.mockResolvedValue({ data: { data: [], meta: meta(0, 1, 0) } });
    await expect(fetchAllQuotes('p1')).resolves.toEqual([]);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('un error de la red se propaga', async () => {
    get.mockRejectedValue(new Error('Network Error'));
    await expect(fetchAllQuotes('p1')).rejects.toThrow('Network Error');
  });

  it('fetchCurrentQuote devuelve la cotización con su estrategia y versión', async () => {
    get.mockResolvedValue({ data: { quoted: true, quote: quote(3) } });
    await expect(fetchCurrentQuote('p1')).resolves.toEqual(quote(3));
    expect(get).toHaveBeenCalledWith('/quotes/players/p1/current');
  });

  it('fetchCurrentQuote devuelve nulo si el jugador nunca fue cotizado', async () => {
    get.mockResolvedValue({ data: { quoted: false, quote: null } });
    await expect(fetchCurrentQuote('p1')).resolves.toBeNull();
  });
});

/** 10-historial-operaciones US3 — cotización vigente en un instante (FR-028 a FR-030). */
describe('quotes.service — cotización en un instante', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('fetchQuoteAt envía el instante como parámetro y devuelve la respuesta tal cual', async () => {
    const found = { quoted: true, quote: quote(2), firstQuotedAt: null };
    get.mockResolvedValue({ data: found });

    await expect(fetchQuoteAt('p1', '2026-10-15T02:59:59.999Z')).resolves.toBe(found);
    expect(get).toHaveBeenCalledWith('/quotes/players/p1/at', { params: { at: '2026-10-15T02:59:59.999Z' } });
  });

  it('un jugador sin cotización a esa fecha devuelve quoted=false con la fecha de la primera', async () => {
    const none = { quoted: false, quote: null, firstQuotedAt: '2026-01-05T02:00:00.000Z' };
    get.mockResolvedValue({ data: none });
    await expect(fetchQuoteAt('p1', '2020-01-01T00:00:00.000Z')).resolves.toEqual(none);
  });

  it('traduce cada código de error a un mensaje propio y cualquier otro a uno genérico', () => {
    expect(quoteAtErrorMessage('VALIDATION_ERROR')).toMatch(/fecha/);
    expect(quoteAtErrorMessage('PLAYER_NOT_FOUND')).toMatch(/no existe/);
    expect(quoteAtErrorMessage('INTERNAL_ERROR')).toMatch(/inesperado/);
    expect(quoteAtErrorMessage(null)).toMatch(/conexión/);
    expect(quoteAtErrorMessage('OTRO')).toMatch(/conexión/);
  });
});
