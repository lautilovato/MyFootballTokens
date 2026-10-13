import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PackTypeTile } from '../PackTypeTile';
import { Pack } from '../pack/Pack';

let container: HTMLDivElement;
let root: Root;

function stubMatchMedia(reduced: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduced && query.includes('reduce'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

beforeEach(() => {
  stubMatchMedia(false);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const PACK = { name: 'Rare', tier: 'rare' as const, series: '12 sin abrir', cardCount: 4 };
const ODDS = { common: 0.55, rare: 0.32, epic: 0.1, legendary: 0.03 };

function render(props: Partial<Parameters<typeof PackTypeTile>[0]> = {}) {
  act(() =>
    root.render(
      <PackTypeTile
        pack={PACK}
        price={200}
        probabilities={ODDS}
        remaining={12}
        disabledReason={null}
        onOpenRequest={async () => false}
        onOpened={() => undefined}
        {...props}
      />,
    ),
  );
}

/** 08-sobres T054 — un tipo de sobre de la pantalla (FR-054, FR-055, FR-062). */
describe('PackTypeTile', () => {
  it('muestra precio, cartas, restantes y probabilidades en %', () => {
    render();
    const text = container.textContent ?? '';
    expect(text).toContain('200 créditos');
    expect(text).toContain('4 cartas');
    expect(text).toContain('12 sin abrir');
    expect(text).toContain('55 %');
    expect(text).toContain('32 %');
    expect(text).toContain('10 %');
    expect(text).toContain('3.0 %');
  });

  it('un tipo disponible se puede abrir', () => {
    render();
    expect(container.querySelector('[role="button"]')).not.toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it.each(['Agotado', 'Saldo insuficiente'])('con motivo «%s» no se puede abrir y lo muestra', (reason) => {
    render({ disabledReason: reason, probabilities: reason === 'Agotado' ? null : ODDS });
    expect(container.querySelector('[role="button"]')).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toBe(reason);
  });

  it('con «reducir movimiento» el sobre igual termina de abrirse y avisa (FR-062)', async () => {
    stubMatchMedia(true);
    const onOpened = vi.fn();
    render({ onOpenRequest: async () => true, onOpened });

    await act(async () => {
      (container.querySelector('[role="button"]') as HTMLElement).click();
    });
    await vi.waitFor(() => expect(onOpened).toHaveBeenCalledTimes(1), { timeout: 3000, interval: 50 });
  });

  it('con autoOpen, el sobre se abre solo al montarse, sin click', async () => {
    stubMatchMedia(true);
    const onOpened = vi.fn();
    await act(async () => root.render(<Pack pack={PACK} interactive={false} autoOpen onOpened={onOpened} />));

    expect(container.querySelector('[data-phase="opening"], [data-phase="opened"]')).not.toBeNull();
    await vi.waitFor(() => expect(onOpened).toHaveBeenCalledTimes(1), { timeout: 3000, interval: 50 });
  });

  it('si el pedido de apertura se rechaza, el sobre no se abre', async () => {
    const onOpened = vi.fn();
    render({ onOpenRequest: async () => false, onOpened });

    await act(async () => {
      (container.querySelector('[role="button"]') as HTMLElement).click();
    });
    await new Promise((r) => setTimeout(r, 300));
    expect(onOpened).not.toHaveBeenCalled();
    expect(container.querySelector('[data-phase="sealed"]')).not.toBeNull();
  });
});
