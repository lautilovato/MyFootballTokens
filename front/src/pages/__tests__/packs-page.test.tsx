import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PacksPage from '../PacksPage';
import { getPackCatalog, openPack, type PackCatalog, type PackOpening } from '../../services/packs.service';
import type { ApiPlayerCard } from '../../services/players.service';

vi.mock('../../services/packs.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/packs.service')>()),
  getPackCatalog: vi.fn(),
  openPack: vi.fn(),
}));

vi.mock('../../services/useAuth', () => ({
  useAuth: () => ({ user: { username: 'ana' }, logout: vi.fn() }),
}));

const credits = { balance: 2000 as number | null, refresh: vi.fn(async () => undefined), setBalance: vi.fn() };
vi.mock('../../app/useCredits', () => ({ useCredits: () => credits }));

/**
 * El sobre real anima con GSAP; acá alcanza con un doble que respete su contrato: al hacer
 * click pide abrir y, si se acepta, avisa que terminó (la animación se prueba en PackTypeTile).
 */
vi.mock('../../components/pack/Pack', async () => {
  const { useEffect } = await import('react');
  return {
    Pack: (props: {
      pack: { name: string; tier: string };
      openable?: boolean;
      autoOpen?: boolean;
      onOpenRequest?: () => Promise<boolean>;
      onOpened?: () => void;
    }) => {
      // El sobre del escenario se abre solo al montarse.
      useEffect(() => {
        if (props.autoOpen) props.onOpened?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      if (props.autoOpen) return <div data-stage-pack={props.pack.tier}>{props.pack.name}</div>;
      return (
        <button
          data-pack={props.pack.tier}
          disabled={props.openable === false}
          onClick={async () => {
            if (await props.onOpenRequest?.()) props.onOpened?.();
          }}
        >
          {props.pack.name}
        </button>
      );
    },
  };
});

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

const getCatalog = vi.mocked(getPackCatalog);
const open = vi.mocked(openPack);

function catalog(over: Partial<Record<'common' | 'rare' | 'epic' | 'legendary', { remaining: number }>> = {}): PackCatalog {
  const base = [
    { type: 'common' as const, price: 100, cards: 3 },
    { type: 'rare' as const, price: 200, cards: 4 },
    { type: 'epic' as const, price: 400, cards: 5 },
    { type: 'legendary' as const, price: 800, cards: 6 },
  ];
  return {
    stockGenerated: true,
    types: base.map((t) => ({
      ...t,
      remaining: over[t.type]?.remaining ?? 10,
      probabilities: (over[t.type]?.remaining ?? 10) === 0 ? null : { common: 0.5, rare: 0.3, epic: 0.15, legendary: 0.05 },
    })),
  };
}

function player(id: string, name: string): ApiPlayerCard {
  return {
    id,
    name,
    position: 'MF',
    ovr: 85,
    rarity: 'epic',
    club: { name: 'E2E FC', crestUrl: null },
    nationality: { name: 'Argentina', code: 'ar' },
    imageUrl: null,
    goals: 1,
    assists: 1,
    marketValue: 6000,
    changePct: 0,
    supply: { minted: 100, total: 100 }, forSaleCount: 0,
    priceHistory: [],
  };
}

const OPENING: PackOpening = {
  id: 'o1',
  type: 'rare',
  price: 200,
  cardCount: 2,
  balanceBefore: 2000,
  balanceAfter: 1800,
  openedAt: '2026-10-13T12:00:00Z',
  cards: [
    { tokenId: 't1', serial: 7, rarity: 'epic', quotePrice: 6000, player: player('p1', 'Ezequiel Epico') },
    { tokenId: 't2', serial: 9, rarity: 'rare', quotePrice: 3000, player: player('p2', 'Raul Raro') },
  ],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  credits.balance = 2000;
  credits.refresh.mockClear();
  credits.setBalance.mockClear();
  getCatalog.mockReset();
  open.mockReset();
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
        <PacksPage />
      </MemoryRouter>,
    );
  });
}

const pack = (tier: string) => container.querySelector(`[data-pack="${tier}"]`) as HTMLButtonElement;
const button = (text: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === text)!;
const click = async (el: HTMLElement) => act(async () => el.click());

/** 08-sobres T055 — pantalla de sobres (US5). */
describe('PacksPage', () => {
  it('muestra el saldo y los cuatro tipos (US5-1)', async () => {
    getCatalog.mockResolvedValue(catalog());
    await render();

    expect(container.querySelector('[aria-label="Saldo"]')?.textContent).toBe('2.000 créditos');
    expect(['common', 'rare', 'epic', 'legendary'].map((t) => pack(t)?.textContent)).toEqual([
      'Common',
      'Rare',
      'Epic',
      'Legendary',
    ]);
  });

  it('sin stock generado explica que todavía no hay sobres (US5-7, FR-061)', async () => {
    getCatalog.mockResolvedValue({ ...catalog(), stockGenerated: false });
    await render();
    expect(container.textContent).toContain('Todavía no hay sobres');
    expect(pack('common')).toBeNull();
  });

  it('un tipo agotado o más caro que el saldo no se puede abrir (US5-5, US5-6)', async () => {
    credits.balance = 300;
    getCatalog.mockResolvedValue(catalog({ common: { remaining: 0 } }));
    await render();

    expect(pack('common').disabled).toBe(true);
    expect(pack('rare').disabled).toBe(false);
    expect(pack('epic').disabled).toBe(true);
    expect(container.textContent).toContain('Agotado');
    expect(container.textContent).toContain('Saldo insuficiente');
  });

  it('pide confirmación con el precio y el saldo resultante; cancelar no abre nada (US5-2)', async () => {
    getCatalog.mockResolvedValue(catalog());
    await render();
    await click(pack('rare'));

    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Rare');
    expect(dialog.textContent).toContain('200 créditos');
    expect(dialog.textContent).toContain('1.800 créditos');

    await click(button('cancelar'));
    expect(open).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('al confirmar revela exactamente las cartas devueltas y actualiza el saldo (US5-3, US5-4)', async () => {
    getCatalog.mockResolvedValue(catalog());
    open.mockResolvedValue(OPENING);
    await render();
    await click(pack('rare'));
    await click(button('confirmar'));

    expect(open).toHaveBeenCalledWith('rare');
    expect(credits.setBalance).toHaveBeenCalledWith(1800);
    const reveal = container.querySelector('[aria-label="Cartas obtenidas"]')!;
    expect(reveal).not.toBeNull();
    expect(reveal.querySelectorAll('li')).toHaveLength(2);
    expect(reveal.textContent).toContain('Ezequiel Epico');
    expect(reveal.textContent).toContain('Raul Raro');
    // El catálogo se vuelve a pedir: restantes y probabilidades reales (FR-059).
    expect(getCatalog).toHaveBeenCalledTimes(2);
    expect(button('Abrir otro')).toBeDefined();
    expect([...container.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/inventory')).toBe(true);
  });

  it('el sobre comprado se abre en un escenario central, no en la grilla (FR-058)', async () => {
    getCatalog.mockResolvedValue(catalog());
    // La revelación se demora: así se puede ver el escenario mientras el sobre "se abre".
    let finish: (value: PackOpening) => void = () => undefined;
    open.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await render();
    await click(pack('rare'));
    await click(button('confirmar'));
    expect(container.querySelector('[aria-label^="Abriendo sobre"]')).toBeNull();

    await act(async () => finish(OPENING));
    // El doble del sobre del escenario avisa que terminó apenas se monta: ya hay revelación,
    // el escenario se cerró y el sobre de la grilla nunca se abrió.
    expect(container.querySelector('[aria-label^="Abriendo sobre"]')).toBeNull();
    expect(container.querySelector('[aria-label="Cartas obtenidas"]')).not.toBeNull();
    expect(container.querySelector('[data-stage-pack]')).toBeNull();
  });

  it('«Abrir otro» vuelve a mostrar los sobres', async () => {
    getCatalog.mockResolvedValue(catalog());
    open.mockResolvedValue(OPENING);
    await render();
    await click(pack('rare'));
    await click(button('confirmar'));
    await click(button('Abrir otro'));

    expect(container.querySelector('[aria-label="Cartas obtenidas"]')).toBeNull();
    expect(pack('rare')).not.toBeNull();
  });

  it('un rechazo no revela cartas, muestra el mensaje y recarga saldo y catálogo (US5-9, SC-018)', async () => {
    getCatalog.mockResolvedValue(catalog());
    open.mockRejectedValue({ response: { status: 409, data: { code: 'PACK_SOLD_OUT', message: 'x' } } });
    await render();
    await click(pack('rare'));
    await click(button('confirmar'));

    expect(container.querySelector('[aria-label="Cartas obtenidas"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/agotaron/);
    expect(credits.refresh).toHaveBeenCalled();
    expect(getCatalog).toHaveBeenCalledTimes(2);
    expect(credits.setBalance).not.toHaveBeenCalled();
  });

  it('no se puede iniciar otra apertura mientras una está en curso (US5-8, FR-057)', async () => {
    getCatalog.mockResolvedValue(catalog());
    let finish: (value: PackOpening) => void = () => undefined;
    open.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await render();

    await click(pack('rare'));
    await click(button('confirmar'));
    // La primera apertura sigue en vuelo: otro sobre no pide confirmación.
    await click(pack('common'));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(open).toHaveBeenCalledTimes(1);

    await act(async () => finish(OPENING));
    expect(container.querySelector('[aria-label="Cartas obtenidas"]')).not.toBeNull();
  });

  it('si el catálogo no carga, ofrece reintentar', async () => {
    getCatalog.mockRejectedValueOnce(new Error('caído')).mockResolvedValue(catalog());
    await render();
    expect(container.textContent).toContain('No se pudieron cargar los sobres');

    await click(button('Reintentar'));
    expect(pack('common')).not.toBeNull();
  });
});
