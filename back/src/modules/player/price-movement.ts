/**
 * Movimiento de precio de un jugador a partir de sus cotizaciones reales (07-cotizacion).
 *
 * Reemplaza a la maqueta determinista (`market-value.mock.ts`): la variación y la serie que
 * muestran la carta y el panel de detalle salen de las cotizaciones guardadas, las mismas que
 * devuelve `GET /quotes/players/:id/history`. Grilla y detalle consumen esta misma función con
 * la misma serie, así que no pueden contradecirse (SC-011).
 *
 * Función pura: sin NestJS, sin inyección, sin base de datos (constitución §7, excepción de
 * utilidades puras). La fórmula de la variación es la del módulo de cotizaciones, no una copia.
 */
import { priceChangePct } from '../quotes/quotes.model';

/**
 * Cuántas cotizaciones como máximo trae la serie. Es un tope de tamaño de respuesta, no una
 * ventana de tiempo: las cotizaciones son semanales o manuales, no diarias.
 */
export const PRICE_HISTORY_POINTS = 30;

export interface PriceMovement {
  /** Variación porcentual de la última cotización respecto de la anterior, con un decimal. */
  changePct: number;
  /** Precios de las últimas cotizaciones, del más viejo al más nuevo. Vacía si nunca cotizó. */
  history: number[];
}

/**
 * `prices` viene del más viejo al más nuevo. Con menos de dos cotizaciones no hay contra qué
 * comparar y la variación es 0: la carta no admite un valor nulo y 0 es lo que muestra "sin
 * cambio".
 */
export function priceMovement(prices: readonly number[]): PriceMovement {
  const history = prices.slice(-PRICE_HISTORY_POINTS);
  const latest = history[history.length - 1];
  const previous = history[history.length - 2];

  return {
    changePct: latest === undefined ? 0 : (priceChangePct(latest, previous) ?? 0),
    history,
  };
}
