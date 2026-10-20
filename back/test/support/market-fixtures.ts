import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { EntityManager } from '@mikro-orm/postgresql';
import request from 'supertest';

/** 09-mercado: atajos HTTP y de base para los e2e del mercado, sobre `packs-fixtures.ts`. */

function auth(jwt: string): [string, string] {
  return ['Authorization', `Bearer ${jwt}`];
}

export function publish(app: INestApplication, jwt: string, body: Record<string, unknown>) {
  return request(app.getHttpServer()).post('/market/listings').set(...auth(jwt)).send(body);
}

export function withdraw(app: INestApplication, jwt: string, listingId: string) {
  return request(app.getHttpServer()).post(`/market/listings/${listingId}/withdraw`).set(...auth(jwt)).send();
}

export function listingsOf(app: INestApplication, jwt: string, playerId: string, query = '') {
  return request(app.getHttpServer()).get(`/market/players/${playerId}/listings${query}`).set(...auth(jwt));
}

export function purchase(app: INestApplication, jwt: string, body: Record<string, unknown>) {
  return request(app.getHttpServer()).post('/market/purchases').set(...auth(jwt)).send(body);
}

export function operations(app: INestApplication, jwt: string, query = '') {
  return request(app.getHttpServer()).get(`/market/operations${query}`).set(...auth(jwt));
}

/**
 * Le da al usuario `count` tokens `reservado` del jugador, como si los hubiera sacado de un sobre:
 * pasan a `de_usuario` con su evento de entrega, así el historial y la invariante «el último evento
 * determina el dueño» siguen valiendo. Sirve para tener cartas deterministas sin sortear sobres.
 */
export async function grantTokens(em: EntityManager, userId: string, playerId: string, count: number): Promise<string[]> {
  const fork = em.fork();
  const rows = await fork.execute<{ id: string; base_value: string }[]>(
    `update "token" t set "status" = 'de_usuario', "owner_id" = ?, "updated_at" = now()
       from "player" p
      where p."id" = t."player_id"
        and t."id" in (select "id" from "token" where "player_id" = ? and "status" = 'reservado' order by "serial" limit ?)
      returning t."id", p."base_value"`,
    [userId, playerId, count],
  );
  for (const row of rows) {
    await fork.execute(
      `insert into "token_event" ("id", "token_id", "type", "from_status", "to_status", "from_owner_id", "to_owner_id",
         "quote_price", "rarity", "reference_type", "reference_id", "correlation_id", "created_at")
       values (?, ?, 'entrega_en_sobre', 'reservado', 'de_usuario', null, ?, ?, 'common', null, null, 'e2e-grant', now())`,
      [randomUUID(), row.id, userId, Math.round(Number(row.base_value)) || null],
    );
  }
  return rows.map((r) => r.id);
}

/** Tokens `de_usuario` del usuario, del jugador más valioso al menos valioso. */
export async function ownedTokens(
  em: EntityManager,
  userId: string,
): Promise<{ id: string; playerId: string; serial: number; price: number }[]> {
  const rows = await em.fork().execute<{ id: string; player_id: string; serial: number; price: number }[]>(
    `select t."id", t."player_id", t."serial", round(p."base_value")::int as "price"
       from "token" t join "player" p on p."id" = t."player_id"
      where t."owner_id" = ? and t."status" = 'de_usuario'
      order by p."base_value" desc, t."player_id", t."serial"`,
    [userId],
  );
  return rows.map((r) => ({ id: r.id, playerId: r.player_id, serial: Number(r.serial), price: Number(r.price) }));
}

/**
 * Pone un token en venta de la plataforma, como lo hará la eliminación de cuentas (08 FR-043):
 * lo pasa a `en_venta_plataforma` sin dueño y le crea su publicación activa con vendedor nulo
 * (FR-008, research #10). Si el token estaba en un sobre, lo saca de él.
 */
export async function insertPlatformListing(em: EntityManager, tokenId: string): Promise<string> {
  const fork = em.fork();
  const [token] = await fork.execute<{ player_id: string }[]>(
    `update "token" set "status" = 'en_venta_plataforma', "owner_id" = null, "pack_id" = null, "updated_at" = now()
      where "id" = ? returning "player_id"`,
    [tokenId],
  );
  const listingId = randomUUID();
  await fork.execute(
    `insert into "listing" ("id", "token_id", "player_id", "seller_id", "status", "created_at", "correlation_id")
     values (?, ?, ?, null, 'activa', now(), 'e2e-platform')`,
    [listingId, tokenId, token.player_id],
  );
  return listingId;
}

export interface MarketSnapshot {
  credits: Record<string, number>;
  tokens: Record<string, string[]>;
  listingStatus: string | null;
  rows: { creditMovements: number; purchases: number; tokenEvents: number };
}

/** Foto del estado que una compra rechazada no debe cambiar (FR-014, SC-002). */
export async function snapshotMarketState(
  em: EntityManager,
  userIds: string[],
  listingId: string | null,
): Promise<MarketSnapshot> {
  const fork = em.fork();
  const credits: Record<string, number> = {};
  const tokens: Record<string, string[]> = {};
  for (const userId of userIds) {
    const [user] = await fork.execute<{ credits: number }[]>('select "credits" from "user" where "id" = ?', [userId]);
    credits[userId] = Number(user.credits);
    const owned = await fork.execute<{ id: string }[]>(
      `select "id" from "token" where "owner_id" = ? and "status" = 'de_usuario' order by "id"`,
      [userId],
    );
    tokens[userId] = owned.map((t) => t.id);
  }
  const [listing] = listingId
    ? await fork.execute<{ status: string }[]>('select "status" from "listing" where "id" = ?', [listingId])
    : [];
  const count = async (table: string) =>
    Number((await fork.execute<{ n: number }[]>(`select count(*)::int as "n" from "${table}"`))[0].n);
  return {
    credits,
    tokens,
    listingStatus: listing?.status ?? null,
    rows: {
      creditMovements: await count('credit_movement'),
      purchases: await count('token_purchase'),
      tokenEvents: await count('token_event'),
    },
  };
}
