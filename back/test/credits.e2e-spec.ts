import { randomUUID } from 'node:crypto';
import { jest } from '@jest/globals';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CreditMovement, CreditMovementType } from '../src/infrastructure/database/entities/credit-movement.entity';
import { User } from '../src/infrastructure/database/entities/user.entity';
import { CreditsRepository } from '../src/modules/credits/credits.repository';
import { CreditsService } from '../src/modules/credits/credits.service';
import { cleanPacksData } from './support/clean-database';

jest.setTimeout(60_000);

const ADMIN_KEY_HEADER = 'x-api-key';
const INITIAL_CREDITS = 2000;
const PASSWORD = 'Passw0rd!2026';

/** 08-sobres US1 — créditos iniciales y saldo (FR-001 a FR-007). */
describe('Credits (e2e)', () => {
  let app: INestApplication;
  let em: EntityManager;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    em = app.get(EntityManager);
  });

  beforeEach(async () => {
    await cleanPacksData(em);
    await em.nativeDelete(User, {});
  });

  afterAll(async () => {
    await cleanPacksData(em);
    await em.nativeDelete(User, {});
    await app.close();
  });

  async function register(email: string): Promise<{ token: string; userId: string }> {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, username: email.split('@')[0], password: PASSWORD })
      .expect(201);
    return { token: res.body.accessToken, userId: res.body.user.id };
  }

  function balance(token: string) {
    return request(app.getHttpServer()).get('/credits').set('Authorization', `Bearer ${token}`);
  }

  function movementsOf(userId: string) {
    return em.fork().find(CreditMovement, { user: userId }, { orderBy: { createdAt: 'asc' } });
  }

  /** Un usuario anterior a la feature: existe sin saldo ni movimiento de entrega. */
  async function insertLegacyUser(email: string): Promise<string> {
    const id = randomUUID();
    await em.fork().insert(User, {
      id,
      email,
      username: email.split('@')[0],
      passwordHash: 'x',
      credits: 0,
      createdAt: new Date(),
    });
    return id;
  }

  describe('US1-1 / US1-2 — saldo inicial al registrarse', () => {
    it('la cuenta nueva arranca con la cantidad inicial y su movimiento de emisión', async () => {
      const { token, userId } = await register('ana@credits.test');

      const { body } = await balance(token).expect(200);
      expect(body).toEqual({ credits: INITIAL_CREDITS });
      expect(Number.isInteger(body.credits)).toBe(true);

      const movements = await movementsOf(userId);
      expect(movements).toHaveLength(1);
      expect(movements[0]).toMatchObject({
        type: CreditMovementType.INITIAL_GRANT,
        amount: INITIAL_CREDITS,
        balanceBefore: 0,
        balanceAfter: INITIAL_CREDITS,
      });
      expect(movements[0].correlationId).toBeTruthy();
    });
  });

  describe('US1-3 / US1-4 — regularización de usuarios anteriores (FR-002)', () => {
    it('entrega la cantidad una sola vez, aunque el proceso se repita', async () => {
      const legacyId = await insertLegacyUser('viejo@credits.test');
      await register('nuevo@credits.test');

      const first = await request(app.getHttpServer())
        .post('/credits/initial-grants')
        .set(ADMIN_KEY_HEADER, process.env.ADMIN_API_KEY!)
        .expect(200);
      expect(first.body).toEqual({ granted: 1, amount: INITIAL_CREDITS });

      const second = await request(app.getHttpServer())
        .post('/credits/initial-grants')
        .set(ADMIN_KEY_HEADER, process.env.ADMIN_API_KEY!)
        .expect(200);
      expect(second.body).toEqual({ granted: 0, amount: INITIAL_CREDITS });

      const legacy = await em.fork().findOneOrFail(User, { id: legacyId });
      expect(legacy.credits).toBe(INITIAL_CREDITS);
      expect(await movementsOf(legacyId)).toHaveLength(1);
    });

    it('también corre sola al arrancar la aplicación', async () => {
      const legacyId = await insertLegacyUser('arranque@credits.test');

      await app.get(CreditsService).onApplicationBootstrap();

      const legacy = await em.fork().findOneOrFail(User, { id: legacyId });
      expect(legacy.credits).toBe(INITIAL_CREDITS);
    });

    it('sin la clave administrativa responde 401 UNAUTHENTICATED', async () => {
      const res = await request(app.getHttpServer()).post('/credits/initial-grants').expect(401);
      expect(res.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    });
  });

  describe('US1-5 / US1-6 — alcance y sesión (FR-047)', () => {
    it('cada usuario ve solo su propio saldo', async () => {
      const ana = await register('ana2@credits.test');
      const beto = await register('beto@credits.test');
      await em.fork().nativeUpdate(User, { id: beto.userId }, { credits: 1500 });

      expect((await balance(ana.token).expect(200)).body).toEqual({ credits: INITIAL_CREDITS });
      expect((await balance(beto.token).expect(200)).body).toEqual({ credits: 1500 });
    });

    it('sin sesión responde 401 con el formato estándar (FR-049)', async () => {
      const res = await request(app.getHttpServer()).get('/credits').expect(401);
      expect(res.body).toEqual({
        code: 'UNAUTHENTICATED',
        message: expect.any(String),
        correlationId: expect.any(String),
      });
      expect(res.body.correlationId).toBe(res.headers['x-correlation-id']);
    });
  });

  describe('US1-7 — registros simultáneos', () => {
    it('cada cuenta termina con su cantidad inicial exacta', async () => {
      const emails = ['p1@credits.test', 'p2@credits.test', 'p3@credits.test', 'p4@credits.test'];
      const results = await Promise.all(emails.map((email) => register(email)));

      for (const { token, userId } of results) {
        expect((await balance(token).expect(200)).body).toEqual({ credits: INITIAL_CREDITS });
        expect(await movementsOf(userId)).toHaveLength(1);
      }
    });
  });

  describe('atomicidad del registro (research #3)', () => {
    it('si la entrega inicial falla, la cuenta no queda creada', async () => {
      const repository = app.get(CreditsRepository);
      const spy = jest
        .spyOn(repository, 'insertInitialGrant')
        .mockRejectedValueOnce(new Error('falla simulada'));

      try {
        await request(app.getHttpServer())
          .post('/auth/register')
          .send({ email: 'falla@credits.test', username: 'falla', password: PASSWORD })
          .expect(500);
      } finally {
        spy.mockRestore();
      }

      expect(await em.fork().count(User, { email: 'falla@credits.test' })).toBe(0);
    });
  });

  describe('FR-007 — conservación', () => {
    it('la suma de saldos es igual al total emitido', async () => {
      await register('c1@credits.test');
      await register('c2@credits.test');

      const [{ total }] = await em.execute<{ total: string }[]>('select coalesce(sum("credits"), 0) as total from "user"');
      const [{ emitted }] = await em.execute<{ emitted: string }[]>(
        `select coalesce(sum("amount"), 0) as emitted from "credit_movement" where "type" = 'entrega_inicial'`,
      );
      expect(Number(total)).toBe(Number(emitted));
    });
  });

  describe('FR-040 — los movimientos son inmutables', () => {
    it('la base rechaza modificarlos o borrarlos', async () => {
      await register('inmutable@credits.test');

      await expect(em.execute('update "credit_movement" set "amount" = "amount"')).rejects.toThrow(/inmutable/);
      await expect(em.execute('delete from "credit_movement"')).rejects.toThrow(/inmutable/);
    });
  });
});
