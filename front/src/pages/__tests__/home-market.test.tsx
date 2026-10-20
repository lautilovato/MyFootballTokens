import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HomePage from '../HomePage';
import { hasActiveFilters } from '../home-filters';
import { fetchLeagues, fetchPlayers } from '../../services/players.service';

vi.mock('../../services/players.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/players.service')>()),
  fetchPlayers: vi.fn(),
  fetchLeagues: vi.fn(),
  fetchPlayerDetail: vi.fn(),
}));
vi.mock('../../services/useAuth', () => ({ useAuth: () => ({ user: { username: 'ana' }, logout: vi.fn() }) }));
vi.mock('../../app/useCredits', () => ({ useCredits: () => ({ balance: 2000, refresh: vi.fn(), setBalance: vi.fn() }) }));

const players = vi.mocked(fetchPlayers);
const leagues = vi.mocked(fetchLeagues);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  players.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } });
  leagues.mockResolvedValue([]);
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
