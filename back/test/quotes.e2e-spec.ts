import { randomUUID } from 'node:crypto';
import { jest } from '@jest/globals';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { League } from '../src/infrastructure/database/entities/league.entity';
import { Player, PlayerPosition } from '../src/infrastructure/database/entities/player.entity';
import { PlayerQuote } from '../src/infrastructure/database/entities/player-quote.entity';
import { PlayerSeasonStats } from '../src/infrastructure/database/entities/player-season-stats.entity';
import {
  QuoteRun,
  QuoteRunStatus,
  QuoteRunTrigger,
} from '../src/infrastructure/database/entities/quote-run.entity';
import { Team } from '../src/infrastructure/database/entities/team.entity';
import { User } from '../src/infrastructure/database/entities/user.entity';
import { ValuationStrategy } from '../src/infrastructure/database/entities/valuation-strategy.entity';
import { QuotesRepository } from '../src/modules/quotes/quotes.repository';
import { QUOTES_CRON_JOB_NAME, QuotesService } from '../src/modules/quotes/quotes.service';
import { cleanPacksData } from './support/clean-database';
import { type SeededQuote, seedQuote } from './support/quote-fixtures';

const SEASON = '2025-2026';
const ADMIN_KEY_HEADER = 'x-api-key';

interface Fixture {
  name: string;
  pos: PlayerPosition;
  league: 'A' | 'B';
  reputation?: number;
  /** null = jugador sin estadísticas de la temporada (FR-022). */
  stats: {
    mp: number | null;
    goals: number;
    assists: number;
    shots: string;
    kp: string;
    dr: string;
    tk: string;
    rating: string;
  } | null;
}

/**
 * Plantel elegido para los escenarios de aceptación:
 * - Delantero Top / Delantero Flojo: mismo puesto, números claramente distintos (US1-2).
 * - Medio Titular / Medio Suplente: idénticos salvo los partidos jugados (US1-3).
 * - Banco Total: lo peor en todo y casi sin jugar → score 0 y precio base (US1-8).
 * - Estrella / Revelación: idénticos salvo rating (Revelación mejor) y reputación (US3).
 * - Sin Stats: está en el catálogo pero no en la temporada → se omite (FR-022).
 */
const FIXTURES: Fixture[] = [
  { name: 'Delantero Top', pos: PlayerPosition.FW, league: 'A',
    stats: { mp: 30, goals: 25, assists: 10, shots: '4.50', kp: '2.50', dr: '2.00', tk: '0.50', rating: '7.90' } },
  { name: 'Delantero Flojo', pos: PlayerPosition.FW, league: 'A',
    stats: { mp: 30, goals: 3, assists: 1, shots: '1.20', kp: '0.60', dr: '0.50', tk: '0.30', rating: '6.60' } },
  { name: 'Medio Titular', pos: PlayerPosition.MF, league: 'A',
    stats: { mp: 30, goals: 6, assists: 8, shots: '1.50', kp: '2.80', dr: '1.60', tk: '1.80', rating: '7.30' } },
  { name: 'Medio Suplente', pos: PlayerPosition.MF, league: 'A',
    stats: { mp: 10, goals: 6, assists: 8, shots: '1.50', kp: '2.80', dr: '1.60', tk: '1.80', rating: '7.30' } },
  { name: 'Defensor', pos: PlayerPosition.DF, league: 'B',
    stats: { mp: 20, goals: 2, assists: 1, shots: '0.50', kp: '0.80', dr: '0.40', tk: '3.20', rating: '7.00' } },
  { name: 'Arquero', pos: PlayerPosition.GK, league: 'B',
    stats: { mp: 20, goals: 0, assists: 0, shots: '0.00', kp: '0.20', dr: '0.00', tk: '0.10', rating: '6.90' } },
  { name: 'Banco Total', pos: PlayerPosition.FW, league: 'B',
    stats: { mp: 1, goals: 0, assists: 0, shots: '0.00', kp: '0.00', dr: '0.00', tk: '0.00', rating: '5.00' } },
  { name: 'Estrella', pos: PlayerPosition.FW, league: 'B', reputation: 95,
    stats: { mp: 20, goals: 9, assists: 4, shots: '2.00', kp: '1.20', dr: '1.10', tk: '0.40', rating: '7.10' } },
  { name: 'Revelación', pos: PlayerPosition.FW, league: 'B', reputation: 40,
    stats: { mp: 20, goals: 9, assists: 4, shots: '2.00', kp: '1.20', dr: '1.10', tk: '0.40', rating: '7.60' } },
  { name: 'Sin Stats', pos: PlayerPosition.MF, league: 'A', stats: null },
];

const WITH_STATS = FIXTURES.filter((f) => f.stats !== null).length;

describe('Quotes (e2e)', () => {
  let app: INestApplication;
  let em: EntityManager;
  let token: string;
  let adminKey: string;
  let ids: Map<string, string>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mismo pipe que main.ts: sin esto, los 400 de validación no se reproducen acá.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    em = app.get(EntityManager);
    adminKey = process.env.ADMIN_API_KEY ?? '';
    await cleanDatabase();
    ids = await seed();
    token = await registerAndLogin();
  });

  afterAll(async () => {
    await cleanDatabase();
    await app.close();
  });

  async function cleanDatabase() {
    await cleanPacksData(em);
    await em.nativeDelete(PlayerQuote, {});
    await em.nativeDelete(QuoteRun, {});
    await em.nativeDelete(PlayerSeasonStats, {});
    await em.nativeDelete(Player, {});
    await em.nativeDelete(Team, {});
    await em.nativeDelete(League, {});
    await em.nativeDelete(User, {});
    await restoreActiveStrategy('performance');
  }

  /** En dos pasos: el índice parcial no admite dos activas ni siquiera por un instante. */
  async function restoreActiveStrategy(key: string) {
    await em.nativeUpdate(ValuationStrategy, {}, { active: false });
    await em.nativeUpdate(ValuationStrategy, { key }, { active: true });
  }

  async function seed(): Promise<Map<string, string>> {
    const leagues = {
      A: em.create(League, { name: 'E2E Quotes A', country: 'Testland' }),
      B: em.create(League, { name: 'E2E Quotes B', country: 'Testland' }),
    };
    const teams = {
      A: em.create(Team, { name: 'Quotes A FC', league: leagues.A }),
      B: em.create(Team, { name: 'Quotes B FC', league: leagues.B }),
    };
    const byName = new Map<string, string>();

    for (const fixture of FIXTURES) {
      const player = em.create(Player, {
        fullName: fixture.name,
        position: fixture.pos,
        baseValue: '0.00',
        worldReputation: fixture.reputation ?? null,
        team: teams[fixture.league],
        createdAt: new Date(),
      });
      em.persist(player);

      if (fixture.stats) {
        em.persist(
          em.create(PlayerSeasonStats, {
            player,
            season: SEASON,
            matchesPlayed: fixture.stats.mp,
            goals: fixture.stats.goals,
            assists: fixture.stats.assists,
            shotsPerGame: fixture.stats.shots,
            keyPasses: fixture.stats.kp,
            dribbles: fixture.stats.dr,
            tackles: fixture.stats.tk,
            rating: fixture.stats.rating,
            lastRefreshedAt: new Date(),
            createdAt: new Date(),
          }),
        );
      }
      byName.set(fixture.name, player.id);
    }

    em.persist([leagues.A, leagues.B, teams.A, teams.B]);
    await em.flush();
    em.clear();
    return byName;
  }

  async function registerAndLogin(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'e2e-quotes@test.local', username: 'e2equotes', password: 'Passw0rd!2026' })
      .expect(201);
    return res.body.accessToken;
  }

  function recalculate(body: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post('/quotes/recalculate')
      .set(ADMIN_KEY_HEADER, adminKey)
      .send(body);
  }

  function id(name: string): string {
    const value = ids.get(name);
    if (!value) throw new Error(`fixture ${name} inexistente`);
    return value;
  }

  /** Última cotización de un jugador, leída directo de la base. */
  async function latestQuote(name: string): Promise<PlayerQuote> {
    const [quote] = await em.fork().find(
      PlayerQuote,
      { player: id(name) },
      { orderBy: { calculatedAt: 'desc' }, limit: 1 },
    );
    return quote;
  }

  async function quoteCount(): Promise<number> {
    return em.fork().count(PlayerQuote, {});
  }

  // ---------------------------------------------------------------- US1

  describe('US1 — calcular el score y la cotización de cada jugador', () => {
    it('US1-1: cotiza a cada jugador con estadísticas y omite al resto', async () => {
      const res = await recalculate().expect(200);

      expect(res.body).toMatchObject({
        status: QuoteRunStatus.COMPLETED,
        trigger: QuoteRunTrigger.MANUAL,
        strategy: { key: 'performance', name: expect.any(String), version: 1 },
        season: SEASON,
        quotedCount: WITH_STATS,
        skippedCount: 1,
      });
      expect(res.body.correlationId).toEqual(expect.any(String));

      const quotes = await em.fork().find(PlayerQuote, { run: res.body.id });
      expect(quotes).toHaveLength(WITH_STATS);
      expect(quotes.some((q) => q.player.id === id('Sin Stats'))).toBe(false);

      // Cada precio es entero, sigue al score con los parámetros de la v1 y queda espejado en
      // player.base_value (research #10).
      const players = await em.fork().find(Player, { id: { $in: quotes.map((q) => q.player.id) } });
      const baseValueById = new Map(players.map((p) => [p.id, Number(p.baseValue)]));
      for (const quote of quotes) {
        expect(Number.isInteger(quote.price)).toBe(true);
        expect(quote.price).toBe(Math.max(10, Math.round(100 + Number(quote.score) * 900)));
        expect(baseValueById.get(quote.player.id)).toBe(quote.price);
        expect(quote.origin).toBe(QuoteRunTrigger.MANUAL);
      }

      const sinStats = await em.fork().findOneOrFail(Player, { id: id('Sin Stats') });
      expect(Number(sinStats.baseValue)).toBe(0);
    });

    it('US1-2: el delantero con mejores números puntúa y cotiza más alto', async () => {
      const top = await latestQuote('Delantero Top');
      const flojo = await latestQuote('Delantero Flojo');

      expect(Number(top.score)).toBeGreaterThan(Number(flojo.score));
      expect(top.price).toBeGreaterThan(flojo.price);
    });

    it('US1-3: con lo demás igual, el que menos jugó puntúa menos', async () => {
      const titular = await latestQuote('Medio Titular');
      const suplente = await latestQuote('Medio Suplente');

      expect(Number(suplente.score)).toBeLessThan(Number(titular.score));
    });

    it('US1-8: si las penalizaciones superan a los aportes, score 0 y precio base', async () => {
      const banco = await latestQuote('Banco Total');

      expect(Number(banco.rawScore)).toBeLessThan(0);
      expect(Number(banco.score)).toBe(0);
      expect(banco.price).toBe(100);
    });

    it('registra en cada cotización el perfil aplicado y su desglose completo', async () => {
      const defensor = await latestQuote('Defensor');
      const delantero = await latestQuote('Delantero Top');

      expect(defensor.positionProfile).toBe('DF');
      expect(delantero.positionProfile).toBe('GENERAL');
      expect(defensor.breakdown).toHaveLength(9);
      const sum = defensor.breakdown.reduce((acc, item) => acc + item.contribution, 0);
      expect(Math.abs(sum - Number(defensor.rawScore))).toBeLessThan(0.0001);
    });

    it('FR-028: una estrategia puntual queda registrada en la corrida', async () => {
      const res = await recalculate({ strategyKey: 'prestige' }).expect(200);
      expect(res.body.strategy).toEqual({ key: 'prestige', name: expect.any(String), version: 1 });

      const estrella = await latestQuote('Estrella');
      expect(estrella.breakdown.find((b) => b.metric === 'worldReputation')?.weight).toBe(0.6);
    });

    it('rechaza una strategyKey inexistente (404) o mal formada (400)', async () => {
      await recalculate({ strategyKey: 'no-existe' }).expect(404);
      await recalculate({ strategyKey: 'MAL FORMADA' }).expect(400);
    });

    it('US1-5: una corrida que falla no deja cotizaciones parciales y queda FAILED', async () => {
      const before = await quoteCount();
      const repository = app.get(QuotesRepository);
      const spy = jest
        .spyOn(repository, 'persistBatch')
        .mockRejectedValueOnce(new Error('falla forzada del lote'));

      try {
        await recalculate().expect(500);
      } finally {
        spy.mockRestore();
      }

      expect(await quoteCount()).toBe(before);
      const [failed] = await em
        .fork()
        .find(QuoteRun, { status: QuoteRunStatus.FAILED }, { orderBy: { startedAt: 'desc' } });
      expect(failed.failureReason).toBe('falla forzada del lote');
      expect(failed.finishedAt).toBeInstanceOf(Date);
    });

    it('FR-031: con una corrida en curso, el disparo se rechaza y queda como SKIPPED', async () => {
      const before = await quoteCount();
      const running = em.fork();
      await running.insert(QuoteRun, {
        id: randomUUID(),
        trigger: QuoteRunTrigger.AUTOMATIC,
        status: QuoteRunStatus.RUNNING,
        startedAt: new Date(),
        quotedCount: 0,
        skippedCount: 0,
        correlationId: 'e2e-running',
      });

      try {
        const res = await recalculate().expect(409);
        expect(res.body.code).toBe('RUN_IN_PROGRESS');
      } finally {
        await em.fork().nativeDelete(QuoteRun, { correlationId: 'e2e-running' });
      }

      expect(await quoteCount()).toBe(before);
      expect(await em.fork().count(QuoteRun, { status: QuoteRunStatus.SKIPPED })).toBe(1);
    });

    it('US1-7: sin estrategia activa responde 409 y no cotiza', async () => {
      const before = await quoteCount();
      await em.nativeUpdate(ValuationStrategy, {}, { active: false });

      try {
        const res = await recalculate().expect(409);
        expect(res.body.code).toBe('NO_ACTIVE_STRATEGY');
      } finally {
        await restoreActiveStrategy('performance');
      }

      expect(await quoteCount()).toBe(before);
    });

    it('US1-6: sin clave administrativa —aun con sesión de usuario— responde 401', async () => {
      const before = await quoteCount();

      await request(app.getHttpServer()).post('/quotes/recalculate').expect(401);
      await request(app.getHttpServer())
        .post('/quotes/recalculate')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);

      expect(await quoteCount()).toBe(before);
    });
  });

  // ---------------------------------------------------------------- US2

  describe('US2 — consultar el score, la cotización y su historial', () => {
    function get(path: string) {
      return request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);
    }

    function current(name: string) {
      return get(`/quotes/players/${id(name)}/current`);
    }

    function history(name: string, query = '') {
      return get(`/quotes/players/${id(name)}/history${query}`);
    }

    it('US1-4: un jugador nunca cotizado informa «sin cotización», sin precio por defecto', async () => {
      const res = await current('Sin Stats').expect(200);
      expect(res.body).toEqual({ playerId: id('Sin Stats'), quoted: false, quote: null });
    });

    it('US2-1: devuelve precio, score, fecha, estrategia, versión y variación', async () => {
      const res = await current('Delantero Top').expect(200);
      const latest = await latestQuote('Delantero Top');
      const [, previous] = await em.fork().find(
        PlayerQuote,
        { player: id('Delantero Top') },
        { orderBy: { calculatedAt: 'desc' }, limit: 2 },
      );

      expect(res.body.quoted).toBe(true);
      expect(res.body.quote).toMatchObject({
        price: latest.price,
        score: Number(latest.score),
        origin: QuoteRunTrigger.MANUAL,
        season: SEASON,
        strategy: { key: expect.any(String), name: expect.any(String), version: 1 },
        previousPrice: previous.price,
        changePct: Number((((latest.price - previous.price) / previous.price) * 100).toFixed(1)),
      });
      expect(new Date(res.body.quote.calculatedAt).getTime()).toBe(latest.calculatedAt.getTime());
    });

    it('US2-2: el desglose trae valor, normalizado, peso y aporte, y suma el score', async () => {
      const { body } = await current('Medio Titular').expect(200);

      expect(body.quote.breakdown).toHaveLength(9);
      for (const item of body.quote.breakdown) {
        expect(item).toEqual({
          metric: expect.any(String),
          raw: expect.anything(),
          normalized: expect.any(Number),
          weight: expect.any(Number),
          contribution: expect.any(Number),
        });
      }
      const sum = body.quote.breakdown.reduce(
        (acc: number, item: { contribution: number }) => acc + item.contribution,
        0,
      );
      expect(Math.abs(sum - body.quote.rawScore)).toBeLessThan(0.0001);
    });

    it('US2-3: tras 3 recálculos el historial suma 3 registros en orden cronológico', async () => {
      const before = (await history('Defensor').expect(200)).body.meta.total;

      for (let i = 0; i < 3; i++) await recalculate().expect(200);

      const { body } = await history('Defensor', '?limit=200').expect(200);
      expect(body.meta.total).toBe(before + 3);
      expect(body.data).toHaveLength(before + 3);

      const times = body.data.map((q: { calculatedAt: string }) => new Date(q.calculatedAt).getTime());
      expect([...times].sort((a, b) => a - b)).toEqual(times);

      const last = body.data[body.data.length - 1];
      const now = (await current('Defensor').expect(200)).body.quote;
      expect(last.price).toBe(now.price);
      expect(last.calculatedAt).toBe(now.calculatedAt);
    });

    it('10 FR-023: cada cotización del historial y la actual informan la estrategia con su nombre legible', async () => {
      await recalculate().expect(200);

      const { body } = await history('Defensor', '?limit=200').expect(200);
      for (const quote of body.data) {
        expect(quote.strategy).toEqual({ key: expect.any(String), name: expect.any(String), version: expect.any(Number) });
        expect(quote.strategy.name.length).toBeGreaterThan(0);
      }
      const now = (await current('Defensor').expect(200)).body.quote;
      expect(now.strategy.name).toBe(body.data[body.data.length - 1].strategy.name);
    });

    it('US2-4: acota por cantidad y por rango de fechas, con total para paginar', async () => {
      const all = (await history('Defensor', '?limit=200').expect(200)).body;

      const page = (await history('Defensor', '?limit=2&page=1').expect(200)).body;
      expect(page.data).toHaveLength(2);
      expect(page.meta).toEqual({
        total: all.meta.total,
        page: 1,
        limit: 2,
        totalPages: Math.ceil(all.meta.total / 2),
      });

      const lastPage = (
        await history('Defensor', `?limit=2&page=${page.meta.totalPages}`).expect(200)
      ).body;
      expect(lastPage.data[lastPage.data.length - 1].calculatedAt).toBe(
        all.data[all.data.length - 1].calculatedAt,
      );

      const from = all.data[all.data.length - 2].calculatedAt;
      const ranged = (
        await history('Defensor', `?from=${encodeURIComponent(from)}`).expect(200)
      ).body;
      expect(ranged.meta.total).toBe(2);

      const to = all.data[0].calculatedAt;
      const upTo = (await history('Defensor', `?to=${encodeURIComponent(to)}`).expect(200)).body;
      expect(upTo.meta.total).toBe(1);
    });

    it('US2-5: un jugador inexistente responde 404, no un precio por defecto', async () => {
      await get(`/quotes/players/${randomUUID()}/current`).expect(404);
      await get(`/quotes/players/${randomUUID()}/history`).expect(404);
      await get('/quotes/players/no-es-un-uuid/current').expect(400);
    });

    it('US2-6: rechaza parámetros inválidos del historial', async () => {
      await history('Defensor', '?from=ayer').expect(400);
      await history('Defensor', '?from=2026-10-10T00:00:00Z&to=2026-10-01T00:00:00Z').expect(400);
      await history('Defensor', '?limit=500').expect(400);
      await history('Defensor', '?page=0').expect(400);
    });

    it('US2-7: sin sesión iniciada la consulta se rechaza', async () => {
      await request(app.getHttpServer()).get(`/quotes/players/${id('Defensor')}/current`).expect(401);
      await request(app.getHttpServer()).get(`/quotes/players/${id('Defensor')}/history`).expect(401);
    });

    it('US2-8: la cotización actual refleja el lote nuevo sin esperar a la caché', async () => {
      const first = (await current('Estrella').expect(200)).body.quote;
      // Se lee dos veces para asegurar que quedó en caché antes del recálculo.
      await current('Estrella').expect(200);

      await recalculate({ strategyKey: 'prestige' }).expect(200);
      const second = (await current('Estrella').expect(200)).body.quote;
      expect(second.strategy.key).toBe('prestige');
      expect(new Date(second.calculatedAt).getTime()).toBeGreaterThan(
        new Date(first.calculatedAt).getTime(),
      );

      await recalculate().expect(200);
      const third = (await current('Estrella').expect(200)).body.quote;
      expect(third.strategy.key).toBe('performance');
    });
  });

  // ---------------------------------------------------------------- US3

  describe('US3 — valuar por calidad general con la reputación mundial', () => {
    function putReputation(playerId: string, worldReputation: unknown) {
      return request(app.getHttpServer())
        .put(`/quotes/reputation/${playerId}`)
        .set(ADMIN_KEY_HEADER, adminKey)
        .send({ worldReputation });
    }

    function putBulk(items: unknown[]) {
      return request(app.getHttpServer())
        .put('/quotes/reputation')
        .set(ADMIN_KEY_HEADER, adminKey)
        .send({ items });
    }

    async function reputationOf(name: string): Promise<number | null | undefined> {
      return (await em.fork().findOneOrFail(Player, { id: id(name) })).worldReputation;
    }

    it('US3-1: con prestigio, la figura de reputación 95 cotiza sobre la de 40 con mejor rating', async () => {
      await recalculate({ strategyKey: 'prestige' }).expect(200);

      const estrella = await latestQuote('Estrella');
      const revelacion = await latestQuote('Revelación');
      expect(estrella.price).toBeGreaterThan(revelacion.price);
    });

    it('US3-2: con performance el orden se invierte (SC-004)', async () => {
      await recalculate({ strategyKey: 'performance' }).expect(200);

      const estrella = await latestQuote('Estrella');
      const revelacion = await latestQuote('Revelación');
      expect(revelacion.price).toBeGreaterThan(estrella.price);
    });

    it('US3-3: sin reputación cargada usa la de por defecto y deja constancia', async () => {
      await recalculate({ strategyKey: 'prestige' }).expect(200);

      const defensor = await latestQuote('Defensor');
      const estrella = await latestQuote('Estrella');
      expect(defensor.usedDefaultReputation).toBe(true);
      expect(defensor.breakdown.find((b) => b.metric === 'worldReputation')?.raw).toBe(20);
      expect(estrella.usedDefaultReputation).toBe(false);
    });

    it('US3-4: rechaza reputaciones fuera de 0–100 o no numéricas', async () => {
      for (const invalid of [150, -1, 'alta', 7.5]) {
        await putReputation(id('Arquero'), invalid).expect(400);
      }
      expect(await reputationOf('Arquero')).toBeNull();
    });

    it('carga y borra la reputación de un jugador individual', async () => {
      const res = await putReputation(id('Arquero'), 55).expect(200);
      expect(res.body).toEqual({ playerId: id('Arquero'), worldReputation: 55 });
      expect(await reputationOf('Arquero')).toBe(55);

      await putReputation(id('Arquero'), null).expect(200);
      expect(await reputationOf('Arquero')).toBeNull();
    });

    it('un jugador inexistente responde 404', async () => {
      await putReputation(randomUUID(), 50).expect(404);
    });

    it('US3-5: el lote informa actualizados y no encontrados sin abortar al resto', async () => {
      const missing = randomUUID();
      const res = await putBulk([
        { playerId: id('Defensor'), worldReputation: 70 },
        { playerId: missing, worldReputation: 80 },
      ]).expect(200);

      expect(res.body).toEqual({ updated: [id('Defensor')], notFound: [missing] });
      expect(await reputationOf('Defensor')).toBe(70);
    });

    it('US3-5: un ítem con formato inválido rechaza el lote completo sin efectos', async () => {
      await putBulk([
        { playerId: id('Defensor'), worldReputation: 10 },
        { playerId: id('Arquero'), worldReputation: 500 },
      ]).expect(400);
      await putBulk([]).expect(400);
      await putBulk([{ playerId: 'no-es-uuid', worldReputation: 10 }]).expect(400);

      expect(await reputationOf('Defensor')).toBe(70);
      expect(await reputationOf('Arquero')).toBeNull();
    });

    it('US3-6: cambiar la reputación no altera la cotización hasta el próximo recálculo', async () => {
      const get = () =>
        request(app.getHttpServer())
          .get(`/quotes/players/${id('Revelación')}/current`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

      const before = (await get()).body.quote;
      await putReputation(id('Revelación'), 99).expect(200);
      const after = (await get()).body.quote;

      expect(after.price).toBe(before.price);
      expect(after.calculatedAt).toBe(before.calculatedAt);

      await putReputation(id('Revelación'), 40).expect(200);
    });

    it('US3-7: sin clave administrativa —aun con sesión— la carga se rechaza', async () => {
      await request(app.getHttpServer())
        .put(`/quotes/reputation/${id('Arquero')}`)
        .send({ worldReputation: 50 })
        .expect(401);
      await request(app.getHttpServer())
        .put('/quotes/reputation')
        .set('Authorization', `Bearer ${token}`)
        .send({ items: [{ playerId: id('Arquero'), worldReputation: 50 }] })
        .expect(401);

      expect(await reputationOf('Arquero')).toBeNull();
    });
  });

  // ---------------------------------------------------------------- US5

  describe('US5 — recálculo automático semanal', () => {
    async function insertRunning(correlationId: string) {
      await em.fork().insert(QuoteRun, {
        id: randomUUID(),
        trigger: QuoteRunTrigger.MANUAL,
        status: QuoteRunStatus.RUNNING,
        startedAt: new Date(),
        quotedCount: 0,
        skippedCount: 0,
        correlationId,
      });
    }

    function runs(query = '') {
      return request(app.getHttpServer()).get(`/quotes/runs${query}`).set(ADMIN_KEY_HEADER, adminKey);
    }

    it('con QUOTES_SCHEDULER_ENABLED=false no registra el job', () => {
      expect(app.get(SchedulerRegistry).getCronJobs().has(QUOTES_CRON_JOB_NAME)).toBe(false);
    });

    it('FR-027: registra el job con la expresión y la zona configuradas', () => {
      const registry = app.get(SchedulerRegistry);
      const previous = { ...process.env };
      process.env.QUOTES_SCHEDULER_ENABLED = 'true';
      process.env.QUOTES_RECALC_CRON = '15 4 * * 2';
      process.env.QUOTES_RECALC_TIMEZONE = 'America/Argentina/Buenos_Aires';

      try {
        app.get(QuotesService).onModuleInit();
        const job = registry.getCronJob(QUOTES_CRON_JOB_NAME);
        expect(job.cronTime.source).toBe('15 4 * * 2');
        expect(job.cronTime.timeZone).toBe('America/Argentina/Buenos_Aires');
        expect(job.isActive).toBe(true);
      } finally {
        registry.deleteCronJob(QUOTES_CRON_JOB_NAME);
        process.env = previous;
      }
    });

    it('una expresión inválida no registra el job ni tira la aplicación', () => {
      const previous = { ...process.env };
      process.env.QUOTES_SCHEDULER_ENABLED = 'true';
      process.env.QUOTES_RECALC_CRON = 'cada lunes';

      try {
        expect(() => app.get(QuotesService).onModuleInit()).not.toThrow();
        expect(app.get(SchedulerRegistry).getCronJobs().has(QUOTES_CRON_JOB_NAME)).toBe(false);
      } finally {
        process.env = previous;
      }
    });

    it('US5-1 / US5-5: la corrida programada cotiza como AUTOMATIC con su propio correlationId', async () => {
      await app.get(QuotesService).runScheduled();

      const [run] = await em
        .fork()
        .find(QuoteRun, { trigger: QuoteRunTrigger.AUTOMATIC }, { orderBy: { startedAt: 'desc' }, limit: 1 });
      expect(run.status).toBe(QuoteRunStatus.COMPLETED);
      expect(run.correlationId).toMatch(/^[0-9a-f-]{36}$/);

      const quotes = await em.fork().find(PlayerQuote, { run: run.id });
      expect(quotes).toHaveLength(WITH_STATS);
      expect(quotes.every((q) => q.origin === QuoteRunTrigger.AUTOMATIC)).toBe(true);
    });

    it('US5-2: con una corrida en curso no duplica cotizaciones y deja constancia', async () => {
      const before = await quoteCount();
      const skippedBefore = await em.fork().count(QuoteRun, { status: QuoteRunStatus.SKIPPED });
      await insertRunning('e2e-us5-running');

      try {
        await expect(app.get(QuotesService).runScheduled()).resolves.toBeUndefined();
      } finally {
        await em.fork().nativeDelete(QuoteRun, { correlationId: 'e2e-us5-running' });
      }

      expect(await quoteCount()).toBe(before);
      expect(await em.fork().count(QuoteRun, { status: QuoteRunStatus.SKIPPED })).toBe(skippedBefore + 1);
    });

    it('US5-4: una corrida automática que falla queda FAILED sin tirar el proceso', async () => {
      const before = await quoteCount();
      const spy = jest
        .spyOn(app.get(QuotesRepository), 'persistBatch')
        .mockRejectedValueOnce(new Error('falla programada'));

      try {
        await expect(app.get(QuotesService).runScheduled()).resolves.toBeUndefined();
      } finally {
        spy.mockRestore();
      }

      expect(await quoteCount()).toBe(before);
      const [failed] = await em
        .fork()
        .find(QuoteRun, { trigger: QuoteRunTrigger.AUTOMATIC }, { orderBy: { startedAt: 'desc' }, limit: 1 });
      expect(failed.status).toBe(QuoteRunStatus.FAILED);
      expect(failed.failureReason).toBe('falla programada');
    });

    it('US5-3: al arrancar, una corrida que quedó colgada se cierra como interrumpida', async () => {
      await insertRunning('e2e-us5-orphan');

      await app.get(QuotesService).recoverInterruptedRuns();

      const orphan = await em.fork().findOneOrFail(QuoteRun, { correlationId: 'e2e-us5-orphan' });
      expect(orphan.status).toBe(QuoteRunStatus.FAILED);
      expect(orphan.failureReason).toBe('interrupted');
      expect(orphan.finishedAt).toBeInstanceOf(Date);
    });

    it('FR-029: lista las corridas de la más reciente a la más vieja', async () => {
      const total = await em.fork().count(QuoteRun, {});
      const { body } = await runs('?limit=5').expect(200);

      expect(body.meta).toEqual({ total, page: 1, limit: 5, totalPages: Math.ceil(total / 5) });
      expect(body.data).toHaveLength(5);
      const starts = body.data.map((r: { startedAt: string }) => new Date(r.startedAt).getTime());
      expect([...starts].sort((a, b) => b - a)).toEqual(starts);

      const completed = body.data.find((r: { status: string }) => r.status === 'COMPLETED');
      expect(completed.strategy).toEqual({ key: expect.any(String), name: expect.any(String), version: expect.any(Number) });
    });

    it('la lista de corridas exige la clave administrativa y valida la paginación', async () => {
      await request(app.getHttpServer()).get('/quotes/runs').expect(401);
      await request(app.getHttpServer())
        .get('/quotes/runs')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
      await runs('?limit=101').expect(400);
    });
  });

  // ------------------------------------------- 10-historial-operaciones — cotización en un instante

  describe('US3 (10) — GET /quotes/players/:id/at', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
    let seeded: { playerId: string; neverId: string; q1: SeededQuote; q2: SeededQuote; q3: SeededQuote };

    beforeAll(async () => {
      const team = await em.fork().findOneOrFail(Team, { name: 'Quotes A FC' });
      const fork = em.fork();
      const player = fork.create(Player, {
        fullName: 'Jugador En Fecha',
        position: PlayerPosition.MF,
        baseValue: '0.00',
        team,
        createdAt: new Date(),
      });
      const never = fork.create(Player, {
        fullName: 'Jugador Nunca Cotizado',
        position: PlayerPosition.MF,
        baseValue: '0.00',
        team,
        createdAt: new Date(),
      });
      fork.persist([player, never]);
      await fork.flush();

      const q1 = await seedQuote(em, player.id, { price: 100, calculatedAt: daysAgo(30), strategyKey: 'e2e-a', strategyName: 'E2E Alfa', version: 1 });
      const q2 = await seedQuote(em, player.id, { price: 200, calculatedAt: daysAgo(20), strategyKey: 'e2e-a', strategyName: 'E2E Alfa', version: 2 });
      const q3 = await seedQuote(em, player.id, { price: 300, calculatedAt: daysAgo(10), strategyKey: 'e2e-b', strategyName: 'E2E Beta', version: 1 });
      seeded = { playerId: player.id, neverId: never.id, q1, q2, q3 };
    });

    afterAll(async () => {
      const fork = em.fork();
      await fork.execute(`delete from "player_quote" where "player_id" in (?, ?)`, [seeded.playerId, seeded.neverId]);
      await fork.execute(`delete from "quote_run" where "correlation_id" = 'e2e-seed-quote'`);
      await fork.execute(
        `delete from "valuation_strategy_version" where "strategy_id" in (select "id" from "valuation_strategy" where "key" like 'e2e-%')`,
      );
      await fork.execute(`delete from "valuation_strategy" where "key" like 'e2e-%'`);
      await fork.execute(`delete from "player" where "id" in (?, ?)`, [seeded.playerId, seeded.neverId]);
    });

    function at(playerId: string, instant: Date | string | null) {
      const query = instant === null ? '' : `?at=${encodeURIComponent(instant instanceof Date ? instant.toISOString() : instant)}`;
      return request(app.getHttpServer())
        .get(`/quotes/players/${playerId}/at${query}`)
        .set('Authorization', `Bearer ${token}`);
    }

    it('un instante entre dos cotizaciones devuelve la anterior, con su estrategia y versión (FR-028, FR-029)', async () => {
      const { body } = await at(seeded.playerId, daysAgo(15)).expect(200);

      expect(body).toMatchObject({ playerId: seeded.playerId, quoted: true, firstQuotedAt: null });
      expect(body.quote).toMatchObject({
        price: 200,
        calculatedAt: seeded.q2.calculatedAt.toISOString(),
        strategy: { key: 'e2e-a', name: 'E2E Alfa', version: 2 },
      });
    });

    it('un instante exactamente igual a una cotización devuelve esa misma: es inclusivo', async () => {
      const { body } = await at(seeded.playerId, seeded.q3.calculatedAt).expect(200);
      expect(body.quote).toMatchObject({ price: 300, strategy: { key: 'e2e-b', name: 'E2E Beta', version: 1 } });
    });

    it('un instante posterior a la última devuelve la última', async () => {
      const { body } = await at(seeded.playerId, new Date()).expect(200);
      expect(body.quote.price).toBe(300);
    });

    it('un instante anterior a la primera responde quoted=false con la fecha de la primera, sin precio (FR-030)', async () => {
      const { body } = await at(seeded.playerId, daysAgo(40)).expect(200);
      expect(body).toMatchObject({ quoted: false, quote: null, firstQuotedAt: seeded.q1.calculatedAt.toISOString() });
    });

    it('un jugador nunca cotizado responde quoted=false y firstQuotedAt nulo; no es un error', async () => {
      const { body } = await at(seeded.neverId, new Date()).expect(200);
      expect(body).toMatchObject({ quoted: false, quote: null, firstQuotedAt: null });
    });

    it('una cotización posterior, de otra estrategia, no cambia el resultado de un instante anterior (FR-017)', async () => {
      const before = (await at(seeded.playerId, daysAgo(15)).expect(200)).body;
      await seedQuote(em, seeded.playerId, { price: 999, calculatedAt: daysAgo(1), strategyKey: 'e2e-c', strategyName: 'E2E Gamma', version: 1 });

      const after = (await at(seeded.playerId, daysAgo(15)).expect(200)).body;
      expect(after.quote).toEqual(before.quote);
      expect((await at(seeded.playerId, new Date()).expect(200)).body.quote.strategy).toEqual({
        key: 'e2e-c',
        name: 'E2E Gamma',
        version: 1,
      });
    });

    it('acepta el final de «hoy» de cualquier zona horaria, pero rechaza una fecha futura (FR-031)', async () => {
      await at(seeded.playerId, new Date(Date.now() + 12 * 60 * 60 * 1000)).expect(200);

      const future = await at(seeded.playerId, new Date(Date.now() + 3 * DAY)).expect(422);
      expect(future.body).toMatchObject({ code: 'VALIDATION_ERROR', correlationId: expect.any(String) });
    });

    it('rechaza un instante ausente o mal formado con VALIDATION_ERROR', async () => {
      for (const instant of [null, 'ayer', '2026-13-45', '']) {
        const res = await at(seeded.playerId, instant).expect(422);
        expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', message: expect.any(String), correlationId: expect.any(String) });
      }
    });

    it('un playerId que no es un UUID es VALIDATION_ERROR, y uno inexistente es PLAYER_NOT_FOUND', async () => {
      const malformed = await at('no-es-un-uuid', new Date()).expect(422);
      expect(malformed.body.code).toBe('VALIDATION_ERROR');

      const missing = await at(randomUUID(), new Date()).expect(404);
      expect(missing.body).toMatchObject({ code: 'PLAYER_NOT_FOUND', correlationId: expect.any(String) });
    });

    it('exige sesión de usuario', async () => {
      const res = await request(app.getHttpServer())
        .get(`/quotes/players/${seeded.playerId}/at?at=${encodeURIComponent(new Date().toISOString())}`)
        .expect(401);
      expect(res.body).toMatchObject({ code: 'UNAUTHENTICATED', correlationId: expect.any(String) });
    });

    it('es de solo lectura: no cambia la cantidad de cotizaciones (FR-037)', async () => {
      const before = await quoteCount();
      await at(seeded.playerId, daysAgo(15)).expect(200);
      await at(seeded.playerId, daysAgo(40)).expect(200);
      expect(await quoteCount()).toBe(before);
    });

    it('el historial de 07 conserva su formato de error: 400 con el cuerpo por defecto de Nest', async () => {
      const res = await request(app.getHttpServer())
        .get(`/quotes/players/${seeded.playerId}/history?from=ayer`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
      expect(res.body.code).toBeUndefined();
    });
  });
});
