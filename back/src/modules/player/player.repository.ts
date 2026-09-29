import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Player } from '../../infrastructure/database/entities/player.entity';
import { PlayerSeasonStats } from '../../infrastructure/database/entities/player-season-stats.entity';
import { GetPlayersFilterDto } from './dto/get-players-filter.dto';
import { PlayerWithStats } from './dto/player-response.dto';
import { ratingLowerBoundForOvr, ratingUpperBoundForOvr } from './ovr';
import { ratingRangesForRarities } from './rarity';

/** Fragmento de SQL parametrizado que se suma al WHERE del listado. */
interface SqlCondition {
  sql: string;
  params: unknown[];
}

/**
 * Los filtros por OVR y por rareza NO tocan ninguna columna de OVR: no existe. Se traducen a
 * rangos sobre `player_season_stats.rating`, que es exacto porque `OVR = trunc(rating × 10)`
 * es monótono y los cortes son enteros (research #1). El índice `(season, rating)` los
 * sostiene.
 *
 * La condición se expresa como subconsulta sobre `player_season_stats` en lugar de un JOIN:
 * un jugador con estadísticas de más de una temporada multiplicaría filas en un JOIN y
 * rompería el conteo y el LIMIT. Con `EXISTS`/`NOT EXISTS` la cardinalidad del resultado es
 * estructuralmente un jugador por fila, sin depender de que la restricción de temporada esté
 * bien puesta.
 */
@Injectable()
export class PlayerRepository {
  constructor(private readonly em: EntityManager) {}

  /**
   * Temporada vigente: el máximo lexicográfico de `season`, que para el formato "2025-2026"
   * coincide con el orden cronológico (research #2). Derivarla de los datos evita el modo de
   * falla de una variable de entorno desactualizada.
   */
  async findCurrentSeason(): Promise<string | null> {
    const [row] = await this.em.execute<{ season: string | null }[]>(
      'select max("season") as season from "player_season_stats"',
    );
    return row?.season ?? null;
  }

  async findAndCount(
    filter: GetPlayersFilterDto,
    season: string | null,
  ): Promise<[PlayerWithStats[], number]> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;

    const qb = this.em
      .createQueryBuilder(Player, 'p')
      .select('*')
      .leftJoinAndSelect('p.team', 't')
      .leftJoinAndSelect('t.league', 'l');

    if (filter.position?.length) {
      qb.andWhere({ position: { $in: filter.position } });
    }
    if (filter.team?.length) {
      qb.andWhere({ 't.name': { $in: filter.team } });
    }
    if (filter.league?.length) {
      qb.andWhere({ 'l.name': { $in: filter.league } });
    }
    // `base_value` es decimal: MikroORM lo tipa como string, pero la comparación debe ser
    // numérica. Va como SQL para que Postgres compare el valor y no su representación.
    if (filter.minValue !== undefined) {
      qb.andWhere('"p"."base_value" >= ?', [filter.minValue]);
    }
    if (filter.maxValue !== undefined) {
      qb.andWhere('"p"."base_value" <= ?', [filter.maxValue]);
    }
    if (filter.search) {
      // El índice funcional de la migración usa esta misma función (research #4).
      qb.andWhere(
        'public.immutable_unaccent("p"."full_name") ilike public.immutable_unaccent(?)',
        [`%${filter.search}%`],
      );
    }

    for (const condition of this.buildRatingConditions(filter, season)) {
      qb.andWhere(condition.sql, condition.params);
    }

    qb.orderBy({ fullName: 'ASC' }).limit(limit).offset((page - 1) * limit);

    const [players, total] = await qb.getResultAndCount();
    return [await this.attachStats(players, season), total];
  }

  async findOneById(id: string, season: string | null): Promise<PlayerWithStats | null> {
    const player = await this.em
      .getRepository(Player)
      .findOne({ id }, { populate: ['team', 'team.league'] });

    if (!player) return null;

    const [row] = await this.attachStats([player], season);
    return row;
  }

  /**
   * Traduce los filtros de OVR y rareza a condiciones sobre `rating`. Sin temporada vigente
   * no hay ninguna fila de estadísticas, así que cualquier filtro que exija un OVR no puede
   * satisfacerse: se fuerza el conjunto vacío en lugar de ignorar el filtro en silencio.
   */
  private buildRatingConditions(
    filter: GetPlayersFilterDto,
    season: string | null,
  ): SqlCondition[] {
    const conditionsOut: SqlCondition[] = [];
    const ranges = ratingRangesForRarities(filter.rarity);
    const hasOvrFilter = filter.minOvr !== undefined || filter.maxOvr !== undefined;

    if (!hasOvrFilter && ranges.length === 0) return conditionsOut;

    if (season === null) {
      // Sin estadísticas cargadas nadie tiene OVR. `common` sigue matcheando a todos, porque
      // un jugador sin rating es common (FR-030); el resto de los filtros no matchea a nadie.
      const onlyCommon = ranges.length > 0 && ranges.every((r) => r.includeNull);
      if (!onlyCommon) conditionsOut.push({ sql: '1 = 0', params: [] });
      return conditionsOut;
    }

    if (hasOvrFilter) {
      // Un rango de OVR excluye a los jugadores sin estadísticas: no tienen OVR que comparar.
      const conditions = ['"s"."player_id" = "p"."id"', '"s"."season" = ?'];
      const params: unknown[] = [season];

      if (filter.minOvr !== undefined) {
        conditions.push('"s"."rating" >= ?');
        params.push(ratingLowerBoundForOvr(filter.minOvr));
      }
      if (filter.maxOvr !== undefined) {
        conditions.push('"s"."rating" < ?');
        params.push(ratingUpperBoundForOvr(filter.maxOvr));
      }

      conditionsOut.push({
        sql: `exists (select 1 from "player_season_stats" "s" where ${conditions.join(' and ')})`,
        params,
      });
    }

    if (ranges.length > 0) {
      const clauses: string[] = [];
      const params: unknown[] = [];

      for (const range of ranges) {
        const conditions = ['"s"."player_id" = "p"."id"', '"s"."season" = ?'];
        const rangeParams: unknown[] = [season];

        if (range.min !== null) {
          conditions.push('"s"."rating" >= ?');
          rangeParams.push(range.min);
        }
        if (range.max !== null) {
          conditions.push('"s"."rating" < ?');
          rangeParams.push(range.max);
        }

        const exists = `exists (select 1 from "player_season_stats" "s" where ${conditions.join(' and ')})`;

        if (range.includeNull) {
          // `common` abarca también a quien no tiene fila de estadísticas de esta temporada.
          clauses.push(
            `(${exists} or not exists (select 1 from "player_season_stats" "s2" where "s2"."player_id" = "p"."id" and "s2"."season" = ?))`,
          );
          params.push(...rangeParams, season);
        } else {
          clauses.push(`(${exists})`);
          params.push(...rangeParams);
        }
      }

      conditionsOut.push({ sql: `(${clauses.join(' or ')})`, params });
    }

    return conditionsOut;
  }

  /**
   * Trae las estadísticas de la temporada vigente para los jugadores de la página. Va en una
   * consulta aparte —y no en el JOIN del listado— para que la paginación cuente jugadores y
   * no filas, sin importar cuántas temporadas tenga cada jugador cargadas.
   */
  private async attachStats(
    players: Player[],
    season: string | null,
  ): Promise<PlayerWithStats[]> {
    if (players.length === 0) return [];

    if (season === null) {
      return players.map((player) => ({ player, stats: null }));
    }

    const stats = await this.em.getRepository(PlayerSeasonStats).find({
      player: { $in: players.map((p) => p.id) },
      season,
    });

    const byPlayerId = new Map(stats.map((s) => [s.player.id, s]));
    return players.map((player) => ({ player, stats: byPlayerId.get(player.id) ?? null }));
  }
}
