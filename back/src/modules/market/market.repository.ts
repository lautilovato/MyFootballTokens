import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { ListingStatus } from '../../infrastructure/database/entities/listing.entity';
import { raritySqlCase } from '../player/rarity';

/**
 * Precio del token = cotización vigente del jugador (FR-001, research #2): el espejo
 * `player.base_value` redondeado, como el momento cero de los sobres. 0 = sin cotización.
 */
const PRICE_SQL = 'round(p."base_value")::int';

/** Rareza vigente del jugador; sin reputación es `common` (08 FR-068). */
const RARITY = raritySqlCase('p."world_reputation"', 'common');

export interface ListingRow {
  id: string;
  tokenId: string;
  serial: number;
  playerId: string;
  status: ListingStatus;
  price: number;
  listedAt: Date;
  closedAt: Date | null;
}

export interface PurchaseInput {
  buyerId: string;
  listingId: string;
  acceptedPrice: number;
  correlationId: string;
}

export interface PurchaseRow {
  id: string;
  listingId: string;
  tokenId: string;
  serial: number;
  playerId: string;
  rarity: string;
  price: number;
  balanceAfter: number;
  purchasedAt: Date;
  buyerMovementId: string;
  sellerMovementId: string | null;
}

export interface OperationRow {
  purchaseId: string;
  kind: 'compra' | 'venta';
  tokenId: string;
  serial: number;
  playerId: string;
  rarity: string;
  price: number;
  balanceBefore: number;
  balanceAfter: number;
  counterparty: 'plataforma' | 'otro_usuario';
  at: Date;
}

export interface PlayerListingRow {
  listingId: string;
  tokenId: string;
  serial: number;
  mine: boolean;
  listedAt: Date;
}

/** El token no existe o no es del usuario (FR-003). */
export class TokenNotOwnedError extends Error {}

/** La publicación no existe, o no es del usuario que la quiere retirar (FR-006). */
export class ListingNotFoundError extends Error {}

/** El jugador no existe (FR-027). */
export class PlayerNotFoundError extends Error {}

/** El token ya tiene una publicación activa (FR-004). */
export class TokenAlreadyListedError extends Error {}

/** La publicación ya fue vendida o retirada (FR-007). */
export class ListingNotActiveError extends Error {}

/** El comprador es el vendedor (FR-011). */
export class OwnListingError extends Error {}

/** El jugador no tiene cotización vigente: su token no tiene precio (FR-001). */
export class PriceNotAvailableError extends Error {}

/** El precio vigente supera el que aceptó el comprador (FR-013). */
export class PriceChangedError extends Error {}

/** El saldo del comprador no alcanza (FR-012). */
export class InsufficientCreditsError extends Error {}

/**
 * Persistencia del mercado (09-mercado, research #3 a #6). La lógica financiera va en SQL
 * explícito dentro de una transacción, como la apertura de sobres (08 research #8).
 */
@Injectable()
export class MarketRepository {
  constructor(private readonly em: EntityManager) {}

  // --------------------------------------------------------------------------- publicar y retirar

  /**
   * Pone a la venta un token propio (FR-003 a FR-005, research #6). El token se bloquea con
   * `for update`: así el chequeo de «ya publicado» y el insert no se mezclan con otra publicación
   * del mismo token; el índice único parcial queda como red de seguridad (FR-004).
   */
  async createListing(userId: string, tokenId: string, correlationId: string): Promise<ListingRow> {
    return this.em.fork().transactional(async (tx) => {
      const [token] = await tx.execute<{ id: string; serial: number; player_id: string; price: number; rarity: string }[]>(
        `select t."id", t."serial", t."player_id", ${PRICE_SQL} as "price", ${RARITY.sql} as "rarity"
           from "token" t
           join "player" p on p."id" = t."player_id"
          where t."id" = ? and t."owner_id" = ? and t."status" = 'de_usuario'
          for update of t`,
        [...RARITY.params, tokenId, userId],
      );
      if (!token) throw new TokenNotOwnedError();

      const [active] = await tx.execute<{ id: string }[]>(
        `select "id" from "listing" where "token_id" = ? and "status" = 'activa'`,
        [tokenId],
      );
      if (active) throw new TokenAlreadyListedError();
      const price = Number(token.price);
      if (price <= 0) throw new PriceNotAvailableError();

      const id = randomUUID();
      const [created] = await tx.execute<{ created_at: Date }[]>(
        `insert into "listing" ("id", "token_id", "player_id", "seller_id", "status", "created_at", "correlation_id")
         values (?, ?, ?, ?, 'activa', now(), ?) returning "created_at"`,
        [id, tokenId, token.player_id, userId, correlationId],
      );
      await this.insertListingEvent(tx, 'puesta_en_venta', tokenId, userId, price, token.rarity, id, correlationId);

      return {
        id,
        tokenId,
        serial: Number(token.serial),
        playerId: token.player_id,
        status: ListingStatus.ACTIVE,
        price,
        listedAt: new Date(created.created_at),
        closedAt: null,
      };
    });
  }

  /**
   * Retira una publicación activa propia (FR-006, research #6). La publicación se bloquea con
   * `for update`: un retiro y una compra simultáneos se resuelven de a uno (US1-10). Una
   * publicación ajena o de la plataforma responde igual que una inexistente.
   */
  async withdrawListing(userId: string, listingId: string, correlationId: string): Promise<ListingRow> {
    return this.em.fork().transactional(async (tx) => {
      const [listing] = await tx.execute<
        { token_id: string; player_id: string; seller_id: string | null; status: ListingStatus; created_at: Date; serial: number; price: number; rarity: string }[]
      >(
        `select l."token_id", l."player_id", l."seller_id", l."status", l."created_at", t."serial",
                ${PRICE_SQL} as "price", ${RARITY.sql} as "rarity"
           from "listing" l
           join "token" t on t."id" = l."token_id"
           join "player" p on p."id" = l."player_id"
          where l."id" = ?
          for update of l`,
        [...RARITY.params, listingId],
      );
      if (!listing || listing.seller_id !== userId) throw new ListingNotFoundError();
      if (listing.status !== ListingStatus.ACTIVE) throw new ListingNotActiveError();

      const [closed] = await tx.execute<{ closed_at: Date }[]>(
        `update "listing" set "status" = 'retirada', "closed_at" = now(), "closed_correlation_id" = ?
          where "id" = ? returning "closed_at"`,
        [correlationId, listingId],
      );
      const price = Number(listing.price);
      await this.insertListingEvent(tx, 'retiro_de_venta', listing.token_id, userId, price, listing.rarity, listingId, correlationId);

      return {
        id: listingId,
        tokenId: listing.token_id,
        serial: Number(listing.serial),
        playerId: listing.player_id,
        status: ListingStatus.WITHDRAWN,
        price,
        listedAt: new Date(listing.created_at),
        closedAt: new Date(closed.closed_at),
      };
    });
  }

  // --------------------------------------------------------------------------- comprar

  /**
   * Compra una publicación (FR-010 a FR-022, research #4 y #5), en una sola transacción y con las
   * validaciones en el orden de FR-012.
   *
   * - La publicación se bloquea primero con `for update`: dos compras, o una compra y un retiro,
   *   sobre la misma publicación se resuelven de a una; la segunda ve el estado ya cerrado.
   * - Los saldos de comprador y vendedor se bloquean juntos y en orden de id: si A le compra a B
   *   mientras B le compra a A, la segunda espera a la primera en vez de trabarse (research #5).
   * - El débito es un UPDATE condicional: el saldo nunca queda negativo (FR-015).
   */
  async purchase(input: PurchaseInput): Promise<PurchaseRow> {
    return this.em.fork().transactional(async (tx) => {
      const [listing] = await tx.execute<
        {
          token_id: string;
          player_id: string;
          seller_id: string | null;
          status: ListingStatus;
          serial: number;
          price: number;
          rarity: string;
          quote_id: string | null;
        }[]
      >(
        // `quote_id` se lee en la misma sentencia que el precio: así los dos salen del mismo
        // snapshot y la compra queda atada a la cotización que fijó su precio (10-historial
        // research #1). El recálculo actualiza `base_value` y agrega la cotización en una sola
        // transacción, por lo que nunca se ve uno sin el otro.
        `select l."token_id", l."player_id", l."seller_id", l."status", t."serial",
                ${PRICE_SQL} as "price", ${RARITY.sql} as "rarity",
                (select q."id" from "player_quote" q
                  where q."player_id" = l."player_id"
                  order by q."calculated_at" desc limit 1) as "quote_id"
           from "listing" l
           join "token" t on t."id" = l."token_id"
           join "player" p on p."id" = l."player_id"
          where l."id" = ?
          for update of l`,
        [...RARITY.params, input.listingId],
      );
      if (!listing) throw new ListingNotFoundError();
      if (listing.status !== ListingStatus.ACTIVE) throw new ListingNotActiveError();
      if (listing.seller_id === input.buyerId) throw new OwnListingError();
      const price = Number(listing.price);
      if (price <= 0) throw new PriceNotAvailableError();
      if (price > input.acceptedPrice) throw new PriceChangedError();

      const sellerId = listing.seller_id;
      const userIds = sellerId ? [input.buyerId, sellerId] : [input.buyerId];
      await tx.execute(
        `select "id" from "user" where "id" in (${userIds.map(() => '?').join(', ')}) order by "id" for update`,
        userIds,
      );

      const debited = await tx.execute<{ credits: number }[]>(
        `update "user" set "credits" = "credits" - ? where "id" = ? and "credits" >= ? returning "credits"`,
        [price, input.buyerId, price],
      );
      if (debited.length === 0) throw new InsufficientCreditsError();
      const buyerAfter = Number(debited[0].credits);
      const buyerBefore = buyerAfter + price;

      let sellerBefore: number | null = null;
      let sellerAfter: number | null = null;
      if (sellerId) {
        const [credited] = await tx.execute<{ credits: number }[]>(
          `update "user" set "credits" = "credits" + ? where "id" = ? returning "credits"`,
          [price, sellerId],
        );
        sellerAfter = Number(credited.credits);
        sellerBefore = sellerAfter - price;
      }

      // El token pasa al comprador: de un usuario (sigue `de_usuario`) o de la plataforma.
      const moved = sellerId
        ? await tx.execute<{ id: string }[]>(
            `update "token" set "owner_id" = ?, "updated_at" = now()
              where "id" = ? and "status" = 'de_usuario' and "owner_id" = ? returning "id"`,
            [input.buyerId, listing.token_id, sellerId],
          )
        : await tx.execute<{ id: string }[]>(
            `update "token" set "status" = 'de_usuario', "owner_id" = ?, "updated_at" = now()
              where "id" = ? and "status" = 'en_venta_plataforma' returning "id"`,
            [input.buyerId, listing.token_id],
          );
      if (moved.length !== 1) {
        throw new Error(`el token ${listing.token_id} de la publicación ${input.listingId} no está donde debería`);
      }

      await tx.execute(
        `update "listing" set "status" = 'vendida', "closed_at" = now(), "closed_correlation_id" = ? where "id" = ?`,
        [input.correlationId, input.listingId],
      );

      const purchaseId = randomUUID();
      const buyerMovementId = randomUUID();
      const sellerMovementId = sellerId ? randomUUID() : null;
      await tx.execute(
        `insert into "credit_movement"
           ("id", "user_id", "type", "amount", "balance_before", "balance_after",
            "reference_type", "reference_id", "correlation_id", "created_at")
         values (?, ?, 'compra_token', ?, ?, ?, 'token_purchase', ?, ?, now())`,
        [buyerMovementId, input.buyerId, -price, buyerBefore, buyerAfter, purchaseId, input.correlationId],
      );
      if (sellerId) {
        await tx.execute(
          `insert into "credit_movement"
             ("id", "user_id", "type", "amount", "balance_before", "balance_after",
              "reference_type", "reference_id", "correlation_id", "created_at")
           values (?, ?, 'venta_token', ?, ?, ?, 'token_purchase', ?, ?, now())`,
          [sellerMovementId, sellerId, price, sellerBefore, sellerAfter, purchaseId, input.correlationId],
        );
      }
      const [created] = await tx.execute<{ created_at: Date }[]>(
        `insert into "token_purchase"
           ("id", "listing_id", "token_id", "player_id", "buyer_id", "seller_id", "accepted_price", "price", "rarity",
            "buyer_balance_before", "buyer_balance_after", "seller_balance_before", "seller_balance_after",
            "buyer_movement_id", "seller_movement_id", "quote_id", "correlation_id", "created_at")
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now()) returning "created_at"`,
        [
          purchaseId,
          input.listingId,
          listing.token_id,
          listing.player_id,
          input.buyerId,
          sellerId,
          input.acceptedPrice,
          price,
          listing.rarity,
          buyerBefore,
          buyerAfter,
          sellerBefore,
          sellerAfter,
          buyerMovementId,
          sellerMovementId,
          listing.quote_id,
          input.correlationId,
        ],
      );
      await tx.execute(
        `insert into "token_event"
           ("id", "token_id", "type", "from_status", "to_status", "from_owner_id", "to_owner_id",
            "quote_price", "rarity", "reference_type", "reference_id", "correlation_id", "created_at")
         values (?, ?, 'venta', ?, 'de_usuario', ?, ?, ?, ?, 'token_purchase', ?, ?, now())`,
        [
          randomUUID(),
          listing.token_id,
          sellerId ? 'de_usuario' : 'en_venta_plataforma',
          sellerId,
          input.buyerId,
          price,
          listing.rarity,
          purchaseId,
          input.correlationId,
        ],
      );

      return {
        id: purchaseId,
        listingId: input.listingId,
        tokenId: listing.token_id,
        serial: Number(listing.serial),
        playerId: listing.player_id,
        rarity: listing.rarity,
        price,
        balanceAfter: buyerAfter,
        purchasedAt: new Date(created.created_at),
        buyerMovementId,
        sellerMovementId,
      };
    });
  }

  // --------------------------------------------------------------------------- lecturas

  /**
   * Cartas a la venta de un jugador (FR-027): de la publicación más antigua a la más nueva, con el
   * precio vigente del jugador y `mine` según quién mira. No expone al vendedor.
   */
  async findActiveListingsPage(
    playerId: string,
    viewerId: string,
    page: number,
    limit: number,
  ): Promise<{ price: number | null; total: number; listings: PlayerListingRow[] }> {
    const [found] = await this.em.execute<{ price: number }[]>(
      `select ${PRICE_SQL} as "price" from "player" p where p."id" = ?`,
      [playerId],
    );
    if (!found) throw new PlayerNotFoundError();

    const [{ total }] = await this.em.execute<{ total: number }[]>(
      `select count(*)::int as "total" from "listing" where "player_id" = ? and "status" = 'activa'`,
      [playerId],
    );
    const rows = await this.em.execute<{ id: string; token_id: string; serial: number; mine: boolean; created_at: Date }[]>(
      `select l."id", l."token_id", t."serial", coalesce(l."seller_id" = ?, false) as "mine", l."created_at"
         from "listing" l
         join "token" t on t."id" = l."token_id"
        where l."player_id" = ? and l."status" = 'activa'
        order by l."created_at", l."id"
        limit ? offset ?`,
      [viewerId, playerId, limit, (page - 1) * limit],
    );

    const price = Number(found.price);
    return {
      price: price > 0 ? price : null,
      total: Number(total),
      listings: rows.map((r) => ({
        listingId: r.id,
        tokenId: r.token_id,
        serial: Number(r.serial),
        mine: Boolean(r.mine),
        listedAt: new Date(r.created_at),
      })),
    };
  }

  /**
   * Compras y ventas del usuario, de la más reciente a la más antigua (FR-029): cada fila de
   * `token_purchase` vista desde su lado, con sus saldos antes y después y la contraparte sin
   * identificar. Como nadie se compra a sí mismo, el usuario es comprador o vendedor, nunca ambos.
   */
  async findOperationsPage(userId: string, page: number, limit: number): Promise<{ total: number; operations: OperationRow[] }> {
    const [{ total }] = await this.em.execute<{ total: number }[]>(
      `select count(*)::int as "total" from "token_purchase" where "buyer_id" = ? or "seller_id" = ?`,
      [userId, userId],
    );
    const rows = await this.em.execute<
      {
        id: string;
        token_id: string;
        serial: number;
        player_id: string;
        rarity: string;
        price: number;
        created_at: Date;
        is_purchase: boolean;
        balance_before: number;
        balance_after: number;
        from_platform: boolean;
      }[]
    >(
      `select tp."id", tp."token_id", t."serial", tp."player_id", tp."rarity", tp."price", tp."created_at",
              tp."buyer_id" = ? as "is_purchase",
              case when tp."buyer_id" = ? then tp."buyer_balance_before" else tp."seller_balance_before" end as "balance_before",
              case when tp."buyer_id" = ? then tp."buyer_balance_after" else tp."seller_balance_after" end as "balance_after",
              tp."seller_id" is null as "from_platform"
         from "token_purchase" tp
         join "token" t on t."id" = tp."token_id"
        where tp."buyer_id" = ? or tp."seller_id" = ?
        order by tp."created_at" desc, tp."id" desc
        limit ? offset ?`,
      [userId, userId, userId, userId, userId, limit, (page - 1) * limit],
    );

    return {
      total: Number(total),
      operations: rows.map((r) => ({
        purchaseId: r.id,
        kind: r.is_purchase ? 'compra' : 'venta',
        tokenId: r.token_id,
        serial: Number(r.serial),
        playerId: r.player_id,
        rarity: r.rarity,
        price: Number(r.price),
        balanceBefore: Number(r.balance_before),
        balanceAfter: Number(r.balance_after),
        counterparty: r.is_purchase && r.from_platform ? 'plataforma' : 'otro_usuario',
        at: new Date(r.created_at),
      })),
    };
  }

  /**
   * Evento de publicación o retiro (FR-023, data-model.md): no cambia estado ni dueño, así que
   * origen y destino son el mismo vendedor y el mismo `de_usuario`.
   */
  private async insertListingEvent(
    tx: EntityManager,
    type: 'puesta_en_venta' | 'retiro_de_venta',
    tokenId: string,
    sellerId: string,
    price: number,
    rarity: string,
    listingId: string,
    correlationId: string,
  ): Promise<void> {
    await tx.execute(
      `insert into "token_event"
         ("id", "token_id", "type", "from_status", "to_status", "from_owner_id", "to_owner_id",
          "quote_price", "rarity", "reference_type", "reference_id", "correlation_id", "created_at")
       values (?, ?, ?, 'de_usuario', 'de_usuario', ?, ?, ?, ?, 'listing', ?, ?, now())`,
      [randomUUID(), tokenId, type, sellerId, sellerId, price > 0 ? price : null, rarity, listingId, correlationId],
    );
  }
}
