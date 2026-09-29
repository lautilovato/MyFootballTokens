import { ratingLowerBoundForOvr } from './ovr';

/**
 * Nivel de rareza de la carta, derivado del OVR (FR-029, FR-030).
 *
 * Función pura: sin NestJS, sin inyección, sin base de datos (constitución §7, excepción de
 * utilidades puras). La rareza no es un atributo del jugador: es una lectura de su OVR, que
 * a su vez deriva del rating. Cuando una ingesta actualiza el rating, la rareza cambia sola,
 * sin migración ni recálculo.
 *
 * Los cuatro valores coinciden con el tipo `Rarity` que el componente de carta ya declara en
 * front/src/components/player-card/types.ts.
 */

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

/** Corte inferior inclusivo de cada nivel, en OVR. Por debajo de `rare` todo es `common`. */
export const RARITY_THRESHOLDS = {
  legendary: 85,
  epic: 77,
  rare: 70,
} as const;

/** Rango de `rating` que representa una rareza. `max` es exclusivo; `null` es sin cota. */
export interface RatingRange {
  min: number | null;
  max: number | null;
  /** Si el rango abarca también a los jugadores sin fila de estadísticas. */
  includeNull: boolean;
}

export function rarityFromOvr(ovr: number | null): Rarity {
  // Sin OVR no hay valoración que clasificar: la carta cae al nivel más bajo (FR-030).
  if (ovr === null) return 'common';
  if (ovr >= RARITY_THRESHOLDS.legendary) return 'legendary';
  if (ovr >= RARITY_THRESHOLDS.epic) return 'epic';
  if (ovr >= RARITY_THRESHOLDS.rare) return 'rare';
  return 'common';
}

/**
 * Traduce las rarezas pedidas a rangos de `rating`, para filtrar en la base sin materializar
 * el OVR (research #1). Varios rangos se unen con OR en el repositorio.
 *
 * `common` es el único que arrastra `includeNull`: agrupa tanto a los jugadores con rating
 * bajo como a los que no tienen estadísticas de temporada.
 */
export function ratingRangesForRarities(rarities?: Rarity[] | null): RatingRange[] {
  if (!rarities || rarities.length === 0) return [];

  const legendary = ratingLowerBoundForOvr(RARITY_THRESHOLDS.legendary);
  const epic = ratingLowerBoundForOvr(RARITY_THRESHOLDS.epic);
  const rare = ratingLowerBoundForOvr(RARITY_THRESHOLDS.rare);

  const byRarity: Record<Rarity, RatingRange> = {
    legendary: { min: legendary, max: null, includeNull: false },
    epic: { min: epic, max: legendary, includeNull: false },
    rare: { min: rare, max: epic, includeNull: false },
    common: { min: null, max: rare, includeNull: true },
  };

  // Set: pedir dos veces la misma rareza no debe duplicar su rango.
  return [...new Set(rarities)].map((rarity) => byRarity[rarity]).filter(Boolean);
}
