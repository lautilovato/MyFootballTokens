import { jest } from '@jest/globals';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RANKING_SIZE } from '../src/modules/ranking/ranking.service';
import { TokensService } from '../src/modules/tokens/tokens.service';
import { ValuationStrategyService } from '../src/modules/valuation-strategy/valuation-strategy.service';
import { type PlayerFixture, cleanAll, registerUser, resetCaches, seedPlayers } from './support/packs-fixtures';
import { grantTokens, insertPlatformListing, publish } from './support/market-fixtures';
import { seedQuote } from './support/quote-fixtures';

jest.setTimeout(180_000);

const STRATEGY = 'performance';
const OTHER_STRATEGY = 'prestige';

/** Más jugadores de los que entran en el top, todos con el mismo precio en su test. */
const TIED_NAMES = Array.from({ length: RANKING_SIZE + 2 }, (_, i) => `Jugador ${String(i).padStart(2, '0')}`);

/** Sin reputación quedan `reservado`, y `grantTokens` puede dárselos a un usuario. */
const PLAYERS: PlayerFixture[] = ['Ana Alta', 'Beto Bajo', 'Ciro Medio', ...TIED_NAMES].map((name) => ({
  name,
  reputation: null,
  price: 0,
}));

/** 13-ranking — top de jugadores según la estrategia activa. */
describe('Ranking (e2e)', () => {
  let app: INestApplication;
  let em: EntityManager;
  let ids: Map<string, string>;
  let token: string;
  let userId: string;

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
    await app.get(ValuationStrategyService).activate(STRATEGY);
    ({ token, userId } = await registerUser(app, 'ranking@e2e.test'));
  });

  afterAll(async () => {
    await app.get(ValuationStrategyService).activate(STRATEGY);
    await cleanAll(em);
    await app.close();
  });

  const player = (name: string) => ids.get(name)!;
  const getRanking = () => request(app.getHttpServer()).get('/ranking/players').set('Authorization', `Bearer ${token}`);

  /** Una corrida de la estrategia con un precio por jugador. */
  async function seedRun(strategyKey: string, prices: Record<string, number>, calculatedAt = new Date(), mirror = true) {
    let runId: string | undefined;
    for (const [name, price] of Object.entries(prices)) {
      ({ runId } = await seedQuote(em, player(name), { price, strategyKey, calculatedAt, runId, mirror }));
    }
  }

  it('exige sesión', async () => {
    await request(app.getHttpServer()).get('/ranking/players').expect(401);
  });

  it('ordena del más caro al más barato, tengan o no cartas en circulación (FR-001, FR-003)', async () => {
    await seedRun(STRATEGY, { 'Beto Bajo': 100, 'Ana Alta': 900, 'Ciro Medio': 500 });

    const { body } = await getRanking().expect(200);

    expect(body.strategy).toMatchObject({ key: STRATEGY, version: 1 });
    expect(body.calculatedAt).toEqual(expect.any(String));
    expect(body.data.map((entry: { rank: number; player: { name: string; marketValue: number } }) => [entry.rank, entry.player.name, entry.player.marketValue])).toEqual([
      [1, 'Ana Alta', 900],
      [2, 'Ciro Medio', 500],
      [3, 'Beto Bajo', 100],
    ]);
    expect(body.data.every((entry: { inCirculation: number }) => entry.inCirculation === 0)).toBe(true);
  });

  it('corta el top y desempata de forma estable (FR-001)', async () => {
    await seedRun(STRATEGY, Object.fromEntries(TIED_NAMES.map((name) => [name, 700])));

    const { body } = await getRanking().expect(200);
    expect(body.data.map((entry: { player: { name: string } }) => entry.player.name)).toEqual(TIED_NAMES.slice(0, RANKING_SIZE));
  });

  it('el detalle del jugador usa el mismo conteo que el ranking (15-numero-de-carta FR-005)', async () => {
    const detail = (name: string) =>
      request(app.getHttpServer()).get(`/players/${player(name)}`).set('Authorization', `Bearer ${token}`).expect(200);
    await grantTokens(em, userId, player('Ana Alta'), 3);

    expect((await detail('Ana Alta')).body.inCirculation).toBe(3);
    expect((await detail('Beto Bajo')).body.inCirculation).toBe(0);
  });

  it('cuenta las cartas de usuarios, a la venta o no, y solo esas (FR-005)', async () => {
    await seedRun(STRATEGY, { 'Ana Alta': 900, 'Beto Bajo': 100 });
    const [listed] = await grantTokens(em, userId, player('Ana Alta'), 3);
    await publish(app, token, { tokenId: listed }).expect(201);

    const [, , , platformToken] = await em.fork().execute<{ id: string }[]>(
      `select "id" from "token" where "player_id" = ? order by "serial" limit 4`,
      [player('Beto Bajo')],
    );
    await insertPlatformListing(em, platformToken.id);

    const { body } = await getRanking().expect(200);
    expect(body.data.map((entry: { inCirculation: number }) => entry.inCirculation)).toEqual([3, 0]);
  });

  it('usa la corrida de la estrategia activa, aunque la última sea de otra (FR-002)', async () => {
    const earlier = new Date(Date.now() - 86_400_000);
    await seedRun(STRATEGY, { 'Ana Alta': 900, 'Beto Bajo': 100 }, earlier);
    await seedRun(OTHER_STRATEGY, { 'Ana Alta': 200, 'Beto Bajo': 800 });

    const { body } = await getRanking().expect(200);

    expect(body.strategy.key).toBe(STRATEGY);
    expect(body.data.map((entry: { player: { name: string; marketValue: number } }) => [entry.player.name, entry.player.marketValue])).toEqual([
      ['Ana Alta', 900],
      ['Beto Bajo', 100],
    ]);
  });

  it('cambia apenas se activa otra estrategia ya calculada (FR-002)', async () => {
    await seedRun(STRATEGY, { 'Ana Alta': 900, 'Beto Bajo': 100 }, new Date(Date.now() - 86_400_000));
    await seedRun(OTHER_STRATEGY, { 'Ana Alta': 200, 'Beto Bajo': 800 });
    await getRanking().expect(200);

    await app.get(ValuationStrategyService).activate(OTHER_STRATEGY);

    const { body } = await getRanking().expect(200);
    expect(body.strategy.key).toBe(OTHER_STRATEGY);
    expect(body.data[0].player.name).toBe('Beto Bajo');
  });

  it('sin corridas de la estrategia activa, el ranking está vacío (FR-007)', async () => {
    await seedRun(OTHER_STRATEGY, { 'Ana Alta': 900 });

    const { body } = await getRanking().expect(200);

    expect(body.strategy.key).toBe(STRATEGY);
    expect(body.calculatedAt).toBeNull();
    expect(body.data).toEqual([]);
  });
});
