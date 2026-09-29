import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketFilters } from '../MarketFilters';
import type { League, PlayerFilters } from '../../services/players.service';

/**
 * FR-021 — el panel no habla con la red: solo emite el filtro completo hacia arriba. Se prueba
 * con las utilidades propias de React (la constitución §2 no autoriza librerías de testing).
 */

const LEAGUES: League[] = [
  { id: 1, name: 'Premier League', country: 'England' },
  { id: 2, name: 'Serie A', country: 'Italy' },
] as League[];

let container: HTMLDivElement;
let root: Root;

function render(filters: PlayerFilters, leagues: League[] = LEAGUES) {
  const onChange = vi.fn<(next: PlayerFilters) => void>();
  act(() => {
    root.render(<MarketFilters leagues={leagues} filters={filters} onChange={onChange} />);
  });
  return onChange;
}

function click(element: Element | null) {
  if (!element) throw new Error('elemento no encontrado');
  act(() => (element as HTMLElement).click());
}

/** React escucha el evento `input`: hay que pasar por el setter nativo para que lo registre. */
function typeInto(input: HTMLInputElement | null, value: string) {
  if (!input) throw new Error('input no encontrado');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function button(text: string): HTMLButtonElement | null {
  return (
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) ??
    null
  );
}

function checkbox(leagueName: string): HTMLInputElement | null {
  const label = Array.from(container.querySelectorAll('label')).find((l) =>
    l.textContent?.includes(leagueName),
  );
  return label?.querySelector('input[type="checkbox"]') ?? null;
}

const input = (selector: string) => container.querySelector<HTMLInputElement>(selector);

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('MarketFilters', () => {
  it('lista las ligas recibidas y avisa cuando no hay ninguna', () => {
    render({});
    expect(container.textContent).toContain('Premier League');
    expect(container.textContent).toContain('Serie A');

    render({}, []);
    expect(container.textContent).toContain('Sin ligas cargadas');
  });

  it('marcar una liga la agrega al filtro, y desmarcar la última lo limpia', () => {
    const onChange = render({ page: 3 });
    click(checkbox('Serie A'));
    expect(onChange).toHaveBeenLastCalledWith({ page: 3, league: ['Serie A'] });

    const onChangeChecked = render({ league: ['Serie A'] });
    expect(checkbox('Serie A')?.checked).toBe(true);
    click(checkbox('Serie A'));
    expect(onChangeChecked).toHaveBeenLastCalledWith({ league: undefined });
  });

  it('los chips de posición y rareza se suman a los ya elegidos', () => {
    const onChange = render({ position: ['FW'] });
    expect(button('FW')?.getAttribute('aria-pressed')).toBe('true');
    expect(button('GK')?.getAttribute('aria-pressed')).toBe('false');

    click(button('GK'));
    expect(onChange).toHaveBeenLastCalledWith({ position: ['FW', 'GK'] });

    click(button('Legendary'));
    expect(onChange).toHaveBeenLastCalledWith({ position: ['FW'], rarity: ['legendary'] });
  });

  it('la búsqueda emite el texto, y vacía se quita del filtro', () => {
    const onChange = render({});
    typeInto(input('input[type="search"]'), 'saka');
    expect(onChange).toHaveBeenLastCalledWith({ search: 'saka' });

    const onChangeWithSearch = render({ search: 'saka' });
    typeInto(input('input[type="search"]'), '');
    expect(onChangeWithSearch).toHaveBeenLastCalledWith({ search: undefined });
  });

  it('los rangos de valor y de OVR emiten números, y vacíos se quitan del filtro', () => {
    const onChange = render({});
    typeInto(input('input[aria-label="Valor mínimo"]'), '100');
    expect(onChange).toHaveBeenLastCalledWith({ minValue: 100 });
    typeInto(input('input[aria-label="Valor máximo"]'), '5000');
    expect(onChange).toHaveBeenLastCalledWith({ maxValue: 5000 });
    typeInto(input('input[aria-label="OVR mínimo"]'), '70');
    expect(onChange).toHaveBeenLastCalledWith({ minOvr: 70 });
    typeInto(input('input[aria-label="OVR máximo"]'), '90');
    expect(onChange).toHaveBeenLastCalledWith({ maxOvr: 90 });

    const onChangeWithValue = render({ minValue: 100 });
    typeInto(input('input[aria-label="Valor mínimo"]'), '');
    expect(onChangeWithValue).toHaveBeenLastCalledWith({ minValue: undefined });
  });

  it('cada sección se puede colapsar y volver a abrir', () => {
    render({});
    const leagues = button('Leagues▲');
    expect(leagues?.getAttribute('aria-expanded')).toBe('true');

    click(leagues);
    expect(button('Leagues▼')?.getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).not.toContain('Premier League');

    click(button('Leagues▼'));
    expect(container.textContent).toContain('Premier League');
  });
});
