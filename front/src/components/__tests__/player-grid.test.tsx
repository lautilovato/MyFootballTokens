import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerGrid } from '../PlayerGrid';
import type { ApiPlayerCard } from '../../services/players.service';

function apiPlayer(id: string, name: string): ApiPlayerCard {
  return {
    id,
    name,
    position: 'MF',
    ovr: 75,
    rarity: 'rare',
    club: { name: 'Arsenal FC', crestUrl: null },
    nationality: { name: 'England', code: 'gb-eng' },
    goals: 3,
    assists: 2,
    marketValue: 1200,
    changePct: 1.5,
    supply: { minted: 100, total: 100 },
    priceHistory: [1100, 1200],
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('PlayerGrid', () => {
  it('muestra una carta por jugador, marca la seleccionada y avisa el click', () => {
    const onSelect = vi.fn();
    act(() => {
      root.render(
        <PlayerGrid
          players={[apiPlayer('a', 'Bukayo Saka'), apiPlayer('b', 'Declan Rice')]}
          selectedId="b"
          onSelect={onSelect}
        />,
      );
    });

    const items = container.querySelectorAll('li');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Bukayo Saka');
    expect(items[0].dataset.selected).toBeUndefined();
    expect(items[1].dataset.selected).toBe('true');

    act(() => items[0].querySelector<HTMLElement>('.pc')!.click());
    expect(onSelect).toHaveBeenCalledWith('a');
  });
});
