import { httpClient } from './http-client';

/**
 * Llamadas al catálogo. Contrato en
 * .specify/specs/06-home/contracts/home.openapi.yaml.
 *
 * Toda la red de la home pasa por acá: ninguna página ni componente crea su propia instancia
 * de Axios ni invoca `axios` directamente (constitución §7).
 */

export type Position = 'GK' | 'DF' | 'MF' | 'FW' | 'UNKNOWN';
export type Rarity = 'legendary' | 'epic' | 'rare' | 'common';

export const RARITIES: Rarity[] = ['legendary', 'epic', 'rare', 'common'];
export const POSITIONS: Position[] = ['FW', 'MF', 'DF', 'GK'];

export interface ApiPlayerCard {
  id: string;
  name: string;
  position: Position;
  /** Nulo si el jugador no tiene estadísticas de temporada. */
  ovr: number | null;
  rarity: Rarity;
  club: { name: string; crestUrl: string | null };
  nationality: { name: string | null; code: string | null };
  /** Ilustración cartoon (PNG con fondo transparente). Nulo si todavía no se encontró. */
  imageUrl: string | null;
  /** Nulo —no cero— cuando no hay estadísticas: "sin dato" es distinto de un cero real. */
  goals: number | null;
  assists: number | null;
  /** Precio de la última cotización del jugador, en créditos. 0 si nunca fue cotizado. */
  marketValue: number;
  /** Variación de la última cotización respecto de la anterior (%). 0 con menos de dos cotizaciones. */
  changePct: number;
  /** SIMULADO: la emisión por jugador todavía no sale de un módulo de tokens. */
  supply: { minted: number; total: number };
  /** Precios de las últimas cotizaciones (hasta 30), del más viejo al más nuevo. Vacío si nunca cotizó. */
  priceHistory: number[];
  /** Cartas del jugador a la venta: publicaciones activas de usuarios y de la plataforma (09-mercado FR-026). */
  forSaleCount: number;
  /** Número de carta de su publicación más antigua; nulo sin cartas a la venta (15-numero-de-carta). */
  firstListedSerial: number | null;
}

export interface ApiPlayerDetail extends ApiPlayerCard {
  league: string;
  season: string | null;
  height: number | null;
  /** Partidos jugados en la temporada (titular + ingresos desde el banco). */
  matchesPlayed: number | null;
  shotsPerGame: number | null;
  keyPasses: number | null;
  dribbles: number | null;
  tackles: number | null;
  rating: number | null;
  /** Cartas del jugador en poder de usuarios, a la venta o no (15-numero-de-carta FR-005). */
  inCirculation: number;
}

export interface PlayersPage {
  data: ApiPlayerCard[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface League {
  id: number;
  name: string;
  country: string;
  code: string | null;
}

export interface PlayerFilters {
  league?: string[];
  position?: Position[];
  rarity?: Rarity[];
  minValue?: number;
  maxValue?: number;
  minOvr?: number;
  maxOvr?: number;
  search?: string;
  page?: number;
  limit?: number;
}

/**
 * Los filtros de valores múltiples viajan como clave repetida
 * (`?league=Premier League&league=La Liga`), que es lo que el backend espera. Axios lo hace
 * con `repeat`, no con el formato `league[]` que usa por defecto en algunos serializadores.
 */
function toParams(filters: PlayerFilters): URLSearchParams {
  const params = new URLSearchParams();

  const appendAll = (key: string, values?: string[]) => {
    for (const value of values ?? []) params.append(key, value);
  };

  appendAll('league', filters.league);
  appendAll('position', filters.position);
  appendAll('rarity', filters.rarity);

  const appendOne = (key: string, value?: number | string) => {
    if (value !== undefined && value !== '') params.append(key, String(value));
  };

  appendOne('minValue', filters.minValue);
  appendOne('maxValue', filters.maxValue);
  appendOne('minOvr', filters.minOvr);
  appendOne('maxOvr', filters.maxOvr);
  appendOne('search', filters.search);
  appendOne('page', filters.page);
  appendOne('limit', filters.limit);

  return params;
}

export async function fetchPlayers(filters: PlayerFilters = {}): Promise<PlayersPage> {
  const { data } = await httpClient.get<PlayersPage>('/players', { params: toParams(filters) });
  return data;
}

export async function fetchPlayerDetail(id: string): Promise<ApiPlayerDetail> {
  const { data } = await httpClient.get<ApiPlayerDetail>(`/players/${id}`);
  return data;
}

export async function fetchLeagues(): Promise<League[]> {
  const { data } = await httpClient.get<League[]>('/leagues');
  return data;
}

export { toParams as buildPlayerQueryParams };
