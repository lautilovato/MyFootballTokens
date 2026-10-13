import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InventoryPage, { INVENTORY_PAGE_SIZE } from '../InventoryPage';
import { getInventory, type InventoryItem, type InventoryPage as Page } from '../../services/inventory.service';
import type { ApiPlayerCard } from '../../services/players.service';

vi.mock('../../services/inventory.service', () => ({ getInventory: vi.fn() }));
vi.mock('../../services/useAuth', () => ({ useAuth: () => ({ user: { username: 'ana' }, logout: vi.fn() }) }));
vi.mock('../../app/useCredits', () => ({ useCredits: () => ({ balance: 1800, refresh: vi.fn(), setBalance: vi.fn() }) }));

const fetchInventory = vi.mocked(getInventory);

function item(id: string, name: string, reputation: number, serials: number[]): InventoryItem {
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
    supply: { minted: 100, total: 100 },
    priceHistory: [],
  };
  return { player, reputation, count: serials.length, tokens: serials.map((serial) => ({ id: `${id}-${serial}`, serial })) };
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

  it('no ofrece acciones sobre las cartas (US6-5, FR-066)', async () => {
    fetchInventory.mockResolvedValue(page([item('p1', 'Leo Legendario', 91, [1, 2])]));
    await render();
    const labels = [...container.querySelectorAll('button')].map((b) => b.textContent?.toLowerCase() ?? '');
    for (const forbidden of ['vender', 'listar', 'transferir', 'comprar']) {
      expect(labels.some((l) => l.includes(forbidden))).toBe(false);
    }
  });
});
