import { jest } from '@jest/globals';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AdminSeedConfigError, seedAdmin } from '../src/infrastructure/database/seeds/admin.seed';
import { TokensService } from '../src/modules/tokens/tokens.service';
import {
  ADMIN_KEY_HEADER,
  PASSWORD,
  type PlayerFixture,
  cleanAll,
  openPack,
  registerUser,
  resetCaches,
  seedPlayers,
  setCredits,
  syncStock,
} from './support/packs-fixtures';
import { grantTokens, insertPlatformListing, publish, purchase } from './support/market-fixtures';

jest.setTimeout(180_000);

/**
 * Sin reputación quedan `reservado`, y `grantTokens` puede dárselos a un usuario. «Pedro Paquete»
 * es el único elegible para los sobres.
 */
const PLAYERS: PlayerFixture[] = [
  { name: 'Mario Mercado', reputation: null, price: 300 },
  { name: 'Luis Lista', reputation: null, price: 100 },
  { name: 'Pedro Paquete', reputation: 75, price: 400 },
];

const ADMIN_EMAIL = 'admin@admin.test';
const SEED_ENV = { ADMIN_SEED_EMAIL: ADMIN_EMAIL, ADMIN_SEED_PASSWORD: PASSWORD };

const dayOffset = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

/** 11-admin-panel — rol, seed y métricas de la plataforma. */
describe('Admin (e2e)', () => {
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

  async function userRow(email: string) {
    const [row] = await em.fork().execute<{ id: string; role: string; credits: number; password_hash: string }[]>(
      'select "id", "role", "credits", "password_hash" from "user" where "email" = ?',
      [email],
    );
    return row;
  }

  async function count(sql: string, params: unknown[] = []): Promise<number> {
    const [row] = await em.fork().execute<{ n: number }[]>(sql, params);
    return Number(row.n);
  }

  async function login(email: string): Promise<{ accessToken: string; user: { role: string } }> {
    return (await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD }).expect(200)).body;
  }

  async function adminToken(): Promise<string> {
    await seedAdmin(em.fork(), SEED_ENV);
    return (await login(ADMIN_EMAIL)).accessToken;
  }

  function getMetrics(jwt: string, query = '') {
    return request(app.getHttpServer()).get(`/admin/metrics${query}`).set('Authorization', `Bearer ${jwt}`);
  }

  /** Salteando la caché: Redis sobrevive entre tests. */
  async function metrics(jwt: string, query = ''): Promise<any> {
    const separator = query ? '&' : '?';
    return (await getMetrics(jwt, `${query}${separator}refresh=true`).expect(200)).body;
  }

  /** Un usuario que ya publicó `n` cartas del jugador. */
  async function seller(email: string, playerName: string, n: number) {
    const user = await registerUser(app, email);
    const tokens = await grantTokens(em, user.userId, player(playerName), n);
    const listings: string[] = [];
    for (const tokenId of tokens) listings.push((await publish(app, user.token, { tokenId }).expect(201)).body.id);
    return { ...user, listings };
  }

  async function buy(jwt: string, listingId: string, acceptedPrice: number): Promise<string> {
    return (await purchase(app, jwt, { listingId, acceptedPrice }).expect(201)).body.id;
  }

  /** Los registros financieros son inmutables por trigger: solo acá se les cambia la fecha. */
  async function backdate(table: 'token_purchase' | 'pack_opening', id: string, at: Date): Promise<void> {
    const fork = em.fork();
    await fork.execute(`alter table "${table}" disable trigger "${table}_immutable"`);
    await fork.execute(`update "${table}" set "created_at" = ? where "id" = ?`, [at, id]);
    await fork.execute(`alter table "${table}" enable trigger "${table}_immutable"`);
  }

  // ------------------------------------------------------------ US1 — el seed

  describe('US1 — cuenta administradora por seed', () => {
    it('crea la cuenta con el rol, saldo 0 y sin entrega inicial (FR-007, FR-009)', async () => {
      expect(await seedAdmin(em.fork(), SEED_ENV)).toBe('created');

      const row = await userRow(ADMIN_EMAIL);
      expect(row).toMatchObject({ role: 'admin', credits: 0 });
      expect(row.password_hash).not.toBe(PASSWORD);
      expect(await count(`select count(*) as "n" from "credit_movement" where "user_id" = ?`, [row.id])).toBe(0);
    });

    it('entra por el login normal e informa su rol (US1-5)', async () => {
      await seedAdmin(em.fork(), SEED_ENV);
      expect((await login(ADMIN_EMAIL)).user.role).toBe('admin');
    });

    it('es repetible: sin duplicados ni cambios (FR-010)', async () => {
      await seedAdmin(em.fork(), SEED_ENV);
      const before = await userRow(ADMIN_EMAIL);

      expect(await seedAdmin(em.fork(), { ...SEED_ENV, ADMIN_SEED_PASSWORD: 'OtraClave123' })).toBe('unchanged');

      expect(await count(`select count(*) as "n" from "user" where "email" = ?`, [ADMIN_EMAIL])).toBe(1);
      expect(await userRow(ADMIN_EMAIL)).toEqual(before);
    });

    it('a una cuenta común le da el rol sin tocar su contraseña ni su saldo (FR-010)', async () => {
      await registerUser(app, ADMIN_EMAIL);
      const before = await userRow(ADMIN_EMAIL);

      expect(await seedAdmin(em.fork(), { ...SEED_ENV, ADMIN_SEED_PASSWORD: 'OtraClave123' })).toBe('promoted');

      expect(await userRow(ADMIN_EMAIL)).toEqual({ ...before, role: 'admin' });
    });

    it.each([
      ['sin credenciales', {}],
      ['correo mal formado', { ADMIN_SEED_EMAIL: 'no-es-un-correo', ADMIN_SEED_PASSWORD: PASSWORD }],
      ['contraseña corta', { ADMIN_SEED_EMAIL: ADMIN_EMAIL, ADMIN_SEED_PASSWORD: 'corta' }],
    ])('%s: falla sin efectos y sin mostrar la contraseña (FR-008, FR-011)', async (_, env) => {
      const error = await seedAdmin(em.fork(), env).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AdminSeedConfigError);
      expect((error as Error).message).not.toContain('corta');
      expect(await count('select count(*) as "n" from "user"')).toBe(0);
    });

    it('la entrega de créditos pendientes no alcanza al administrador (FR-009)', async () => {
      await seedAdmin(em.fork(), SEED_ENV);

      await request(app.getHttpServer())
        .post('/credits/initial-grants')
        .set(ADMIN_KEY_HEADER, process.env.ADMIN_API_KEY!)
        .expect(200);

      expect((await userRow(ADMIN_EMAIL)).credits).toBe(0);
    });

    it('el registro público rechaza un rol en el pedido y crea usuarios comunes (FR-002, US1-6, US1-8)', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'colado@admin.test', username: 'colado', password: PASSWORD, role: 'admin' })
        .expect(400);
      expect(await userRow('colado@admin.test')).toBeUndefined();

      await registerUser(app, 'comun@admin.test');
      expect((await login('comun@admin.test')).user.role).toBe('user');
      expect((await userRow('comun@admin.test')).role).toBe('user');
    });
  });

  // ------------------------------------------------------------ US2 — acceso y números clave

  describe('US2 — acceso al panel', () => {
    it('sin sesión: 401 sin métricas (FR-014)', async () => {
      const { body } = await request(app.getHttpServer()).get('/admin/metrics').expect(401);
      expect(body).toMatchObject({ code: 'UNAUTHENTICATED' });
      expect(body.users).toBeUndefined();
    });

    it('sesión común: 403 FORBIDDEN sin métricas (FR-014)', async () => {
      const { token } = await registerUser(app, 'comun@admin.test');
      const { body } = await getMetrics(token).expect(403);
      expect(body).toMatchObject({ code: 'FORBIDDEN' });
      expect(body.correlationId).toEqual(expect.any(String));
      expect(body.users).toBeUndefined();
    });

    it('la clave administrativa no abre el panel, ni el rol los procesos internos (FR-005)', async () => {
      await request(app.getHttpServer())
        .get('/admin/metrics')
        .set(ADMIN_KEY_HEADER, process.env.ADMIN_API_KEY!)
        .expect(401);

      const jwt = await adminToken();
      await request(app.getHttpServer())
        .post('/credits/initial-grants')
        .set('Authorization', `Bearer ${jwt}`)
        .expect(401);
    });

    it('una cuenta que pierde el rol queda afuera con la misma sesión (FR-004)', async () => {
      const jwt = await adminToken();
      await getMetrics(jwt).expect(200);

      await em.fork().execute(`update "user" set "role" = 'user' where "email" = ?`, [ADMIN_EMAIL]);

      await getMetrics(jwt).expect(403);
    });

    it('sirve de la caché hasta que se pide actualizar (FR-026)', async () => {
      const jwt = await adminToken();
      const query = `?from=${dayOffset(3)}&to=${dayOffset(3)}`;
      await metrics(jwt, query);
      const first = (await getMetrics(jwt, query).expect(200)).body;
      await registerUser(app, 'nuevo@admin.test');

      const cached = (await getMetrics(jwt, query).expect(200)).body;
      const refreshed = await metrics(jwt, query);

      expect(cached.computedAt).toBe(first.computedAt);
      expect(cached.users.registered).toBe(0);
      expect(refreshed.users.registered).toBe(1);
    });
  });

  describe('US2 a US4 — métricas', () => {
    it('una plataforma sin operaciones responde ceros, sin promedio y con todo conciliado (US2-5, US2-6)', async () => {
      const body = await metrics(await adminToken());

      expect(body.users).toEqual({ registered: 0, new: 0, active: 0 });
      expect(body.market).toEqual({ sales: 0, averagePrice: null, volume: 0, topSale: null, topPlayers: [] });
      expect(body.activity).toEqual({ unit: 'day', buckets: [] });
      expect(body.reconciliation.cards.ok).toBe(true);
      expect(body.reconciliation.credits.ok).toBe(true);
    });

    it('cuenta usuarios, cartas, mercado y créditos según sus definiciones', async () => {
      const ana = await seller('ana@admin.test', 'Mario Mercado', 2);
      const luis = await seller('luis@admin.test', 'Luis Lista', 1);
      const beto = await registerUser(app, 'beto@admin.test');
      await registerUser(app, 'mirón@admin.test');

      await buy(beto.token, ana.listings[0], 300);
      await buy(beto.token, luis.listings[0], 100);
      const [reserved] = await em.fork().execute<{ id: string }[]>(
        `select "id" from "token" where "status" = 'reservado' and "player_id" = ? limit 1`,
        [player('Mario Mercado')],
      );
      await buy(beto.token, await insertPlatformListing(em, reserved.id), 300);

      const body = await metrics(await adminToken());

      expect(body.users).toEqual({ registered: 4, new: 4, active: 3 });
      expect(body.cards).toEqual({
        issued: 300,
        inCirculation: 4,
        inPacks: 0,
        reserved: 296,
        platformSale: 0,
        listed: 1,
      });
      expect(body.market).toMatchObject({ sales: 3, volume: 700, averagePrice: 233 });
      expect(body.market.topSale).toMatchObject({ price: 300, playerName: 'Mario Mercado' });
      expect(body.market.topPlayers).toEqual([
        { playerId: player('Mario Mercado'), playerName: 'Mario Mercado', sales: 2, volume: 600 },
        { playerId: player('Luis Lista'), playerName: 'Luis Lista', sales: 1, volume: 100 },
      ]);
      // Las ventas entre usuarios no salen de circulación: solo la de la plataforma.
      expect(body.credits).toEqual({ issued: 8000, collected: 300, inCirculation: 7700 });
      expect(body.reconciliation.credits).toEqual({ ok: true, expected: 7700, actual: 7700, difference: 0 });
      expect(body.reconciliation.cards).toEqual({ ok: true, difference: 0, affectedPlayers: 0 });
    });

    it('sobres por tipo, rareza vigente y actividad (US3, US4, FR-019, FR-040)', async () => {
      await syncStock(app);
      await resetCaches(app);
      const beto = await registerUser(app, 'beto@admin.test');
      const { body: opening } = await openPack(app, beto.token, { type: 'common' }).expect(201);

      const body = await metrics(await adminToken(), `?from=${dayOffset(1)}&to=${dayOffset(0)}`);

      const common = body.packs.byType.find((row: any) => row.type === 'common');
      expect(common.opened).toBe(1);
      expect(body.packs.opened).toBe(1);
      expect(body.packs.remaining).toBe(body.packs.byType.reduce((sum: number, row: any) => sum + row.remaining, 0));
      expect(body.packs.byType.map((row: any) => row.type)).toEqual(['common', 'rare', 'epic', 'legendary']);
      expect(body.cards.inPacks).toBe(100 - opening.cards.length);
      expect(body.rarity).toEqual({ common: 0, rare: opening.cards.length, epic: 0, legendary: 0 });
      expect(body.credits.collected).toBe(opening.price);
      expect(body.activity.unit).toBe('day');
      expect(body.activity.buckets.reduce((sum: number, b: any) => sum + b.packsOpened, 0)).toBe(1);
      expect(body.reconciliation.credits.ok).toBe(true);
    });

    it('no expone datos de los usuarios (FR-031)', async () => {
      const ana = await seller('ana@admin.test', 'Mario Mercado', 1);
      const beto = await registerUser(app, 'beto@admin.test');
      await buy(beto.token, ana.listings[0], 300);

      const raw = JSON.stringify(await metrics(await adminToken()));

      for (const secret of ['ana@admin.test', 'beto@admin.test', ADMIN_EMAIL, ana.userId, beto.userId]) {
        expect(raw).not.toContain(secret);
      }
    });

    it('consultar no escribe nada (FR-030)', async () => {
      const ana = await seller('ana@admin.test', 'Mario Mercado', 1);
      const jwt = await adminToken();
      const totals = () =>
        count(`select (select count(*) from "credit_movement") + (select count(*) from "token_event") + (select count(*) from "listing") as "n"`);
      const before = await totals();

      await metrics(jwt);

      expect(await totals()).toBe(before);
      expect((await userRow('ana@admin.test')).id).toBe(ana.userId);
    });

    it('avisa si los créditos no cierran, sin corregir nada (US4-4, FR-025)', async () => {
      const ana = await registerUser(app, 'ana@admin.test');
      await setCredits(em, ana.userId, 1500);

      const { reconciliation } = await metrics(await adminToken());

      expect(reconciliation.credits).toEqual({ ok: false, expected: 2000, actual: 1500, difference: 500 });
      expect((await userRow('ana@admin.test')).credits).toBe(1500);
    });

    it('avisa si un jugador no tiene 100 tokens (US4-5)', async () => {
      await em.fork().execute('truncate table "token_event", "token" cascade');
      await em.fork().execute(
        `insert into "token" ("id", "player_id", "serial", "status", "created_at") values (gen_random_uuid(), ?, 1, 'reservado', now())`,
        [player('Mario Mercado')],
      );

      const { reconciliation } = await metrics(await adminToken());

      expect(reconciliation.cards).toEqual({ ok: false, difference: 0, affectedPlayers: 1 });
    });
  });

  // ------------------------------------------------------------ US5 — período

  describe('US5 — selector de fechas', () => {
    it('acota las métricas de período; las de estado y las conciliaciones no cambian (FR-037)', async () => {
      const ana = await seller('ana@admin.test', 'Mario Mercado', 2);
      const luis = await seller('luis@admin.test', 'Luis Lista', 1);
      const beto = await registerUser(app, 'beto@admin.test');
      const old = await buy(beto.token, luis.listings[0], 100);
      await buy(beto.token, ana.listings[0], 300);
      await backdate('token_purchase', old, new Date(Date.now() - 40 * 86_400_000));

      const jwt = await adminToken();
      const all = await metrics(jwt);
      const lastWeek = await metrics(jwt, `?from=${dayOffset(7)}&to=${dayOffset(0)}`);

      expect(all.market).toMatchObject({ sales: 2, averagePrice: 200, volume: 400 });
      expect(lastWeek.market).toMatchObject({ sales: 1, averagePrice: 300, volume: 300 });
      expect(lastWeek.market.topPlayers.map((p: any) => p.playerName)).toEqual(['Mario Mercado']);
      expect(lastWeek.cards).toEqual(all.cards);
      expect(lastWeek.rarity).toEqual(all.rarity);
      expect(lastWeek.reconciliation).toEqual(all.reconciliation);
      expect(lastWeek.users.registered).toBe(all.users.registered);
      expect(lastWeek.activity.buckets.reduce((sum: number, b: any) => sum + b.sales, 0)).toBe(1);
      expect(all.activity.unit).toBe('week');
      expect(all.activity.buckets.reduce((sum: number, b: any) => sum + b.sales, 0)).toBe(2);
    });

    it('un período sin operaciones responde sin promedio y con los tramos en cero (US5-7)', async () => {
      const body = await metrics(await adminToken(), `?from=${dayOffset(3)}&to=${dayOffset(2)}`);

      expect(body.market.averagePrice).toBeNull();
      expect(body.activity.buckets).toEqual([
        { start: dayOffset(3), packsOpened: 0, sales: 0 },
        { start: dayOffset(2), packsOpened: 0, sales: 0 },
      ]);
    });

    it('toma los días en la zona horaria del administrador (FR-038)', async () => {
      const ana = await seller('ana@admin.test', 'Mario Mercado', 1);
      const beto = await registerUser(app, 'beto@admin.test');
      const sale = await buy(beto.token, ana.listings[0], 300);
      // 01:00 UTC del 1 de enero son las 22:00 del 31 de diciembre en Buenos Aires.
      await backdate('token_purchase', sale, new Date('2026-01-01T01:00:00Z'));

      const jwt = await adminToken();
      const buenosAires = await metrics(jwt, '?from=2025-12-31&to=2025-12-31&timezone=America/Argentina/Buenos_Aires');
      const utc = await metrics(jwt, '?from=2025-12-31&to=2025-12-31&timezone=UTC');

      expect(buenosAires.market.sales).toBe(1);
      expect(buenosAires.activity.buckets).toEqual([{ start: '2025-12-31', packsOpened: 0, sales: 1 }]);
      expect(utc.market.sales).toBe(0);
    });

    it.each([
      ['solo from', `?from=2026-01-01`],
      ['solo to', `?to=2026-01-01`],
      ['rango invertido', `?from=2026-02-01&to=2026-01-01`],
      ['fecha inexistente', `?from=2026-02-31&to=2026-03-01`],
      ['fecha mal formada', `?from=01/01/2026&to=2026-01-02`],
      ['fecha futura', `?from=2026-01-01&to=2999-01-01`],
      ['zona horaria desconocida', `?timezone=Marte/Olympus`],
      ['refresh inválido', `?refresh=si`],
      ['parámetro desconocido', `?userId=1`],
    ])('%s: 422 VALIDATION_ERROR sin métricas (FR-039)', async (_, query) => {
      const { body } = await getMetrics(await adminToken(), query).expect(422);
      expect(body).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(body.users).toBeUndefined();
    });
  });
});
