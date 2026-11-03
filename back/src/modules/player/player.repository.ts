import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Player } from '../../infrastructure/database/entities/player.entity';
import { PlayerSeasonStats } from '../../infrastructure/database/entities/player-season-stats.entity';
import { Token, TokenStatus } from '../../infrastructure/database/entities/token.entity';
import { GetPlayersFilterDto } from './dto/get-players-filter.dto';
import { PlayerWithStats } from './dto/player-response.dto';
import { OVR_MAX, PRICE_HISTORY_POINTS, reputationRangesForRarities } from './player.model';

interface SqlCondition {
  sql: string;
  params: unknown[];
}

@Injectable()
export class PlayerRepository {
  constructor(private readonly em: EntityManager) {}

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
    if (filter.minValue !== undefined) {
      qb.andWhere('"p"."base_value" >= ?', [filter.minValue]);
    }
    if (filter.maxValue !== undefined) {
      qb.andWhere('"p"."base_value" <= ?', [filter.maxValue]);
    }
    if (filter.search) {
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
    return { ...row, inCirculation: await this.countInCirculation(id) };
  }

  private async countInCirculation(playerId: string): Promise<number> {
    return this.em.count(Token, { player: playerId, status: TokenStatus.OWNED });
  }

 
  async findManyByIds(ids: string[], season: string | null): Promise<PlayerWithStats[]> {
    if (ids.length === 0) return [];
    const players = await this.em
      .getRepository(Player)
      .find({ id: { $in: [...new Set(ids)] } }, { populate: ['team', 'team.league'] });
    return this.attachStats(players, season);
  }

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

  
  private async attachStats(
    players: Player[],
    season: string | null,
  ): Promise<PlayerWithStats[]> {
    if (players.length === 0) return [];

    const playerIds = players.map((p) => p.id);
    const priceSeries = await this.findPriceSeries(playerIds);
    const forSale = await this.findActiveListings(playerIds);

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
      forSaleCount: forSale.get(player.id)?.count ?? 0,
      firstListedSerial: forSale.get(player.id)?.firstSerial ?? null,
    }));
  }

  
  private async findActiveListings(playerIds: string[]): Promise<Map<string, { count: number; firstSerial: number }>> {
    const rows = await this.em.execute<{ player_id: string; count: number; first_serial: number }[]>(
      `select l."player_id", count(*)::int as "count",
              (array_agg(t."serial" order by l."created_at", l."id"))[1] as "first_serial"
         from "listing" l
         join "token" t on t."id" = l."token_id"
        where l."status" = 'activa' and l."player_id" in (${playerIds.map(() => '?').join(', ')})
        group by l."player_id"`,
      playerIds,
    );
    return new Map(rows.map((row) => [row.player_id, { count: Number(row.count), firstSerial: Number(row.first_serial) }]));
  }

  
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
