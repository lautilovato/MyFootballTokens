import { Injectable } from '@nestjs/common';
import { IsolationLevel } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { raritySqlCase } from '../player/rarity';
import { bucketUnit, fillBuckets, todayIn, type ActivityBucket, type AdminPeriod, type BucketUnit } from './admin-period';

/** Todo lo que se lee de la base en una carga del panel, antes de armar el DTO. */
export interface AdminSnapshot {
  users: { registered: number; new: number; active: number };
  tokensByStatus: Record<string, number>;
  playersWithoutFullEmission: number;
  listed: number;
  rarity: Record<string, number>;
  packsRemaining: Record<string, number>;
  packsOpened: Record<string, number>;
  market: { sales: number; averagePrice: number | null; volume: number };
  topSale: { price: number; playerId: string; playerName: string; at: Date } | null;
  topPlayers: { playerId: string; playerName: string; sales: number; volume: number }[];
  credits: { issued: number; collected: number };
  creditsAllTime: { issued: number; collected: number };
  creditsInCirculation: number;
  activity: { unit: BucketUnit; buckets: ActivityBucket[] };
}

type Tx = Pick<EntityManager, 'execute'>;

const toMap = (rows: { key: string; n: number | string }[]): Record<string, number> =>
  Object.fromEntries(rows.map((row) => [row.key, Number(row.n)]));

/** Restringe `column` al período, con los días en la zona del administrador (research #7). */
function inPeriod(column: string, period: AdminPeriod): { sql: string; params: string[] } {
  if (!period.from || !period.to) return { sql: 'true', params: [] };
  return {
    sql: `${column} >= (?::date::timestamp at time zone ?) and ${column} < ((?::date + 1)::timestamp at time zone ?)`,
    params: [period.from, period.timezone, period.to, period.timezone],
  };
}

/**
 * Agregados del panel (11-admin-panel). Lee las tablas con SQL propio, como `history`: las
 * métricas cruzan todos los dominios. Nunca escribe (FR-030).
 */
@Injectable()
export class AdminRepository {
  constructor(private readonly em: EntityManager) {}

  /** Una sola foto de la base: si no, una apertura en el medio rompería la conciliación (FR-026). */
  async loadSnapshot(period: AdminPeriod): Promise<AdminSnapshot> {
    return this.em.transactional(
      async (tx) => ({
        users: await this.loadUsers(tx, period),
        ...(await this.loadTokens(tx)),
        ...(await this.loadPacks(tx, period)),
        ...(await this.loadMarket(tx, period)),
        ...(await this.loadCredits(tx, period)),
        activity: await this.loadActivity(tx, period),
      }),
      { isolationLevel: IsolationLevel.REPEATABLE_READ, readOnly: true },
    );
  }

  /** Aperturas y ventas por tramo. «Todo» arranca en la primera operación registrada. */
  private async loadActivity(tx: Tx, period: AdminPeriod): Promise<AdminSnapshot['activity']> {
    const { timezone } = period;
    const from = period.from ?? (await this.loadFirstActivityDay(tx, timezone));
    if (!from) return { unit: 'day', buckets: [] };

    const to = period.to ?? todayIn(timezone);
    const unit = bucketUnit(from, to);
    const range = inPeriod('"created_at"', { from, to, timezone });
    const bucket = `to_char(date_trunc(?, "created_at" at time zone ?), 'YYYY-MM-DD')`;
    const rows = await tx.execute<{ start: string; packs_opened: string; sales: string }[]>(
      `select "start", sum("packs_opened") as "packs_opened", sum("sales") as "sales"
         from (
           select ${bucket} as "start", count(*) as "packs_opened", 0 as "sales"
             from "pack_opening" where ${range.sql} group by 1
           union all
           select ${bucket} as "start", 0 as "packs_opened", count(*) as "sales"
             from "token_purchase" where ${range.sql} group by 1
         ) t
        group by "start"`,
      [unit, timezone, ...range.params, unit, timezone, ...range.params],
    );
    const counted = rows.map((row) => ({ start: row.start, packsOpened: Number(row.packs_opened), sales: Number(row.sales) }));
    return { unit, buckets: fillBuckets(from, to, unit, counted) };
  }

  private async loadUsers(tx: Tx, period: AdminPeriod): Promise<AdminSnapshot['users']> {
    const created = inPeriod('"created_at"', period);
    const [users] = await tx.execute<{ registered: string; new: string }[]>(
      `select count(*) as "registered", count(*) filter (where ${created.sql}) as "new"
         from "user" where "role" = 'user'`,
      created.params,
    );

    const openings = inPeriod('"created_at"', period);
    const bought = inPeriod('"created_at"', period);
    const sold = inPeriod('"created_at"', period);
    const [active] = await tx.execute<{ n: string }[]>(
      `select count(distinct a."id") as "n"
         from (
           select "user_id" as "id" from "pack_opening" where ${openings.sql}
           union select "buyer_id" from "token_purchase" where ${bought.sql}
           union select "seller_id" from "token_purchase" where "seller_id" is not null and ${sold.sql}
         ) a
         join "user" u on u."id" = a."id" and u."role" = 'user'`,
      [...openings.params, ...bought.params, ...sold.params],
    );

    return { registered: Number(users.registered), new: Number(users.new), active: Number(active.n) };
  }

  private async loadTokens(tx: Tx) {
    const tokens = await tx.execute<{ key: string; n: string }[]>(
      'select "status"::text as "key", count(*) as "n" from "token" group by "status"',
    );
    const [incomplete] = await tx.execute<{ n: string }[]>(
      `select count(*) as "n" from (select "player_id" from "token" group by "player_id" having count(*) <> 100) t`,
    );
    const [listed] = await tx.execute<{ n: string }[]>(`select count(*) as "n" from "listing" where "status" = 'activa'`);

    const rarity = raritySqlCase('p."world_reputation"', 'common');
    const rarities = await tx.execute<{ key: string; n: string }[]>(
      `select ${rarity.sql} as "key", count(*) as "n"
         from "token" t
         join "player" p on p."id" = t."player_id"
        where t."status" = 'de_usuario'
        group by 1`,
      rarity.params,
    );

    return {
      tokensByStatus: toMap(tokens),
      playersWithoutFullEmission: Number(incomplete.n),
      listed: Number(listed.n),
      rarity: toMap(rarities),
    };
  }

  private async loadPacks(tx: Tx, period: AdminPeriod) {
    const remaining = await tx.execute<{ key: string; n: string }[]>(
      `select "type"::text as "key", count(*) as "n" from "pack" where "status" = 'sin_abrir' group by "type"`,
    );
    const created = inPeriod('"created_at"', period);
    const opened = await tx.execute<{ key: string; n: string }[]>(
      `select "pack_type"::text as "key", count(*) as "n" from "pack_opening" where ${created.sql} group by "pack_type"`,
      created.params,
    );
    return { packsRemaining: toMap(remaining), packsOpened: toMap(opened) };
  }

  private async loadMarket(tx: Tx, period: AdminPeriod) {
    const created = inPeriod('tp."created_at"', period);
    const [totals] = await tx.execute<{ sales: string; volume: string; average: string | null }[]>(
      `select count(*) as "sales", coalesce(sum(tp."price"), 0) as "volume", round(avg(tp."price")) as "average"
         from "token_purchase" tp where ${created.sql}`,
      created.params,
    );
    const [top] = await tx.execute<{ price: number; player_id: string; full_name: string; created_at: Date }[]>(
      `select tp."price", tp."player_id", p."full_name", tp."created_at"
         from "token_purchase" tp
         join "player" p on p."id" = tp."player_id"
        where ${created.sql}
        order by tp."price" desc, tp."created_at" desc, tp."id"
        limit 1`,
      created.params,
    );
    const players = await tx.execute<{ player_id: string; full_name: string; sales: string; volume: string }[]>(
      `select tp."player_id", p."full_name", count(*) as "sales", sum(tp."price") as "volume"
         from "token_purchase" tp
         join "player" p on p."id" = tp."player_id"
        where ${created.sql}
        group by tp."player_id", p."full_name"
        order by count(*) desc, sum(tp."price") desc, p."full_name", tp."player_id"
        limit 5`,
      created.params,
    );

    return {
      market: {
        sales: Number(totals.sales),
        averagePrice: totals.average === null ? null : Number(totals.average),
        volume: Number(totals.volume),
      },
      topSale: top
        ? { price: Number(top.price), playerId: top.player_id, playerName: top.full_name, at: new Date(top.created_at) }
        : null,
      topPlayers: players.map((row) => ({
        playerId: row.player_id,
        playerName: row.full_name,
        sales: Number(row.sales),
        volume: Number(row.volume),
      })),
    };
  }

  private async loadCredits(tx: Tx, period: AdminPeriod) {
    const [balance] = await tx.execute<{ n: string }[]>('select coalesce(sum("credits"), 0) as "n" from "user"');
    return {
      credits: await this.loadCreditFlows(tx, period),
      creditsAllTime: await this.loadCreditFlows(tx, { from: null, to: null, timezone: period.timezone }),
      creditsInCirculation: Number(balance.n),
    };
  }

  /** Emitido: entregas iniciales. Cobrado: aperturas y ventas de tokens de la plataforma. */
  private async loadCreditFlows(tx: Tx, period: AdminPeriod) {
    const movements = inPeriod('"created_at"', period);
    const [flows] = await tx.execute<{ issued: string; packs: string }[]>(
      `select coalesce(sum("amount") filter (where "type" = 'entrega_inicial'), 0) as "issued",
              coalesce(-sum("amount") filter (where "type" = 'compra_sobre'), 0) as "packs"
         from "credit_movement" where ${movements.sql}`,
      movements.params,
    );
    const purchases = inPeriod('"created_at"', period);
    const [platform] = await tx.execute<{ n: string }[]>(
      `select coalesce(sum("price"), 0) as "n" from "token_purchase" where "seller_id" is null and ${purchases.sql}`,
      purchases.params,
    );
    return { issued: Number(flows.issued), collected: Number(flows.packs) + Number(platform.n) };
  }

  private async loadFirstActivityDay(tx: Tx, timezone: string): Promise<string | null> {
    const [row] = await tx.execute<{ day: string | null }[]>(
      `select to_char(least(
                (select min("created_at") from "pack_opening"),
                (select min("created_at") from "token_purchase")
              ) at time zone ?, 'YYYY-MM-DD') as "day"`,
      [timezone],
    );
    return row.day;
  }
}
