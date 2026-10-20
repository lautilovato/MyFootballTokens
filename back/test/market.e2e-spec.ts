import { randomUUID } from 'node:crypto';
import { jest } from '@jest/globals';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PlayerSeasonStats } from '../src/infrastructure/database/entities/player-season-stats.entity';
import { Player } from '../src/infrastructure/database/entities/player.entity';
import { TokensService } from '../src/modules/tokens/tokens.service';
import {
  type PlayerFixture,
  cleanAll,
  openPack,
  registerUser,
  resetCaches,
  seedPlayers,
  setCredits,
  syncStock,
} from './support/packs-fixtures';
import {
  grantTokens,
  insertPlatformListing,
  listingsOf,
  operations,
  publish,
  purchase,
  snapshotMarketState,
  withdraw,
} from './support/market-fixtures';

jest.setTimeout(180_000);

const SEASON = '2025-2026';

/**
 * Jugadores sin reputación: quedan `reservado`, fuera de los sobres (08 FR-011), y `grantTokens`
 * puede dárselos a un usuario de forma determinista. «Pedro Paquete» es el único elegible para
 * los sobres, así cualquier sobre abierto trae cartas suyas.
 */
const PLAYERS: PlayerFixture[] = [
  { name: 'Mario Mercado', reputation: null, price: 300 },
  { name: 'Lucas Lista', reputation: null, price: 500 },
  { name: 'Sergio SinPrecio', reputation: null, price: 0 },
  { name: 'Pedro Paquete', reputation: 75, price: 400 },
];

/** 09-mercado — publicar, retirar, comprar e historial de operaciones. */
describe('Market (e2e)', () => {
  let app: INestApplication;
  let em: EntityManager;
  let ids: Map<string, string>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    em = app.get(EntityManager);
  });

  beforeEach(async () => {
    await cleanAll(em);
    ids = await seedPlayers(em, PLAYERS);
    await resetCaches(app);
    await app.get(TokensService).emitMissing();
  });

  afterAll(async () => {
    await cleanAll(em);
    await app.close();
  });

  const player = (name: string) => ids.get(name)!;

  function get(jwt: string, path: string) {
    return request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${jwt}`);
  }

  async function count(sql: string, params: unknown[] = []): Promise<number> {
    const [row] = await em.fork().execute<{ n: number }[]>(sql, params);
    return Number(row.n);
  }

  async function creditsOf(userId: string): Promise<number> {
    const [row] = await em.fork().execute<{ credits: number }[]>('select "credits" from "user" where "id" = ?', [userId]);
    return Number(row.credits);
  }

  async function eventTypes(tokenId: string): Promise<string[]> {
    const rows = await em
      .fork()
      .execute<{ type: string }[]>('select "type" from "token_event" where "token_id" = ? order by "created_at", "id"', [tokenId]);
    return rows.map((r) => r.type);
  }

  /** Un usuario con `n` cartas de un jugador. */
  async function seller(email: string, playerName = 'Mario Mercado', n = 1) {
    const user = await registerUser(app, email);
    const tokens = await grantTokens(em, user.userId, player(playerName), n);
    return { ...user, tokens };
  }

  async function inventoryToken(jwt: string, tokenId: string): Promise<any> {
    const { body } = await get(jwt, '/inventory?limit=100').expect(200);
    return body.data.flatMap((item: any) => item.tokens).find((t: any) => t.id === tokenId);
  }

  // ---------------------------------------------------------------- US1 — publicar y retirar

  describe('US1 — publicar y retirar (FR-003 a FR-009)', () => {
    it('publica una carta propia al precio de la cotización, sin cambiar su dueño (US1-1, FR-001, FR-005)', async () => {
      const ana = await seller('ana@market.test');
      const [tokenId] = ana.tokens;

      const { body } = await publish(app, ana.token, { tokenId }).expect(201);
      expect(body).toMatchObject({ tokenId, playerId: player('Mario Mercado'), status: 'activa', price: 300, closedAt: null });
      expect(body.serial).toEqual(expect.any(Number));

      const detail = await get(ana.token, `/players/${player('Mario Mercado')}`).expect(200);
      expect(body.price).toBe(detail.body.marketValue);

      const [token] = await em.fork().execute<{ status: string; owner_id: string }[]>(
        'select "status", "owner_id" from "token" where "id" = ?',
        [tokenId],
      );
      expect(token).toEqual({ status: 'de_usuario', owner_id: ana.userId });
      expect((await inventoryToken(ana.token, tokenId)).listingId).toBe(body.id);
      expect(await eventTypes(tokenId)).toEqual(['emision', 'entrega_en_sobre', 'puesta_en_venta']);
    });

    it('una carta sacada de un sobre se puede publicar', async () => {
      await syncStock(app);
      const ana = await registerUser(app, 'sobre@market.test');
      const { body: opening } = await openPack(app, ana.token, { type: 'common' }).expect(201);
      const card = opening.cards[0];

      const { body } = await publish(app, ana.token, { tokenId: card.tokenId }).expect(201);
      expect(body).toMatchObject({ playerId: player('Pedro Paquete'), price: 400 });
    });

    it('un precio o un usuario en el pedido se rechazan con VALIDATION_ERROR (US1-3, US1-12, FR-009)', async () => {
      const ana = await seller('valid@market.test');
      for (const extra of [{ price: 10 }, { userId: ana.userId }]) {
        const res = await publish(app, ana.token, { tokenId: ana.tokens[0], ...extra }).expect(422);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      }
      expect(await count('select count(*)::int as n from "listing"')).toBe(0);
    });

    it('una carta ya publicada no se puede publicar de nuevo (US1-4, FR-004)', async () => {
      const ana = await seller('dos-veces@market.test');
      await publish(app, ana.token, { tokenId: ana.tokens[0] }).expect(201);
      const res = await publish(app, ana.token, { tokenId: ana.tokens[0] }).expect(409);
      expect(res.body.code).toBe('TOKEN_ALREADY_LISTED');
    });

    it('dos publicaciones simultáneas del mismo token: exactamente una se crea (FR-004)', async () => {
      const ana = await seller('simultaneas@market.test');
      const results = await Promise.all([1, 2].map(() => publish(app, ana.token, { tokenId: ana.tokens[0] })));
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await count(`select count(*)::int as n from "listing" where "status" = 'activa'`)).toBe(1);
    });

    it('un token ajeno o inexistente responde 404 TOKEN_NOT_FOUND sin distinguirlos (US1-5)', async () => {
      const ana = await seller('ana-ajeno@market.test');
      const beto = await registerUser(app, 'beto-ajeno@market.test');
      const ajeno = await publish(app, beto.token, { tokenId: ana.tokens[0] }).expect(404);
      const inexistente = await publish(app, beto.token, { tokenId: randomUUID() }).expect(404);
      expect(ajeno.body.code).toBe('TOKEN_NOT_FOUND');
      expect({ ...ajeno.body, correlationId: null }).toEqual({ ...inexistente.body, correlationId: null });
    });

    it('un jugador sin cotización no se puede publicar (PRICE_NOT_AVAILABLE)', async () => {
      const ana = await seller('sin-precio@market.test', 'Sergio SinPrecio');
      const res = await publish(app, ana.token, { tokenId: ana.tokens[0] }).expect(409);
      expect(res.body.code).toBe('PRICE_NOT_AVAILABLE');
    });

    it('retirar deja la carta en el inventario sin la marca (US1-6, FR-006)', async () => {
      const ana = await seller('retira@market.test');
      const { body: listing } = await publish(app, ana.token, { tokenId: ana.tokens[0] }).expect(201);

      const { body } = await withdraw(app, ana.token, listing.id).expect(200);
      expect(body).toMatchObject({ id: listing.id, status: 'retirada', closedAt: expect.any(String) });
      expect((await inventoryToken(ana.token, ana.tokens[0])).listingId).toBeNull();
      expect(await eventTypes(ana.tokens[0])).toEqual(['emision', 'entrega_en_sobre', 'puesta_en_venta', 'retiro_de_venta']);
    });

    it('retirar una publicación cerrada responde LISTING_NOT_ACTIVE (US1-7)', async () => {
      const ana = await seller('cerrada@market.test');
      const { body: listing } = await publish(app, ana.token, { tokenId: ana.tokens[0] }).expect(201);
      await withdraw(app, ana.token, listing.id).expect(200);
      const res = await withdraw(app, ana.token, listing.id).expect(409);
      expect(res.body.code).toBe('LISTING_NOT_ACTIVE');
    });

    it('nadie retira una publicación ajena, de la plataforma o inexistente (US1-8)', async () => {
      const ana = await seller('ana-retiro@market.test');
      const beto = await registerUser(app, 'beto-retiro@market.test');
      const { body: listing } = await publish(app, ana.token, { tokenId: ana.tokens[0] }).expect(201);
      const [platformToken] = await em
        .fork()
        .execute<{ id: string }[]>(`select "id" from "token" where "player_id" = ? and "status" = 'reservado' limit 1`, [
          player('Lucas Lista'),
        ]);
      const platformListing = await insertPlatformListing(em, platformToken.id);

      for (const listingId of [listing.id, platformListing, randomUUID()]) {
        const res = await withdraw(app, beto.token, listingId).expect(404);
        expect(res.body.code).toBe('LISTING_NOT_FOUND');
      }
      expect(await count(`select count(*)::int as n from "listing" where "status" = 'activa'`)).toBe(2);
    });

    it('publicar, retirar y volver a publicar crea una publicación nueva (FR-007)', async () => {
      const ana = await seller('republica@market.test');
      const { body: first } = await publish(app, ana.token, { tokenId: ana.tokens[0] }).expect(201);
      await withdraw(app, ana.token, first.id).expect(200);
      const { body: second } = await publish(app, ana.token, { tokenId: ana.tokens[0] }).expect(201);

      expect(second.id).not.toBe(first.id);
      const rows = await em
        .fork()
        .execute<{ id: string; status: string }[]>('select "id", "status" from "listing" where "token_id" = ?', [ana.tokens[0]]);
      expect(Object.fromEntries(rows.map((r) => [r.id, r.status]))).toEqual({ [first.id]: 'retirada', [second.id]: 'activa' });
    });

    it('sin sesión, publicar y retirar responden 401 UNAUTHENTICATED (US1-11)', async () => {
      const a = await request(app.getHttpServer()).post('/market/listings').send({ tokenId: randomUUID() }).expect(401);
      const b = await request(app.getHttpServer()).post(`/market/listings/${randomUUID()}/withdraw`).expect(401);
      expect([a.body.code, b.body.code]).toEqual(['UNAUTHENTICATED', 'UNAUTHENTICATED']);
    });

    it('el jugador aparece en el Market al publicar y desaparece al retirar, sin esperar la caché', async () => {
      const fork = em.fork();
      fork.persist(
        fork.create(PlayerSeasonStats, {
          player: fork.getReference(Player, player('Mario Mercado')),
          season: SEASON,
          matchesPlayed: 10,
          goals: 1,
          assists: 1,
          shotsPerGame: '1.00',
          keyPasses: '1.00',
          dribbles: '1.00',
          tackles: '1.00',
          rating: '7.00',
          lastRefreshedAt: new Date(),
          createdAt: new Date(),
        }),
      );
      await fork.flush();
      const ana = await seller('market@market.test');
      const names = async () =>
        (await get(ana.token, '/players?limit=100').expect(200)).body.data.map((p: any) => p.name);

      expect(await names()).not.toContain('Mario Mercado');
      const { body: listing } = await publish(app, ana.token, { tokenId: ana.tokens[0] }).expect(201);
      expect(await names()).toContain('Mario Mercado');
      await withdraw(app, ana.token, listing.id).expect(200);
      expect(await names()).not.toContain('Mario Mercado');
    });

    it('una publicación solo admite cerrarse: reabrirla o borrarla falla (FR-030)', async () => {
      const ana = await seller('trigger@market.test');
      const { body: listing } = await publish(app, ana.token, { tokenId: ana.tokens[0] }).expect(201);
      await withdraw(app, ana.token, listing.id).expect(200);

      await expect(
        em.fork().execute(`update "listing" set "status" = 'activa', "closed_at" = null, "closed_correlation_id" = null`),
      ).rejects.toThrow(/solo admite/);
      await expect(em.fork().execute('delete from "listing"')).rejects.toThrow(/no admite DELETE/);
    });
  });

  // ---------------------------------------------------------------- US2 — comprar

  /** Un token de la plataforma puesto a la venta, como lo hará la eliminación de cuentas. */
  async function platformListing(playerName = 'Lucas Lista'): Promise<{ listingId: string; tokenId: string }> {
    const [row] = await em
      .fork()
      .execute<{ id: string }[]>(`select "id" from "token" where "player_id" = ? and "status" = 'reservado' order by "serial" limit 1`, [
        player(playerName),
      ]);
    return { listingId: await insertPlatformListing(em, row.id), tokenId: row.id };
  }

  /** Ana publica `n` cartas de Mario (300 créditos cada una); Beto compra. */
  async function market(prefix: string, n = 1) {
    const ana = await seller(`${prefix}-ana@market.test`, 'Mario Mercado', n);
    const beto = await registerUser(app, `${prefix}-beto@market.test`);
    const listings: string[] = [];
    for (const tokenId of ana.tokens) listings.push((await publish(app, ana.token, { tokenId }).expect(201)).body.id);
    return { ana, beto, listings };
  }

  async function totalCredits(): Promise<number> {
    return count('select coalesce(sum("credits"), 0)::int as n from "user"');
  }

  describe('US2 — comprar (FR-010 a FR-019)', () => {
    it('compra una carta al precio vigente; el vendedor recibe exactamente lo pagado (US2-2, US2-3, FR-018)', async () => {
      const { ana, beto, listings } = await market('compra');
      const before = await totalCredits();

      const { body } = await purchase(app, beto.token, { listingId: listings[0], acceptedPrice: 300 }).expect(201);
      expect(body).toMatchObject({
        listingId: listings[0],
        tokenId: ana.tokens[0],
        playerId: player('Mario Mercado'),
        rarity: 'common',
        price: 300,
        balanceAfter: 1700,
      });

      expect(await creditsOf(beto.userId)).toBe(1700);
      expect(await creditsOf(ana.userId)).toBe(2300);
      expect(await totalCredits()).toBe(before);
      expect(await inventoryToken(beto.token, ana.tokens[0])).toMatchObject({ listingId: null });
      expect(await inventoryToken(ana.token, ana.tokens[0])).toBeUndefined();
      expect(await count(`select count(*)::int as n from "listing" where "id" = ? and "status" = 'vendida'`, [listings[0]])).toBe(1);

      const movements = await em
        .fork()
        .execute<{ user_id: string; type: string; amount: number; reference_id: string }[]>(
          `select "user_id", "type", "amount", "reference_id" from "credit_movement" where "type" in ('compra_token', 'venta_token') order by "type"`,
        );
      expect(movements).toEqual([
        { user_id: beto.userId, type: 'compra_token', amount: -300, reference_id: body.id },
        { user_id: ana.userId, type: 'venta_token', amount: 300, reference_id: body.id },
      ]);
      expect(await eventTypes(ana.tokens[0])).toEqual(['emision', 'entrega_en_sobre', 'puesta_en_venta', 'venta']);
      const [sale] = await em
        .fork()
        .execute<{ from_owner_id: string; to_owner_id: string; quote_price: number }[]>(
          `select "from_owner_id", "to_owner_id", "quote_price" from "token_event" where "token_id" = ? and "type" = 'venta'`,
          [ana.tokens[0]],
        );
      expect(sale).toEqual({ from_owner_id: ana.userId, to_owner_id: beto.userId, quote_price: 300 });
    });

    it('una carta de la plataforma se cobra al precio vigente y sale de circulación (US2-4, FR-019)', async () => {
      const beto = await registerUser(app, 'plataforma@market.test');
      const { listingId, tokenId } = await platformListing();
      const before = await totalCredits();

      await purchase(app, beto.token, { listingId, acceptedPrice: 500 }).expect(201);
      expect(await creditsOf(beto.userId)).toBe(1500);
      expect(await totalCredits()).toBe(before - 500);
      expect(await count(`select count(*)::int as n from "credit_movement" where "type" = 'venta_token'`)).toBe(0);
      const [token] = await em
        .fork()
        .execute<{ status: string; owner_id: string }[]>('select "status", "owner_id" from "token" where "id" = ?', [tokenId]);
      expect(token).toEqual({ status: 'de_usuario', owner_id: beto.userId });
      const [purchaseRow] = await em
        .fork()
        .execute<{ seller_id: string | null; seller_movement_id: string | null }[]>(
          'select "seller_id", "seller_movement_id" from "token_purchase"',
        );
      expect(purchaseRow).toEqual({ seller_id: null, seller_movement_id: null });
    });

    it('rechaza sin efectos: propia, cerrada, inexistente, sin saldo, precio cambiado (US2-5 a US2-9, US2-12)', async () => {
      const { ana, beto, listings } = await market('rechazos', 3);
      await purchase(app, beto.token, { listingId: listings[1], acceptedPrice: 300 }).expect(201);
      await withdraw(app, ana.token, listings[2]).expect(200);
      const users = [ana.userId, beto.userId];

      const cases: { jwt: string; listingId: string; acceptedPrice: number; status: number; code: string; credits?: number }[] = [
        { jwt: ana.token, listingId: listings[0], acceptedPrice: 300, status: 409, code: 'OWN_LISTING' },
        { jwt: beto.token, listingId: listings[1], acceptedPrice: 300, status: 409, code: 'LISTING_NOT_ACTIVE' },
        { jwt: beto.token, listingId: listings[2], acceptedPrice: 300, status: 409, code: 'LISTING_NOT_ACTIVE' },
        { jwt: beto.token, listingId: randomUUID(), acceptedPrice: 300, status: 404, code: 'LISTING_NOT_FOUND' },
        { jwt: beto.token, listingId: listings[0], acceptedPrice: 299, status: 409, code: 'PRICE_CHANGED' },
        { jwt: beto.token, listingId: listings[0], acceptedPrice: 300, status: 409, code: 'INSUFFICIENT_CREDITS', credits: 299 },
      ];
      for (const c of cases) {
        if (c.credits !== undefined) await setCredits(em, beto.userId, c.credits);
        const before = await snapshotMarketState(em, users, listings[0]);
        const res = await purchase(app, c.jwt, { listingId: c.listingId, acceptedPrice: c.acceptedPrice }).expect(c.status);
        expect(res.body.code).toBe(c.code);
        expect(await snapshotMarketState(em, users, listings[0])).toEqual(before);
      }
    });

    it('con exactamente el precio la compra se completa y el saldo queda en 0 (US2-8)', async () => {
      const { beto, listings } = await market('justo');
      await setCredits(em, beto.userId, 300);
      const { body } = await purchase(app, beto.token, { listingId: listings[0], acceptedPrice: 300 }).expect(201);
      expect(body.balanceAfter).toBe(0);
      expect(await creditsOf(beto.userId)).toBe(0);
    });

    it('si el precio bajó, cobra el vigente aunque haya aceptado más (US2-9, FR-013)', async () => {
      const { beto, listings } = await market('bajo');
      const { body } = await purchase(app, beto.token, { listingId: listings[0], acceptedPrice: 1000 }).expect(201);
      expect(body.price).toBe(300);
      expect(await creditsOf(beto.userId)).toBe(1700);
    });

    it('un usuario en el pedido o un precio aceptado inválido responden VALIDATION_ERROR (US2-14)', async () => {
      const { ana, beto, listings } = await market('validacion');
      for (const body of [
        { listingId: listings[0], acceptedPrice: 300, userId: ana.userId },
        { listingId: listings[0] },
        { listingId: listings[0], acceptedPrice: 10.5 },
        { listingId: 'no-es-uuid', acceptedPrice: 300 },
      ]) {
        const res = await purchase(app, beto.token, body).expect(422);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      }
    });

    it('sin sesión responde 401 UNAUTHENTICATED (US2-13)', async () => {
      const res = await request(app.getHttpServer())
        .post('/market/purchases')
        .send({ listingId: randomUUID(), acceptedPrice: 300 })
        .expect(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('el comprador puede volver a publicar de inmediato la carta comprada', async () => {
      const { ana, beto, listings } = await market('reventa');
      await purchase(app, beto.token, { listingId: listings[0], acceptedPrice: 300 }).expect(201);
      const { body } = await publish(app, beto.token, { tokenId: ana.tokens[0] }).expect(201);
      expect(body).toMatchObject({ status: 'activa', price: 300 });
    });
  });

  describe('US2 — concurrencia, atomicidad e invariantes (FR-014, FR-015, FR-021, FR-022)', () => {
    it('dos compradores simultáneos: uno la recibe y al otro no se le cobra (US2-10, SC-003)', async () => {
      const { listings } = await market('carrera');
      const carla = await registerUser(app, 'carrera-carla@market.test');
      const dani = await registerUser(app, 'carrera-dani@market.test');

      const results = await Promise.all(
        [carla, dani].map((u) => purchase(app, u.token, { listingId: listings[0], acceptedPrice: 300 })),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      const loser = results[0].status === 409 ? carla : dani;
      expect(results.find((r) => r.status === 409)!.body.code).toBe('LISTING_NOT_ACTIVE');
      expect(await creditsOf(loser.userId)).toBe(2000);
      expect(await count('select count(*)::int as n from "token_purchase"')).toBe(1);
    });

    it('compra y retiro simultáneos: se completa exactamente una operación (US1-10)', async () => {
      const { ana, beto, listings } = await market('compra-retiro');
      const [bought, withdrawn] = await Promise.all([
        purchase(app, beto.token, { listingId: listings[0], acceptedPrice: 300 }),
        withdraw(app, ana.token, listings[0]),
      ]);
      const successes = [bought.status === 201, withdrawn.status === 200].filter(Boolean);
      expect(successes).toHaveLength(1);
      expect(await creditsOf(beto.userId)).toBe(bought.status === 201 ? 1700 : 2000);
    });

    it('con saldo para una sola carta, de dos compras simultáneas se completa una (US2-11, SC-004)', async () => {
      const { beto, listings } = await market('saldo', 2);
      await setCredits(em, beto.userId, 300);
      const results = await Promise.all(listings.map((listingId) => purchase(app, beto.token, { listingId, acceptedPrice: 300 })));
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(results.find((r) => r.status === 409)!.body.code).toBe('INSUFFICIENT_CREDITS');
      expect(await creditsOf(beto.userId)).toBe(0);
    });

    it('A le compra a B mientras B le compra a A: las dos se completan sin interbloqueo (research #5)', async () => {
      const ana = await seller('cruce-ana@market.test');
      const beto = await seller('cruce-beto@market.test', 'Lucas Lista');
      const { body: deAna } = await publish(app, ana.token, { tokenId: ana.tokens[0] }).expect(201);
      const { body: deBeto } = await publish(app, beto.token, { tokenId: beto.tokens[0] }).expect(201);

      const results = await Promise.all([
        purchase(app, beto.token, { listingId: deAna.id, acceptedPrice: 300 }),
        purchase(app, ana.token, { listingId: deBeto.id, acceptedPrice: 500 }),
      ]);
      expect(results.map((r) => r.status)).toEqual([201, 201]);
      expect(await creditsOf(ana.userId)).toBe(2000 + 300 - 500);
      expect(await creditsOf(beto.userId)).toBe(2000 - 300 + 500);
    });

    it('la suma de saldos es lo emitido menos lo cobrado por la plataforma (SC-007) y cada jugador suma 100 tokens (SC-008)', async () => {
      const { beto, listings } = await market('invariantes', 2);
      await purchase(app, beto.token, { listingId: listings[0], acceptedPrice: 300 }).expect(201);
      const { listingId } = await platformListing();
      await purchase(app, beto.token, { listingId, acceptedPrice: 500 }).expect(201);

      const emitted = await count(`select coalesce(sum("amount"), 0)::int as n from "credit_movement" where "type" = 'entrega_inicial'`);
      const packs = await count(`select coalesce(-sum("amount"), 0)::int as n from "credit_movement" where "type" = 'compra_sobre'`);
      const platformSales = await count(`select coalesce(sum("price"), 0)::int as n from "token_purchase" where "seller_id" is null`);
      expect(await totalCredits()).toBe(emitted - packs - platformSales);
      expect(
        await count(`select count(*)::int as n from (select "player_id" from "token" group by 1 having count(*) <> 100) d`),
      ).toBe(0);
    });

    it('una compra registrada no se puede modificar ni borrar (FR-030)', async () => {
      const { beto, listings } = await market('inmutable');
      await purchase(app, beto.token, { listingId: listings[0], acceptedPrice: 300 }).expect(201);
      await expect(em.fork().execute('update "token_purchase" set "price" = 1')).rejects.toThrow(/inmutable/);
      await expect(em.fork().execute('delete from "token_purchase"')).rejects.toThrow(/inmutable/);
    });
  });

  describe('US3 — el precio sigue a la cotización (FR-001, FR-002)', () => {
    it('al cambiar la cotización cambia el precio de las cartas a la venta, sin tocar la publicación', async () => {
      const { beto, listings } = await market('cotizacion');
      // Lo mismo que hace una corrida de cotización al cerrar: espejar el precio en base_value (07).
      await em.fork().execute(`update "player" set "base_value" = 450 where "id" = ?`, [player('Mario Mercado')]);

      const { body } = await listingsOf(app, beto.token, player('Mario Mercado')).expect(200);
      expect(body.price).toBe(450);

      const res = await purchase(app, beto.token, { listingId: listings[0], acceptedPrice: 300 }).expect(409);
      expect(res.body.code).toBe('PRICE_CHANGED');
      const { body: bought } = await purchase(app, beto.token, { listingId: listings[0], acceptedPrice: 450 }).expect(201);
      expect(bought.price).toBe(450);
    });
  });

  describe('US2 — cartas a la venta de un jugador (FR-027)', () => {
    it('lista de la más antigua a la más nueva, al precio vigente, sin identificar al vendedor', async () => {
      const { ana, beto, listings } = await market('detalle', 2);

      const { body } = await listingsOf(app, beto.token, player('Mario Mercado')).expect(200);
      expect(body).toMatchObject({ playerId: player('Mario Mercado'), price: 300, meta: { total: 2, page: 1 } });
      expect(body.data.map((l: any) => l.listingId)).toEqual(listings);
      expect(body.data.every((l: any) => l.mine === false)).toBe(true);
      expect(JSON.stringify(body)).not.toContain(ana.userId);

      const propias = (await listingsOf(app, ana.token, player('Mario Mercado')).expect(200)).body;
      expect(propias.data.every((l: any) => l.mine === true)).toBe(true);

      const second = (await listingsOf(app, beto.token, player('Mario Mercado'), '?page=2&limit=1').expect(200)).body;
      expect(second.data.map((l: any) => l.listingId)).toEqual([listings[1]]);
      expect(second.meta).toMatchObject({ total: 2, page: 2, limit: 1, totalPages: 2 });
    });

    it('sin publicaciones devuelve una lista vacía; un jugador inexistente responde PLAYER_NOT_FOUND', async () => {
      const beto = await registerUser(app, 'vacio@market.test');
      const { body } = await listingsOf(app, beto.token, player('Lucas Lista')).expect(200);
      expect(body).toMatchObject({ price: 500, data: [], meta: { total: 0 } });

      const res = await listingsOf(app, beto.token, randomUUID()).expect(404);
      expect(res.body.code).toBe('PLAYER_NOT_FOUND');
    });

    it('las consultas no tienen el límite de frecuencia de los POST (research #11)', async () => {
      const beto = await registerUser(app, 'consultas@market.test');
      for (let i = 0; i < 8; i++) await listingsOf(app, beto.token, player('Mario Mercado')).expect(200);
    });
  });

  // ---------------------------------------------------------------- US4 — historial de operaciones

  describe('US4 — mis compras y ventas (FR-028 a FR-031)', () => {
    it('cada uno ve su lado, de la más reciente a la más antigua, sin identificar a la contraparte (US4-1 a US4-4)', async () => {
      const { ana, beto, listings } = await market('historial');
      await purchase(app, beto.token, { listingId: listings[0], acceptedPrice: 300 }).expect(201);
      const { listingId } = await platformListing();
      await purchase(app, beto.token, { listingId, acceptedPrice: 500 }).expect(201);

      const deBeto = (await operations(app, beto.token).expect(200)).body;
      expect(deBeto.meta).toMatchObject({ total: 2, page: 1 });
      expect(deBeto.data.map((o: any) => [o.kind, o.price, o.balanceBefore, o.balanceAfter, o.counterparty])).toEqual([
        ['compra', 500, 1700, 1200, 'plataforma'],
        ['compra', 300, 2000, 1700, 'otro_usuario'],
      ]);
      for (const op of deBeto.data) expect(op.balanceBefore - op.price).toBe(op.balanceAfter);

      const deAna = (await operations(app, ana.token).expect(200)).body;
      expect(deAna.data).toHaveLength(1);
      expect(deAna.data[0]).toMatchObject({
        kind: 'venta',
        tokenId: ana.tokens[0],
        price: 300,
        balanceBefore: 2000,
        balanceAfter: 2300,
        counterparty: 'otro_usuario',
      });
      expect(JSON.stringify(deAna)).not.toContain(beto.userId);
      expect(JSON.stringify(deBeto)).not.toContain(ana.userId);
    });

    it('pagina y cada usuario ve solo sus operaciones (US4-7)', async () => {
      const { beto, listings } = await market('paginado', 2);
      for (const listingId of listings) await purchase(app, beto.token, { listingId, acceptedPrice: 300 }).expect(201);
      const carla = await registerUser(app, 'paginado-carla@market.test');

      const second = (await operations(app, beto.token, '?page=2&limit=1').expect(200)).body;
      expect(second.data).toHaveLength(1);
      expect(second.meta).toMatchObject({ total: 2, page: 2, limit: 1, totalPages: 2 });
      expect((await operations(app, carla.token).expect(200)).body).toMatchObject({ data: [], meta: { total: 0 } });
    });

    it('sumando en orden los movimientos de un usuario se reconstruye su saldo (US4-8, SC-009)', async () => {
      const { ana, beto, listings } = await market('reconstruir', 2);
      await purchase(app, beto.token, { listingId: listings[0], acceptedPrice: 300 }).expect(201);
      await purchase(app, beto.token, { listingId: listings[1], acceptedPrice: 300 }).expect(201);

      for (const user of [ana, beto]) {
        const movements = await em
          .fork()
          .execute<{ amount: number; balance_before: number; balance_after: number }[]>(
            `select "amount", "balance_before", "balance_after" from "credit_movement" where "user_id" = ? order by "created_at", "id"`,
            [user.userId],
          );
        let balance = 0;
        for (const m of movements) {
          expect(Number(m.balance_before)).toBe(balance);
          balance += Number(m.amount);
          expect(Number(m.balance_after)).toBe(balance);
        }
        expect(balance).toBe(await creditsOf(user.userId));
      }
    });

    it('sin sesión responde 401 y una paginación inválida 422', async () => {
      const a = await request(app.getHttpServer()).get('/market/operations').expect(401);
      expect(a.body.code).toBe('UNAUTHENTICATED');
      const beto = await registerUser(app, 'operaciones-422@market.test');
      const b = await operations(app, beto.token, '?page=0').expect(422);
      expect(b.body.code).toBe('VALIDATION_ERROR');
    });
  });

  // ---------------------------------------------------------------- rendimiento (SC-001)

  it('el 95 % de 50 compras secuenciales termina en menos de 2 s (SC-001)', async () => {
    const beto = await registerUser(app, 'rendimiento@market.test');
    const rows = await em
      .fork()
      .execute<{ id: string }[]>(`select "id" from "token" where "player_id" = ? and "status" = 'reservado' order by "serial" limit 50`, [
        player('Lucas Lista'),
      ]);
    const listingIds: string[] = [];
    for (const row of rows) listingIds.push(await insertPlatformListing(em, row.id));
    await setCredits(em, beto.userId, 50 * 500);

    const durations: number[] = [];
    for (const listingId of listingIds) {
      const start = performance.now();
      await purchase(app, beto.token, { listingId, acceptedPrice: 500 }).expect(201);
      durations.push(performance.now() - start);
    }
    durations.sort((a, b) => a - b);
    expect(durations[Math.ceil(durations.length * 0.95) - 1]).toBeLessThan(2000);
    expect(await creditsOf(beto.userId)).toBe(0);
  });
});
