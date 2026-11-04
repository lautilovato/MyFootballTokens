/**
 * Modelo de los créditos (08-sobres): la cantidad que recibe cada usuario al registrarse.
 *
 * Funciones puras: sin NestJS, sin inyección, sin base de datos (constitución §7, modelo del
 * dominio). `CreditsService` lee la cantidad al arrancar; con un valor inválido la aplicación no
 * arranca (research #11).
 */

/** Cantidad inicial por defecto (spec, Assumptions). */
export const DEFAULT_INITIAL_CREDITS = 2000;

/** Lee `INITIAL_CREDITS`: entero positivo, por defecto 2000 (FR-044, FR-045). */
export function parseInitialCredits(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_INITIAL_CREDITS;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`INITIAL_CREDITS tiene que ser un entero positivo (recibido: "${raw}")`);
  }
  return value;
}
