import { httpClient } from './http-client';
import type { ApiPlayerCard } from './players.service';

/** Ranking de jugadores (13-ranking). El contrato lo documenta el Swagger del backend. */

export interface RankingEntry {
  /** 1 es el jugador más caro. */
  rank: number;
  /** Cartas del jugador en poder de usuarios, a la venta o no. */
  inCirculation: number;
  /** `marketValue` es su precio en la corrida de la que sale el ranking. */
  player: ApiPlayerCard;
}

export interface PlayerRanking {
  strategy: { key: string; name: string; version: number };
  /** Nulo si la estrategia activa todavía no se calculó: entonces `data` viene vacío. */
  calculatedAt: string | null;
  data: RankingEntry[];
}

export async function getPlayerRanking(): Promise<PlayerRanking> {
  const { data } = await httpClient.get<PlayerRanking>('/ranking/players');
  return data;
}
