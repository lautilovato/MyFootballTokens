/**
 * Valoración general (OVR) del jugador: su reputación mundial cargada (08-sobres FR-067, que
 * reemplaza FR-027 y FR-028 de 06-home).
 *
 * Función pura: sin NestJS, sin inyección, sin base de datos. Vive en la carpeta del módulo
 * por la excepción de utilidades puras de la constitución §7.
 *
 * El OVR ya no se deriva del rating de temporada: es la columna `player.world_reputation`
 * (0–100, la carga un administrador, spec 07). Como está persistida, los filtros por rango de
 * OVR comparan directamente contra ella (research #12).
 */

export const OVR_MAX = 99;

/**
 * OVR a partir de la reputación. Nulo sin reputación cargada (FR-068). La carta muestra dos
 * cifras, así que una reputación de 100 se presenta como 99 (FR-067).
 */
export function ovrFromReputation(reputation: number | null | undefined): number | null {
  if (reputation === null || reputation === undefined) return null;
  if (!Number.isFinite(reputation)) return null;
  return Math.min(OVR_MAX, Math.max(0, Math.trunc(reputation)));
}
