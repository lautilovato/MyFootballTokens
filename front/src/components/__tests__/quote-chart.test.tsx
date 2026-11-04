import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuoteChart } from '../QuoteChart';
import type { ApiQuote } from '../../services/quotes.service';
import type { StrategyRef } from '../../services/quote.mapper';

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

const performance1: StrategyRef = { key: 'performance', name: 'Performance', version: 1 };
const prestige1: StrategyRef = { key: 'prestige', name: 'Prestigio', version: 1 };

function quotes(count: number, strategyOf: (i: number) => StrategyRef = () => performance1): ApiQuote[] {
  return Array.from({ length: count }, (_, i) => ({
    price: 1000 + (i % 7) * 50,
    score: 0.5,
    rawScore: 0.5,
    calculatedAt: new Date(Date.UTC(2026, 0, 5 + i * 7, 2)).toISOString(),
    origin: 'AUTOMATIC' as const,
    season: '2025-2026',
    strategy: strategyOf(i),
    positionProfile: 'GENERAL',
    usedDefaultReputation: false,
    missingMatchesPlayed: false,
  }));
}

function render(list: ApiQuote[], props: { selectedIndex?: number | null; highlightIndex?: number | null } = {}) {
  const onSelect = vi.fn();
  act(() =>
    root.render(
      <QuoteChart
        quotes={list}
        playerName="Mario Mercado"
        selectedIndex={props.selectedIndex ?? null}
        highlightIndex={props.highlightIndex ?? null}
        onSelect={onSelect}
      />,
    ),
  );
  return onSelect;
}

const svg = () => container.querySelector('svg[role="slider"]') as SVGSVGElement;
const markerCount = () => svg().querySelectorAll('circle, rect, polygon').length;

/** 10-historial-operaciones US2 — gráfico completo de cotizaciones (FR-021 a FR-024). */
describe('QuoteChart', () => {
  it('no dibuja nada sin cotizaciones', () => {
    render([]);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('dibuja el eje de precios y el de fechas, y la línea de la serie', () => {
    render(quotes(10));
    expect(svg().querySelector('polyline')).not.toBeNull();
    const labels = [...svg().querySelectorAll('text')].map((t) => t.textContent ?? '');
    expect(labels.filter((t) => /^\d{2}\/\d{2}\/\d{2}$/.test(t)).length).toBeGreaterThanOrEqual(2);
    expect(labels.some((t) => /^1\.\d{3}$/.test(t))).toBe(true);
  });

  it('tiene un nombre accesible con el jugador y la cantidad de cotizaciones', () => {
    render(quotes(10));
    expect(svg().getAttribute('aria-label')).toContain('Mario Mercado');
    expect(svg().getAttribute('aria-label')).toContain('10 en total');
    expect(svg().tabIndex).toBe(0);
  });

  it('describe la cotización elegida con fecha, precio y estrategia para los lectores de pantalla', () => {
    render(quotes(10), { selectedIndex: 3 });
    const text = svg().getAttribute('aria-valuetext') ?? '';
    expect(text).toContain('créditos');
    expect(text).toContain('Performance v1');
    expect(svg().getAttribute('aria-valuenow')).toBe('3');
  });

  it('la leyenda tiene una entrada por estrategia+versión', () => {
    render(quotes(10, (i) => (i < 5 ? performance1 : prestige1)));
    const items = [...container.querySelectorAll('ul[aria-label="Leyenda de estrategias"] li')].map((li) => li.textContent);
    expect(items[0]).toBe('Performance v1');
    expect(items[1]).toBe('Prestigio v1');
    expect(items[2]).toContain('líneas punteadas');
  });

  it('marca con una línea vertical cada cambio de estrategia o de versión', () => {
    render(quotes(10, (i) => (i < 4 ? performance1 : i < 7 ? prestige1 : performance1)));
    expect(svg().querySelectorAll('[data-testid="strategy-change"]')).toHaveLength(2);
  });

  it('sin cambios de estrategia no hay líneas verticales ni la nota de la leyenda', () => {
    render(quotes(10));
    expect(svg().querySelectorAll('[data-testid="strategy-change"]')).toHaveLength(0);
    expect(container.textContent).not.toContain('líneas punteadas');
  });

  it('distingue las estrategias por la forma del marcador y no solo por el color', () => {
    render(quotes(10, (i) => (i < 5 ? performance1 : prestige1)));
    const legendShapes = [...container.querySelectorAll('ul[aria-label="Leyenda de estrategias"] li svg')].map((s) =>
      s.firstElementChild?.tagName,
    );
    expect(legendShapes).toEqual(['circle', 'rect']);
  });

  it('dibuja las cuatro formas de marcador cuando hay cuatro estrategias', () => {
    const strategies: StrategyRef[] = [
      performance1,
      prestige1,
      { key: 'tercera', name: 'Tercera', version: 1 },
      { key: 'cuarta', name: 'Cuarta', version: 1 },
    ];
    render(quotes(8, (i) => strategies[Math.floor(i / 2)]));

    expect(svg().querySelectorAll('circle')).toHaveLength(2);
    expect(svg().querySelectorAll('rect')).toHaveLength(2);
    const polygons = [...svg().querySelectorAll('polygon')];
    // Triángulo (3 vértices) y rombo (4 vértices).
    expect(polygons.map((p) => p.getAttribute('points')!.trim().split(' ').length).sort()).toEqual([3, 3, 4, 4]);
  });

  it('con pocas cotizaciones dibuja un marcador en cada una', () => {
    render(quotes(12));
    expect(markerCount()).toBe(12);
  });

  it('con 500 cotizaciones no dibuja 500 marcadores', () => {
    render(quotes(500, (i) => (i < 250 ? performance1 : prestige1)), { selectedIndex: 100 });
    // La primera, el cambio de estrategia y la elegida.
    expect(markerCount()).toBe(3);
  });

  it('resalta la cotización indicada', () => {
    render(quotes(10), { highlightIndex: 4 });
    expect(svg().querySelectorAll('[data-testid="highlight"]')).toHaveLength(1);
  });

  it('un clic elige la cotización más cercana en el eje horizontal', () => {
    const onSelect = render(quotes(10));
    vi.spyOn(svg(), 'getBoundingClientRect').mockReturnValue({ left: 0, width: 640, top: 0, height: 300 } as DOMRect);

    // Muy a la izquierda → la primera; muy a la derecha → la última.
    act(() => svg().dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 70 })));
    expect(onSelect).toHaveBeenLastCalledWith(0);
    act(() => svg().dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 630 })));
    expect(onSelect).toHaveBeenLastCalledWith(9);
  });

  it('con el gráfico enfocado, las flechas mueven la selección sin salirse del rango', () => {
    const onSelect = render(quotes(10), { selectedIndex: 5 });
    const press = (key: string) =>
      act(() => svg().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));

    press('ArrowLeft');
    expect(onSelect).toHaveBeenLastCalledWith(4);
    press('ArrowRight');
    expect(onSelect).toHaveBeenLastCalledWith(6);
    press('Home');
    expect(onSelect).toHaveBeenLastCalledWith(0);
    press('End');
    expect(onSelect).toHaveBeenLastCalledWith(9);
  });

  it('las flechas en los extremos no salen del rango', () => {
    const onSelect = render(quotes(10), { selectedIndex: 0 });
    act(() => svg().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })));
    expect(onSelect).toHaveBeenLastCalledWith(0);
  });

  it('con una sola cotización la dibuja centrada, sin fallar', () => {
    render(quotes(1));
    expect(markerCount()).toBe(1);
  });
});
