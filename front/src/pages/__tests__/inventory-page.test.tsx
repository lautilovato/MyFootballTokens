import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InventoryPage, { INVENTORY_PAGE_SIZE } from '../InventoryPage';
import { getInventory, type InventoryItem, type InventoryPage as Page } from '../../services/inventory.service';
import { publishListing, withdrawListing } from '../../services/market.service';
import type { ApiPlayerCard } from '../../services/players.service';

vi.mock('../../services/inventory.service', () => ({ getInventory: vi.fn() }));
vi.mock('../../services/market.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/market.service')>()),
  publishListing: vi.fn(),
  withdrawListing: vi.fn(),
}));
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
vi.mock('../../services/useAuth', () => ({ useAuth: () => ({ user: { username: 'ana' }, logout: vi.fn() }) }));
vi.mock('../../app/useCredits', () => ({ useCredits: () => ({ balance: 1800, refresh: vi.fn(), setBalance: vi.fn() }) }));

const fetchInventory = vi.mocked(getInventory);
const publish = vi.mocked(publishListing);
const withdraw = vi.mocked(withdrawListing);

function item(id: string, name: string, reputation: number, serials: number[], listed: number[] = []): InventoryItem {
  const player: ApiPlayerCard = {
    id,
    name,
    position: 'FW',
    ovr: reputation,
    rarity: 'rare',
    club: { name: 'E2E FC', crestUrl: null },
    nationality: { name: 'Argentina', code: 'ar' },
    imageUrl: null,
    goals: 1,
    assists: 0,
    marketValue: 3000,
    changePct: 0,
    supply: { minted: 100, total: 100 }, forSaleCount: 0,
    priceHistory: [],
  };
  return { player, reputation, count: serials.length, tokens: serials.map((serial) => ({ id: `${id}-${serial}`, serial, listingId: listed.includes(serial) ? `l-${id}-${serial}` : null })) };
}

function page(data: InventoryItem[], meta: Partial<Page['meta']> = {}): Page {
  return { data, meta: { total: data.length, page: 1, limit: INVENTORY_PAGE_SIZE, totalPages: data.length ? 1 : 0, ...meta } };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  fetchInventory.mockReset();
  publish.mockReset();
  withdraw.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <InventoryPage />
      </MemoryRouter>,
    );
  });
}

const button = (text: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === text)!;

/** 08-sobres T064 — pantalla de inventario (US6). */
describe('InventoryPage', () => {
  it('muestra una carta por token, con su número de serie en la carta, en el orden recibido (US6-1, US6-2)', async () => {
    fetchInventory.mockResolvedValue(
      page([item('p1', 'Leo Legendario', 91, [3, 17, 58]), item('p2', 'Raul Raro', 75, [9])]),
    );
    await render();

    const cards = [...container.querySelectorAll('ul > li')];
    expect(cards).toHaveLength(4);
    expect(cards.map((li) => (li.textContent?.includes('Leo Legendario') ? 'Leo' : 'Raul'))).toEqual([
      'Leo',
      'Leo',
      'Leo',
      'Raul',
    ]);
    // El número de serie va dentro de la carta, junto a la rareza: «Rare 3/100».
    expect(cards.map((li) => li.querySelector('.pc__rarity')?.textContent)).toEqual([
      'Rare 3/100',
      'Rare 17/100',
      'Rare 58/100',
      'Rare 9/100',
    ]);
    expect(container.textContent).toContain('4 cartas de 2 jugadores');
    expect(fetchInventory).toHaveBeenCalledWith(1, INVENTORY_PAGE_SIZE);
  });

  it('pagina el inventario e indica la página actual (US6-3, FR-064)', async () => {
    fetchInventory.mockResolvedValue(page([item('p1', 'Leo Legendario', 91, [1])], { total: 20, totalPages: 2 }));
    await render();
    expect(container.textContent).toContain('1 / 2');
    expect(button('Anterior').disabled).toBe(true);

    fetchInventory.mockResolvedValue(page([item('p9', 'Otro Jugador', 60, [5])], { total: 20, page: 2, totalPages: 2 }));
    await act(async () => button('Siguiente').click());
    expect(fetchInventory).toHaveBeenLastCalledWith(2, INVENTORY_PAGE_SIZE);
    expect(container.textContent).toContain('Otro Jugador');
    expect(button('Siguiente').disabled).toBe(true);
  });

  it('sin cartas muestra un mensaje con acceso a sobres (US6-4, FR-065)', async () => {
    fetchInventory.mockResolvedValue(page([]));
    await render();
    expect(container.textContent).toContain('Todavía no tenés cartas');
    expect([...container.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/packs' && a.textContent === 'Ir a sobres')).toBe(true);
  });

  it('ante un error permite reintentar (US6-6)', async () => {
    fetchInventory.mockRejectedValueOnce(new Error('caído')).mockResolvedValue(page([item('p1', 'Leo Legendario', 91, [1])]));
    await render();
    expect(container.textContent).toContain('No se pudo cargar tu inventario');

    await act(async () => button('Reintentar').click());
    expect(container.textContent).toContain('Leo Legendario');
  });

  // 09-mercado reemplaza FR-066: cada carta se puede poner a la venta o retirar (FR-036, FR-037).

  it('publicar pide confirmación con el precio actual y avisa que sigue a la cotización', async () => {
    fetchInventory.mockResolvedValue(page([item('p1', 'Leo Legendario', 91, [3])]));
    await render();

    await act(async () => button('Poner a la venta').click());
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('3.000 créditos');
    expect(dialog.textContent).toContain('sigue a la cotización');
    expect(publish).not.toHaveBeenCalled();
  });

  it('cancelar no publica nada', async () => {
    fetchInventory.mockResolvedValue(page([item('p1', 'Leo Legendario', 91, [3])]));
    await render();
    await act(async () => button('Poner a la venta').click());
    await act(async () => button('cancelar').click());
    expect(publish).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('confirmar publica la carta y recarga el inventario con la marca «A la venta»', async () => {
    fetchInventory.mockResolvedValueOnce(page([item('p1', 'Leo Legendario', 91, [3])]));
    publish.mockResolvedValue({} as never);
    await render();

    fetchInventory.mockResolvedValue(page([item('p1', 'Leo Legendario', 91, [3], [3])]));
    await act(async () => button('Poner a la venta').click());
    await act(async () => button('confirmar').click());

    expect(publish).toHaveBeenCalledWith('p1-3');
    expect(container.textContent).toContain('A la venta');
    expect(button('Retirar')).toBeDefined();
  });

  it('retirar también pide confirmación y usa la publicación del token', async () => {
    fetchInventory.mockResolvedValue(page([item('p1', 'Leo Legendario', 91, [3], [3])]));
    withdraw.mockResolvedValue({} as never);
    await render();

    await act(async () => button('Retirar').click());
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('deja de estar a la venta');
    await act(async () => button('confirmar').click());
    expect(withdraw).toHaveBeenCalledWith('l-p1-3');
  });

  it('un rechazo muestra el mensaje de su código', async () => {
    fetchInventory.mockResolvedValue(page([item('p1', 'Leo Legendario', 91, [3])]));
    publish.mockRejectedValue({ response: { data: { code: 'TOKEN_ALREADY_LISTED', message: 'x' } } });
    await render();

    await act(async () => button('Poner a la venta').click());
    await act(async () => button('confirmar').click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Esa carta ya está a la venta.');
  });
});
