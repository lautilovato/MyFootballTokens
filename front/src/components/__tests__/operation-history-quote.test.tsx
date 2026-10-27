import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationHistory } from '../OperationHistory';
import type { OperationEntry } from '../../services/history.service';
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
  forSaleCount: 0,
  priceHistory: [],
};

function entry(overrides: Partial<OperationEntry> & Pick<OperationEntry, 'id' | 'kind'>): OperationEntry {
  return {
    at: '2026-10-20T15:30:00.000Z',
    tokenId: `t-${overrides.id}`,
    serial: 7,
    rarity: 'rare',
    player,
    packType: null,
    price: null,
    balanceBefore: null,
    balanceAfter: null,
    counterparty: null,
    quote: null,
    ...overrides,
  };
}

const quote = {
  id: 'q1',
  calculatedAt: '2026-10-19T02:00:00.000Z',
  strategy: { key: 'prestige', name: 'Prestigio', version: 2 },
};

const buy = entry({
  id: 'compra:1',
  kind: 'compra',
  price: 1200,
  balanceBefore: 3000,
  balanceAfter: 1800,
  counterparty: 'otro_usuario',
  quote,
});
const buyWithoutQuote = entry({ id: 'compra:2', kind: 'compra', price: 900, balanceBefore: 3000, balanceAfter: 2100, counterparty: 'plataforma' });
const sell = entry({ id: 'venta:1', kind: 'venta', price: 1200, balanceBefore: 1800, balanceAfter: 3000, counterparty: 'otro_usuario', quote });
const pack = entry({ id: 's1', kind: 'sobre', packType: 'common' });

function render(entries: OperationEntry[], onViewPlayer = vi.fn()) {
  act(() =>
    root.render(
      <MemoryRouter>
        <OperationHistory
          entries={entries}
          meta={{ total: entries.length, page: 1, limit: 20, totalPages: 1 }}
          filter="all"
          loading={false}
          error={null}
          onFilterChange={vi.fn()}
          onPageChange={vi.fn()}
          onRetry={vi.fn()}
          onViewPlayer={onViewPlayer}
        />
      </MemoryRouter>,
    ),
  );
  return onViewPlayer;
}

const items = () => [...container.querySelectorAll('li')].map((li) => li.textContent ?? '');

/** 10-historial-operaciones US4 — cotización y estrategia de cada operación (FR-015, FR-016, FR-018). */
describe('OperationHistory — cotización y estrategia', () => {
  it('una compra y una venta muestran la cotización de ese momento con su estrategia y versión (US4-1)', () => {
    render([buy, sell]);
    for (const item of items()) {
      expect(item).toContain('Cotización de ese momento: 1.200 créditos · Prestigio v2');
    }
  });

  it('si no se puede determinar la estrategia lo dice y sigue mostrando el precio (US4-5, FR-016)', () => {
    render([buyWithoutQuote]);
    const [item] = items();
    expect(item).toContain('Estrategia no disponible');
    expect(item).toContain('Pagaste 900 créditos');
    expect(item).not.toContain('Cotización de ese momento');
  });

  it('las cartas de sobre no muestran cotización ni estrategia (US4-2)', () => {
    render([pack]);
    const [item] = items();
    expect(item).toContain('Primer propietario');
    expect(item).not.toMatch(/Cotización|Estrategia|v\d/);
  });

  it('«Ver evolución» aparece en las tres clases de entrada y avisa cuál se eligió (US4-4, FR-018)', () => {
    const onViewPlayer = render([pack, buy, sell]);
    const buttons = [...container.querySelectorAll('button')].filter((b) => b.textContent === 'Ver evolución');
    expect(buttons).toHaveLength(3);

    act(() => buttons[1].click());
    expect(onViewPlayer).toHaveBeenCalledTimes(1);
    expect(onViewPlayer).toHaveBeenCalledWith(buy);
  });

  it('sin onViewPlayer no ofrece el botón', () => {
    act(() =>
      root.render(
        <MemoryRouter>
          <OperationHistory
            entries={[buy]}
            meta={{ total: 1, page: 1, limit: 20, totalPages: 1 }}
            filter="all"
            loading={false}
            error={null}
            onFilterChange={vi.fn()}
            onPageChange={vi.fn()}
            onRetry={vi.fn()}
          />
        </MemoryRouter>,
      ),
    );
    expect(container.textContent).not.toContain('Ver evolución');
  });
});
