/**
 * ⚠️ MAQUETA — reemplazar por el historial de cotizaciones.
 *
 * El valor ACTUAL ya es real: es el precio de la última cotización del jugador, que el
 * recálculo de 07-cotizacion espeja en `player.base_value` (research #10). Lo que sigue
 * simulado es la variación porcentual y la serie de 30 días que muestran la carta y el panel
 * de detalle: la spec 06-home las exige como maqueta (FR-023) y la 07 deja fuera de alcance
 * cualquier cambio en la home.
 *
 * El dato real ya existe en `GET /quotes/players/:id/history` (variación y serie a partir de
 * las cotizaciones guardadas). Cuando una feature lo conecte a la home, este archivo es lo
 * único que hay que reemplazar: el resto del código consume `mockMarketMovement` y nada más.
 *
 * Por qué es DETERMINISTA y no aleatoria (research #5): la grilla y el detalle son dos
 * respuestas distintas del mismo jugador. Si cada una simulara por su cuenta, el mismo
 * jugador mostraría una variación en la carta y otra en el panel (violando SC-011), el valor
 * cambiaría en cada refresco, y ningún test podría afirmar nada. Sembrando el generador con
 * el UUID del jugador, el resultado es estable, distinto por jugador y reproducible.
 *
 * Función pura: sin NestJS, sin inyección, sin base de datos (constitución §7, excepción de
 * utilidades puras).
 */

/** Puntos de la serie: uno por día de la gráfica de "30 Day Market Value". */
export const MARKET_HISTORY_POINTS = 30;

/** Tope de la variación simulada, en puntos porcentuales. */
const MAX_CHANGE_PCT = 25;

export interface MarketMovement {
  /** Variación porcentual con un decimal, ej. 12.5 o -4.1. */
  changePct: number;
  /** Serie de precios del más viejo al más nuevo; el último es el valor actual. */
  history: number[];
}

/**
 * Hash determinista de 32 bits (FNV-1a) sobre el identificador del jugador. No necesita ser
 * criptográfico: solo estable entre procesos y bien distribuido entre ids parecidos, que es
 * lo que un UUID con pocos caracteres de diferencia exige.
 */
function hashSeed(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash || 1;
}

/** Generador congruencial lineal: misma semilla, misma secuencia, en cualquier corrida. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function mockMarketMovement(playerId: string, currentValue: number): MarketMovement {
  const random = createRandom(hashSeed(playerId));

  // Variación total del período, centrada en cero y acotada.
  const changePct = Number(((random() * 2 - 1) * MAX_CHANGE_PCT).toFixed(1));

  // Se reconstruye la serie hacia atrás desde el valor actual, para que el último punto sea
  // exactamente el valor real y la gráfica no contradiga al número que se muestra al lado.
  const startValue = currentValue / (1 + changePct / 100);

  const history: number[] = [];
  for (let i = 0; i < MARKET_HISTORY_POINTS; i++) {
    const progress = i / (MARKET_HISTORY_POINTS - 1);
    const trend = startValue + (currentValue - startValue) * progress;
    // Ruido decreciente: los días viejos oscilan más que los recientes, y el último no
    // oscila nada para poder clavar el valor actual.
    const noise = (random() * 2 - 1) * 0.04 * trend * (1 - progress);
    history.push(Math.max(0.01, Number((trend + noise).toFixed(2))));
  }
  history[history.length - 1] = currentValue;

  return { changePct, history };
}
