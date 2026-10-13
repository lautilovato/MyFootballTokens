import { PRICE_HISTORY_POINTS, priceMovement } from './price-movement';

describe('price-movement', () => {
  it('sin cotizaciones: serie vacía y variación 0', () => {
    expect(priceMovement([])).toEqual({ changePct: 0, history: [] });
  });

  it('con una sola cotización no hay variación que calcular', () => {
    expect(priceMovement([724])).toEqual({ changePct: 0, history: [724] });
  });

  it('la variación compara la última cotización con la anterior', () => {
    expect(priceMovement([500, 600, 660]).changePct).toBe(10);
    expect(priceMovement([500, 600, 540]).changePct).toBe(-10);
  });

  it('la serie conserva el orden del más viejo al más nuevo', () => {
    expect(priceMovement([100, 200, 300]).history).toEqual([100, 200, 300]);
  });

  it('una anterior de 0 no sirve de base: variación 0', () => {
    expect(priceMovement([0, 500]).changePct).toBe(0);
  });

  it('se queda con las últimas cotizaciones cuando hay más del tope', () => {
    const prices = Array.from({ length: 45 }, (_, i) => 100 + i);
    const { history, changePct } = priceMovement(prices);

    expect(PRICE_HISTORY_POINTS).toBe(30);
    expect(history).toHaveLength(30);
    expect(history[0]).toBe(115);
    expect(history[29]).toBe(144);
    expect(changePct).toBe(0.7); // (144 − 143) / 143
  });

  it('la variación usa la fórmula del módulo de cotizaciones: un decimal', () => {
    expect(priceMovement([700, 724]).changePct).toBe(3.4);
  });
});
