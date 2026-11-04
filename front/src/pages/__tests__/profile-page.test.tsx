import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProfilePage from '../ProfilePage';
import { getOperations, HISTORY_PAGE_SIZE, type OperationEntry, type OperationsPage } from '../../services/history.service';
import type { ApiPlayerCard } from '../../services/players.service';
import { fetchAllQuotes, fetchQuoteAt, type ApiQuote } from '../../services/quotes.service';

vi.mock('../../services/history.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/history.service')>()),
  getOperations: vi.fn(),
}));
vi.mock('../../services/quotes.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/quotes.service')>()),
  fetchAllQuotes: vi.fn(),
  fetchQuoteAt: vi.fn(),
}));
vi.mock('../../services/useAuth', () => ({
  useAuth: () => ({ user: { username: 'ana', email: 'ana@secreto.test' }, logout: vi.fn() }),
}));
vi.mock('../../app/useCredits', () => ({ useCredits: () => ({ balance: 1800, refresh: vi.fn(), setBalance: vi.fn() }) }));

const fetchOperations = vi.mocked(getOperations);
const allQuotes = vi.mocked(fetchAllQuotes);
const quoteAt = vi.mocked(fetchQuoteAt);

const player: ApiPlayerCard = {
  id: 'p1',
  name: 'Mario Mercado',
  position: 'FW',
  ovr: 80,
  rarity: 'rare',
  club: { name: 'E2E FC', crestUrl: null },
  nationality: { name: 'Argentina', code: 'ar' },
  imageUrl: null,
  goals: 1,
  assists: 0,
  marketValue: 3000,
  changePct: 0,
  supply: { minted: 100, total: 100 },
  forSaleCount: 0, firstListedSerial: null,
  priceHistory: [],
};

function entry(id: string, kind: OperationEntry['kind'], name = 'Mario Mercado'): OperationEntry {
  return {
    id,
    kind,
    at: '2026-10-20T15:30:00.000Z',
    tokenId: `t-${id}`,
    serial: 7,
    rarity: 'rare',
    player: { ...player, name },
    packType: kind === 'sobre' ? 'common' : null,
    price: kind === 'sobre' ? null : 1200,
    balanceBefore: kind === 'sobre' ? null : 3000,
    balanceAfter: kind === 'sobre' ? null : 1800,
    counterparty: kind === 'sobre' ? null : 'otro_usuario',
    quote: null,
  };
}

function page(data: OperationEntry[], meta: Partial<OperationsPage['meta']> = {}): OperationsPage {
  return { data, meta: { total: data.length, page: 1, limit: HISTORY_PAGE_SIZE, totalPages: data.length ? 1 : 0, ...meta } };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  fetchOperations.mockReset();
  allQuotes.mockReset();
  quoteAt.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render() {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );
  });
}

const button = (text: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === text)!;
const tab = (text: string) => [...container.querySelectorAll('[role="tab"]')].find((b) => b.textContent === text) as HTMLButtonElement;

/** 10-historial-operaciones US1 — pantalla «Mi perfil» (FR-001, FR-002, FR-003). */
describe('ProfilePage', () => {
  it('muestra el nombre y el saldo, y ningún otro dato del usuario como el correo (FR-002)', async () => {
    fetchOperations.mockResolvedValue(page([]));
    await render();
    expect(container.querySelector('h1')?.textContent).toBe('Mi perfil');
    expect(container.textContent).toContain('ana');
    expect(container.textContent).toContain('1.800 créditos');
    expect(container.textContent).not.toContain('ana@secreto.test');
  });

  it('carga la primera página del historial con el filtro «Todas»', async () => {
    fetchOperations.mockResolvedValue(page([entry('s1', 'sobre'), entry('compra:1', 'compra'), entry('venta:1', 'venta')]));
    await render();

    expect(fetchOperations).toHaveBeenCalledWith('all', 1, HISTORY_PAGE_SIZE);
    expect(container.querySelectorAll('ul > li')).toHaveLength(3);
    expect(container.textContent).toContain('Historial de operaciones');
  });

  it('cambiar de filtro pide la página 1 con el filtro nuevo', async () => {
    fetchOperations.mockResolvedValue(page([entry('s1', 'sobre')], { total: 30, totalPages: 2 }));
    await render();
    fetchOperations.mockResolvedValue(page([entry('venta:1', 'venta')]));
    await act(async () => button('Siguiente').click());
    expect(fetchOperations).toHaveBeenLastCalledWith('all', 2, HISTORY_PAGE_SIZE);

    await act(async () => tab('Vendidas').click());
    expect(fetchOperations).toHaveBeenLastCalledWith('sold', 1, HISTORY_PAGE_SIZE);
    expect(tab('Vendidas').getAttribute('aria-selected')).toBe('true');
  });

  it('pasar de página pide la siguiente', async () => {
    fetchOperations.mockResolvedValue(page([entry('s1', 'sobre')], { total: 45, totalPages: 3 }));
    await render();
    fetchOperations.mockResolvedValue(page([entry('compra:9', 'compra', 'Otro Jugador')], { total: 45, page: 2, totalPages: 3 }));
    await act(async () => button('Siguiente').click());

    expect(fetchOperations).toHaveBeenLastCalledWith('all', 2, HISTORY_PAGE_SIZE);
    expect(container.textContent).toContain('Otro Jugador');
    expect(container.textContent).toContain('Página 2 de 3');
  });

  it('ante un error muestra un mensaje y reintenta', async () => {
    fetchOperations.mockRejectedValueOnce(new Error('Network Error'));
    await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('No pudimos cargar tu historial');

    fetchOperations.mockResolvedValue(page([entry('compra:1', 'compra')]));
    await act(async () => button('Reintentar').click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelectorAll('ul > li')).toHaveLength(1);
  });

  it('sin operaciones muestra el vacío con acceso a Sobres y al Market (FR-013)', async () => {
    fetchOperations.mockResolvedValue(page([]));
    await render();
    expect(container.textContent).toContain('Todavía no hiciste operaciones');
    const hrefs = [...container.querySelectorAll('main a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(['/packs', '/']));
  });

  it('una respuesta vieja no pisa a la de un filtro más nuevo', async () => {
    let resolveFirst: (value: OperationsPage) => void = () => {};
    fetchOperations.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)));
    await render();

    fetchOperations.mockResolvedValue(page([entry('venta:1', 'venta', 'Jugador Nuevo')]));
    await act(async () => tab('Vendidas').click());
    await act(async () => resolveFirst(page([entry('s1', 'sobre', 'Jugador Viejo')])));

    expect(container.textContent).toContain('Jugador Nuevo');
    expect(container.textContent).not.toContain('Jugador Viejo');
  });
});

/** 10-historial-operaciones US4 — «Ver evolución» abre el gráfico del jugador de la entrada (FR-018, US4-4). */
describe('ProfilePage — ver evolución', () => {
  const strategy = { key: 'prestige', name: 'Prestigio', version: 2 };
  const quote = (price: number, iso: string): ApiQuote => ({
    price,
    score: 0.5,
    rawScore: 0.5,
    calculatedAt: iso,
    origin: 'AUTOMATIC',
    season: '2025-2026',
    strategy,
    positionProfile: 'GENERAL',
    usedDefaultReputation: false,
    missingMatchesPlayed: false,
  });
  const SERIES = [quote(1000, '2026-10-05T05:00:00.000Z'), quote(1200, '2026-10-12T05:00:00.000Z')];
  const modal = () => container.querySelector('dialog[aria-label^="Cotizaciones de"]') as HTMLDialogElement;

  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
    allQuotes.mockResolvedValue(SERIES);
    quoteAt.mockResolvedValue({ quoted: true, quote: SERIES[0], firstQuotedAt: null });
  });

  it('«Ver evolución» abre el modal del jugador, con la cotización vigente en esa operación resaltada', async () => {
    const buy = entry('compra:1', 'compra', 'Mario Mercado');
    fetchOperations.mockResolvedValue(page([buy]));
    await render();

    await act(async () => button('Ver evolución').click());

    expect(allQuotes).toHaveBeenCalledWith('p1');
    expect(quoteAt).toHaveBeenCalledWith('p1', buy.at);
    expect(modal().hasAttribute('open')).toBe(true);
    expect(modal().textContent).toContain('Cotizaciones de Mario Mercado');
    expect(modal().querySelectorAll('[data-testid="highlight"]')).toHaveLength(1);
    expect(modal().querySelector('section[aria-label="Cotización elegida"]')!.textContent).toContain('Prestigio v2');
  });

  it('también desde una carta de sobre', async () => {
    fetchOperations.mockResolvedValue(page([entry('s1', 'sobre')]));
    await render();
    await act(async () => button('Ver evolución').click());
    expect(modal().hasAttribute('open')).toBe(true);
  });

  it('cerrar el modal deja el historial como estaba', async () => {
    fetchOperations.mockResolvedValue(page([entry('compra:1', 'compra')]));
    await render();
    await act(async () => button('Ver evolución').click());
    await act(async () => button('Cerrar').click());

    expect(modal().hasAttribute('open')).toBe(false);
    expect(container.querySelectorAll('ul > li')).toHaveLength(1);
    expect(fetchOperations).toHaveBeenCalledTimes(1);
  });
});
