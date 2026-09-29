export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export type Position = 'GK' | 'DF' | 'MF' | 'FW';

export interface PlayerCardStat {
  /** Texto corto que se muestra en la carta, ej. "G" */
  label: string;
  value: number | string;
  /** Texto completo para tooltip / lectores de pantalla, ej. "Goles" */
  title?: string;
}

export interface PlayerCardData {
  name: string;
  position: Position;
  /** 0–99, sale de la fórmula de valoración */
  overall: number;
  club: {
    name: string;
    crestUrl?: string;
  };
  nationality: {
    name: string;
    /** ISO 3166-1 alpha-2 en minúscula ("se", "ar") o subdivisiones de flagcdn ("gb-eng") */
    code: string;
  };
  /** Ideal: PNG recortado con fondo transparente */
  photoUrl?: string;
  token: {
    rarity: Rarity;
    supply: number;
    minted: number;
    /** Número de serie del token que se está mostrando (opcional) */
    serial?: number;
  };
  price: {
    current: number;
    /** ISO 4217: "USD", "ARS"… */
    currency: string;
    /** Variación en %, ej. 12.4 o -3.1 */
    changePct: number;
    /** Serie de precios para el sparkline, del más viejo al más nuevo */
    history: number[];
  };
  stats: PlayerCardStat[];
}
