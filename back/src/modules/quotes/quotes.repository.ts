import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { EntityManager, UniqueConstraintViolationException } from '@mikro-orm/postgresql';
import { Player } from '../../infrastructure/database/entities/player.entity';
import { PlayerQuote } from '../../infrastructure/database/entities/player-quote.entity';
import {
  NormalizationBounds,
  QuoteRun,
  QuoteRunStatus,
  QuoteRunTrigger,
} from '../../infrastructure/database/entities/quote-run.entity';
import type { CalculatedQuote, PlayerMetricsRow } from './score-calculator';

/**
 * Filas por INSERT del lote. PostgreSQL admite hasta 65.535 parámetros por sentencia y cada
 * cotización usa ~15: 1.000 filas quedan holgadas por debajo del límite.
 */
const INSERT_CHUNK_SIZE = 1000;

export interface PersistBatchInput {
  runId: string;
  strategyVersionId: string;
  trigger: QuoteRunTrigger;
  season: string;
  quotes: CalculatedQuote[];
  bounds: NormalizationBounds;
  skippedCount: number;
}

/** Fila cruda de `loadSeasonBatch`: los `numeric` de Postgres llegan como string. */
interface SeasonBatchRow {
  playerId: string;
  position: string;
  leagueId: number;
  matchesPlayed: number | null;
  goals: number;
  assists: number;
  shots: string;
  keyPasses: string;
  dribbles: string;
  tackles: string;
  rating: string;
  worldReputation: number | null;
}

/**
 * Persistencia de corridas y cotizaciones. Las cotizaciones son solo INSERT: ningún método de
 * esta clase actualiza ni borra una `player_quote` (FR-017).
 *
 * Las operaciones de la corrida usan un `fork()` del EntityManager: la corrida automática no
 * tiene RequestContext, y miles de entidades en el identity map global quedarían vivas entre
 * corridas. Por eso también se usan inserts y updates nativos en lugar de `persist`.
 */
@Injectable()
export class QuotesRepository {
  constructor(private readonly em: EntityManager) {}

  /** Temporada vigente: mismo criterio que `PlayerRepository.findCurrentSeason`. */
  async findCurrentSeason(): Promise<string | null> {
    const [row] = await this.em.execute<{ season: string | null }[]>(
      'select max("season") as season from "player_season_stats"',
    );
    return row?.season ?? null;
  }

  async countCatalogPlayers(): Promise<number> {
    return this.em.fork().count(Player, {});
  }

  /**
   * Toma el lock de corrida insertando la fila en RUNNING. Devuelve `null` si ya había una en
   * curso: el índice único parcial `quote_run_one_running` rechaza la segunda (research #2).
   */
  async tryStartRun(trigger: QuoteRunTrigger, correlationId: string): Promise<string | null> {
    const id = randomUUID();
    try {
      await this.em.fork().insert(QuoteRun, {
        id,
        trigger,
        status: QuoteRunStatus.RUNNING,
        startedAt: new Date(),
        quotedCount: 0,
        skippedCount: 0,
        correlationId,
      });
      return id;
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) return null;
      throw error;
    }
  }

  /** Deja constancia de un disparo que llegó con otra corrida en curso (US5-2). */
  async insertSkippedRun(trigger: QuoteRunTrigger, correlationId: string): Promise<void> {
    const now = new Date();
    await this.em.fork().insert(QuoteRun, {
      id: randomUUID(),
      trigger,
      status: QuoteRunStatus.SKIPPED,
      startedAt: now,
      finishedAt: now,
      quotedCount: 0,
      skippedCount: 0,
      failureReason: 'run in progress',
      correlationId,
    });
  }

  /**
   * Todo lo que el cálculo necesita, en UNA consulta: estadísticas de la temporada, posición,
   * liga (vía equipo, para la ausencia) y reputación de cada jugador con datos (research #3).
   */
  async loadSeasonBatch(season: string): Promise<PlayerMetricsRow[]> {
    const rows = await this.em.execute<SeasonBatchRow[]>(
      `select s."player_id" as "playerId", p."position", t."league_id" as "leagueId",
              s."matches_played" as "matchesPlayed", s."goals", s."assists",
              s."shots_per_game" as "shots", s."key_passes" as "keyPasses", s."dribbles",
              s."tackles", s."rating", p."world_reputation" as "worldReputation"
         from "player_season_stats" s
         join "player" p on p."id" = s."player_id"
         join "team" t on t."id" = p."team_id"
        where s."season" = ?`,
      [season],
    );

    return rows.map((row) => ({
      playerId: row.playerId,
      position: row.position,
      leagueId: Number(row.leagueId),
      matchesPlayed: row.matchesPlayed === null ? null : Number(row.matchesPlayed),
      goals: Number(row.goals),
      assists: Number(row.assists),
      shots: Number(row.shots),
      keyPasses: Number(row.keyPasses),
      dribbles: Number(row.dribbles),
      tackles: Number(row.tackles),
      rating: Number(row.rating),
      worldReputation: row.worldReputation === null ? null : Number(row.worldReputation),
    }));
  }

  /**
   * Persiste el lote de forma atómica (FR-030): o quedan todas las cotizaciones, el espejo de
   * `base_value` y la corrida cerrada en COMPLETED, o no queda nada.
   */
  async persistBatch(input: PersistBatchInput): Promise<void> {
    await this.em.fork().transactional(async (tx) => {
      const calculatedAt = new Date();
      const rows = input.quotes.map((quote) => ({
        id: randomUUID(),
        player: quote.playerId,
        run: input.runId,
        strategyVersion: input.strategyVersionId,
        origin: input.trigger,
        season: input.season,
        score: quote.score.toFixed(4),
        rawScore: quote.rawScore.toFixed(4),
        price: quote.price,
        positionProfile: quote.positionProfile,
        positiveWeightSum: quote.positiveWeightSum.toFixed(4),
        breakdown: quote.breakdown,
        usedDefaultReputation: quote.usedDefaultReputation,
        missingMatchesPlayed: quote.missingMatchesPlayed,
        calculatedAt,
      }));

      for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
        await tx.insertMany(PlayerQuote, rows.slice(i, i + INSERT_CHUNK_SIZE) as never[]);
      }

      // Espejo del precio vigente en la columna que ya leen el listado y la home (research #10).
      await tx.execute(
        `update "player" p set "base_value" = q."price"
           from "player_quote" q
          where q."player_id" = p."id" and q."run_id" = ?`,
        [input.runId],
      );

      await tx.nativeUpdate(
        QuoteRun,
        { id: input.runId },
        {
          status: QuoteRunStatus.COMPLETED,
          finishedAt: calculatedAt,
          strategyVersion: input.strategyVersionId,
          season: input.season,
          quotedCount: input.quotes.length,
          skippedCount: input.skippedCount,
          normalizationBounds: input.bounds,
        },
      );
    });
  }

  /** Va fuera de la transacción del lote: el fallo tiene que quedar registrado (FR-029). */
  async markRunFailed(runId: string, reason: string, strategyVersionId?: string): Promise<void> {
    await this.em.fork().nativeUpdate(
      QuoteRun,
      { id: runId },
      {
        status: QuoteRunStatus.FAILED,
        finishedAt: new Date(),
        failureReason: reason.slice(0, 2000),
        ...(strategyVersionId ? { strategyVersion: strategyVersionId } : {}),
      },
    );
  }

  async playerExists(id: string): Promise<boolean> {
    return (await this.em.fork().count(Player, { id })) > 0;
  }

  /** La cotización vigente y la inmediatamente anterior (índice `player_id, calculated_at desc`). */
  async findLatestTwo(playerId: string): Promise<PlayerQuote[]> {
    return this.em.fork().find(
      PlayerQuote,
      { player: playerId },
      { orderBy: { calculatedAt: 'desc' }, limit: 2, populate: ['strategyVersion.strategy'] },
    );
  }

  /** Historial en orden cronológico ascendente, con `from`/`to` inclusivos (FR-020). */
  async findHistory(
    playerId: string,
    filter: { from?: Date; to?: Date; page: number; limit: number },
  ): Promise<[PlayerQuote[], number]> {
    const calculatedAt: { $gte?: Date; $lte?: Date } = {};
    if (filter.from) calculatedAt.$gte = filter.from;
    if (filter.to) calculatedAt.$lte = filter.to;

    return this.em.fork().findAndCount(
      PlayerQuote,
      { player: playerId, ...(filter.from || filter.to ? { calculatedAt } : {}) },
      {
        orderBy: { calculatedAt: 'asc' },
        limit: filter.limit,
        offset: (filter.page - 1) * filter.limit,
        populate: ['strategyVersion.strategy'],
      },
    );
  }

  /** Devuelve si el jugador existía. Impacta recién en el próximo recálculo (FR-026). */
  async setReputation(playerId: string, value: number | null): Promise<boolean> {
    const affected = await this.em
      .fork()
      .nativeUpdate(Player, { id: playerId }, { worldReputation: value });
    return affected > 0;
  }

  /** Un solo UPDATE para todo el lote; devuelve los ids que existían y se actualizaron. */
  async setReputationBulk(items: { playerId: string; value: number | null }[]): Promise<string[]> {
    const values = items.map(() => '(?::uuid, ?::smallint)').join(', ');
    const params = items.flatMap((item) => [item.playerId, item.value]);

    const rows = await this.em.execute<{ id: string }[]>(
      `update "player" p set "world_reputation" = v."value"
         from (values ${values}) as v("id", "value")
        where p."id" = v."id"
        returning p."id"`,
      params,
    );
    return rows.map((row) => row.id);
  }

  async findRuns(page: number, limit: number): Promise<[QuoteRun[], number]> {
    return this.em.fork().findAndCount(
      QuoteRun,
      {},
      {
        orderBy: { startedAt: 'desc' },
        limit,
        offset: (page - 1) * limit,
        populate: ['strategyVersion.strategy'],
      },
    );
  }

  /**
   * Cierra las corridas que quedaron en RUNNING porque el proceso murió a mitad de camino. Sin
   * esto, el índice `quote_run_one_running` bloquearía todas las corridas siguientes.
   */
  async failInterruptedRuns(): Promise<number> {
    return this.em.fork().nativeUpdate(
      QuoteRun,
      { status: QuoteRunStatus.RUNNING },
      { status: QuoteRunStatus.FAILED, failureReason: 'interrupted', finishedAt: new Date() },
    );
  }

  async findRunById(id: string): Promise<QuoteRun> {
    return this.em
      .fork()
      .findOneOrFail(QuoteRun, { id }, { populate: ['strategyVersion.strategy'] });
  }
}
