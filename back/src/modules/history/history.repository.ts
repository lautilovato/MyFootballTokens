import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { HistoryKind } from './history-filter';

/** Una carta del historial tal como la devuelve la base, antes de armar el DTO. */
export interface HistoryRow {
  id: string;
  kind: HistoryKind;
  at: Date;
  tokenId: string;
  serial: number;
  playerId: string;
  rarity: string;
  /** Solo `sobre`. */
  packType: string | null;
  /** Solo `compra` y `venta`. */
  price: number | null;
  balanceBefore: number | null;
  balanceAfter: number | null;
  counterparty: 'plataforma' | 'otro_usuario' | null;
  quoteId: string | null;
}

/** La cotización que fijó el precio de una compra o venta, con su estrategia y versión. */
export interface QuoteRef {
  id: string;
  calculatedAt: Date;
  strategyKey: string;
  strategyName: string;
  version: number;
}

/**
 * Cada rama devuelve las mismas 14 columnas, en el mismo orden y con los mismos tipos, para poder
 * unirlas (`union all`). Todas llevan un único `?`: el usuario. Los valores son los que se
 * registraron en la operación (FR-011): nada se recalcula con los datos de hoy.
 */
const BRANCHES: Record<HistoryKind, string> = {
  // Una entrada por carta de cada sobre abierto. Sin precio, saldos ni cotización (FR-005).
  sobre: `select poc."id"::text as "id", 'sobre'::text as "kind", po."created_at" as "at", po."id" as "operation_id",
                 poc."token_id" as "token_id", poc."serial"::int as "serial", poc."player_id" as "player_id",
                 poc."rarity"::text as "rarity", po."pack_type"::text as "pack_type",
                 null::int as "price", null::int as "balance_before", null::int as "balance_after",
                 null::text as "counterparty", null::uuid as "quote_id"
            from "pack_opening_card" poc
            join "pack_opening" po on po."id" = poc."opening_id"
           where po."user_id" = ?`,
  compra: `select 'compra:' || tp."id"::text as "id", 'compra'::text as "kind", tp."created_at" as "at", tp."id" as "operation_id",
                  tp."token_id" as "token_id", t."serial"::int as "serial", tp."player_id" as "player_id",
                  tp."rarity"::text as "rarity", null::text as "pack_type",
                  tp."price" as "price", tp."buyer_balance_before" as "balance_before", tp."buyer_balance_after" as "balance_after",
                  (case when tp."seller_id" is null then 'plataforma' else 'otro_usuario' end)::text as "counterparty", tp."quote_id" as "quote_id"
             from "token_purchase" tp
             join "token" t on t."id" = tp."token_id"
            where tp."buyer_id" = ?`,
  // Quien vende siempre le vende a un usuario: la plataforma no compra (spec 09).
  venta: `select 'venta:' || tp."id"::text as "id", 'venta'::text as "kind", tp."created_at" as "at", tp."id" as "operation_id",
                 tp."token_id" as "token_id", t."serial"::int as "serial", tp."player_id" as "player_id",
                 tp."rarity"::text as "rarity", null::text as "pack_type",
                 tp."price" as "price", tp."seller_balance_before" as "balance_before", tp."seller_balance_after" as "balance_after",
                 'otro_usuario'::text as "counterparty", tp."quote_id" as "quote_id"
            from "token_purchase" tp
            join "token" t on t."id" = tp."token_id"
           where tp."seller_id" = ?`,
};

/**
 * Lectura del historial de cartas adquiridas y vendidas (10-historial-operaciones). Solo lee
 * `pack_opening_card`, `pack_opening`, `token_purchase` y las cotizaciones; no escribe nada
 * (FR-037).
 */
@Injectable()
export class HistoryRepository {
  constructor(private readonly em: EntityManager) {}

  /**
   * Una página del historial de `userId` y el total del filtro. Orden: la más reciente primero y,
   * a igual instante, por operación y por token, de modo que las cartas de un sobre quedan
   * contiguas y la paginación no repite ni saltea entradas (FR-008).
   */
  async findPage(
    userId: string,
    kinds: readonly HistoryKind[],
    page: number,
    limit: number,
  ): Promise<{ total: number; rows: HistoryRow[] }> {
    const union = kinds.map((kind) => BRANCHES[kind]).join('\n union all\n');
    const params = kinds.map(() => userId);

    const [{ total }] = await this.em.execute<{ total: number }[]>(
      `select count(*)::int as "total" from (${union}) h`,
      params,
    );
    const rows = await this.em.execute<
      {
        id: string;
        kind: HistoryKind;
        at: Date;
        token_id: string;
        serial: number;
        player_id: string;
        rarity: string;
        pack_type: string | null;
        price: number | null;
        balance_before: number | null;
        balance_after: number | null;
        counterparty: 'plataforma' | 'otro_usuario' | null;
        quote_id: string | null;
      }[]
    >(
      `select h.* from (${union}) h
        order by h."at" desc, h."operation_id" desc, h."token_id"
        limit ? offset ?`,
      [...params, limit, (page - 1) * limit],
    );

    return {
      total: Number(total),
      rows: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        at: new Date(r.at),
        tokenId: r.token_id,
        serial: Number(r.serial),
        playerId: r.player_id,
        rarity: r.rarity,
        packType: r.pack_type,
        price: r.price === null ? null : Number(r.price),
        balanceBefore: r.balance_before === null ? null : Number(r.balance_before),
        balanceAfter: r.balance_after === null ? null : Number(r.balance_after),
        counterparty: r.counterparty,
        quoteId: r.quote_id,
      })),
    };
  }

  /** Cotizaciones con su estrategia y versión, por id. Solo las de las filas de la página. */
  async findQuoteRefs(quoteIds: string[]): Promise<Map<string, QuoteRef>> {
    if (quoteIds.length === 0) return new Map();
    const rows = await this.em.execute<
      { id: string; calculated_at: Date; key: string; name: string; version: number }[]
    >(
      `select q."id", q."calculated_at", s."key", s."name", v."version"
         from "player_quote" q
         join "valuation_strategy_version" v on v."id" = q."strategy_version_id"
         join "valuation_strategy" s on s."id" = v."strategy_id"
        where q."id" in (${quoteIds.map(() => '?').join(', ')})`,
      quoteIds,
    );
    return new Map(
      rows.map((r) => [
        r.id,
        {
          id: r.id,
          calculatedAt: new Date(r.calculated_at),
          strategyKey: r.key,
          strategyName: r.name,
          version: Number(r.version),
        },
      ]),
    );
  }
}
