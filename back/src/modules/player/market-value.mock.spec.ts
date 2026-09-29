import { MARKET_HISTORY_POINTS, mockMarketMovement } from './market-value.mock';

// research #5 — la simulación debe ser determinista, o grilla y detalle se contradicen (SC-011).
describe('market-value.mock', () => {
  const idA = '2f1c9d2e-0b3a-4c5d-8e6f-7a8b9c0d1e2f';
  const idB = 'a1b2c3d4-e5f6-4071-8213-9a8b7c6d5e4f';

  it('devuelve exactamente lo mismo para el mismo jugador', () => {
    const first = mockMarketMovement(idA, 8450);
    const second = mockMarketMovement(idA, 8450);
    expect(second).toEqual(first);
  });

  it('devuelve resultados distintos para jugadores distintos', () => {
    const a = mockMarketMovement(idA, 8450);
    const b = mockMarketMovement(idB, 8450);
    expect(a.changePct).not.toBe(b.changePct);
  });

  it('produce la cantidad de puntos que pide la gráfica de 30 días', () => {
    expect(mockMarketMovement(idA, 8450).history).toHaveLength(MARKET_HISTORY_POINTS);
    expect(MARKET_HISTORY_POINTS).toBe(30);
  });

  it('la serie termina en el valor de mercado recibido', () => {
    const { history } = mockMarketMovement(idA, 8450);
    expect(history[history.length - 1]).toBe(8450);
  });

  it('la variación queda en un rango creíble y con un decimal', () => {
    for (const id of [idA, idB, '00000000-0000-4000-8000-000000000000']) {
      const { changePct } = mockMarketMovement(id, 1000);
      expect(Math.abs(changePct)).toBeLessThanOrEqual(25);
      expect(Number(changePct.toFixed(1))).toBe(changePct);
    }
  });

  it('nunca genera un precio negativo ni cero en la serie', () => {
    for (const value of [1, 50, 8450, 120000]) {
      for (const point of mockMarketMovement(idA, value).history) {
        expect(point).toBeGreaterThan(0);
      }
    }
  });

  it('el signo de la variación es coherente con el arranque de la serie', () => {
    const { history, changePct } = mockMarketMovement(idB, 5000);
    const first = history[0];
    const last = history[history.length - 1];
    expect(changePct >= 0).toBe(last >= first);
  });
});
