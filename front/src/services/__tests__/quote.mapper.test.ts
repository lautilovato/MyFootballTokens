import { describe, expect, it } from 'vitest';
import {
  buildSeries,
  changePoints,
  markersToDraw,
  MAX_FULL_MARKERS,
  seriesId,
  strategyLabel,
  type StrategyRef,
} from '../quote.mapper';

const performance1: StrategyRef = { key: 'performance', name: 'Performance', version: 1 };
const performance2: StrategyRef = { key: 'performance', name: 'Performance', version: 2 };
const prestige1: StrategyRef = { key: 'prestige', name: 'Prestigio', version: 1 };

const quotes = (...strategies: StrategyRef[]) => strategies.map((strategy) => ({ strategy }));

/** 10-historial-operaciones — series por estrategia y reglas de marcadores del gráfico. */
describe('quote.mapper', () => {
  it('strategyLabel junta el nombre y la versión', () => {
    expect(strategyLabel(performance2)).toBe('Performance v2');
  });

  it('seriesId distingue la estrategia y la versión', () => {
    expect(seriesId(performance1)).toBe('performance@1');
    expect(seriesId(performance2)).toBe('performance@2');
    expect(seriesId(prestige1)).toBe('prestige@1');
  });

  describe('buildSeries', () => {
    it('crea un estilo por estrategia+versión, en el orden en que aparecen', () => {
      const series = buildSeries(quotes(performance1, performance1, prestige1, performance2, prestige1));
      expect(series.map((s) => s.id)).toEqual(['performance@1', 'prestige@1', 'performance@2']);
      expect(series.map((s) => s.label)).toEqual(['Performance v1', 'Prestigio v1', 'Performance v2']);
    });

    it('cada serie tiene un color y una forma distintos, para no depender solo del color', () => {
      const series = buildSeries(quotes(performance1, prestige1, performance2));
      expect(new Set(series.map((s) => s.color)).size).toBe(3);
      expect(new Set(series.map((s) => s.shape)).size).toBe(3);
    });

    it('con más series que colores no repite el par color-forma', () => {
      const many: StrategyRef[] = Array.from({ length: 8 }, (_, i) => ({ key: `s${i}`, name: `S${i}`, version: 1 }));
      const pairs = buildSeries(quotes(...many)).map((s) => `${s.color}|${s.shape}`);
      expect(new Set(pairs).size).toBe(8);
    });

    it('sin cotizaciones no hay series', () => {
      expect(buildSeries([])).toEqual([]);
    });
  });

  describe('changePoints', () => {
    it('devuelve los índices donde cambia la estrategia o la versión', () => {
      expect(changePoints(quotes(performance1, performance1, performance2, performance2, prestige1))).toEqual([2, 4]);
    });

    it('sin cambios, o con una sola cotización, no hay puntos de cambio', () => {
      expect(changePoints(quotes(performance1, performance1))).toEqual([]);
      expect(changePoints(quotes(performance1))).toEqual([]);
    });
  });

  describe('markersToDraw', () => {
    it(`con hasta ${MAX_FULL_MARKERS} cotizaciones dibuja un marcador en cada una`, () => {
      const list = quotes(...Array.from({ length: MAX_FULL_MARKERS }, () => performance1));
      expect(markersToDraw(list, null, null)).toHaveLength(MAX_FULL_MARKERS);
    });

    it('con más, dibuja solo la primera, los cambios, la elegida y la resaltada', () => {
      const list = quotes(
        ...Array.from({ length: 200 }, () => performance1),
        ...Array.from({ length: 300 }, () => performance2),
      );
      expect(markersToDraw(list, null, null)).toEqual([0, 200]);
      expect(markersToDraw(list, 350, 120)).toEqual([0, 120, 200, 350]);
    });

    it('ignora una selección fuera de rango', () => {
      const list = quotes(...Array.from({ length: 100 }, () => performance1));
      expect(markersToDraw(list, 999, -1)).toEqual([0]);
    });

    it('no repite un índice que ya es un cambio', () => {
      const list = quotes(...Array.from({ length: 70 }, () => performance1), ...Array.from({ length: 30 }, () => prestige1));
      expect(markersToDraw(list, 70, 70)).toEqual([0, 70]);
    });
  });
});
