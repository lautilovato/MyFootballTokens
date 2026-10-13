import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { League } from '../src/infrastructure/database/entities/league.entity';
import { Player, PlayerPosition } from '../src/infrastructure/database/entities/player.entity';
import { PlayerQuote } from '../src/infrastructure/database/entities/player-quote.entity';
import { PlayerSeasonStats } from '../src/infrastructure/database/entities/player-season-stats.entity';
import { QuoteRun } from '../src/infrastructure/database/entities/quote-run.entity';
import { Team } from '../src/infrastructure/database/entities/team.entity';
import { User } from '../src/infrastructure/database/entities/user.entity';
import { ValuationStrategy } from '../src/infrastructure/database/entities/valuation-strategy.entity';
import { ValuationStrategyVersion } from '../src/infrastructure/database/entities/valuation-strategy-version.entity';

const SEASON = '2025-2026';
const ADMIN_KEY_HEADER = 'x-api-key';

/** Configuración de performance v1 tal como la siembra la migración. */
const PERFORMANCE_V1 = {
  weights: {
    general: {
      goals: 0.25, assists: 0.15, shots: 0.1, keyPasses: 0.1, dribbles: 0.1, tackles: 0.1,
      rating: 0.2, absence: -0.1,
    },
    byPosition: {
      MF: {
        goals: 0.1, assists: 0.2, shots: 0.05, keyPasses: 0.2, dribbles: 0.15, tackles: 0.1,
        rating: 0.2, absence: -0.1,
      },
      DF: {
        goals: 0.05, assists: 0.05, keyPasses: 0.1, dribbles: 0.05, tackles: 0.4, rating: 0.35,
        absence: -0.1,
      },
      GK: { keyPasses: 0.05, tackles: 0.05, rating: 0.9, absence: -0.1 },
    },
  },
  baseValue: 100,
  scaleFactor: 900,
  minPrice: 10,
  defaultReputation: 20,
};

describe('Valuation strategies (e2e)', () => {
  let app: INestApplication;
  let em: EntityManager;
  let token: string;
  let adminKey: string;
  const playerIds = new Map<string, string>();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    em = app.get(EntityManager);
    adminKey = process.env.ADMIN_API_KEY ?? '';
    await cleanDatabase();
    await seed();
    token = await registerAndLogin();
  });

  afterAll(async () => {
    await cleanDatabase();
    await app.close();
  });

  /** Deja las estrategias como las sembró la migración: solo v1 y performance activa. */
  async function cleanDatabase() {
    await em.nativeDelete(PlayerQuote, {});
    await em.nativeDelete(QuoteRun, {});
    await em.nativeDelete(ValuationStrategyVersion, { version: { $gt: 1 } });
    await em.nativeUpdate(ValuationStrategy, {}, { currentVersion: 1, active: false });
    await em.nativeUpdate(ValuationStrategy, { key: 'performance' }, { active: true });
    await em.nativeDelete(PlayerSeasonStats, {});
    await em.nativeDelete(Player, {});
    await em.nativeDelete(Team, {});
    await em.nativeDelete(League, {});
    await em.nativeDelete(User, {});
  }

  async function seed() {
    const league = em.create(League, { name: 'E2E Strategies', country: 'Testland' });
    const team = em.create(Team, { name: 'Strategies FC', league });
    const fixtures = [
      { name: 'Delantero', pos: PlayerPosition.FW, goals: 20, tk: '0.40', rating: '7.60' },
      { name: 'Defensor', pos: PlayerPosition.DF, goals: 2, tk: '3.10', rating: '7.10' },
      { name: 'Volante', pos: PlayerPosition.MF, goals: 6, tk: '1.80', rating: '6.90' },
    ];

    for (const f of fixtures) {
      const player = em.create(Player, {
        fullName: f.name, position: f.pos, baseValue: '0.00', team, createdAt: new Date(),
      });
      em.persist(player);
      em.persist(
        em.create(PlayerSeasonStats, {
          player, season: SEASON, matchesPlayed: 25, goals: f.goals, assists: 3,
          shotsPerGame: '1.50', keyPasses: '1.00', dribbles: '0.90', tackles: f.tk,
          rating: f.rating, lastRefreshedAt: new Date(), createdAt: new Date(),
        }),
      );
      playerIds.set(f.name, player.id);
    }

    em.persist([league, team]);
    await em.flush();
    em.clear();
  }

  async function registerAndLogin(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'e2e-strategies@test.local', username: 'e2estrategies', password: 'Passw0rd!2026' })
      .expect(201);
    return res.body.accessToken;
  }

  function get(path: string) {
    return request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);
  }

  function admin(method: 'post', path: string, body?: unknown) {
    const req = request(app.getHttpServer())[method](path).set(ADMIN_KEY_HEADER, adminKey);
    return body === undefined ? req : req.send(body as object);
  }

  async function latestQuote(name: string): Promise<PlayerQuote> {
    const [quote] = await em.fork().find(
      PlayerQuote,
      { player: playerIds.get(name) },
      { orderBy: { calculatedAt: 'desc' }, limit: 1, populate: ['strategyVersion.strategy'] },
    );
    return quote;
  }

  it('US4-1: lista performance y prestige con versión vigente, configuración y estado', async () => {
    const { body } = await get('/valuation-strategies').expect(200);

    expect(body.map((s: { key: string }) => s.key).sort()).toEqual(['performance', 'prestige']);
    const performance = body.find((s: { key: string }) => s.key === 'performance');
    const prestige = body.find((s: { key: string }) => s.key === 'prestige');

    expect(performance.active).toBe(true);
    expect(prestige.active).toBe(false);
    expect(performance.currentVersion).toMatchObject({ version: 1, ...PERFORMANCE_V1 });
    expect(prestige.currentVersion.weights.general.worldReputation).toBe(0.6);
  });

  it('US4-3 (preparación): cotiza con performance v1', async () => {
    await admin('post', '/quotes/recalculate').expect(200);
    const quote = await latestQuote('Delantero');
    expect(quote.strategyVersion.version).toBe(1);
  });

  it('US4-2: guardar una configuración crea la versión siguiente y deja la previa intacta', async () => {
    const v2 = {
      ...PERFORMANCE_V1,
      weights: {
        ...PERFORMANCE_V1.weights,
        general: { ...PERFORMANCE_V1.weights.general, goals: 0.3 },
      },
    };

    const res = await admin('post', '/valuation-strategies/performance/versions', v2).expect(201);
    expect(res.body).toMatchObject({ version: 2 });
    expect(res.body.weights.general.goals).toBe(0.3);

    const versions = (await get('/valuation-strategies/performance/versions').expect(200)).body;
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[1]).toMatchObject({ version: 1, ...PERFORMANCE_V1 });
  });

  it('US4-3: las cotizaciones calculadas con v1 siguen citando v1 y sus pesos', async () => {
    const quote = await latestQuote('Delantero');
    expect(quote.strategyVersion.version).toBe(1);
    expect(quote.breakdown.find((b) => b.metric === 'goals')?.weight).toBe(0.25);

    const { body } = await get(`/quotes/players/${playerIds.get('Delantero')}/current`).expect(200);
    expect(body.quote.strategy).toEqual({ key: 'performance', version: 1 });
  });

  it('las cotizaciones nuevas usan la versión vigente', async () => {
    await admin('post', '/quotes/recalculate').expect(200);
    const quote = await latestQuote('Delantero');
    expect(quote.strategyVersion.version).toBe(2);
    expect(quote.breakdown.find((b) => b.metric === 'goals')?.weight).toBe(0.3);
  });

  it('US4-4: rechaza configuraciones inválidas sin crear versión', async () => {
    const invalid = [
      // métrica inexistente
      { ...PERFORMANCE_V1, weights: { general: { ...PERFORMANCE_V1.weights.general, cards: -0.1 } } },
      // peso fuera de límites
      { ...PERFORMANCE_V1, weights: { general: { rating: 1.5 } } },
      // ningún peso positivo
      { ...PERFORMANCE_V1, weights: { general: { absence: -0.1 } } },
      // perfil por posición sin positivos
      { ...PERFORMANCE_V1, weights: { general: { rating: 1 }, byPosition: { DF: { absence: -0.1 } } } },
      // factor de escala no positivo
      { ...PERFORMANCE_V1, scaleFactor: 0 },
      // falta la configuración general
      { ...PERFORMANCE_V1, weights: {} },
    ];

    for (const body of invalid) {
      await admin('post', '/valuation-strategies/performance/versions', body).expect(400);
    }

    const versions = (await get('/valuation-strategies/performance/versions').expect(200)).body;
    expect(versions).toHaveLength(2);
  });

  it('US4-5: activar una estrategia desactiva la otra; nunca hay dos activas', async () => {
    const res = await admin('post', '/valuation-strategies/prestige/activate').expect(200);
    expect(res.body).toMatchObject({ key: 'prestige', active: true });

    const list = (await get('/valuation-strategies').expect(200)).body;
    expect(list.filter((s: { active: boolean }) => s.active).map((s: { key: string }) => s.key)).toEqual([
      'prestige',
    ]);
    expect(await em.fork().count(ValuationStrategy, { active: true })).toBe(1);
  });

  it('US4-6: activar otra estrategia no cambia las cotizaciones vigentes', async () => {
    const quote = await latestQuote('Delantero');
    expect(quote.strategyVersion.strategy.key).toBe('performance');

    await admin('post', '/quotes/recalculate').expect(200);
    const next = await latestQuote('Delantero');
    expect(next.strategyVersion.strategy.key).toBe('prestige');

    await admin('post', '/valuation-strategies/performance/activate').expect(200);
  });

  it('US4-7: los defensores usan su perfil propio y los delanteros el general', async () => {
    await admin('post', '/quotes/recalculate').expect(200);

    const defensor = await latestQuote('Defensor');
    const delantero = await latestQuote('Delantero');
    expect(defensor.positionProfile).toBe('DF');
    expect(defensor.breakdown.find((b) => b.metric === 'tackles')?.weight).toBe(0.4);
    expect(delantero.positionProfile).toBe('GENERAL');
  });

  it('una estrategia inexistente responde 404', async () => {
    await get('/valuation-strategies/no-existe/versions').expect(404);
    await admin('post', '/valuation-strategies/no-existe/versions', PERFORMANCE_V1).expect(404);
    await admin('post', '/valuation-strategies/no-existe/activate').expect(404);
  });

  it('US4-8: escribir exige la clave administrativa y leer exige sesión', async () => {
    const server = app.getHttpServer();

    await request(server)
      .post('/valuation-strategies/performance/versions')
      .set('Authorization', `Bearer ${token}`)
      .send(PERFORMANCE_V1)
      .expect(401);
    await request(server)
      .post('/valuation-strategies/prestige/activate')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    await request(server).get('/valuation-strategies').expect(401);
    await request(server).get('/valuation-strategies/performance/versions').expect(401);

    expect(await em.fork().count(ValuationStrategy, { key: 'performance', active: true })).toBe(1);
  });
});
