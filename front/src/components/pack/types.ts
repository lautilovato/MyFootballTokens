import type { Rarity } from '../player-card/types';

export interface PackData {
  /** Nombre comercial, ej. "Premium". Se muestra arriba de "PACK" */
  name: string;
  /** Define el color de los acentos y la cantidad de estrellas (misma paleta que las cartas) */
  tier: Rarity;
  /** Texto libre de la tirada, ej. "Series 1 // Batch 3" */
  series: string;
  /** Cuántas cartas trae el sobre */
  cardCount: number;
}
