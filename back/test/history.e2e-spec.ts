import { jest } from '@jest/globals';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import request from 'supertest';
import { AppModule } from '../src/app.module';
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
  operationsHistory,
  publish,
  purchase,
  withdraw,
} from './support/market-fixtures';
import { seedQuote } from './support/quote-fixtures';

jest.setTimeout(180_000);

/**
 * Jugadores sin reputación: quedan `reservado`, fuera de los sobres (08 FR-011), y `grantTokens`
 * puede dárselos a un usuario de forma determinista. «Pedro Paquete» es el único elegible para
 * los sobres, así cualquier sobre abierto trae cartas suyas.
 */
const PLAYERS: PlayerFixture[] = [
  { name: 'Mario Mercado', reputation: null, price: 300 },
  { name: 'Pedro Paquete', reputation: 75, price: 400 },
];

const INITIAL_CREDITS = 2000;

/** 10-historial-operaciones — historial de cartas adquiridas y vendidas (US1 y US4). */
describe('History (e2e)', () => {
  let app: INestApplication;
  let em: EntityManager;
  let ids: Map<string, string>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    // Mismo pipe que main.ts: sin esto, los 400 de validación no se reproducen acá.
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

  async function count(sql: string, params: unknown[] = []): Promise<number> {
    const [row] = await em.fork().execute<{ n: number }[]>(sql, params);
    return Number(row.n);
  }

  /** Un usuario con `n` cartas de Mario Mercado, que ya las puso a la venta. */
  async function seller(email: string, n = 1) {
    const user = await registerUser(app, email);
    const tokens = await grantTokens(em, user.userId, player('Mario Mercado'), n);
    const listings: string[] = [];
    for (const tokenId of tokens) listings.push((await publish(app, user.token, { tokenId }).expect(201)).body.id);
    return { ...user, tokens, listings };
  }

  async function history(jwt: string, query = ''): Promise<any> {
    return (await operationsHistory(app, jwt, query).expect(200)).body;
  }

  async function buy(buyerJwt: string, listingId: string, acceptedPrice: number) {
    return (await purchase(app, buyerJwt, { listingId, acceptedPrice }).expect(201)).body;
  }

  // ------------------------------------------------------------ US1 — el historial

  describe('US1 — cartas adquiridas y vendidas', () => {
    it('una carta de sobre es una entrada «Primer propietario»: sin precio, saldos ni cotización (US1-2, FR-005)', async () => {
      await syncStock(app);
      const beto = await registerUser(app, 'sobre@history.test');
      const { body: opening } = await openPack(app, beto.token, { type: 'common' }).expect(201);

      const body = await history(beto.token);

      expect(body.meta.total).toBe(opening.cards.length);
      expect(body.data).toHaveLength(opening.cards.length);
      expect(new Set(body.data.map((e: any) => e.tokenId))).toEqual(new Set(opening.cards.map((c: any) => c.tokenId)));
      expect(new Set(body.data.map((e: any) => e.at)).size).toBe(1);
      for (const entry of body.data) {
        expect(entry).toMatchObject({
          kind: 'sobre',
          packType: 'common',
          price: null,
          balanceBefore: null,
          balanceAfter: null,
          counterparty: null,
          quote: null,
        });
        expect(entry.player).toMatchObject({ id: player('Pedro Paquete'), name: 'Pedro Paquete' });
        const card = opening.cards.find((c: any) => c.tokenId === entry.tokenId);
        expect(entry).toMatchObject({ serial: card.serial, rarity: card.rarity });
      }
    });

    it('una compra y una venta informan precio, saldos y contraparte sin identificarla (US1-3, US1-4, US1-7, FR-006, FR-007)', async () => {
      const ana = await seller('ana-cv@history.test');
      const beto = await registerUser(app, 'beto-cv@history.test');
      const sale = await buy(beto.token, ana.listings[0], 300);

      const bought = (await history(beto.token)).data;
      expect(bought).toHaveLength(1);
      expect(bought[0]).toMatchObject({
        id: `compra:${sale.id}`,
        kind: 'compra',
        tokenId: ana.tokens[0],
        price: 300,
        balanceBefore: INITIAL_CREDITS,
        balanceAfter: INITIAL_CREDITS - 300,
        counterparty: 'otro_usuario',
        packType: null,
      });
      expect(bought[0].balanceBefore - bought[0].price).toBe(bought[0].balanceAfter);

      const sold = (await history(ana.token)).data;
      expect(sold).toHaveLength(1);
      expect(sold[0]).toMatchObject({
        id: `venta:${sale.id}`,
        kind: 'venta',
        tokenId: ana.tokens[0],
        price: 300,
        balanceBefore: INITIAL_CREDITS,
        balanceAfter: INITIAL_CREDITS + 300,
        counterparty: 'otro_usuario',
      });
      expect(sold[0].balanceBefore + sold[0].price).toBe(sold[0].balanceAfter);

      // Ninguna entrada identifica a la otra parte (FR-007).
      const serialized = JSON.stringify([bought, sold]);
      for (const user of [ana, beto]) expect(serialized).not.toContain(user.userId);
    });

    it('la compra a la plataforma muestra «plataforma» como contraparte', async () => {
      const [reserved] = await em
        .fork()
        .execute<{ id: string }[]>(
          `select "id" from "token" where "player_id" = ? and "status" = 'reservado' order by "serial" limit 1`,
          [player('Mario Mercado')],
        );
      const listingId = await insertPlatformListing(em, reserved.id);
      const beto = await registerUser(app, 'beto-plat@history.test');
      await buy(beto.token, listingId, 300);

      const { data } = await history(beto.token);
      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({ kind: 'compra', counterparty: 'plataforma', price: 300 });
    });

    it('ordena de la más reciente a la más antigua, filtra y pagina sin repetir ni saltear (US1-5, US1-6, US1-9, FR-008, FR-009)', async () => {
      await syncStock(app);
      const ana = await seller('ana-orden@history.test');
      const carol = await registerUser(app, 'carol-orden@history.test');
      const beto = await registerUser(app, 'beto-orden@history.test');
      await setCredits(em, beto.userId, 100_000);
      const { body: opening } = await openPack(app, beto.token, { type: 'common' }).expect(201);
      const cards: number = opening.cards.length;

      // Beto vende una de las cartas del sobre y compra otra a Ana.
      const soldToken: string = opening.cards[0].tokenId;
      const { body: listing } = await publish(app, beto.token, { tokenId: soldToken }).expect(201);
      await buy(carol.token, listing.id, 400);
      await buy(beto.token, ana.listings[0], 300);

      const all = await history(beto.token, '?limit=100');
      expect(all.meta.total).toBe(cards + 2);
      expect(all.data).toHaveLength(cards + 2);

      // La más reciente primero: la compra, la venta y después las cartas del sobre.
      expect(all.data.map((e: any) => e.kind).slice(0, 2)).toEqual(['compra', 'venta']);
      const times = all.data.map((e: any) => new Date(e.at).getTime());
      expect([...times].sort((a, b) => b - a)).toEqual(times);

      // Una carta vendida sigue en su entrada original de sobre (US1-4 de «carta que ya no tengo»).
      const fromPack = all.data.filter((e: any) => e.kind === 'sobre');
      expect(fromPack).toHaveLength(cards);
      expect(fromPack.map((e: any) => e.tokenId)).toContain(soldToken);

      // Filtros y totales.
      const acquired = await history(beto.token, '?type=acquired&limit=100');
      const sold = await history(beto.token, '?type=sold&limit=100');
      expect(acquired.meta.total).toBe(cards + 1);
      expect(sold.meta.total).toBe(1);
      expect(acquired.meta.total + sold.meta.total).toBe(all.meta.total);
      expect(acquired.data.every((e: any) => e.kind === 'sobre' || e.kind === 'compra')).toBe(true);
      expect(sold.data.map((e: any) => e.kind)).toEqual(['venta']);
      expect(sold.data[0].tokenId).toBe(soldToken);

      // Paginación de a 2: cada entrada exactamente una vez y en el mismo orden.
      const paged: string[] = [];
      const pages = Math.ceil(all.meta.total / 2);
      for (let page = 1; page <= pages; page++) {
        const body = await history(beto.token, `?limit=2&page=${page}`);
        expect(body.meta).toMatchObject({ total: all.meta.total, page, limit: 2, totalPages: pages });
        paged.push(...body.data.map((e: any) => e.id));
      }
      expect(paged).toEqual(all.data.map((e: any) => e.id));
      expect(new Set(paged).size).toBe(paged.length);
    });

    it('comprar, vender y volver a comprar la misma carta da tres entradas separadas (US1-11)', async () => {
      const ana = await seller('ana-reventa@history.test');
      const beto = await registerUser(app, 'beto-reventa@history.test');
      const carol = await registerUser(app, 'carol-reventa@history.test');
      const token = ana.tokens[0];

      await buy(beto.token, ana.listings[0], 300);
      const second = (await publish(app, beto.token, { tokenId: token }).expect(201)).body.id;
      await buy(carol.token, second, 300);
      const third = (await publish(app, carol.token, { tokenId: token }).expect(201)).body.id;
      await buy(beto.token, third, 300);

      const { data } = await history(beto.token);
      expect(data.map((e: any) => e.kind)).toEqual(['compra', 'venta', 'compra']);
      expect(new Set(data.map((e: any) => e.tokenId))).toEqual(new Set([token]));
      expect(new Set(data.map((e: any) => e.id)).size).toBe(3);
    });

    it('lo que cambia después no toca lo registrado: precio, saldos y rareza quedan como en la operación (SC-002, FR-011)', async () => {
      await seedQuote(em, player('Mario Mercado'), { price: 300, strategyKey: 'e2e-a', version: 1 });
      const ana = await seller('ana-valores@history.test');
      const beto = await registerUser(app, 'beto-valores@history.test');
      await buy(beto.token, ana.listings[0], 300);
      const before = (await history(beto.token)).data[0];

      // El jugador se encarece y se activa otra estrategia.
      await seedQuote(em, player('Mario Mercado'), { price: 999, strategyKey: 'e2e-b', version: 1 });

      const after = (await history(beto.token)).data[0];
      // La tarjeta del jugador es la de hoy; lo registrado en la operación no cambia.
      expect({ ...after, player: undefined }).toEqual({ ...before, player: undefined });
      expect(after).toMatchObject({ price: 300, balanceAfter: INITIAL_CREDITS - 300, rarity: 'common' });
    });

    it('no aparecen las compras rechazadas, las publicaciones ni los retiros (US1-10, FR-010)', async () => {
      const ana = await seller('ana-rechazo@history.test');
      const beto = await registerUser(app, 'beto-rechazo@history.test');
      await setCredits(em, beto.userId, 100);

      const res = await purchase(app, beto.token, { listingId: ana.listings[0], acceptedPrice: 300 }).expect(409);
      expect(res.body.code).toBe('INSUFFICIENT_CREDITS');
      await withdraw(app, ana.token, ana.listings[0]).expect(200);
      await publish(app, ana.token, { tokenId: ana.tokens[0] }).expect(201);

      expect((await history(beto.token)).data).toEqual([]);
      expect((await history(ana.token)).data).toEqual([]);
    });

    it('un usuario sin operaciones recibe una página vacía (US1-8)', async () => {
      const nuevo = await registerUser(app, 'vacio@history.test');
      const body = await history(nuevo.token);
      expect(body.data).toEqual([]);
      expect(body.meta).toMatchObject({ total: 0, page: 1, totalPages: 0 });
    });

    it('cada usuario ve solo lo suyo y no hay forma de pedir el historial de otro (US1-12, FR-012)', async () => {
      const ana = await seller('ana-aislada@history.test');
      const beto = await registerUser(app, 'beto-aislado@history.test');
      const carol = await registerUser(app, 'carol-aislada@history.test');
      await buy(beto.token, ana.listings[0], 300);

      expect((await history(carol.token)).data).toEqual([]);
      expect((await history(ana.token)).data.map((e: any) => e.kind)).toEqual(['venta']);
      expect((await history(beto.token)).data.map((e: any) => e.kind)).toEqual(['compra']);

      const res = await operationsHistory(app, carol.token, `?userId=${beto.userId}`).expect(422);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rechaza sin sesión y con entradas inválidas, con el formato estándar de error (FR-035, FR-036)', async () => {
      const unauthenticated = await request(app.getHttpServer()).get('/history/operations').expect(401);
      expect(unauthenticated.body).toMatchObject({ code: 'UNAUTHENTICATED', correlationId: expect.any(String) });

      const user = await registerUser(app, 'invalido@history.test');
      for (const query of ['?type=todo', '?page=0', '?limit=0', '?limit=500', '?page=uno']) {
        const res = await operationsHistory(app, user.token, query).expect(422);
        expect(res.body).toMatchObject({
          code: 'VALIDATION_ERROR',
          message: expect.any(String),
          correlationId: expect.any(String),
        });
      }
    });

    it('es de solo lectura: consultar no cambia ninguna tabla (FR-037)', async () => {
      await syncStock(app);
      const ana = await seller('ana-lectura@history.test');
      const beto = await registerUser(app, 'beto-lectura@history.test');
      await openPack(app, beto.token, { type: 'common' }).expect(201);
      await buy(beto.token, ana.listings[0], 300);

      const tables = ['pack_opening', 'pack_opening_card', 'token_purchase', 'credit_movement', 'token_event', 'player_quote', 'listing'];
      const snapshot = async () => {
        const counts: Record<string, number> = {};
        for (const table of tables) counts[table] = await count(`select count(*)::int as n from "${table}"`);
        return counts;
      };
      const before = await snapshot();

      for (const query of ['', '?type=acquired', '?type=sold', '?limit=2&page=2']) {
        await history(beto.token, query);
        await history(ana.token, query);
      }

      expect(await snapshot()).toEqual(before);
    });
  });

  // ------------------------------------------------ US4 — cotización y estrategia de cada operación

  describe('US4 — con qué cotización y estrategia se compró o vendió', () => {
    it('cada compra y venta cita la estrategia y versión de la cotización que fijó su precio (US4-1, FR-015)', async () => {
      const quoteA = await seedQuote(em, player('Mario Mercado'), {
        price: 300,
        calculatedAt: new Date(Date.now() - 120_000),
        strategyKey: 'e2e-a',
        strategyName: 'E2E Alfa',
        version: 1,
      });
      const ana = await seller('ana-estrategia@history.test', 2);
      const beto = await registerUser(app, 'beto-estrategia@history.test');
      await buy(beto.token, ana.listings[0], 300);

      const quoteB = await seedQuote(em, player('Mario Mercado'), {
        price: 450,
        calculatedAt: new Date(), // después de la primera compra: la cotización nueva rige desde ahora
        strategyKey: 'e2e-b',
        strategyName: 'E2E Beta',
        version: 2,
      });
      await buy(beto.token, ana.listings[1], 450);

      const { data } = await history(beto.token);
      expect(data.map((e: any) => [e.kind, e.price, e.quote.id])).toEqual([
        ['compra', 450, quoteB.id],
        ['compra', 300, quoteA.id],
      ]);
      expect(data[0].quote.strategy).toEqual({ key: 'e2e-b', name: 'E2E Beta', version: 2 });
      expect(data[1].quote.strategy).toEqual({ key: 'e2e-a', name: 'E2E Alfa', version: 1 });

      // La búsqueda por instante coincide con el vínculo guardado: en el instante de cada compra, la
      // cotización vigente es la que la compra cita (invariante 5 de data-model.md).
      for (const entry of data) {
        const res = await request(app.getHttpServer())
          .get(`/quotes/players/${entry.player.id}/at?at=${encodeURIComponent(entry.at)}`)
          .set('Authorization', `Bearer ${beto.token}`)
          .expect(200);
        expect(res.body.quote).toMatchObject({
          price: entry.price,
          calculatedAt: entry.quote.calculatedAt,
          strategy: entry.quote.strategy,
        });
      }

      // La venta de Ana cita la misma cotización que la compra de Beto.
      const sold = (await history(ana.token)).data;
      expect(sold.map((e: any) => e.quote.id)).toEqual([quoteB.id, quoteA.id]);
    });

    it('el precio de la operación es el de la cotización citada, y no cambia al activar otra estrategia (SC-002, SC-007)', async () => {
      await seedQuote(em, player('Mario Mercado'), { price: 300, strategyKey: 'e2e-a', strategyName: 'E2E Alfa', version: 1 });
      const ana = await seller('ana-estable@history.test');
      const beto = await registerUser(app, 'beto-estable@history.test');
      await buy(beto.token, ana.listings[0], 300);
      const before = (await history(beto.token)).data[0];

      // Una cotización posterior, de otra versión y otra estrategia.
      await seedQuote(em, player('Mario Mercado'), { price: 800, strategyKey: 'e2e-a', strategyName: 'E2E Alfa', version: 2 });
      await seedQuote(em, player('Mario Mercado'), { price: 900, strategyKey: 'e2e-b', strategyName: 'E2E Beta', version: 1 });

      const after = (await history(beto.token)).data[0];
      expect(after.quote).toEqual(before.quote);
      expect(after.quote.strategy).toEqual({ key: 'e2e-a', name: 'E2E Alfa', version: 1 });

      const [row] = await em
        .fork()
        .execute<{ price: number }[]>(`select "price" from "player_quote" where "id" = ?`, [after.quote.id]);
      expect(Number(row.price)).toBe(after.price);
    });

    it('la regla de relleno de la migración elige la misma cotización que guarda purchase() (research #1)', async () => {
      await seedQuote(em, player('Mario Mercado'), { price: 300, calculatedAt: new Date(Date.now() - 120_000), strategyKey: 'e2e-a', version: 1 });
      await seedQuote(em, player('Mario Mercado'), { price: 300, calculatedAt: new Date(Date.now() - 60_000), strategyKey: 'e2e-b', version: 1 });
      const ana = await seller('ana-relleno@history.test');
      const beto = await registerUser(app, 'beto-relleno@history.test');
      await buy(beto.token, ana.listings[0], 300);

      // Es el `update` de Migration20261026120000, como `select`.
      const rows = await em.fork().execute<{ quote_id: string; backfilled: string }[]>(
        `select tp."quote_id",
                (select q."id" from "player_quote" q
                  where q."player_id" = tp."player_id" and q."calculated_at" <= tp."created_at"
                  order by (q."price" = tp."price") desc, q."calculated_at" desc limit 1) as "backfilled"
           from "token_purchase" tp`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].quote_id).not.toBeNull();
      expect(rows[0].backfilled).toBe(rows[0].quote_id);
    });

    it('una compra sin cotización registrada devuelve quote nulo y conserva el precio (US4-5, FR-016)', async () => {
      const ana = await seller('ana-sin-cotizacion@history.test');
      const beto = await registerUser(app, 'beto-sin-cotizacion@history.test');
      await buy(beto.token, ana.listings[0], 300);

      const [entry] = (await history(beto.token)).data;
      expect(entry).toMatchObject({ kind: 'compra', price: 300, quote: null });
    });
  });
});
