import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HomePage, { LISTINGS_PAGE_SIZE } from '../HomePage';
import { hasActiveFilters } from '../home-filters';
import { fetchPlayerListings, purchaseListing, type PlayerListingsPage } from '../../services/market.service';
import { fetchLeagues, fetchPlayerDetail, fetchPlayers, type ApiPlayerDetail } from '../../services/players.service';
import { fetchAllQuotes, fetchCurrentQuote, type ApiQuote } from '../../services/quotes.service';

vi.mock('../../services/players.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/players.service')>()),
  fetchPlayers: vi.fn(),
  fetchLeagues: vi.fn(),
  fetchPlayerDetail: vi.fn(),
}));
vi.mock('../../services/market.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/market.service')>()),
  fetchPlayerListings: vi.fn(),
  purchaseListing: vi.fn(),
}));
vi.mock('../../services/quotes.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/quotes.service')>()),
  fetchAllQuotes: vi.fn(),
  fetchCurrentQuote: vi.fn(),
}));
vi.mock('../../services/useAuth', () => ({ useAuth: () => ({ user: { username: 'ana' }, logout: vi.fn() }) }));
const { refreshBalance } = vi.hoisted(() => ({ refreshBalance: vi.fn(async () => undefined) }));
vi.mock('../../app/useCredits', () => ({ useCredits: () => ({ balance: 2000, refresh: refreshBalance, setBalance: vi.fn() }) }));
/** jsdom no implementa `<dialog>.showModal()`: el doble muestra el contenido si está abierto. */
vi.mock('../../components/confirm-modal/ConfirmModal', () => ({
  ConfirmModal: (props: { open: boolean; title: string; description?: string; onConfirm: () => void; onCancel: () => void }) =>
    props.open ? (
      <div role="dialog">
        <p>{props.title}</p>
        <p>{props.description}</p>
        <button onClick={props.onConfirm}>confirmar</button>
        <button onClick={props.onCancel}>cancelar</button>
      </div>
    ) : null,
}));

const players = vi.mocked(fetchPlayers);
const leagues = vi.mocked(fetchLeagues);
const detail = vi.mocked(fetchPlayerDetail);
const listings = vi.mocked(fetchPlayerListings);
const buy = vi.mocked(purchaseListing);
const allQuotes = vi.mocked(fetchAllQuotes);
const currentQuote = vi.mocked(fetchCurrentQuote);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  players.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } });
  leagues.mockResolvedValue([]);
  allQuotes.mockResolvedValue([]);
  currentQuote.mockResolvedValue(null);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(path: string) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <HomePage />
      </MemoryRouter>,
    );
  });
}

/** 08-sobres FR-070 — el Market solo muestra cartas a la venta y arranca vacío. */
describe('Market sin cartas a la venta', () => {
  it('sin filtros explica que todavía no hay cartas a la venta y lleva a los sobres', async () => {
    await render('/');
    expect(container.textContent).toContain('Todavía no hay cartas a la venta');
    expect(container.textContent).not.toContain('Sin resultados');
    const link = [...container.querySelectorAll('a')].find((a) => a.textContent === 'Ir a sobres');
    expect(link?.getAttribute('href')).toBe('/packs');
  });

  it('los filtros siguen visibles', async () => {
    await render('/');
    expect(container.querySelector('input, select, [role="search"], aside')).not.toBeNull();
  });

  it('con filtros aplicados, un resultado vacío es «Sin resultados»', async () => {
    await render('/?rarity=legendary');
    expect(container.textContent).toContain('Sin resultados');
    expect(container.textContent).not.toContain('Todavía no hay cartas a la venta');
  });

  it('hasActiveFilters ignora la página', () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ page: 3 })).toBe(false);
    expect(hasActiveFilters({ search: 'messi' })).toBe(true);
    expect(hasActiveFilters({ rarity: ['epic'] })).toBe(true);
  });
});

/** 09-mercado US2 — comprar una carta desde el panel de detalle (FR-038 a FR-042). */
describe('Compra desde el detalle del jugador', () => {
  const DETAIL = {
    id: 'p1',
    name: 'Mario Mercado',
    position: 'MF',
    ovr: 70,
    rarity: 'rare',
    club: { name: 'E2E FC', crestUrl: null },
    nationality: { name: 'Argentina', code: 'ar' },
    imageUrl: null,
    goals: 1,
    assists: 1,
    marketValue: 300,
    changePct: 0,
    supply: { minted: 100, total: 100 }, forSaleCount: 0,
    priceHistory: [],
    league: 'E2E',
    season: '2025-2026',
    height: 180,
    matchesPlayed: 10,
    shotsPerGame: 1,
    keyPasses: 1,
    dribbles: 1,
    tackles: 1,
    rating: 7,
  } as unknown as ApiPlayerDetail;

  const LISTINGS: PlayerListingsPage = {
    playerId: 'p1',
    price: 300,
    data: [
      { listingId: 'l7', tokenId: 't7', serial: 7, mine: false, listedAt: '2026-10-20T12:00:00.000Z' },
      { listingId: 'l9', tokenId: 't9', serial: 9, mine: true, listedAt: '2026-10-20T12:05:00.000Z' },
    ],
    meta: { total: 2, page: 1, limit: LISTINGS_PAGE_SIZE, totalPages: 1 },
  };

  beforeEach(() => {
    detail.mockReset().mockResolvedValue(DETAIL);
    listings.mockReset().mockResolvedValue(LISTINGS);
    buy.mockReset();
    refreshBalance.mockClear();
  });

  const button = (text: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === text)!;
  const dialog = () => container.querySelector('[role="dialog"]');

  it('al abrir un jugador pide sus cartas a la venta', async () => {
    await render('/?player=p1');
    expect(listings).toHaveBeenCalledWith('p1', 1, LISTINGS_PAGE_SIZE);
    expect(container.textContent).toContain('#7');
    expect(container.textContent).toContain('Tuya');
  });

  it('«Comprar» confirma con la carta, el precio y el saldo que quedaría; cancelar no compra', async () => {
    await render('/?player=p1');
    await act(async () => button('Comprar').click());
    expect(dialog()?.textContent).toContain('Mario Mercado #7 cuesta 300 créditos');
    expect(dialog()?.textContent).toContain('Te quedarían 1.700 créditos');

    await act(async () => button('cancelar').click());
    expect(buy).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  it('confirmar compra al precio mostrado y refresca el saldo, la lista y el Market', async () => {
    buy.mockResolvedValue({ id: 'c1', serial: 7, price: 300, balanceAfter: 1700 } as never);
    await render('/?player=p1');
    const marketCalls = players.mock.calls.length;
    const listingCalls = listings.mock.calls.length;

    await act(async () => button('Comprar').click());
    await act(async () => button('confirmar').click());

    expect(buy).toHaveBeenCalledWith('l7', 300);
    expect(refreshBalance).toHaveBeenCalled();
    expect(listings.mock.calls.length).toBeGreaterThan(listingCalls);
    expect(players.mock.calls.length).toBeGreaterThan(marketCalls);
    expect(container.textContent).toContain('Compraste la carta #7');
    const link = [...container.querySelectorAll('a')].find((a) => a.textContent === 'Ir a mis cartas');
    expect(link?.getAttribute('href')).toBe('/inventory');
  });

  it('un rechazo muestra su mensaje y vuelve a pedir el saldo y la lista', async () => {
    buy.mockRejectedValue({ response: { data: { code: 'LISTING_NOT_ACTIVE', message: 'x' } } });
    await render('/?player=p1');
    const listingCalls = listings.mock.calls.length;

    await act(async () => button('Comprar').click());
    await act(async () => button('confirmar').click());

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Esa carta ya no está a la venta.');
    expect(refreshBalance).toHaveBeenCalled();
    expect(listings.mock.calls.length).toBeGreaterThan(listingCalls);
  });
});

/** 10-historial-operaciones US2 — gráfico completo de cotizaciones desde el detalle (FR-019 a FR-026). */
describe('Gráfico completo de cotizaciones desde el detalle', () => {
  const DETAIL = {
    id: 'p1',
    name: 'Mario Mercado',
    position: 'MF',
    ovr: 70,
    rarity: 'rare',
    club: { name: 'E2E FC', crestUrl: null },
    nationality: { name: 'Argentina', code: 'ar' },
    imageUrl: null,
    goals: 1,
    assists: 1,
    marketValue: 300,
    changePct: 5,
    supply: { minted: 100, total: 100 },
    forSaleCount: 0,
    priceHistory: [280, 300],
    league: 'E2E',
    season: '2025-2026',
    height: 180,
    matchesPlayed: 10,
    shotsPerGame: 1,
    keyPasses: 1,
    dribbles: 1,
    tackles: 1,
    rating: 7,
  } as unknown as ApiPlayerDetail;

  const quote = (price: number, day: number, strategy = { key: 'performance', name: 'Performance', version: 1 }): ApiQuote => ({
    price,
    score: 0.5,
    rawScore: 0.5,
    calculatedAt: new Date(Date.UTC(2026, 9, day, 2)).toISOString(),
    origin: 'AUTOMATIC',
    season: '2025-2026',
    strategy,
    positionProfile: 'GENERAL',
    usedDefaultReputation: false,
    missingMatchesPlayed: false,
  });
  const SERIES = [quote(280, 5), quote(300, 12, { key: 'prestige', name: 'Prestigio', version: 2 })];

  const showModal = vi.fn();
  beforeEach(() => {
    // jsdom no implementa <dialog>.showModal(): el doble solo refleja el atributo `open`.
    showModal.mockReset().mockImplementation(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.showModal = showModal as unknown as () => void;
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
    detail.mockReset().mockResolvedValue(DETAIL);
    listings.mockReset().mockResolvedValue({ playerId: 'p1', price: 300, data: [], meta: { total: 0, page: 1, limit: LISTINGS_PAGE_SIZE, totalPages: 0 } });
    allQuotes.mockReset().mockResolvedValue(SERIES);
    currentQuote.mockReset().mockResolvedValue(SERIES[1]);
  });

  const button = (text: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === text)!;
  const modal = () => container.querySelector('dialog[aria-label^="Cotizaciones de"]') as HTMLDialogElement;

  it('al abrir un jugador pide su cotización actual y muestra la estrategia bajo el gráfico', async () => {
    await render('/?player=p1');
    expect(currentQuote).toHaveBeenCalledWith('p1');
    expect(container.textContent).toContain('Cotizado con Prestigio v2');
  });

  it('si no se puede pedir la cotización actual, el panel funciona sin esa línea', async () => {
    currentQuote.mockRejectedValue(new Error('caído'));
    await render('/?player=p1');
    expect(container.textContent).toContain('Mario Mercado');
    expect(container.textContent).not.toContain('Cotizado con');
    expect(button('Ver más')).toBeDefined();
  });

  it('«Ver más» abre el modal con todas las cotizaciones y su estrategia', async () => {
    await render('/?player=p1');
    expect(modal().hasAttribute('open')).toBe(false);

    await act(async () => button('Ver más').click());

    expect(allQuotes).toHaveBeenCalledWith('p1');
    expect(showModal).toHaveBeenCalled();
    const text = modal().textContent ?? '';
    expect(text).toContain('Cotizaciones de Mario Mercado');
    expect(text).toContain('Performance v1');
    expect(text).toContain('Prestigio v2');
    expect(modal().querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('si falla la carga muestra el error con «Reintentar» sin cerrar el panel, y reintenta', async () => {
    allQuotes.mockRejectedValueOnce(new Error('caído'));
    await render('/?player=p1');
    await act(async () => button('Ver más').click());

    expect(modal().querySelector('[role="alert"]')?.textContent).toContain('No se pudieron cargar las cotizaciones');
    expect(container.textContent).toContain('Player Details');

    await act(async () => button('Reintentar').click());
    expect(allQuotes).toHaveBeenCalledTimes(2);
    expect(modal().querySelector('[role="alert"]')).toBeNull();
    expect(modal().querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('cerrar el modal deja el panel como estaba', async () => {
    await render('/?player=p1');
    await act(async () => button('Ver más').click());
    await act(async () => button('Cerrar').click());

    expect(modal().hasAttribute('open')).toBe(false);
    expect(container.textContent).toContain('Mario Mercado');
    expect(container.textContent).toContain('Cotizado con Prestigio v2');
  });
});
