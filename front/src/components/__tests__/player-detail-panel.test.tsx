import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  goals: 29,
  assists: 5,
  marketValue: 8450,
  changePct: 12.5,
  supply: { minted: 100, total: 100 },
  priceHistory: Array.from({ length: 30 }, (_, i) => 8000 + i * 15),
  league: 'Premier League',
  season: '2025-2026',
  height: 195,
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
  it('muestra las siete métricas que exige la spec (FR-012)', () => {
    render(<PlayerDetailPanel player={PLAYER} loading={false} error={null} onClose={() => {}} />);

    const text = container.textContent ?? '';
    for (const label of [
      'Goles',
      'Asistencias',
      'Altura',
      'Tiros por partido',
      'Pases clave',
      'Regates',
      'Entradas',
    ]) {
      expect(text).toContain(label);
    }
    expect(text).toContain('29');
    expect(text).toContain('195 cm');
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
      shotsPerGame: null,
      keyPasses: null,
      dribbles: null,
      tackles: null,
    };
    render(<PlayerDetailPanel player={sinStats} loading={false} error={null} onClose={() => {}} />);
    expect(container.textContent).toContain('Sin dato');
  });

  it('el bloque de compra está deshabilitado (FR-033)', () => {
    render(<PlayerDetailPanel player={PLAYER} loading={false} error={null} onClose={() => {}} />);

    const buyButton = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Buy token'),
    );
    expect(buyButton).toBeDefined();
    expect(buyButton!.disabled).toBe(true);

    const amount = container.querySelector<HTMLInputElement>('input[type="number"]');
    expect(amount).not.toBeNull();
    expect(amount!.disabled).toBe(true);
  });

  it('ningún clic en la compra emite una petición (FR-032, SC-007)', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<PlayerDetailPanel player={PLAYER} loading={false} error={null} onClose={() => {}} />);

    const buyButton = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Buy token'),
    )!;
    act(() => {
      buyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('identifica la gráfica y la compra como maqueta (FR-023)', () => {
    render(<PlayerDetailPanel player={PLAYER} loading={false} error={null} onClose={() => {}} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Maqueta');
    expect(text).toContain('No disponible');
    expect(text).toContain('todavía no está habilitada');
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
