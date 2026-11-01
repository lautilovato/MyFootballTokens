import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { raritySqlCase } from '../player/rarity';
import type { TokenEventRow } from './dto/token-history-response.dto';

/** Tokens por jugador (constitución §5, FR-029). */
export const TOKENS_PER_PLAYER = 100;

/**
 * Persistencia de los tokens y de su historial (08-sobres FR-028 a FR-036, research #5).
 */
@Injectable()
export class TokensRepository {
  constructor(private readonly em: EntityManager) {}

  /**
   * Emite los tokens que falten: 100 por jugador, en estado `reservado` y en poder de la
   * plataforma, con su evento `emision` (FR-029). Idempotente y seguro ante dos ejecuciones
   * simultáneas: `on conflict do nothing` contra `(player_id, serial)`. Devuelve cuántos emitió.
   */
  async emitMissing(correlationId: string): Promise<number> {
    const rarity = raritySqlCase('p."world_reputation"', null);
    return this.em.fork().transactional(async (tx) => {
      const [row] = await tx.execute<{ emitted: number }[]>(
        `with "inserted" as (
           insert into "token" ("id", "player_id", "serial", "status", "owner_id", "pack_id", "created_at")
           select gen_random_uuid(), p."id", gs, 'reservado', null, null, now()
             from "player" p
            cross join generate_series(1, ?) as gs
           on conflict ("player_id", "serial") do nothing
           returning "id", "player_id"
         ), "events" as (
           insert into "token_event"
             ("id", "token_id", "type", "from_status", "to_status", "from_owner_id", "to_owner_id",
              "quote_price", "rarity", "reference_type", "reference_id", "correlation_id", "created_at")
           select gen_random_uuid(), i."id", 'emision', null, 'reservado', null, null,
                  nullif(round(p."base_value")::int, 0), ${rarity.sql}, null, null, ?, now()
             from "inserted" i
             join "player" p on p."id" = i."player_id"
           returning 1
         )
         select count(*)::int as "emitted" from "events"`,
        [TOKENS_PER_PLAYER, ...rarity.params, correlationId],
      );
      return Number(row?.emitted ?? 0);
    });
  }

  /**
   * Página del inventario (FR-033 a FR-035): jugadores de los que el usuario posee tokens hoy,
   * por reputación descendente y con el id como desempate, más los tokens de esos jugadores.
   */
  async findInventoryPage(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ total: number; players: InventoryPlayerRow[]; tokens: InventoryTokenRow[] }> {
    const [{ total }] = await this.em.execute<{ total: number }[]>(
      `select count(distinct "player_id")::int as "total"
         from "token" where "owner_id" = ? and "status" = 'de_usuario'`,
      [userId],
    );
    const players = await this.em.execute<InventoryPlayerRow[]>(
      `select t."player_id", p."world_reputation" as "reputation", count(*)::int as "count"
         from "token" t
         join "player" p on p."id" = t."player_id"
        where t."owner_id" = ? and t."status" = 'de_usuario'
        group by t."player_id", p."world_reputation"
        order by p."world_reputation" desc nulls last, t."player_id"
        limit ? offset ?`,
      [userId, limit, (page - 1) * limit],
    );
    if (players.length === 0) return { total: Number(total), players, tokens: [] };

    // `listing_id`: la publicación activa del token, si está a la venta (09-mercado FR-025). El
    // índice único parcial garantiza a lo sumo una, así que el join no duplica filas.
    const tokens = await this.em.execute<InventoryTokenRow[]>(
      `select t."id", t."serial", t."player_id", l."id" as "listing_id"
         from "token" t
         left join "listing" l on l."token_id" = t."id" and l."status" = 'activa'
        where t."owner_id" = ? and t."status" = 'de_usuario'
          and t."player_id" in (${players.map(() => '?').join(', ')})
        order by t."player_id", t."serial"`,
      [userId, ...players.map((p) => p.player_id)],
    );
    return { total: Number(total), players, tokens };
  }

  /**
   * Historial de un token, solo si `userId` lo posee o lo poseyó (FR-031): alguna vez fue el
   * destino de uno de sus eventos. Si no, `null`, sin distinguir si el token existe.
   */
  async findHistoryVisibleTo(
    tokenId: string,
    userId: string,
  ): Promise<{ token: { id: string; serial: number; player_id: string }; events: TokenEventRow[] } | null> {
    const [token] = await this.em.execute<{ id: string; serial: number; player_id: string }[]>(
      `select t."id", t."serial", t."player_id"
         from "token" t
        where t."id" = ?
          and exists (select 1 from "token_event" e where e."token_id" = t."id" and e."to_owner_id" = ?)`,
      [tokenId, userId],
    );
    if (!token) return null;

    const events = await this.em.execute<TokenEventRow[]>(
      `select "type", "created_at", "from_status", "from_owner_id", "to_owner_id", "quote_price", "rarity",
              "reference_type", "reference_id"
         from "token_event"
        where "token_id" = ?
        order by "created_at", "id"`,
      [tokenId],
    );
    return { token, events };
  }
}

export interface InventoryPlayerRow {
  player_id: string;
  reputation: number | null;
  count: number;
}

export interface InventoryTokenRow {
  id: string;
  serial: number;
  player_id: string;
  listing_id: string | null;
}
