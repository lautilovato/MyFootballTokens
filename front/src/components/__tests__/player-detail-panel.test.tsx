import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { MarketListingsProps } from '../MarketListings';
import { PlayerDetailPanel } from '../PlayerDetailPanel';
import type { ApiPlayerDetail } from '../../services/players.service';

/**
 * T051 / FR-012, FR-033 — renderizado con las utilidades propias de React: la constitución §2
 * no autoriza ninguna librería adicional de testing.
 */

const PLAYER: ApiPlayerDetail = {
  id: 'p1',
  name: 'Erling Haaland',
  position: 'FW',
  ovr: 86,
  rarity: 'legendary',
  club: { name: 'Manchester City', crestUrl: null },
  nationality: { name: 'Norway', code: 'no' },
  imageUrl: null,
  goals: 29,
  assists: 5,
  marketValue: 8450,
  changePct: 12.5,
  supply: { minted: 100, total: 100 }, forSaleCount: 0,
  priceHistory: Array.from({ length: 30 }, (_, i) => 8000 + i * 15),
  league: 'Premier League',
  season: '2025-2026',
  height: 195,
  matchesPlayed: 31,
  shotsPerGame: 4.2,
  keyPasses: 1.1,
  dribbles: 0.9,
  tackles: 0.3,
  rating: 8.63,
};

let container: HTMLDivElement;
let root: Root;

function render(ui: React.ReactElement) {
  act(() => {
    root.render(ui);
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('PlayerDetailPanel', () => {
  it('muestra las siete métricas de temporada en orden (FR-012)', () => {
    render(<PlayerDetailPanel player={PLAYER} loading={false} error={null} onClose={() => {}} />);

    const labels = [...container.querySelectorAll('dt')].map((dt) => dt.textContent);
    expect(labels.slice(0, 7)).toEqual([
      'Partidos jugados',
      'Goles',
      'Asistencias',
      'Tiros por partido',
      'Pases clave por partido',
      'Regates por partido',
      'Entradas por partido',
    ]);

    const text = container.textContent ?? '';
    expect(text).toContain('31');
    expect(text).toContain('29');
  });

  it('no muestra la altura entre las métricas de temporada', () => {
    render(<PlayerDetailPanel player={PLAYER} loading={false} error={null} onClose={() => {}} />);
    const text = container.textContent ?? '';
    expect(text).not.toContain('Altura');
    expect(text).not.toContain('195 cm');
  });

  it('muestra la liga y el club (FR-013)', () => {
    render(<PlayerDetailPanel player={PLAYER} loading={false} error={null} onClose={() => {}} />);
    expect(container.textContent).toContain('Manchester City');
    expect(container.textContent).toContain('Premier League');
  });

  it('informa el supply como emitido sobre total (FR-014)', () => {
    render(<PlayerDetailPanel player={PLAYER} loading={false} error={null} onClose={() => {}} />);
    expect(container.textContent).toContain('100/100');
  });

  it('muestra "Sin dato" en las métricas nulas, no cero (FR-015)', () => {
    const sinStats: ApiPlayerDetail = {
      ...PLAYER,
      ovr: null,
      rarity: 'common',
      goals: null,
      assists: null,
      season: null,
      rating: null,
      matchesPlayed: null,
      shotsPerGame: null,
      keyPasses: null,
      dribbles: null,
      tackles: null,
    };
    render(<PlayerDetailPanel player={sinStats} loading={false} error={null} onClose={() => {}} />);
    expect(container.textContent).toContain('Sin dato');
  });

  // 09-mercado FR-038 reemplaza la maqueta de compra (06 FR-032, FR-033) por MarketListings.

  const market = (overrides: Partial<MarketListingsProps> = {}): MarketListingsProps => ({
    price: 8450,
    listings: [{ listingId: 'l1', tokenId: 't1', serial: 7, mine: false, listedAt: '2026-10-20T12:00:00.000Z' }],
    page: 1,
    totalPages: 1,
    balance: 10_000,
    loading: false,
    error: null,
    busy: false,
    message: null,
    onBuy: vi.fn(),
    onPage: vi.fn(),
    ...overrides,
  });

  it('el bloque de compra muestra las cartas a la venta que recibe y compra por la página', () => {
    const props = market();
    render(
      <MemoryRouter>
        <PlayerDetailPanel player={PLAYER} loading={false} error={null} onClose={() => {}} market={props} />
      </MemoryRouter>,
    );

    expect(container.querySelector('section[aria-label="Compra de cartas"]')).not.toBeNull();
    expect(container.textContent).toContain('#7');
    const buy = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Comprar')!;
    act(() => buy.click());
    expect(props.onBuy).toHaveBeenCalledWith(props.listings[0]);
  });

  it('ya no tiene selector de cantidad ni la maqueta inerte', () => {
    render(
      <MemoryRouter>
        <PlayerDetailPanel player={PLAYER} loading={false} error={null} onClose={() => {}} market={market()} />
      </MemoryRouter>,
    );
    const text = container.textContent ?? '';
    expect(container.querySelector('input[type="number"]')).toBeNull();
    expect(text).not.toContain('Buy token');
    expect(text).not.toContain('No disponible');
    expect(text).not.toContain('todavía no está habilitada');
  });

  it('sin datos del mercado no muestra el bloque de compra', () => {
    render(<PlayerDetailPanel player={PLAYER} loading={false} error={null} onClose={() => {}} />);
    expect(container.querySelector('section[aria-label="Compra de cartas"]')).toBeNull();
  });

  describe('historial de cotizaciones', () => {
    const chart = () => container.querySelector('svg[aria-label="Historial de cotizaciones"]');

    it('dibuja la serie real y resume cuántas cotizaciones son y su rango', () => {
      const player = { ...PLAYER, priceHistory: [1000, 1500, 1200, 1800], changePct: 50 };
      render(<PlayerDetailPanel player={player} loading={false} error={null} onClose={() => {}} />);

      expect(chart()).not.toBeNull();
      const polyline = container.querySelector('svg[aria-label="Historial de cotizaciones"] polyline');
      expect(polyline?.getAttribute('points')?.split(' ')).toHaveLength(4);

      const text = container.textContent ?? '';
      expect(text).toContain('Últimas 4 cotizaciones');
      expect(text).toContain('mín 1.000');
      expect(text).toContain('máx 1.800');
      expect(text).toContain('+50.0%');
    });

    it('una variación negativa se muestra con su signo', () => {
      const player = { ...PLAYER, priceHistory: [2000, 1800], changePct: -10 };
      render(<PlayerDetailPanel player={player} loading={false} error={null} onClose={() => {}} />);
      expect(container.textContent).toContain('-10.0%');
    });

    it('con una sola cotización no hay gráfica y lo explica', () => {
      const player = { ...PLAYER, priceHistory: [1000], changePct: 0 };
      render(<PlayerDetailPanel player={player} loading={false} error={null} onClose={() => {}} />);

      expect(chart()).toBeNull();
      expect(container.textContent).toContain('Hay una sola cotización');
    });

    /** 10-historial-operaciones FR-019, FR-020 — «Ver más» y la estrategia de la cotización vigente. */
    describe('gráfico completo', () => {
      const viewOf = (quoteLabel: string | null = 'Performance v2') => ({ quoteLabel, onOpen: vi.fn() });
      const verMas = () => [...container.querySelectorAll('button')].find((b) => b.textContent === 'Ver más');

      it('con cotizaciones ofrece «Ver más» y lo avisa al apretarlo', () => {
        const view = viewOf();
        render(<PlayerDetailPanel player={PLAYER} loading={false} error={null} onClose={() => {}} priceHistoryView={view} />);

        expect(verMas()).toBeDefined();
        act(() => verMas()!.click());
        expect(view.onOpen).toHaveBeenCalledTimes(1);
      });

      it('con una sola cotización también lo ofrece', () => {
        const player = { ...PLAYER, priceHistory: [1000], changePct: 0 };
        render(<PlayerDetailPanel player={player} loading={false} error={null} onClose={() => {}} priceHistoryView={viewOf()} />);
        expect(verMas()).toBeDefined();
      });

      it('sin cotizaciones no lo ofrece', () => {
        const player = { ...PLAYER, priceHistory: [], changePct: 0, marketValue: 0 };
        render(<PlayerDetailPanel player={player} loading={false} error={null} onClose={() => {}} priceHistoryView={viewOf()} />);
        expect(verMas()).toBeUndefined();
        expect(container.textContent).not.toContain('Cotizado con');
      });

      it('sin priceHistoryView no ofrece «Ver más» ni la línea de estrategia', () => {
        render(<PlayerDetailPanel player={PLAYER} loading={false} error={null} onClose={() => {}} />);
        expect(verMas()).toBeUndefined();
        expect(container.textContent).not.toContain('Cotizado con');
      });

      it('indica con qué estrategia y versión se calculó la cotización vigente', () => {
        render(<PlayerDetailPanel player={PLAYER} loading={false} error={null} onClose={() => {}} priceHistoryView={viewOf()} />);
        expect(container.textContent).toContain('Cotizado con Performance v2');
      });

      it('si todavía no se conoce la estrategia omite la línea y conserva «Ver más»', () => {
        render(<PlayerDetailPanel player={PLAYER} loading={false} error={null} onClose={() => {}} priceHistoryView={viewOf(null)} />);
        expect(container.textContent).not.toContain('Cotizado con');
        expect(verMas()).toBeDefined();
      });

      it('el mini-gráfico sigue siendo el de las últimas cotizaciones', () => {
        render(<PlayerDetailPanel player={PLAYER} loading={false} error={null} onClose={() => {}} priceHistoryView={viewOf()} />);
        const polyline = container.querySelector('svg[aria-label="Historial de cotizaciones"] polyline');
        expect(polyline?.getAttribute('points')?.split(' ')).toHaveLength(30);
      });
    });

    it('un jugador nunca cotizado no muestra gráfica ni una variación inventada', () => {
      const player = { ...PLAYER, priceHistory: [], changePct: 0, marketValue: 0 };
      render(<PlayerDetailPanel player={player} loading={false} error={null} onClose={() => {}} />);

      expect(chart()).toBeNull();
      const text = container.textContent ?? '';
      expect(text).toContain('todavía no tiene cotizaciones');
      expect(text).not.toContain('0.0%');
    });
  });

  it('avisa el cierre del panel', () => {
    let closed = false;
    render(
      <PlayerDetailPanel
        player={PLAYER}
        loading={false}
        error={null}
        onClose={() => {
          closed = true;
        }}
      />,
    );

    const closeButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Cerrar el detalle"]',
    )!;
    act(() => {
      closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(closed).toBe(true);
  });

  it('muestra el estado de carga sin datos', () => {
    render(<PlayerDetailPanel player={null} loading error={null} onClose={() => {}} />);
    expect(container.textContent).toContain('Cargando detalle');
  });
});
