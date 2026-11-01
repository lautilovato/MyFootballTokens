import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminPage from '../AdminPage';
import { getAdminMetrics, type AdminMetrics } from '../../services/admin.service';

vi.mock('../../services/admin.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/admin.service')>()),
  getAdminMetrics: vi.fn(),
}));
vi.mock('../../services/useAuth', () => ({
  useAuth: () => ({ user: { username: 'admin', role: 'admin' }, logout: vi.fn() }),
}));
vi.mock('../../app/useCredits', () => ({ useCredits: () => ({ balance: 0, refresh: vi.fn(), setBalance: vi.fn() }) }));

const fetchMetrics = vi.mocked(getAdminMetrics);

function metrics(overrides: Partial<AdminMetrics> = {}): AdminMetrics {
  return {
    computedAt: '2026-10-31T15:00:00.000Z',
    period: { from: '2026-10-02', to: '2026-10-31', timezone: 'UTC' },
    users: { registered: 12, new: 3, active: 5 },
    cards: { issued: 1000, inCirculation: 240, inPacks: 700, reserved: 60, platformSale: 0, listed: 8 },
    rarity: { common: 200, rare: 30, epic: 8, legendary: 2 },
    packs: {
      remaining: 90,
      opened: 15,
      byType: [
        { type: 'common', remaining: 60, opened: 10, soldOut: false },
        { type: 'rare', remaining: 30, opened: 5, soldOut: false },
        { type: 'epic', remaining: 0, opened: 0, soldOut: true },
        { type: 'legendary', remaining: 0, opened: 0, soldOut: true },
      ],
    },
    market: {
      sales: 4,
      averagePrice: 1250,
      volume: 5000,
      topSale: { price: 3000, playerId: 'p1', playerName: 'Mario Mercado', at: '2026-10-20T15:00:00.000Z' },
      topPlayers: [{ playerId: 'p1', playerName: 'Mario Mercado', sales: 3, volume: 4000 }],
    },
    credits: { issued: 6000, collected: 1500, inCirculation: 4500 },
    activity: { unit: 'day', buckets: [{ start: '2026-10-30', packsOpened: 2, sales: 1 }] },
    reconciliation: {
      cards: { ok: true, difference: 0, affectedPlayers: 0 },
      credits: { ok: true, expected: 4500, actual: 4500, difference: 0 },
    },
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  // jsdom no lo trae, y el contenedor de los gráficos lo necesita para medirse.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

beforeEach(() => {
  fetchMetrics.mockReset();
  fetchMetrics.mockResolvedValue(metrics());
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
        <AdminPage />
      </MemoryRouter>,
    );
  });
}

const button = (text: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement;
const alertText = () => container.querySelector('[role="alert"]')?.textContent;

function setDate(label: string, value: string) {
  const input = [...container.querySelectorAll('label')].find((l) => l.textContent?.includes(label))!.querySelector('input')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** 11-admin-panel — panel de administración (US2 a US5). */
describe('AdminPage', () => {
  it('arranca con los últimos 30 días y muestra las cinco métricas pedidas (FR-015, FR-036)', async () => {
    await render();

    expect(fetchMetrics).toHaveBeenCalledTimes(1);
    const [period] = fetchMetrics.mock.calls[0];
    expect(period.from).not.toBeNull();
    expect(button('30 días').getAttribute('aria-pressed')).toBe('true');

    const text = container.textContent;
    expect(text).toContain('Usuarios registradosHoy12');
    expect(text).toContain('Cartas en circulaciónHoy240');
    expect(text).toContain('Cartas en sobresHoy700');
    expect(text).toContain('Pool de sobres restantesHoy90');
    expect(text).toContain('1.250 créditos');
  });

  it('sin ventas no muestra 0 como promedio (FR-016)', async () => {
    fetchMetrics.mockResolvedValue(metrics({ market: { sales: 0, averagePrice: null, volume: 0, topSale: null, topPlayers: [] } }));

    await render();

    expect(container.textContent).toContain('Precio de venta promedioPeríodoSin ventas');
  });

  it('distingue las métricas de período de las de estado (FR-037)', async () => {
    await render();

    expect(container.textContent).toContain('Usuarios nuevosPeríodo3');
    expect(container.textContent).toContain('Créditos en circulaciónHoy4.500');
  });

  it('un atajo pide ese período; «Todo» va sin fechas', async () => {
    await render();

    await act(async () => button('Todo').click());

    expect(fetchMetrics).toHaveBeenLastCalledWith({ from: null, to: null }, false);
    expect(button('Todo').getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).toContain('Toda la historia');
  });

  it('aplica un rango válido', async () => {
    await render();

    setDate('Desde', '2026-01-01');
    setDate('Hasta', '2026-01-31');
    await act(async () => button('Aplicar').click());

    expect(fetchMetrics).toHaveBeenLastCalledWith({ from: '2026-01-01', to: '2026-01-31' }, false);
    expect(button('30 días').getAttribute('aria-pressed')).toBe('false');
  });

  it('un rango invertido muestra un mensaje y no consulta (US5-5)', async () => {
    await render();
    fetchMetrics.mockClear();

    setDate('Desde', '2026-02-01');
    setDate('Hasta', '2026-01-01');
    await act(async () => button('Aplicar').click());

    expect(fetchMetrics).not.toHaveBeenCalled();
    expect(alertText()).toMatch(/posterior/);
    expect(container.textContent).toContain('Usuarios registrados');
  });

  it('actualizar saltea la caché (FR-026)', async () => {
    await render();

    await act(async () => button('Actualizar').click());

    expect(fetchMetrics).toHaveBeenLastCalledWith(expect.anything(), true);
  });

  it('si falla muestra el error y reintenta, sin números (FR-027)', async () => {
    fetchMetrics.mockRejectedValueOnce(new Error('Network Error'));

    await render();

    expect(alertText()).toMatch(/conexión/);
    expect(container.textContent).not.toContain('Usuarios registrados');

    await act(async () => button('Reintentar').click());

    expect(container.textContent).toContain('Usuarios registrados');
  });

  it('marca los tipos de sobre agotados y ofrece los datos como texto (FR-018, FR-028)', async () => {
    await render();

    const cells = [...container.querySelectorAll('tbody th')].map((th) => th.textContent);
    expect(cells).toContain('Épico (agotado)');
    expect(cells).toContain('Mario Mercado');
    expect(cells).toContain('30 oct');
    expect(container.querySelector('tbody td')?.textContent).toBeTruthy();
  });

  it('avisa si la conciliación no cierra (FR-025)', async () => {
    fetchMetrics.mockResolvedValue(
      metrics({
        reconciliation: {
          cards: { ok: true, difference: 0, affectedPlayers: 0 },
          credits: { ok: false, expected: 4500, actual: 4000, difference: 500 },
        },
      }),
    );

    await render();

    expect(alertText()).toContain('Créditos: no cierra');
    expect(alertText()).toContain('500');
  });
});
