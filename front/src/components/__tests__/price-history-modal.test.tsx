import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PriceHistoryModal } from '../PriceHistoryModal';
import type { ApiQuote } from '../../services/quotes.service';

let container: HTMLDivElement;
let root: Root;
const showModal = vi.fn();
const close = vi.fn();

beforeEach(() => {
  // jsdom no implementa <dialog>.showModal(): el doble solo refleja el atributo `open`.
  showModal.mockReset().mockImplementation(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  close.mockReset().mockImplementation(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
  HTMLDialogElement.prototype.showModal = showModal as unknown as () => void;
  HTMLDialogElement.prototype.close = close as unknown as () => void;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function quote(i: number, strategy = { key: 'performance', name: 'Performance', version: 1 }): ApiQuote {
  return {
    price: 1000 + i * 25,
    score: 0.5 + i / 100,
    rawScore: 0.5,
    calculatedAt: new Date(Date.UTC(2026, 0, 5 + i * 7, 2)).toISOString(),
    origin: i === 2 ? 'MANUAL' : 'AUTOMATIC',
    season: '2025-2026',
    strategy,
    positionProfile: 'GENERAL',
    usedDefaultReputation: false,
    missingMatchesPlayed: false,
  };
}

const prestige = { key: 'prestige', name: 'Prestigio', version: 2 };

interface Props {
  open?: boolean;
  quotes?: ApiQuote[];
  loading?: boolean;
  error?: string | null;
  selectedIndex?: number | null;
  highlightIndex?: number | null;
}

function render(props: Props = {}) {
  const handlers = { onSelect: vi.fn(), onRetry: vi.fn(), onClose: vi.fn() };
  act(() =>
    root.render(
      <PriceHistoryModal
        open={props.open ?? true}
        playerName="Mario Mercado"
        quotes={props.quotes ?? []}
        loading={props.loading ?? false}
        error={props.error ?? null}
        selectedIndex={props.selectedIndex ?? null}
        highlightIndex={props.highlightIndex ?? null}
        {...handlers}
      />,
    ),
  );
  return handlers;
}

const dialog = () => container.querySelector('dialog') as HTMLDialogElement;
const text = () => dialog().textContent ?? '';
const button = (label: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement;
const four = [quote(0), quote(1), quote(2, prestige), quote(3, prestige)];

/** 10-historial-operaciones US2 — modal del gráfico completo (FR-021 a FR-026). */
describe('PriceHistoryModal', () => {
  it('abierto, se muestra como modal con el nombre del jugador', () => {
    render({ quotes: four });
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(dialog().getAttribute('aria-label')).toBe('Cotizaciones de Mario Mercado');
    expect(text()).toContain('Cotizaciones de Mario Mercado');
    expect(text()).toContain('4 en total');
  });

  it('al cerrarse por el padre, cierra el <dialog>', () => {
    render({ quotes: four });
    render({ open: false, quotes: four });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('no abre el <dialog> si está cerrado', () => {
    render({ open: false, quotes: four });
    expect(showModal).not.toHaveBeenCalled();
  });

  it('muestra el gráfico con todas las cotizaciones y su leyenda de estrategias', () => {
    render({ quotes: four });
    expect(dialog().querySelector('svg[role="slider"]')).not.toBeNull();
    const legend = [...dialog().querySelectorAll('ul[aria-label="Leyenda de estrategias"] li')].map((li) => li.textContent);
    expect(legend[0]).toBe('Performance v1');
    expect(legend[1]).toBe('Prestigio v2');
  });

  it('mientras carga lo indica y no muestra el gráfico', () => {
    render({ loading: true });
    expect(text()).toContain('Cargando cotizaciones');
    expect(dialog().querySelector('svg')).toBeNull();
  });

  it('ante un error muestra el mensaje y permite reintentar sin cerrar', () => {
    const { onRetry, onClose } = render({ error: 'No se pudieron cargar las cotizaciones.' });
    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('No se pudieron cargar');
    act(() => button('Reintentar').click());
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('con una sola cotización la muestra y avisa que todavía no hay historial para comparar', () => {
    render({ quotes: [quote(0)], selectedIndex: 0 });
    expect(text()).toContain('Hay una sola cotización: todavía no hay historial para comparar');
    expect(text()).toContain('1.000 créditos');
  });

  it('elegida una cotización, muestra precio, score, fecha, origen y estrategia con versión (FR-022)', () => {
    render({ quotes: four, selectedIndex: 2 });
    const detail = dialog().querySelector('section[aria-label="Cotización elegida"]')!.textContent ?? '';
    expect(detail).toContain('1.050 créditos');
    expect(detail).toContain('0,52');
    expect(detail).toContain('Manual');
    expect(detail).toContain('Prestigio v2');
    expect(detail).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
  });

  it('sin una cotización elegida no muestra el detalle', () => {
    render({ quotes: four, selectedIndex: null });
    expect(dialog().querySelector('section[aria-label="Cotización elegida"]')).toBeNull();
  });

  it('la lista en texto tiene una fila por cotización, la más reciente primero, con su estrategia (FR-024)', () => {
    render({ quotes: four, selectedIndex: 3 });
    const rows = [...dialog().querySelectorAll('tbody tr')].map((tr) => tr.textContent ?? '');
    expect(rows).toHaveLength(4);
    expect(rows[0]).toContain('1.075 créditos');
    expect(rows[0]).toContain('Prestigio v2');
    expect(rows[3]).toContain('1.000 créditos');
    expect(rows[3]).toContain('Performance v1');
  });

  it('cada fila de la lista es un botón que selecciona esa cotización', () => {
    const { onSelect } = render({ quotes: four });
    const rowButtons = [...dialog().querySelectorAll('tbody button')] as HTMLButtonElement[];
    // La lista va de la más reciente a la más antigua: el tercer botón es la segunda cotización.
    act(() => rowButtons[2].click());
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('marca la fila de la cotización elegida', () => {
    render({ quotes: four, selectedIndex: 1 });
    const current = dialog().querySelectorAll('tbody button[aria-current="true"]');
    expect(current).toHaveLength(1);
  });

  it('cierra con el botón «Cerrar»', () => {
    const { onClose } = render({ quotes: four });
    act(() => button('Cerrar').click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('cierra con Escape y evita el cierre por defecto del navegador', () => {
    const { onClose } = render({ quotes: four });
    const event = new Event('cancel', { bubbles: false, cancelable: true });
    act(() => {
      dialog().dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('cierra con un clic en el fondo, pero no con un clic dentro del contenido', () => {
    const { onClose } = render({ quotes: four });
    act(() => (dialog().querySelector('h2') as HTMLElement).click());
    expect(onClose).not.toHaveBeenCalled();
    act(() => dialog().click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
