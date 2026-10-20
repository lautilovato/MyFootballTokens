import { randomInt, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { Rarity } from '../player/rarity';
import { raritySqlCase } from '../player/rarity';
import { PACK_TYPES, PackTypeKey, RARITY_ORDER } from './pack-config.rules';
import type { PlannedBatch } from './pack-stock-planner';

/** Clave fija del advisory lock de la generación de lotes (research #6). */
const STOCK_LOCK_KEY = 8_2026_1013;

/** Tokens por tanda en los UPDATE e INSERT masivos de un lote. */
const BATCH_CHUNK_SIZE = 20_000;

/** Reintentos del sorteo cuando otra apertura toma el sobre elegido (research #8). */
const DRAW_ATTEMPTS = 4;

/** No quedan sobres sin abrir del tipo (FR-019). */
export class PackSoldOutError extends Error {}

/** El saldo no alcanza para el precio (FR-004, FR-019). */
export class InsufficientCreditsError extends Error {}

export interface EligibleTokenRow {
  tokenId: string;
  reputation: number;
}

export interface GeneratedBatch {
  number: number;
  tokenCount: number;
  packs: Record<PackTypeKey, number>;
}

export interface OpenPackInput {
  userId: string;
  type: PackTypeKey;
  price: number;
  correlationId: string;
  /** Rareza de un jugador según su reputación en el momento cero (FR-016). */
  rarityOf: (reputation: number | null) => Rarity;
}

export interface OpenedCard {
  tokenId: string;
  serial: number;
  playerId: string;
  rarity: Rarity;
  quotePrice: number;
}

export interface OpenedPack {
  id: string;
  type: PackTypeKey;
  price: number;
  cardCount: number;
  balanceBefore: number;
  balanceAfter: number;
  openedAt: Date;
  cards: OpenedCard[];
}

/** Literal de arreglo de Postgres para valores sin comas ni comillas (uuids, enteros, enums). */
function pgArray(values: readonly (string | number)[]): string {
  return `{${values.join(',')}}`;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Persistencia del stock de sobres y de las aperturas (08-sobres FR-008 a FR-027, FR-037 a
 * FR-041). Las operaciones que mueven tokens o créditos van cada una en su transacción.
 */
@Injectable()
export class PacksRepository {
  constructor(private readonly em: EntityManager) {}

  // --------------------------------------------------------------------------- stock

  /**
   * Genera un lote con los tokens `reservado` de los jugadores elegibles (FR-011, FR-012):
   * emisión completa, cotización vigente (`base_value > 0`, research #7) y reputación cargada.
   *
   * Todo corre en una transacción con un advisory lock, para que dos sincronizaciones no armen
   * dos lotes con los mismos tokens. `plan` arma los sobres en memoria (utilidad pura).
   */
  async generateBatch(
    plan: (tokens: EligibleTokenRow[]) => PlannedBatch,
    params: Record<string, unknown>,
    correlationId: string,
  ): Promise<GeneratedBatch | null> {
    return this.em.fork().transactional(async (tx) => {
      await tx.execute('select pg_advisory_xact_lock(?)', [STOCK_LOCK_KEY]);

      const rows = await tx.execute<{ id: string; reputation: number }[]>(
        `select t."id", p."world_reputation" as "reputation"
           from "token" t
           join "player" p on p."id" = t."player_id"
          where t."status" = 'reservado'
            and p."base_value" > 0
            and p."world_reputation" is not null
            and t."player_id" in (
              select "player_id" from "token" group by "player_id" having count(*) = ?
            )
          order by t."player_id", t."serial"
          for update of t`,
        [100],
      );
      if (rows.length === 0) return null;

      const planned = plan(rows.map((r) => ({ tokenId: r.id, reputation: Number(r.reputation) })));

      const [batch] = await tx.execute<{ id: string; number: number }[]>(
        `insert into "pack_batch" ("id", "token_count", "params", "composition", "correlation_id", "created_at")
         values (?, ?, ?::jsonb, ?::jsonb, ?, now())
         returning "id", "number"`,
        [randomUUID(), rows.length, JSON.stringify(params), JSON.stringify(planned.composition), correlationId],
      );

      const packIds = planned.packs.map(() => randomUUID());
      for (const indexes of chunks(planned.packs.map((_, i) => i), BATCH_CHUNK_SIZE)) {
        await tx.execute(
          `insert into "pack" ("id", "batch_id", "type", "card_count", "status", "opened_at", "created_at")
           select unnest(?::uuid[]), ?, unnest(?::text[]), unnest(?::smallint[]), 'sin_abrir', null, now()`,
          [
            pgArray(indexes.map((i) => packIds[i])),
            batch.id,
            pgArray(indexes.map((i) => planned.packs[i].type)),
            pgArray(indexes.map((i) => planned.packs[i].tokenIds.length)),
          ],
        );
      }

      const assignments = planned.packs.flatMap((pack, i) => pack.tokenIds.map((tokenId) => [tokenId, packIds[i]]));
      const rarity = raritySqlCase('p."world_reputation"', null);
      for (const slice of chunks(assignments, BATCH_CHUNK_SIZE)) {
        const tokenIds = pgArray(slice.map(([tokenId]) => tokenId));
        await tx.execute(
          `update "token" t
              set "status" = 'en_sobre', "pack_id" = v."pack_id", "updated_at" = now()
             from unnest(?::uuid[], ?::uuid[]) as v("token_id", "pack_id")
            where t."id" = v."token_id"`,
          [tokenIds, pgArray(slice.map(([, packId]) => packId))],
        );
        await tx.execute(
          `insert into "token_event"
             ("id", "token_id", "type", "from_status", "to_status", "from_owner_id", "to_owner_id",
              "quote_price", "rarity", "reference_type", "reference_id", "correlation_id", "created_at")
           select gen_random_uuid(), t."id", 'asignacion_a_sobre', 'reservado', 'en_sobre', null, null,
                  nullif(round(p."base_value")::int, 0), ${rarity.sql}, 'pack_batch', ?, ?, now()
             from unnest(?::uuid[]) as v("token_id")
             join "token" t on t."id" = v."token_id"
             join "player" p on p."id" = t."player_id"`,
          [...rarity.params, batch.id, correlationId, tokenIds],
        );
      }

      const packs = Object.fromEntries(PACK_TYPES.map((t) => [t, planned.composition[t].packs])) as Record<
        PackTypeKey,
        number
      >;
      return { number: Number(batch.number), tokenCount: rows.length, packs };
    });
  }

  // --------------------------------------------------------------------------- catálogo

  /** ¿Se generó alguna vez un sobre? (`PACKS_NOT_AVAILABLE`, FR-061). */
  async anyPackGenerated(): Promise<boolean> {
    const [row] = await this.em.execute<{ exists: boolean }[]>('select exists (select 1 from "pack") as "exists"');
    return Boolean(row?.exists);
  }

  async countUnopenedByType(): Promise<Record<PackTypeKey, number>> {
    const rows = await this.em.execute<{ type: PackTypeKey; count: number }[]>(
      `select "type", count(*)::int as "count" from "pack" where "status" = 'sin_abrir' group by "type"`,
    );
    const counts = Object.fromEntries(PACK_TYPES.map((t) => [t, 0])) as Record<PackTypeKey, number>;
    for (const row of rows) counts[row.type] = Number(row.count);
    return counts;
  }

  /**
   * Cartas de cada rareza en los sobres sin abrir de cada tipo, con la rareza ACTUAL del jugador
   * (research #9): es la que el usuario va a recibir. Solo conteos: el contenido de cada sobre
   * no sale de acá (FR-015).
   */
  async countUnopenedCardsByTypeAndRarity(): Promise<Record<PackTypeKey, Record<Rarity, number>>> {
    const rarity = raritySqlCase('p."world_reputation"', 'common');
    const rows = await this.em.execute<{ type: PackTypeKey; rarity: Rarity; cards: number }[]>(
      `select pk."type", ${rarity.sql} as "rarity", count(*)::int as "cards"
         from "token" t
         join "pack" pk on pk."id" = t."pack_id"
         join "player" p on p."id" = t."player_id"
        where pk."status" = 'sin_abrir' and t."status" = 'en_sobre'
        group by 1, 2`,
      rarity.params,
    );
    const result = Object.fromEntries(
      PACK_TYPES.map((t) => [t, Object.fromEntries(RARITY_ORDER.map((r) => [r, 0]))]),
    ) as Record<PackTypeKey, Record<Rarity, number>>;
    for (const row of rows) result[row.type][row.rarity] = Number(row.cards);
    return result;
  }

  // --------------------------------------------------------------------------- apertura

  /**
   * Abre un sobre del tipo en una sola transacción (FR-021, research #8): sortea uno de los
   * sobres sin abrir, debita el saldo con un UPDATE condicional, entrega los tokens y registra
   * movimiento, apertura, cartas y eventos, todos referenciados entre sí (FR-041).
   */
  async openPack(input: OpenPackInput): Promise<OpenedPack> {
    return this.em.fork().transactional(async (tx) => {
      const pack = await this.drawUnopenedPack(tx, input.type);

      const debited = await tx.execute<{ credits: number }[]>(
        `update "user" set "credits" = "credits" - ? where "id" = ? and "credits" >= ? returning "credits"`,
        [input.price, input.userId, input.price],
      );
      if (debited.length === 0) throw new InsufficientCreditsError();
      const balanceAfter = Number(debited[0].credits);
      const balanceBefore = balanceAfter + input.price;

      const [opened] = await tx.execute<{ opened_at: Date }[]>(
        `update "pack" set "status" = 'abierto', "opened_at" = now() where "id" = ? returning "opened_at"`,
        [pack.id],
      );

      const tokens = await tx.execute<
        { id: string; serial: number; player_id: string; base_value: string; world_reputation: number | null }[]
      >(
        `update "token" t
            set "status" = 'de_usuario', "owner_id" = ?, "updated_at" = now()
           from "player" p
          where t."pack_id" = ? and t."status" = 'en_sobre' and p."id" = t."player_id"
          returning t."id", t."serial", t."player_id", p."base_value", p."world_reputation"`,
        [input.userId, pack.id],
      );
      if (tokens.length !== pack.cardCount) {
        throw new Error(`el sobre ${pack.id} tiene ${tokens.length} tokens y debería tener ${pack.cardCount}`);
      }

      const cards: OpenedCard[] = tokens
        .map((t) => ({
          tokenId: t.id,
          serial: Number(t.serial),
          playerId: t.player_id,
          rarity: input.rarityOf(t.world_reputation === null ? null : Number(t.world_reputation)),
          quotePrice: Math.round(Number(t.base_value)),
        }))
        // Mismo orden que el historial (`order by player_id, serial`): comparación de texto plana,
        // que para uuids en minúscula coincide con el orden de Postgres.
        .sort((a, b) => (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : a.serial - b.serial));

      const openingId = randomUUID();
      const movementId = randomUUID();
      const params = { price: input.price, batch: pack.batchParams };

      await tx.execute(
        `insert into "credit_movement"
           ("id", "user_id", "type", "amount", "balance_before", "balance_after",
            "reference_type", "reference_id", "correlation_id", "created_at")
         values (?, ?, 'compra_sobre', ?, ?, ?, 'pack_opening', ?, ?, now())`,
        [movementId, input.userId, -input.price, balanceBefore, balanceAfter, openingId, input.correlationId],
      );
      await tx.execute(
        `insert into "pack_opening"
           ("id", "user_id", "pack_id", "pack_type", "price", "card_count", "balance_before", "balance_after",
            "params", "credit_movement_id", "correlation_id", "created_at")
         values (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?)`,
        [
          openingId,
          input.userId,
          pack.id,
          input.type,
          input.price,
          pack.cardCount,
          balanceBefore,
          balanceAfter,
          JSON.stringify(params),
          movementId,
          input.correlationId,
          opened.opened_at,
        ],
      );
      await tx.execute(
        `insert into "pack_opening_card" ("id", "opening_id", "token_id", "player_id", "serial", "rarity", "quote_price")
         values ${cards.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ')}`,
        cards.flatMap((c) => [randomUUID(), openingId, c.tokenId, c.playerId, c.serial, c.rarity, c.quotePrice]),
      );
      await tx.execute(
        `insert into "token_event"
           ("id", "token_id", "type", "from_status", "to_status", "from_owner_id", "to_owner_id",
            "quote_price", "rarity", "reference_type", "reference_id", "correlation_id", "created_at")
         values ${cards
           .map(() => `(?, ?, 'entrega_en_sobre', 'en_sobre', 'de_usuario', null, ?, ?, ?, 'pack_opening', ?, ?, now())`)
           .join(', ')}`,
        cards.flatMap((c) => [
          randomUUID(),
          c.tokenId,
          input.userId,
          c.quotePrice,
          c.rarity,
          openingId,
          input.correlationId,
        ]),
      );

      return {
        id: openingId,
        type: input.type,
        price: input.price,
        cardCount: pack.cardCount,
        balanceBefore,
        balanceAfter,
        openedAt: new Date(opened.opened_at),
        cards,
      };
    });
  }

  // --------------------------------------------------------------------------- historial

  /**
   * Aperturas del usuario, de la más reciente a la más antigua (FR-039), con las cartas
   * registradas en el momento cero (FR-038), que no cambian aunque cambie el jugador o el dueño.
   */
  async findOpeningsPage(userId: string, page: number, limit: number): Promise<{ total: number; openings: OpenedPack[] }> {
    const [{ total }] = await this.em.execute<{ total: number }[]>(
      'select count(*)::int as "total" from "pack_opening" where "user_id" = ?',
      [userId],
    );
    const rows = await this.em.execute<
      {
        id: string;
        pack_type: PackTypeKey;
        price: number;
        card_count: number;
        balance_before: number;
        balance_after: number;
        created_at: Date;
      }[]
    >(
      `select "id", "pack_type", "price", "card_count", "balance_before", "balance_after", "created_at"
         from "pack_opening"
        where "user_id" = ?
        order by "created_at" desc, "id" desc
        limit ? offset ?`,
      [userId, limit, (page - 1) * limit],
    );
    if (rows.length === 0) return { total: Number(total), openings: [] };

    const cards = await this.em.execute<
      { opening_id: string; token_id: string; serial: number; player_id: string; rarity: Rarity; quote_price: number }[]
    >(
      `select "opening_id", "token_id", "serial", "player_id", "rarity", "quote_price"
         from "pack_opening_card"
        where "opening_id" in (${rows.map(() => '?').join(', ')})
        order by "player_id", "serial"`,
      rows.map((r) => r.id),
    );

    return {
      total: Number(total),
      openings: rows.map((row) => ({
        id: row.id,
        type: row.pack_type,
        price: Number(row.price),
        cardCount: Number(row.card_count),
        balanceBefore: Number(row.balance_before),
        balanceAfter: Number(row.balance_after),
        openedAt: new Date(row.created_at),
        cards: cards
          .filter((c) => c.opening_id === row.id)
          .map((c) => ({
            tokenId: c.token_id,
            serial: Number(c.serial),
            playerId: c.player_id,
            rarity: c.rarity,
            quotePrice: Number(c.quote_price),
          })),
      })),
    };
  }

  /**
   * Sorteo uniforme entre los sobres sin abrir del tipo (FR-020): un desplazamiento al azar
   * sobre el conteo actual (research #8).
   *
   * Elegir y bloquear van en dos pasos: Postgres bloquea también las filas que saltea un
   * `OFFSET` con `FOR UPDATE`, y eso haría que cada apertura tome cientos de sobres. Se elige el
   * id sin bloquear y se bloquea solo esa fila con `skip locked`; si otra apertura la tomó
   * justo, se vuelve a contar y sortear.
   */
  private async drawUnopenedPack(
    tx: EntityManager,
    type: PackTypeKey,
  ): Promise<{ id: string; cardCount: number; batchParams: unknown }> {
    for (let attempt = 0; attempt < DRAW_ATTEMPTS; attempt++) {
      const [{ count }] = await tx.execute<{ count: number }[]>(
        `select count(*)::int as "count" from "pack" where "type" = ? and "status" = 'sin_abrir'`,
        [type],
      );
      if (Number(count) === 0) throw new PackSoldOutError();

      const [candidate] = await tx.execute<{ id: string }[]>(
        `select "id" from "pack" where "type" = ? and "status" = 'sin_abrir' order by "id" offset ? limit 1`,
        [type, randomInt(Number(count))],
      );
      if (!candidate) continue;

      const [row] = await tx.execute<{ id: string; card_count: number; params: unknown }[]>(
        `select pk."id", pk."card_count", b."params"
           from "pack" pk
           join "pack_batch" b on b."id" = pk."batch_id"
          where pk."id" = ? and pk."status" = 'sin_abrir'
          for update of pk skip locked`,
        [candidate.id],
      );
      if (row) return { id: row.id, cardCount: Number(row.card_count), batchParams: row.params };
    }
    // Todos los intentos chocaron con aperturas en curso: el próximo intento del usuario
    // ya verá el stock actualizado.
    throw new PackSoldOutError();
  }
}
