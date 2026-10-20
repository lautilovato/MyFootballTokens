import { jest } from '@jest/globals';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { User } from '../src/infrastructure/database/entities/user.entity';
import { rarityOfReputation } from '../src/modules/packs/packs.service';
import {
  DEFAULT_PLAYERS,
  cleanAll,
  openPack,
  registerUser,
  resetCaches,
  seedPlayers,
  setCredits,
  syncStock,
} from './support/packs-fixtures';

jest.setTimeout(120_000);

const INITIAL_CREDITS = 2000;
const PRICES = { common: 100, rare: 200, epic: 400, legendary: 800 } as const;
const CARDS = { common: 3, rare: 4, epic: 5, legendary: 6 } as const;
const ELIGIBLE = DEFAULT_PLAYERS.filter((p) => p.reputation !== null && p.price > 0);

/** 08-sobres US2 y US7 — stock, catálogo, apertura e historial de aperturas. */
describe('Packs (e2e)', () => {
  let app: INestApplication;
  let em: EntityManager;
  let playerIds: Map<string, string>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    em = app.get(EntityManager);
  });

  beforeEach(async () => {
    await cleanAll(em);
    playerIds = await seedPlayers(em);
    await resetCaches(app);
  });

  afterAll(async () => {
    await cleanAll(em);
    await app.close();
  });

  function catalog(token: string) {
    return request(app.getHttpServer()).get('/packs/types').set('Authorization', `Bearer ${token}`);
  }

  async function count(sql: string, params: unknown[] = []): Promise<number> {
    const [row] = await em.execute<{ n: number }[]>(sql, params);
    return Number(row.n);
  }

  async function creditsOf(userId: string): Promise<number> {
    return (await em.fork().findOneOrFail(User, { id: userId })).credits;
  }

  /** Snapshot de todo lo que una apertura fallida no debería tocar (SC-002). */
  async function snapshot(userId: string) {
    return {
      credits: await creditsOf(userId),
      openings: await count('select count(*)::int as n from "pack_opening"'),
      owned: await count(`select count(*)::int as n from "token" where "status" = 'de_usuario'`),
      unopened: await count(`select count(*)::int as n from "pack" where "status" = 'sin_abrir'`),
      movements: await count('select count(*)::int as n from "credit_movement"'),
    };
  }

  // ------------------------------------------------------------------------------- stock

  describe('sincronización del stock (FR-011, FR-012, FR-029)', () => {
    it('emite 100 tokens por jugador y arma un lote solo con los elegibles; repetirla no cambia nada', async () => {
      const first = await syncStock(app);
      expect(first.body.emittedTokens).toBe(DEFAULT_PLAYERS.length * 100);
      expect(first.body.batch).toMatchObject({ number: expect.any(Number), tokenCount: ELIGIBLE.length * 100 });

      const second = await syncStock(app);
      expect(second.body).toEqual({ emittedTokens: 0, batch: null });

      // Partición exacta (SC-005): cada token del lote en un sobre y cada sobre completo.
      expect(await count(`select coalesce(sum("card_count"), 0)::int as n from "pack"`)).toBe(ELIGIBLE.length * 100);
      expect(
        await count(
          `select count(*)::int as n from "pack" pk
            where pk."card_count" <> (select count(*) from "token" t where t."pack_id" = pk."id")`,
        ),
      ).toBe(0);
    });

    it('los jugadores sin cotización o sin reputación quedan reservados (FR-011, SC-009)', async () => {
      await syncStock(app);
      for (const name of ['Nico SinCotizar', 'Pedro SinReputacion']) {
        expect(
          await count(`select count(*)::int as n from "token" where "player_id" = ? and "status" <> 'reservado'`, [
            playerIds.get(name),
          ]),
        ).toBe(0);
      }
    });

    it('sin la clave administrativa responde 401 UNAUTHENTICATED', async () => {
      const res = await request(app.getHttpServer()).post('/packs/stock/sync').expect(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('no expone el contenido de los sobres sin abrir (FR-015)', async () => {
      const sync = await syncStock(app);
      const { token } = await registerUser(app, 'mira@packs.test');
      const types = await catalog(token).expect(200);
      const body = JSON.stringify([sync.body, types.body]);
      for (const id of playerIds.values()) expect(body).not.toContain(id);
      expect(body).not.toMatch(/tokenId|playerId/);
    });
  });

  // ------------------------------------------------------------------------------- catálogo

  describe('US2-1 — catálogo con probabilidades en vivo (FR-010, SC-007)', () => {
    it('sin stock informa stockGenerated: false y abrir responde PACKS_NOT_AVAILABLE (US2-7)', async () => {
      const { token, userId } = await registerUser(app, 'temprano@packs.test');
      const types = await catalog(token).expect(200);
      expect(types.body.stockGenerated).toBe(false);
      expect(types.body.types.every((t: any) => t.remaining === 0 && t.probabilities === null)).toBe(true);

      const before = await snapshot(userId);
      const res = await openPack(app, token, { type: 'common' }).expect(409);
      expect(res.body.code).toBe('PACKS_NOT_AVAILABLE');
      expect(await snapshot(userId)).toEqual(before);
    });

    it('devuelve los cuatro tipos con precio, cartas, restantes y probabilidades que suman 1', async () => {
      await syncStock(app);
      const { token } = await registerUser(app, 'catalogo@packs.test');
      const { body } = await catalog(token).expect(200);

      expect(body.stockGenerated).toBe(true);
      expect(body.types.map((t: any) => t.type)).toEqual(['common', 'rare', 'epic', 'legendary']);
      let cards = 0;
      for (const t of body.types) {
        expect(t.price).toBe(PRICES[t.type as keyof typeof PRICES]);
        expect(t.cards).toBe(CARDS[t.type as keyof typeof CARDS]);
        const p = t.probabilities;
        expect(p.common + p.rare + p.epic + p.legendary).toBeCloseTo(1, 9);
        expect(t.remaining).toBe(
          await count(`select count(*)::int as n from "pack" where "type" = ? and "status" = 'sin_abrir'`, [t.type]),
        );
        cards += t.remaining * t.cards;
      }
      expect(cards).toBe(ELIGIBLE.length * 100);
    });

    it('las probabilidades reflejan las cartas que quedan después de una apertura (FR-010)', async () => {
      await syncStock(app);
      const { token } = await registerUser(app, 'vivo@packs.test');
      await catalog(token).expect(200); // queda en caché
      await openPack(app, token, { type: 'common' }).expect(201);

      const { body } = await catalog(token).expect(200);
      const common = body.types.find((t: any) => t.type === 'common');
      const rows = await em.execute<{ reputation: number; n: number }[]>(
        `select p."world_reputation" as "reputation", count(*)::int as n
           from "token" t join "pack" pk on pk."id" = t."pack_id" join "player" p on p."id" = t."player_id"
          where pk."type" = 'common' and pk."status" = 'sin_abrir'
          group by 1`,
      );
      const expected = { common: 0, rare: 0, epic: 0, legendary: 0 };
      for (const row of rows) expected[rarityOfReputation(Number(row.reputation))] += Number(row.n);
      const total = Object.values(expected).reduce((a, b) => a + b, 0);
      for (const rarity of Object.keys(expected) as (keyof typeof expected)[]) {
        expect(common.probabilities[rarity]).toBeCloseTo(expected[rarity] / total, 9);
      }
    });
  });

  // ------------------------------------------------------------------------------- apertura

  describe('US2-2 / US2-3 — abrir un sobre', () => {
    it('cobra el precio, entrega las cartas del tipo y baja el stock en uno', async () => {
      await syncStock(app);
      const { token, userId } = await registerUser(app, 'abre@packs.test');
      const before = (await catalog(token).expect(200)).body.types.find((t: any) => t.type === 'rare').remaining;

      const { body } = await openPack(app, token, { type: 'rare' }).expect(201);

      expect(body).toMatchObject({
        type: 'rare',
        price: PRICES.rare,
        cardCount: CARDS.rare,
        balanceBefore: INITIAL_CREDITS,
        balanceAfter: INITIAL_CREDITS - PRICES.rare,
      });
      expect(body.cards).toHaveLength(CARDS.rare);
      for (const card of body.cards) {
        const fixture = DEFAULT_PLAYERS.find((p) => p.name === card.player.name)!;
        expect(card.serial).toBeGreaterThanOrEqual(1);
        expect(card.serial).toBeLessThanOrEqual(100);
        expect(card.quotePrice).toBe(fixture.price);
        expect(card.rarity).toBe(rarityOfReputation(fixture.reputation));
        expect(card.player.ovr).toBe(fixture.reputation);
      }
      expect(await creditsOf(userId)).toBe(INITIAL_CREDITS - PRICES.rare);

      const after = (await catalog(token).expect(200)).body.types.find((t: any) => t.type === 'rare').remaining;
      expect(after).toBe(before - 1);

      // Cada token pasó de la plataforma al usuario, con su evento (FR-023, FR-030).
      const tokenIds = body.cards.map((c: any) => c.tokenId);
      expect(
        await count(
          `select count(*)::int as n from "token" where "id" in (${tokenIds.map(() => '?').join(',')}) and "status" = 'de_usuario' and "owner_id" = ?`,
          [...tokenIds, userId],
        ),
      ).toBe(CARDS.rare);
      expect(
        await count(
          `select count(*)::int as n from "token_event" where "type" = 'entrega_en_sobre' and "to_owner_id" = ?`,
          [userId],
        ),
      ).toBe(CARDS.rare);
    });

    it('movimiento, apertura y eventos se referencian entre sí (FR-041)', async () => {
      await syncStock(app);
      const { token } = await registerUser(app, 'refs@packs.test');
      const { body } = await request(app.getHttpServer())
        .post('/packs/openings')
        .set('Authorization', `Bearer ${token}`)
        .set('x-correlation-id', 'e2e-refs-correlation')
        .send({ type: 'common' })
        .expect(201);

      const [opening] = await em.execute<any[]>('select * from "pack_opening" where "id" = ?', [body.id]);
      const [movement] = await em.execute<any[]>('select * from "credit_movement" where "id" = ?', [
        opening.credit_movement_id,
      ]);
      expect(movement).toMatchObject({ type: 'compra_sobre', reference_type: 'pack_opening', reference_id: body.id });
      expect(movement.amount).toBe(-PRICES.common);
      const events = await em.execute<any[]>(
        `select * from "token_event" where "reference_id" = ? and "type" = 'entrega_en_sobre'`,
        [body.id],
      );
      expect(events).toHaveLength(CARDS.common);
      for (const row of [opening, movement, ...events]) expect(row.correlation_id).toBe('e2e-refs-correlation');
    });

    it('con un solo jugador elegible, un sobre trae varias cartas suyas (US2-14, FR-024)', async () => {
      await cleanAll(em);
      const ids = await seedPlayers(em, [{ name: 'Unico Jugador', reputation: 90, price: 7000 }]);
      await resetCaches(app);
      await syncStock(app);
      const { token, userId } = await registerUser(app, 'unico@packs.test');

      const { body } = await openPack(app, token, { type: 'legendary' }).expect(201);
      expect(body.cards).toHaveLength(CARDS.legendary);
      expect(new Set(body.cards.map((c: any) => c.player.id))).toEqual(new Set([ids.get('Unico Jugador')]));
      expect(
        await count(`select count(*)::int as n from "token" where "owner_id" = ? and "player_id" = ?`, [
          userId,
          ids.get('Unico Jugador'),
        ]),
      ).toBe(CARDS.legendary);
    });
  });

  describe('rechazos sin efectos (FR-019, SC-002)', () => {
    it('saldo menor que el precio → 409 INSUFFICIENT_CREDITS (US2-4)', async () => {
      await syncStock(app);
      const { token, userId } = await registerUser(app, 'pobre@packs.test');
      await setCredits(em, userId, PRICES.rare - 1);
      const before = await snapshot(userId);

      const res = await openPack(app, token, { type: 'rare' }).expect(409);
      expect(res.body).toMatchObject({ code: 'INSUFFICIENT_CREDITS', correlationId: expect.any(String) });
      expect(await snapshot(userId)).toEqual(before);
    });

    it('con el saldo justo abre y queda en 0 (US2-5)', async () => {
      await syncStock(app);
      const { token, userId } = await registerUser(app, 'justo@packs.test');
      await setCredits(em, userId, PRICES.rare);

      const { body } = await openPack(app, token, { type: 'rare' }).expect(201);
      expect(body.balanceAfter).toBe(0);
      expect(await creditsOf(userId)).toBe(0);
    });

    it('tipo agotado → 409 PACK_SOLD_OUT y los demás siguen disponibles (US2-6)', async () => {
      await syncStock(app);
      const { token, userId } = await registerUser(app, 'rico@packs.test');
      await setCredits(em, userId, 1_000_000);
      const legendary = await count(`select count(*)::int as n from "pack" where "type" = 'legendary'`);
      for (let i = 0; i < legendary; i++) await openPack(app, token, { type: 'legendary' }).expect(201);

      const before = await snapshot(userId);
      const res = await openPack(app, token, { type: 'legendary' }).expect(409);
      expect(res.body.code).toBe('PACK_SOLD_OUT');
      expect(await snapshot(userId)).toEqual(before);

      const types = (await catalog(token).expect(200)).body.types;
      expect(types.find((t: any) => t.type === 'legendary')).toMatchObject({ remaining: 0, probabilities: null });
      await openPack(app, token, { type: 'common' }).expect(201);
    });

    it.each([
      [{ type: 'mega' }, 404, 'PACK_TYPE_NOT_FOUND'],
      [{}, 422, 'VALIDATION_ERROR'],
      [{ type: 5 }, 422, 'VALIDATION_ERROR'],
    ])('el pedido %j responde %i %s (US2-8)', async (body, status, code) => {
      await syncStock(app);
      const { token, userId } = await registerUser(app, 'invalido@packs.test');
      const before = await snapshot(userId);
      const res = await openPack(app, token, body).expect(status);
      expect(res.body.code).toBe(code);
      expect(await snapshot(userId)).toEqual(before);
    });

    it('un usuario indicado en el pedido se rechaza y no se abre nada (US2-16, FR-025)', async () => {
      await syncStock(app);
      const ana = await registerUser(app, 'ana@packs.test');
      const beto = await registerUser(app, 'beto@packs.test');
      const before = await snapshot(beto.userId);

      const res = await openPack(app, ana.token, { type: 'common', userId: beto.userId }).expect(422);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(await snapshot(beto.userId)).toEqual(before);
    });

    it('sin sesión → 401 UNAUTHENTICATED (US2-15)', async () => {
      await syncStock(app);
      const res = await request(app.getHttpServer()).post('/packs/openings').send({ type: 'common' }).expect(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
      await request(app.getHttpServer()).get('/packs/types').expect(401);
    });

    it('una falla a mitad de la apertura no deja efectos (US2-13, SC-002)', async () => {
      await syncStock(app);
      const { token, userId } = await registerUser(app, 'falla@packs.test');
      const before = await snapshot(userId);

      // Falla real dentro de la transacción, después del débito y de la entrega de tokens.
      await em.execute(`create function "e2e_fail_delivery"() returns trigger language plpgsql as $$
        begin raise exception 'falla simulada'; end; $$`);
      await em.execute(
        `create trigger "e2e_fail_delivery" before insert on "token_event" for each row
           when (new."type" = 'entrega_en_sobre') execute function "e2e_fail_delivery"()`,
      );
      try {
        const res = await openPack(app, token, { type: 'common' }).expect(500);
        expect(res.body).toMatchObject({ code: 'INTERNAL_ERROR' });
        expect(JSON.stringify(res.body)).not.toContain('falla simulada');
      } finally {
        await em.execute('drop trigger "e2e_fail_delivery" on "token_event"');
        await em.execute('drop function "e2e_fail_delivery"()');
      }
      expect(await snapshot(userId)).toEqual(before);
    });
  });

  describe('concurrencia (FR-022, SC-003)', () => {
    it('con saldo para dos sobres y cinco aperturas simultáneas, se completan exactamente dos (US2-10)', async () => {
      await syncStock(app);
      const { token, userId } = await registerUser(app, 'apurado@packs.test');
      await setCredits(em, userId, PRICES.common * 2);

      const results = await Promise.all(
        Array.from({ length: 5 }, () => openPack(app, token, { type: 'common' })),
      );
      const ok = results.filter((r) => r.status === 201);
      const rejected = results.filter((r) => r.status === 409);
      expect(ok).toHaveLength(2);
      expect(rejected).toHaveLength(3);
      expect(rejected.every((r) => r.body.code === 'INSUFFICIENT_CREDITS')).toBe(true);
      expect(await creditsOf(userId)).toBe(0);
    });

    it('el último sobre de un tipo lo recibe uno solo; al otro no se le cobra (US2-11)', async () => {
      await syncStock(app);
      const rico = await registerUser(app, 'rico2@packs.test');
      await setCredits(em, rico.userId, 1_000_000);
      const legendary = await count(`select count(*)::int as n from "pack" where "type" = 'legendary'`);
      for (let i = 0; i < legendary - 1; i++) await openPack(app, rico.token, { type: 'legendary' }).expect(201);

      const ana = await registerUser(app, 'ana2@packs.test');
      const beto = await registerUser(app, 'beto2@packs.test');
      await setCredits(em, ana.userId, PRICES.legendary);
      await setCredits(em, beto.userId, PRICES.legendary);

      const [a, b] = await Promise.all([
        openPack(app, ana.token, { type: 'legendary' }),
        openPack(app, beto.token, { type: 'legendary' }),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      const loser = a.status === 409 ? ana : beto;
      expect((a.status === 409 ? a : b).body.code).toBe('PACK_SOLD_OUT');
      expect(await creditsOf(loser.userId)).toBe(PRICES.legendary);
    });

    it('aperturas simultáneas de varios usuarios no entregan un token dos veces (US2-12)', async () => {
      await syncStock(app);
      const users = await Promise.all(
        Array.from({ length: 6 }, (_, i) => registerUser(app, `multi${i}@packs.test`)),
      );
      // allSettled: si una falla, igual se espera a las demás antes de limpiar la base.
      const results = await Promise.allSettled(users.map((u) => openPack(app, u.token, { type: 'common' })));
      expect(results.map((r) => (r.status === 'fulfilled' ? r.value.status : r.reason))).toEqual(
        users.map(() => 201),
      );
      expect(
        await count(
          `select count(*)::int as n from (select "token_id" from "pack_opening_card" group by 1 having count(*) > 1) d`,
        ),
      ).toBe(0);
      expect(
        await count(
          `select count(*)::int as n from (select "pack_id" from "pack_opening" group by 1 having count(*) > 1) d`,
        ),
      ).toBe(0);
    });
  });

  // ------------------------------------------------------------------------------- US7

  describe('US7 — historial de aperturas (FR-037 a FR-041)', () => {
    function history(token: string, query = '') {
      return request(app.getHttpServer()).get(`/packs/openings${query}`).set('Authorization', `Bearer ${token}`);
    }

    it('lista las aperturas de la más reciente a la más antigua, con saldo y cartas (US7-1, US7-2)', async () => {
      await syncStock(app);
      const { token } = await registerUser(app, 'hist@packs.test');
      const first = (await openPack(app, token, { type: 'common' }).expect(201)).body;
      const second = (await openPack(app, token, { type: 'rare' }).expect(201)).body;

      const { body } = await history(token).expect(200);
      expect(body.meta).toEqual({ total: 2, page: 1, limit: 20, totalPages: 1 });
      expect(body.data.map((o: any) => o.id)).toEqual([second.id, first.id]);
      for (const opening of body.data) {
        expect(opening.balanceBefore - opening.price).toBe(opening.balanceAfter);
        expect(opening.cards).toHaveLength(opening.cardCount);
      }
      expect(body.data[0]).toEqual(second);
    });

    it('las cartas conservan la rareza y la cotización del momento cero (US7-3, US7-4)', async () => {
      await syncStock(app);
      const ana = await registerUser(app, 'cero@packs.test');
      const opening = (await openPack(app, ana.token, { type: 'legendary' }).expect(201)).body;
      const card = opening.cards[0];

      // Después cambian la reputación y la cotización del jugador, y el token cambia de dueño.
      await em.execute(`update "player" set "world_reputation" = 10, "base_value" = 1 where "id" = ?`, [
        card.player.id,
      ]);
      const beto = await registerUser(app, 'otro@packs.test');
      await em.execute(`update "token" set "owner_id" = ? where "id" = ?`, [beto.userId, card.tokenId]);

      const { body } = await history(ana.token).expect(200);
      const stored = body.data[0].cards.find((c: any) => c.tokenId === card.tokenId);
      expect(stored).toMatchObject({ rarity: card.rarity, quotePrice: card.quotePrice, serial: card.serial });
      expect(body.data[0].cards).toHaveLength(CARDS.legendary);
    });

    it('las aperturas y sus cartas son inmutables (US7-5, FR-040)', async () => {
      await syncStock(app);
      const { token } = await registerUser(app, 'fija@packs.test');
      await openPack(app, token, { type: 'common' }).expect(201);
      await expect(em.execute('delete from "pack_opening"')).rejects.toThrow(/inmutable/);
      await expect(em.execute('update "pack_opening_card" set "quote_price" = 0')).rejects.toThrow(/inmutable/);
    });

    it('cada usuario ve solo su historial (US7-6)', async () => {
      await syncStock(app);
      const ana = await registerUser(app, 'ana3@packs.test');
      const beto = await registerUser(app, 'beto3@packs.test');
      await openPack(app, ana.token, { type: 'common' }).expect(201);

      expect((await history(beto.token).expect(200)).body.data).toEqual([]);
      await history(ana.token, `?userId=${beto.userId}`).expect(422);
    });

    it('los movimientos de créditos reconstruyen el saldo actual (US7-7, SC-012)', async () => {
      await syncStock(app);
      const { token, userId } = await registerUser(app, 'saldo@packs.test');
      await openPack(app, token, { type: 'epic' }).expect(201);
      await openPack(app, token, { type: 'common' }).expect(201);

      const movements = await em.execute<{ amount: number; balance_before: number; balance_after: number }[]>(
        `select "amount", "balance_before", "balance_after" from "credit_movement"
          where "user_id" = ? order by "created_at", "balance_before" desc`,
        [userId],
      );
      let balance = 0;
      for (const m of movements) {
        expect(m.balance_before).toBe(balance);
        balance += m.amount;
        expect(m.balance_after).toBe(balance);
      }
      expect(balance).toBe(await creditsOf(userId));
    });

    it('cada registro conserva el identificador de trazabilidad de la solicitud (US7-8)', async () => {
      await syncStock(app);
      const { token } = await registerUser(app, 'traza@packs.test');
      const { body } = await request(app.getHttpServer())
        .post('/packs/openings')
        .set('Authorization', `Bearer ${token}`)
        .set('x-correlation-id', 'e2e-us7-correlation')
        .send({ type: 'rare' })
        .expect(201);
      const [row] = await em.execute<{ correlation_id: string }[]>(
        'select "correlation_id" from "pack_opening" where "id" = ?',
        [body.id],
      );
      expect(row.correlation_id).toBe('e2e-us7-correlation');
    });

    it('pagina el historial', async () => {
      await syncStock(app);
      const { token } = await registerUser(app, 'paginas@packs.test');
      for (let i = 0; i < 3; i++) await openPack(app, token, { type: 'common' }).expect(201);
      const page2 = (await history(token, '?page=2&limit=2').expect(200)).body;
      expect(page2.meta).toEqual({ total: 3, page: 2, limit: 2, totalPages: 2 });
      expect(page2.data).toHaveLength(1);
      expect((await history(token, '?limit=0').expect(422)).body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('invariantes', () => {
    it('cada jugador suma 100 tokens en los cuatro estados (FR-023)', async () => {
      await syncStock(app);
      const { token } = await registerUser(app, 'inv@packs.test');
      await openPack(app, token, { type: 'epic' }).expect(201);
      expect(
        await count(
          `select count(*)::int as n from (select "player_id" from "token" group by 1 having count(*) <> 100) d`,
        ),
      ).toBe(0);
    });

    it('la suma de saldos es igual a lo emitido menos lo cobrado (FR-007, SC-013)', async () => {
      await syncStock(app);
      const ana = await registerUser(app, 'cons1@packs.test');
      const beto = await registerUser(app, 'cons2@packs.test');
      await openPack(app, ana.token, { type: 'rare' }).expect(201);
      await openPack(app, beto.token, { type: 'epic' }).expect(201);
      await openPack(app, beto.token, { type: 'common' }).expect(201);

      const balances = await count('select coalesce(sum("credits"), 0)::int as n from "user"');
      const emitted = await count(
        `select coalesce(sum("amount"), 0)::int as n from "credit_movement" where "type" = 'entrega_inicial'`,
      );
      const charged = await count(
        `select coalesce(-sum("amount"), 0)::int as n from "credit_movement" where "type" = 'compra_sobre'`,
      );
      expect(balances).toBe(emitted - charged);
      expect(charged).toBe(PRICES.rare + PRICES.epic + PRICES.common);
    });

    it('el último evento de cada token coincide con su estado y dueño (FR-032, SC-014)', async () => {
      await syncStock(app);
      const { token } = await registerUser(app, 'eventos@packs.test');
      await openPack(app, token, { type: 'legendary' }).expect(201);
      expect(
        await count(
          `select count(*)::int as n
             from "token" t
             join lateral (
               select e."to_status", e."to_owner_id" from "token_event" e
                where e."token_id" = t."id" order by e."created_at" desc, e."type" desc limit 1
             ) last on true
            where last."to_status" <> t."status" or last."to_owner_id" is distinct from t."owner_id"`,
        ),
      ).toBe(0);
    });
  });
});
