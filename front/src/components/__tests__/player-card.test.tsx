import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerCard } from '../player-card/PlayerCard';
import type { PlayerCardData } from '../player-card/types';

/**
 * FR-020 — la carta se usa tal cual; acá se verifica lo que muestra y cómo reacciona. Se
 * renderiza con las utilidades propias de React (la constitución §2 no autoriza librerías de
 * testing). jsdom no trae `matchMedia` ni un `requestAnimationFrame` síncrono: se simulan.
 */

function cardData(overrides: Partial<PlayerCardData> = {}): PlayerCardData {
  return {
    name: 'Erling Haaland',
    position: 'FW',
    overall: 86,
    club: { name: 'Manchester City FC' },
    nationality: { name: 'Norway', code: 'no' },
    token: { rarity: 'legendary', supply: 100, minted: 100 },
    price: { current: 8450, currency: 'USD', changePct: 12.5, history: [8000, 8200, 8450] },
    stats: [
      { label: 'G', value: 29, title: 'Goles' },
      { label: 'A', value: 5, title: 'Asistencias' },
    ],
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;
let reducedMotion = false;

function render(ui: React.ReactElement) {
  act(() => {
    root.render(ui);
  });
}

const card = () => container.querySelector<HTMLDivElement>('.pc')!;

function pointerMove(clientX: number, clientY: number) {
  act(() => {
    card().dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX, clientY }));
  });
}

beforeEach(() => {
  reducedMotion = false;
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: reducedMotion,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('PlayerCard', () => {
  it('muestra nombre, OVR, club, rareza, precio y estadísticas', () => {
    render(<PlayerCard player={cardData()} />);
    const text = container.textContent ?? '';

    expect(text).toContain('Erling Haaland');
    expect(text).toContain('86');
    expect(text).toContain('Club: Manchester City FC');
    expect(text).toContain('Legendary');
    expect(text).toContain('Minted: 100/100');
    expect(text).toContain('$8,450');
    expect(text).toContain('+12.5%');
    expect(text).toContain('MFT collectible');
    expect(card().dataset.rarity).toBe('legendary');
    expect(card().getAttribute('aria-label')).toBe('Erling Haaland, FW, Manchester City FC, 86 OVR');
  });

  it('marca la tendencia a la baja y omite el sparkline con un solo punto de precio', () => {
    render(
      <PlayerCard
        player={cardData({ price: { current: 50.5, currency: 'USD', changePct: -3.1, history: [50.5] } })}
      />,
    );

    expect(card().dataset.trend).toBe('down');
    expect(container.textContent).toContain('-3.1%');
    expect(container.querySelector('.pc__spark')).toBeNull();
  });

  it('dibuja el sparkline cuando hay historial de precios', () => {
    render(<PlayerCard player={cardData()} />);
    expect(container.querySelector('.pc__spark polyline')).not.toBeNull();
    expect(container.querySelectorAll('.pc__spark circle')).toHaveLength(3);
  });

  it('sin foto ni escudo dibuja la silueta y un escudo con las iniciales del club', () => {
    render(<PlayerCard player={cardData({ club: { name: 'Club Atlético River Plate' } })} />);

    expect(container.querySelector('.pc__photo--empty')).not.toBeNull();
    const crest = container.querySelector('svg.pc__crest');
    expect(crest?.getAttribute('aria-label')).toBe('Club Atlético River Plate');
    expect(crest?.textContent).toBe('AR');
  });

  it('usa la foto y el escudo cuando vienen, y muestra el número de serie del token', () => {
    render(
      <PlayerCard
        player={cardData({
          photoUrl: 'https://example.test/haaland.png',
          club: { name: 'Manchester City FC', crestUrl: 'https://example.test/city.png' },
          token: { rarity: 'rare', supply: 100, minted: 40, serial: 7 },
        })}
      />,
    );

    expect(container.querySelector('img.pc__photo')?.getAttribute('src')).toBe(
      'https://example.test/haaland.png',
    );
    expect(container.querySelector('img.pc__crest')?.getAttribute('src')).toBe(
      'https://example.test/city.png',
    );
    expect(container.textContent).toContain('Rare 7/100');
  });

  it('con onClick se comporta como botón: click, Enter y espacio lo disparan', () => {
    const onClick = vi.fn();
    render(<PlayerCard player={cardData()} onClick={onClick} />);

    expect(card().getAttribute('role')).toBe('button');
    expect(card().tabIndex).toBe(0);

    act(() => card().click());
    act(() => {
      card().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      card().dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      card().dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    });
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('sin onClick es un artículo no enfocable', () => {
    render(<PlayerCard player={cardData()} />);
    expect(card().getAttribute('role')).toBe('article');
    expect(card().hasAttribute('tabindex')).toBe(false);
  });

  it('inclina la carta siguiendo al puntero y la endereza al salir', () => {
    render(<PlayerCard player={cardData()} />);
    card().getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 300 }) as DOMRect;

    pointerMove(200, 0);
    expect(card().style.getPropertyValue('--mx')).toBe('100.00%');
    expect(card().style.getPropertyValue('--my')).toBe('0.00%');
    expect(card().style.getPropertyValue('--ry')).toBe('8deg');
    expect(card().dataset.active).toBe('true');

    act(() => {
      card().dispatchEvent(new MouseEvent('pointerout', { bubbles: true }));
      card().dispatchEvent(new MouseEvent('pointerleave', { bubbles: false }));
    });
    expect(card().style.getPropertyValue('--mx')).toBe('');
    expect(card().dataset.active).toBeUndefined();
  });

  it('no se inclina si el usuario pidió reducir el movimiento o la carta no es interactiva', () => {
    reducedMotion = true;
    render(<PlayerCard key="reduced" player={cardData()} />);
    pointerMove(100, 100);
    expect(card().dataset.active).toBeUndefined();

    // `key` distinta: carta montada de nuevo, que vuelve a leer la preferencia (ahora sin
    // reducción), así lo único que frena el movimiento es `interactive={false}`.
    reducedMotion = false;
    render(<PlayerCard key="static" player={cardData()} interactive={false} />);
    pointerMove(100, 100);
    expect(card().dataset.active).toBeUndefined();

    render(<PlayerCard key="live" player={cardData()} />);
    pointerMove(100, 100);
    expect(card().dataset.active).toBe('true');
  });
});
