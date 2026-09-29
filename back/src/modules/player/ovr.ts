/**
 * Valoración general (OVR) derivada del rating de temporada (FR-027, FR-028).
 *
 * Función pura: sin NestJS, sin inyección, sin base de datos. Vive en la carpeta del módulo
 * por la excepción de utilidades puras de la constitución §7.
 *
 * El OVR NO se persiste. Se deriva en lectura del `rating` que ya ingiere 03-ingesta-stats,
 * y los filtros por rango de OVR se traducen a rangos sobre esa misma columna (research #1),
 * lo que mantiene el filtrado y la paginación resolubles en la base.
 */

export const OVR_MAX = 99;

/** Decimales que la columna `rating` puede contener: decimal(4,2). */
const RATING_DECIMALS = 2;
const RATING_SCALE = 10 ** RATING_DECIMALS;

/**
 * Parte entera y primer decimal del rating, como entero de dos cifras: 8,63 → 86.
 * Trunca, no redondea: 7,49 y 7,41 dan ambos 74.
 *
 * MikroORM entrega las columnas `decimal` como string, así que se aceptan ambos tipos.
 * No se multiplica por 10 directamente porque en coma flotante `0.3 * 10` da
 * 2.9999999999999996, cuyo truncado sería 2 en lugar de 3. Redondear primero a la grilla
 * real de la columna elimina ese error antes de truncar.
 */
export function ovrFromRating(rating: string | number | null | undefined): number | null {
  if (rating === null || rating === undefined || rating === '') return null;

  const numeric = Number(rating);
  if (!Number.isFinite(numeric)) return null;

  const scaled = Math.round(numeric * RATING_SCALE); // 8.63 -> 863
  const ovr = Math.floor(scaled / 10); // 863 -> 86

  return Math.min(OVR_MAX, Math.max(0, ovr));
}

/** Cota inferior inclusiva: `minOvr = n` equivale a `rating >= n/10` (research #1). */
export function ratingLowerBoundForOvr(ovr: number): number {
  return ovr / 10;
}

/** Cota superior exclusiva: `maxOvr = n` equivale a `rating < (n+1)/10` (research #1). */
export function ratingUpperBoundForOvr(ovr: number): number {
  return (ovr + 1) / 10;
}
