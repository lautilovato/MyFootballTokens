import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationHistory } from '../OperationHistory';
import type { HistoryFilter, OperationEntry } from '../../services/history.service';
import type { ApiPlayerCard } from '../../services/players.service';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function card(name: string): ApiPlayerCard {
  return {
    id: `p-${name}`,
    name,
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
    forSaleCount: 0,
    priceHistory: [],
  };
}

function entry(overrides: Partial<OperationEntry> & Pick<OperationEntry, 'id' | 'kind'>): OperationEntry {
  return {
    at: '2026-10-20T15:30:00.000Z',
    tokenId: `t-${overrides.id}`,
    serial: 7,
    rarity: 'rare',
    player: card('Mario Mercado'),
    packType: null,
    price: null,
    balanceBefore: null,
    balanceAfter: null,
    counterparty: null,
    quote: null,
    ...overrides,
  };
}

const packEntry = entry({ id: 's1', kind: 'sobre', packType: 'epic' });
const buyEntry = entry({
  id: 'compra:1',
  kind: 'compra',
  price: 1500,
  balanceBefore: 3000,
  balanceAfter: 1500,
  counterparty: 'otro_usuario',
});
const sellEntry = entry({
  id: 'venta:1',
  kind: 'venta',
  price: 2000,
  balanceBefore: 1000,
  balanceAfter: 3000,
  counterparty: 'plataforma',
});

interface Props {
  entries?: OperationEntry[];
  filter?: HistoryFilter;
  loading?: boolean;
  error?: string | null;
  total?: number;
  page?: number;
  totalPages?: number;
}

function render(props: Props = {}) {
  const handlers = {
    onFilterChange: vi.fn(),
    onPageChange: vi.fn(),
    onRetry: vi.fn(),
  };
  const entries = props.entries ?? [];
  act(() =>
    root.render(
      <MemoryRouter>
        <OperationHistory
          entries={entries}
          meta={{ total: props.total ?? entries.length, page: props.page ?? 1, limit: 20, totalPages: props.totalPages ?? 1 }}
          filter={props.filter ?? 'all'}
          loading={props.loading ?? false}
          error={props.error ?? null}
          {...handlers}
        />
      </MemoryRouter>,
    ),
  );
  return handlers;
}

const text = () => container.textContent ?? '';
const buttonByText = (label: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement;

/** 10-historial-operaciones US1 — historial de cartas adquiridas y vendidas (FR-004 a FR-013). */
describe('OperationHistory', () => {
  it('rotula cada entrada como adquirida por sobre, adquirida por compra o vendida (FR-004)', () => {
    render({ entries: [packEntry, buyEntry, sellEntry] });
    expect(text()).toContain('Adquirida por sobre');
    expect(text()).toContain('Adquirida por compra');
    expect(text()).toContain('Vendida');
    expect(container.querySelectorAll('li')).toHaveLength(3);
  });

  it('una carta de sobre dice «Primer propietario» y el tipo de sobre, sin precio ni saldos (FR-005)', () => {
    render({ entries: [packEntry] });
    expect(text()).toContain('Primer propietario');
    expect(text()).toContain('Sobre Épico');
    expect(text()).not.toMatch(/créditos|Saldo|Pagaste|Recibiste|Cotización/);
  });

  it('una compra y una venta muestran el precio, el saldo antes y después y la contraparte (FR-006, FR-007)', () => {
    render({ entries: [buyEntry, sellEntry] });
    const [buy, sell] = [...container.querySelectorAll('li')].map((li) => li.textContent ?? '');
    expect(buy).toContain('Pagaste 1.500 créditos');
    expect(buy).toContain('Saldo: 3.000 → 1.500');
    expect(buy).toContain('Otro usuario');
    expect(sell).toContain('Recibiste 2.000 créditos');
    expect(sell).toContain('Saldo: 1.000 → 3.000');
    expect(sell).toContain('Plataforma');
  });

  it('muestra el jugador, el club, la rareza y la serie de cada carta', () => {
    render({ entries: [buyEntry] });
    expect(text()).toContain('Mario Mercado');
    expect(text()).toContain('E2E FC');
    expect(text()).toContain('Rara');
    expect(text()).toContain('Serie #7');
  });

  it('las pestañas marcan el filtro activo y avisan el cambio (FR-009)', () => {
    const { onFilterChange } = render({ entries: [buyEntry], filter: 'acquired' });
    const tabs = [...container.querySelectorAll('[role="tab"]')];
    expect(tabs.map((t) => [t.textContent, t.getAttribute('aria-selected')])).toEqual([
      ['Todas', 'false'],
      ['Adquiridas', 'true'],
      ['Vendidas', 'false'],
    ]);
    act(() => buttonByText('Vendidas').click());
    expect(onFilterChange).toHaveBeenCalledWith('sold');
  });

  it('informa el total y pagina con anterior y siguiente (FR-008)', () => {
    const { onPageChange } = render({ entries: [buyEntry], total: 45, page: 2, totalPages: 3 });
    expect(text()).toContain('45 cartas');
    expect(text()).toContain('Página 2 de 3');
    act(() => buttonByText('Siguiente').click());
    expect(onPageChange).toHaveBeenLastCalledWith(3);
    act(() => buttonByText('Anterior').click());
    expect(onPageChange).toHaveBeenLastCalledWith(1);
  });

  it('en la primera y la última página deshabilita el botón que no corresponde', () => {
    render({ entries: [buyEntry], total: 45, page: 1, totalPages: 3 });
    expect(buttonByText('Anterior').disabled).toBe(true);
    expect(buttonByText('Siguiente').disabled).toBe(false);
  });

  it('sin operaciones indica el vacío y ofrece ir a Sobres y al Market (FR-013)', () => {
    render({ entries: [], total: 0, totalPages: 0 });
    expect(text()).toContain('Todavía no hiciste operaciones');
    const links = [...container.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toContainEqual(['Ir a Sobres', '/packs']);
    expect(links).toContainEqual(['Ir al Market', '/']);
  });

  it('un filtro sin resultados no manda a abrir sobres', () => {
    render({ entries: [], filter: 'sold', total: 0, totalPages: 0 });
    expect(text()).toContain('No hay cartas vendidas para mostrar');
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('mientras carga por primera vez lo indica', () => {
    render({ entries: [], loading: true });
    expect(text()).toContain('Cargando tu historial');
  });

  it('ante un error muestra el mensaje y permite reintentar', () => {
    const { onRetry } = render({ error: 'No pudimos cargar tu historial.' });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('No pudimos cargar');
    act(() => buttonByText('Reintentar').click());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
