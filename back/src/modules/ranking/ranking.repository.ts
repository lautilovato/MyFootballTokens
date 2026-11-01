import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { QuoteRun, QuoteRunStatus } from '../../infrastructure/database/entities/quote-run.entity';
import { TokenStatus } from '../../infrastructure/database/entities/token.entity';

export interface RankedPlayerRow {
  playerId: string;
  price: number;
}

/** Lecturas del ranking (13-ranking). Las cotizaciones y los tokens se leen, nunca se modifican. */
@Injectable()
export class RankingRepository {
  constructor(private readonly em: EntityManager) {}

  /** Última corrida completada de la estrategia, con cualquiera de sus versiones. */
  async findLatestCompletedRun(strategyId: string): Promise<QuoteRun | null> {
    return this.em.fork().findOne(
      QuoteRun,
      { status: QuoteRunStatus.COMPLETED, strategyVersion: { strategy: strategyId } },
      { orderBy: { finishedAt: 'desc' }, populate: ['strategyVersion'] },
    );
  }

  /**
   * Los más caros de una corrida, que cotiza a todo el catálogo con estadísticas: no depende de
   * que el jugador tenga cartas en circulación. Los desempates dejan el orden estable.
   */
  async findTopOfRun(runId: string, limit: number): Promise<RankedPlayerRow[]> {
    const rows = await this.em.execute<{ player_id: string; price: number }[]>(
      `select q."player_id", q."price"
         from "player_quote" q
         join "player" p on p."id" = q."player_id"
        where q."run_id" = ?
        order by q."price" desc, q."score" desc, p."full_name" asc, p."id" asc
        limit ?`,
      [runId, limit],
    );
    return rows.map((row) => ({ playerId: row.player_id, price: Number(row.price) }));
  }

  /** Mismo criterio que `cards.inCirculation` del panel de administración: tokens de usuarios. */
  async countInCirculation(playerIds: string[]): Promise<Map<string, number>> {
    if (playerIds.length === 0) return new Map();

    const rows = await this.em.execute<{ player_id: string; count: number }[]>(
      `select "player_id", count(*)::int as "count"
         from "token"
        where "status" = ? and "player_id" in (${playerIds.map(() => '?').join(', ')})
        group by "player_id"`,
      [TokenStatus.OWNED, ...playerIds],
    );
    return new Map(rows.map((row) => [row.player_id, Number(row.count)]));
  }
}
