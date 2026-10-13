/**
 * Nivel de rareza de la carta, derivado del OVR (08-sobres FR-016, FR-068; reemplazan FR-029
 * y FR-030 de 06-home).
 *
 * Función pura: sin NestJS, sin inyección, sin base de datos (constitución §7, excepción de
 * utilidades puras). La rareza no es un atributo del jugador: es una lectura de su OVR, que es
 * su reputación mundial cargada. Cuando un administrador carga otra reputación, la rareza cambia
 * sola, sin migración ni recálculo.
 *
 * Es la única regla de rareza del sistema (FR-069): la usan la home, el panel de detalle, sus
 * filtros, la generación del stock de sobres, la apertura y el inventario.
 *
 * Los cuatro valores coinciden con el tipo `Rarity` que el componente de carta ya declara en
 * front/src/components/player-card/types.ts.
 */

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

/** Corte inferior inclusivo de cada nivel, en OVR. Por debajo de `rare` todo es `common`. */
export const RARITY_THRESHOLDS = {
  legendary: 88,
  epic: 80,
  rare: 70,
} as const;

/**
 * Rango de reputación que representa una rareza. `min` es inclusivo, `max` exclusivo y `null`
 * es sin cota. `includeNull` marca que el rango abarca a los jugadores sin reputación.
 */
export interface ReputationRange {
  min: number | null;
  max: number | null;
  includeNull: boolean;
}

export function rarityFromOvr(ovr: number | null): Rarity {
  // Sin OVR no hay valoración que clasificar: la carta cae al nivel más bajo (FR-068).
  if (ovr === null) return 'common';
  if (ovr >= RARITY_THRESHOLDS.legendary) return 'legendary';
  if (ovr >= RARITY_THRESHOLDS.epic) return 'epic';
  if (ovr >= RARITY_THRESHOLDS.rare) return 'rare';
  return 'common';
}

/**
 * La misma regla que `rarityFromOvr`, como expresión SQL sobre una columna de reputación, para
 * agrupar o registrar rarezas en la base sin copiar los cortes a mano (FR-069). Los cortes
 * valen igual sobre la reputación que sobre el OVR: acotar 100 a 99 no cruza ninguno.
 *
 * `whenNull` decide qué devuelve un jugador sin reputación: `'common'` cuando se clasifica (como
 * hace la carta, FR-068) o `null` cuando se registra «sin rareza» en un evento.
 */
export function raritySqlCase(column: string, whenNull: 'common' | null): { sql: string; params: number[] } {
  const nullBranch = whenNull === null ? 'null' : `'${whenNull}'`;
  return {
    sql: `(case when ${column} is null then ${nullBranch}
                when ${column} >= ? then 'legendary'
                when ${column} >= ? then 'epic'
                when ${column} >= ? then 'rare'
                else 'common' end)`,
    params: [RARITY_THRESHOLDS.legendary, RARITY_THRESHOLDS.epic, RARITY_THRESHOLDS.rare],
  };
}

/**
 * Traduce las rarezas pedidas a rangos de `player.world_reputation`, para filtrar en la base.
 * Varios rangos se unen con OR en el repositorio. Los cortes valen igual sobre la reputación que
 * sobre el OVR: acotar 100 a 99 no cruza ningún corte.
 *
 * `common` es el único que arrastra `includeNull`: agrupa tanto a los jugadores con reputación
 * baja como a los que no la tienen cargada (FR-068).
 */
export function reputationRangesForRarities(rarities?: Rarity[] | null): ReputationRange[] {
  if (!rarities || rarities.length === 0) return [];

  const { legendary, epic, rare } = RARITY_THRESHOLDS;
  const byRarity: Record<Rarity, ReputationRange> = {
    legendary: { min: legendary, max: null, includeNull: false },
    epic: { min: epic, max: legendary, includeNull: false },
    rare: { min: rare, max: epic, includeNull: false },
    common: { min: null, max: rare, includeNull: true },
  };

  // Set: pedir dos veces la misma rareza no debe duplicar su rango.
  return [...new Set(rarities)].map((rarity) => byRarity[rarity]).filter(Boolean);
}
