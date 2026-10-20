import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Player } from '../../infrastructure/database/entities/player.entity';
import { PlayerSeasonStats } from '../../infrastructure/database/entities/player-season-stats.entity';
import { GetPlayersFilterDto } from './dto/get-players-filter.dto';
import { PlayerWithStats } from './dto/player-response.dto';
import { OVR_MAX } from './ovr';
import { PRICE_HISTORY_POINTS } from './price-movement';
import { reputationRangesForRarities } from './rarity';

/** Fragmento de SQL parametrizado que se suma al WHERE del listado. */
interface SqlCondition {
  sql: string;
  params: unknown[];
}

/**
 * Los filtros por OVR y por rareza comparan contra `player.world_reputation`: el OVR es la
 * reputación cargada (08-sobres FR-067, research #12), así que no hace falta traducirlos a
 * rangos de rating como en 06-home. El índice `player_world_reputation_index` los sostiene.
 *
 * La pertenencia a la temporada vigente se expresa como subconsulta sobre
 * `player_season_stats` en lugar de un JOIN: un jugador con estadísticas de más de una
 * temporada multiplicaría filas en un JOIN y rompería el conteo y el LIMIT.
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

    // El listado solo muestra jugadores con estadísticas de la temporada vigente: sin ellas la
    // carta no tiene OVR ni métricas. Sin temporada cargada, entonces, no hay nadie que listar.
    if (season === null) return [[], 0];

    const qb = this.em
      .createQueryBuilder(Player, 'p')
      .select('*')
      .leftJoinAndSelect('p.team', 't')
      .leftJoinAndSelect('t.league', 'l')
      .where(
        'exists (select 1 from "player_season_stats" "s0" where "s0"."player_id" = "p"."id" and "s0"."season" = ?)',
        [season],
      )
      // El Market muestra solo jugadores con alguna carta a la venta (08-sobres FR-070): una
      // publicación activa, de un usuario o de la plataforma (09-mercado FR-026, research #8).
      // Mientras no exista ninguna —el mercado arranca vacío—, el listado está vacío.
      .andWhere(
        `exists (select 1 from "listing" "ls" where "ls"."player_id" = "p"."id" and "ls"."status" = 'activa')`,
        [],
      );

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

    for (const condition of this.buildReputationConditions(filter)) {
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
   * Página de jugadores por id, con las mismas estadísticas y series de precios que el listado.
   * Alimenta las cartas del inventario y de las aperturas (08-sobres research #13). Los ids
   * inexistentes simplemente no aparecen.
   */
  async findManyByIds(ids: string[], season: string | null): Promise<PlayerWithStats[]> {
    if (ids.length === 0) return [];
    const players = await this.em
      .getRepository(Player)
      .find({ id: { $in: [...new Set(ids)] } }, { populate: ['team', 'team.league'] });
    return this.attachStats(players, season);
  }

  /**
   * Traduce los filtros de OVR y rareza a condiciones sobre `player.world_reputation` (FR-067).
   *
   * - Con un filtro de OVR activo, los jugadores sin reputación quedan afuera (FR-068): la
   *   comparación contra NULL nunca es verdadera.
   * - `maxOvr = 99` incluye la reputación 100, que se presenta como OVR 99.
   * - La rareza `common` incluye a los jugadores sin reputación (FR-068).
   */
  private buildReputationConditions(filter: GetPlayersFilterDto): SqlCondition[] {
    const conditionsOut: SqlCondition[] = [];

    if (filter.minOvr !== undefined) {
      conditionsOut.push({ sql: '"p"."world_reputation" >= ?', params: [filter.minOvr] });
    }
    if (filter.maxOvr !== undefined) {
      const upper = filter.maxOvr >= OVR_MAX ? Number.MAX_SAFE_INTEGER : filter.maxOvr;
      conditionsOut.push({ sql: '"p"."world_reputation" <= ?', params: [upper] });
    }

    const ranges = reputationRangesForRarities(filter.rarity);
    if (ranges.length > 0) {
      const clauses: string[] = [];
      const params: unknown[] = [];

      for (const range of ranges) {
        const conditions: string[] = [];
        if (range.min !== null) {
          conditions.push('"p"."world_reputation" >= ?');
          params.push(range.min);
        }
        if (range.max !== null) {
          conditions.push('"p"."world_reputation" < ?');
          params.push(range.max);
        }
        const bounded = `(${conditions.join(' and ')})`;
        clauses.push(range.includeNull ? `(${bounded} or "p"."world_reputation" is null)` : bounded);
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

    const playerIds = players.map((p) => p.id);
    const priceSeries = await this.findPriceSeries(playerIds);
    const forSale = await this.countActiveListings(playerIds);

    // Sin temporada cargada no hay estadísticas, pero un jugador cotizado sigue teniendo precios.
    const stats =
      season === null
        ? []
        : await this.em.getRepository(PlayerSeasonStats).find({
            player: { $in: playerIds },
            season,
          });

    const byPlayerId = new Map(stats.map((s) => [s.player.id, s]));
    return players.map((player) => ({
      player,
      stats: byPlayerId.get(player.id) ?? null,
      priceSeries: priceSeries.get(player.id) ?? [],
      forSaleCount: forSale.get(player.id) ?? 0,
    }));
  }

  /**
   * Cartas a la venta de cada jugador de la página (09-mercado FR-026): sus publicaciones activas,
   * de usuarios y de la plataforma. Una consulta para toda la página, por el mismo motivo que las
   * estadísticas; la sostiene `listing_player_active_index`.
   */
  private async countActiveListings(playerIds: string[]): Promise<Map<string, number>> {
    const rows = await this.em.execute<{ player_id: string; count: number }[]>(
      `select "player_id", count(*)::int as "count"
         from "listing"
        where "status" = 'activa' and "player_id" in (${playerIds.map(() => '?').join(', ')})
        group by "player_id"`,
      playerIds,
    );
    return new Map(rows.map((row) => [row.player_id, Number(row.count)]));
  }

  /**
   * Precios de las últimas `PRICE_HISTORY_POINTS` cotizaciones de cada jugador, del más viejo al
   * más nuevo, en UNA consulta para toda la página. Va aparte del listado por el mismo motivo que
   * las estadísticas: un JOIN multiplicaría filas y rompería el conteo y el LIMIT.
   */
  private async findPriceSeries(playerIds: string[]): Promise<Map<string, number[]>> {
    const series = new Map<string, number[]>();
    if (playerIds.length === 0) return series;

    const rows = await this.em.execute<{ player_id: string; price: number }[]>(
      `select "player_id", "price"
         from (
           select "player_id", "price", "calculated_at",
                  row_number() over (partition by "player_id" order by "calculated_at" desc) as "rn"
             from "player_quote"
            where "player_id" in (${playerIds.map(() => '?').join(', ')})
         ) "q"
        where "rn" <= ?
        order by "player_id", "calculated_at" asc`,
      [...playerIds, PRICE_HISTORY_POINTS],
    );

    for (const row of rows) {
      const prices = series.get(row.player_id) ?? [];
      prices.push(Number(row.price));
      series.set(row.player_id, prices);
    }
    return series;
  }
}
