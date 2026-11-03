import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { League } from '../src/infrastructure/database/entities/league.entity';
import { Player, PlayerPosition } from '../src/infrastructure/database/entities/player.entity';
import { PlayerQuote, PositionProfile } from '../src/infrastructure/database/entities/player-quote.entity';
import {
  QuoteRun,
  QuoteRunStatus,
  QuoteRunTrigger,
} from '../src/infrastructure/database/entities/quote-run.entity';
import { ValuationStrategyVersion } from '../src/infrastructure/database/entities/valuation-strategy-version.entity';
import { PlayerSeasonStats } from '../src/infrastructure/database/entities/player-season-stats.entity';
import { Team } from '../src/infrastructure/database/entities/team.entity';
import { User } from '../src/infrastructure/database/entities/user.entity';
import { PlayerService } from '../src/modules/player/player.service';
import { cleanPacksData } from './support/clean-database';

const SEASON = '2025-2026';

/**
 * Jugadores del fixture, elegidos para cubrir los cuatro cortes de rareza y sus bordes
 * (08-sobres FR-016: 88 / 80 / 70 sobre el OVR, que es la reputación, FR-067), más un jugador
 * sin estadísticas, uno con estadísticas pero sin reputación cargada (FR-068) y uno con nombre
 * acentuado para la búsqueda sin acentos (FR-006).
 *
 * Los ratings no coinciden a propósito con la reputación: el OVR ya no sale del rating.
 */
const FIXTURES = [
  { name: 'Aaron Legend',        pos: PlayerPosition.FW, rating: '8.63', reputation: 91,   ovr: 91,   rarity: 'legendary', value: '9000.00', nat: 'Norway',    league: 'E2E Premier' },
  { name: 'Bruno Epico',         pos: PlayerPosition.MF, rating: '7.70', reputation: 80,   ovr: 80,   rarity: 'epic',      value: '5000.00', nat: 'Portugal',  league: 'E2E Premier' },
  { name: 'Nicolás Raro',        pos: PlayerPosition.DF, rating: '7.08', reputation: 70,   ovr: 70,   rarity: 'rare',      value: '3000.00', nat: 'Argentina', league: 'E2E Liga'    },
  { name: 'Dario Comun',         pos: PlayerPosition.GK, rating: '6.94', reputation: 69,   ovr: 69,   rarity: 'common',    value: '1000.00', nat: 'Italy',     league: 'E2E Liga'    },
  { name: 'Elias Truncado',      pos: PlayerPosition.FW, rating: '7.49', reputation: 79,   ovr: 79,   rarity: 'rare',      value: '4000.00', nat: 'England',   league: 'E2E Premier' },
  { name: 'Pablo SinReputacion', pos: PlayerPosition.DF, rating: '8.10', reputation: null, ovr: null, rarity: 'common',    value: '2000.00', nat: 'Spain',     league: 'E2E Premier' },
  { name: 'Zoltan SinStats',     pos: PlayerPosition.MF, rating: null,   reputation: 85,   ovr: 85,   rarity: 'epic',      value: '500.00',  nat: 'Hungary',   league: 'E2E Liga'    },
  { name: 'Quique NoEnVenta',    pos: PlayerPosition.FW, rating: '7.90', reputation: 86,   ovr: 86,   rarity: 'epic',      value: '7000.00', nat: 'Spain',     league: 'E2E Premier' },
] as const;

/** Jugadores sin ninguna carta a la venta: el Market no los muestra (08-sobres FR-070). */
const NOT_FOR_SALE: readonly string[] = ['Quique NoEnVenta'];

/**
 * El listado solo incluye a los jugadores con estadísticas de la temporada vigente y con alguna
 * carta a la venta.
 */
const LISTED_COUNT = FIXTURES.filter((f) => f.rating !== null && !NOT_FOR_SALE.includes(f.name)).length;

describe('Players / Leagues (e2e)', () => {
  let app: INestApplication;
  let em: EntityManager;
  let token: string;
  let idsByName: Map<string, string>;

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
    await cleanDatabase();
    idsByName = await seed();
    await seedQuotes();
    // Redis sobrevive entre corridas: una página cacheada por una corrida anterior (con otros
    // ids o reputaciones) no debe responder por los datos recién sembrados.
    await app.get(PlayerService).invalidateListCache();
    token = await registerAndLogin();
  });

  afterAll(async () => {
    await cleanDatabase();
    await app.close();
  });

  async function cleanDatabase() {
    await cleanPacksData(em);
    await em.nativeDelete(PlayerSeasonStats, {});
    // 07-cotizacion: las cotizaciones referencian al jugador; se borran antes.
    await em.nativeDelete(PlayerQuote, {});
    await em.nativeDelete(QuoteRun, {});
    await em.nativeDelete(Player, {});
    await em.nativeDelete(Team, {});
    await em.nativeDelete(League, {});
    await em.nativeDelete(User, {});
  }

  async function seed(): Promise<Map<string, string>> {
    const leagues = new Map<string, League>();
    const teams = new Map<string, Team>();
    const ids = new Map<string, string>();

    for (const fixture of FIXTURES) {
      if (!leagues.has(fixture.league)) {
        const league = em.create(League, { name: fixture.league, country: 'Testland' });
        leagues.set(fixture.league, league);
        teams.set(
          fixture.league,
          em.create(Team, { name: `${fixture.league} FC`, league, crestUrl: null }),
        );
      }

      const player = em.create(Player, {
        fullName: fixture.name,
        position: fixture.pos,
        baseValue: fixture.value,
        nationality: fixture.nat,
        worldReputation: fixture.reputation,
        height: 180,
        team: teams.get(fixture.league)!,
        createdAt: new Date(),
      });
      em.persist(player);

      if (fixture.rating !== null) {
        em.persist(
          em.create(PlayerSeasonStats, {
            player,
            season: SEASON,
            matchesPlayed: 12,
            goals: 10,
            assists: 5,
            shotsPerGame: '2.50',
            keyPasses: '1.20',
            dribbles: '0.80',
            tackles: '1.10',
            rating: fixture.rating,
            lastRefreshedAt: new Date(),
            createdAt: new Date(),
          }),
        );
      }
      ids.set(fixture.name, player.id);
    }

    em.persist([...leagues.values(), ...teams.values()]);
    await em.flush();

    // Cartas a la venta (08-sobres FR-070): sin ellas el Market no lista al jugador. Son tokens
    // de la plataforma, cada uno con su publicación activa (09-mercado FR-008).
    for (const fixture of FIXTURES) {
      if (NOT_FOR_SALE.includes(fixture.name)) continue;
      await em.execute(
        `insert into "token" ("id", "player_id", "serial", "status", "owner_id", "pack_id", "created_at")
         select gen_random_uuid(), ?, gs, 'en_venta_plataforma', null, null, now() from generate_series(1, 100) as gs`,
        [ids.get(fixture.name)],
      );
    }
    await relistPlatformTokens();
    return ids;
  }

  /**
   * Una publicación activa por cada token de la plataforma. `listing` no admite DELETE ni reabrir
   * (09-mercado FR-030): para volver al estado inicial se vacía con TRUNCATE y se recrea.
   */
  async function relistPlatformTokens(): Promise<void> {
    await em.execute('truncate table "token_purchase", "listing"');
    await em.execute(
      `insert into "listing" ("id", "token_id", "player_id", "seller_id", "status", "created_at", "correlation_id")
       select gen_random_uuid(), "id", "player_id", null, 'activa', now(), 'e2e-players'
         from "token" where "status" = 'en_venta_plataforma'`,
    );
  }

  /**
   * Cotizaciones reales de algunos jugadores, para verificar que la carta y el detalle muestran
   * la variación y la serie guardadas (07-cotizacion). En el sistema real el último precio
   * coincide con `base_value` —el recálculo lo espeja—, por eso cada serie termina en el valor
   * del fixture del jugador.
   *
   * Las filas se insertan en orden inverso a propósito: la serie tiene que salir ordenada por
   * fecha de cálculo, no por orden de inserción.
   */
  async function seedQuotes(): Promise<void> {
    const fork = em.fork();
    const [version] = await fork.find(ValuationStrategyVersion, {}, { limit: 1 });
    const runId = randomUUID();
    await fork.insert(QuoteRun, {
      id: runId,
      trigger: QuoteRunTrigger.MANUAL,
      status: QuoteRunStatus.COMPLETED,
      startedAt: new Date(),
      finishedAt: new Date(),
      quotedCount: 0,
      skippedCount: 0,
      correlationId: 'e2e-players',
    });

    const series: Record<string, number[]> = {
      'Bruno Epico': [3000, 4000, 4500, 5000],
      'Nicolás Raro': [3000],
      // 35 cotizaciones: la respuesta solo trae las últimas 30.
      'Elias Truncado': Array.from({ length: 35 }, (_, i) => 3966 + i),
    };

    const rows = Object.entries(series).flatMap(([name, prices]) =>
      prices.map((price, i) => ({
        id: randomUUID(),
        player: idsByName.get(name)!,
        run: runId,
        strategyVersion: version.id,
        origin: QuoteRunTrigger.MANUAL,
        season: SEASON,
        score: '0.5000',
        rawScore: '0.5000',
        price,
        positionProfile: PositionProfile.GENERAL,
        positiveWeightSum: '1.0000',
        breakdown: [],
        usedDefaultReputation: false,
        missingMatchesPlayed: false,
        calculatedAt: new Date(Date.UTC(2026, 6, 1 + i * 7)),
      })),
    );
    await fork.insertMany(PlayerQuote, rows.reverse() as never[]);
  }

  async function registerAndLogin(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'e2e-home@test.local', username: 'e2ehome', password: 'Passw0rd!2026' })
      .expect(201);
    return res.body.accessToken;
  }

  function get(path: string) {
    return request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);
  }

  // ---------------------------------------------------------------- E1

  describe('E1 — forma del elemento de listado (FR-009, FR-010)', () => {
    it('devuelve todos los campos que la carta necesita', async () => {
      const { body } = await get('/players?limit=100').expect(200);

      expect(body.meta).toEqual({
        total: LISTED_COUNT,
        page: 1,
        limit: 100,
        totalPages: 1,
      });

      const legend = body.data.find((p: any) => p.name === 'Aaron Legend');
      expect(legend).toMatchObject({
        position: 'FW',
        ovr: 91,
        rarity: 'legendary',
        goals: 10,
        assists: 5,
        marketValue: 9000,
        supply: { minted: 100, total: 100 },
      });
      expect(legend.club).toEqual({ name: 'E2E Premier FC', crestUrl: null });
      expect(legend.nationality).toEqual({ name: 'Norway', code: 'no' });
      // Sin cotizaciones guardadas no hay serie ni variación: no se inventan.
      expect(legend.priceHistory).toEqual([]);
      expect(legend.changePct).toBe(0);
    });

    it('no lista a los jugadores sin estadísticas de la temporada vigente', async () => {
      const { body } = await get('/players?limit=100').expect(200);
      expect(body.data.map((p: any) => p.name)).not.toContain('Zoltan SinStats');
    });

    it('devuelve el código de bandera de las selecciones británicas (research #7)', async () => {
      const { body } = await get('/players?search=Truncado').expect(200);
      expect(body.data[0].nationality).toEqual({ name: 'England', code: 'gb-eng' });
    });

    it('devuelve imageUrl nulo mientras el jugador no tiene imagen', async () => {
      const { body } = await get('/players?search=Legend').expect(200);
      expect(body.data[0].imageUrl).toBeNull();
    });

    it('devuelve la imagen cartoon guardada del jugador', async () => {
      const imageUrl = 'https://r2.thesportsdb.com/images/media/player/cartoon/e2e.png';
      await em.nativeUpdate(Player, { id: idsByName.get('Bruno Epico')! }, { imageUrl });

      // El detalle no pasa por la caché del listado, así que ve el cambio al instante.
      const { body } = await get(`/players/${idsByName.get('Bruno Epico')}`).expect(200);
      expect(body.imageUrl).toBe(imageUrl);
    });
  });

  // ---------------------------------------------------------------- E2

  describe('E2 — paginación (FR-008)', () => {
    it('no repite ni omite identificadores entre páginas consecutivas', async () => {
      const page1 = await get('/players?page=1&limit=3').expect(200);
      const page2 = await get('/players?page=2&limit=3').expect(200);

      const ids1 = page1.body.data.map((p: any) => p.id);
      const ids2 = page2.body.data.map((p: any) => p.id);

      expect(ids1).toHaveLength(3);
      expect(ids2).toHaveLength(LISTED_COUNT - 3);
      expect(ids1.filter((id: string) => ids2.includes(id))).toEqual([]);
      // El LEFT JOIN a las stats no debe multiplicar filas: el total cuenta jugadores.
      expect(page1.body.meta.total).toBe(LISTED_COUNT);
      expect(new Set([...ids1, ...ids2]).size).toBe(LISTED_COUNT);
    });

    it('una página fuera de rango devuelve vacío con el total correcto', async () => {
      const { body } = await get('/players?page=99&limit=20').expect(200);
      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(LISTED_COUNT);
    });
  });

  // ---------------------------------------------------------------- E3

  describe('E3 — el OVR es la reputación cargada (08-sobres FR-067, FR-068)', () => {
    it.each([
      ['Aaron Legend', 91],
      ['Bruno Epico', 80],
      ['Nicolás Raro', 70],
      ['Dario Comun', 69],
      ['Elias Truncado', 79],
    ])('%s tiene OVR %i', async (name, expected) => {
      const id = idsByName.get(name)!;
      const { body } = await get(`/players/${id}`).expect(200);
      expect(body.ovr).toBe(expected);
    });

    it('el detalle expone el rating, pero el OVR no sale de él', async () => {
      const { body } = await get(`/players/${idsByName.get('Elias Truncado')}`).expect(200);
      expect(Number(body.rating)).toBeCloseTo(7.49, 2);
      expect(body.ovr).toBe(79);
    });

    it('un jugador sin reputación cargada tiene OVR nulo y rareza common', async () => {
      const { body } = await get(`/players/${idsByName.get('Pablo SinReputacion')}`).expect(200);
      expect(body.ovr).toBeNull();
      expect(body.rarity).toBe('common');
    });
  });

  // ---------------------------------------------------------------- E4

  describe('E4 — cortes de rareza (08-sobres FR-016)', () => {
    it.each([
      ['legendary', 88, 99],
      ['epic', 80, 87],
      ['rare', 70, 79],
    ])('%s cae dentro de [%i, %i]', async (rarity, min, max) => {
      const { body } = await get(`/players?rarity=${rarity}&limit=100`).expect(200);
      expect(body.data.length).toBeGreaterThan(0);
      for (const player of body.data) {
        expect(player.rarity).toBe(rarity);
        expect(player.ovr).toBeGreaterThanOrEqual(min);
        expect(player.ovr).toBeLessThanOrEqual(max);
      }
    });

    it('common agrupa a los de OVR bajo y a los sin reputación (los sin estadísticas no se listan)', async () => {
      const { body } = await get('/players?rarity=common&limit=100').expect(200);
      const names = body.data.map((p: any) => p.name).sort();
      expect(names).toEqual(['Dario Comun', 'Pablo SinReputacion']);
    });

    it('varias rarezas se unen', async () => {
      const { body } = await get('/players?rarity=legendary&rarity=rare&limit=100').expect(200);
      const names = body.data.map((p: any) => p.name).sort();
      expect(names).toEqual(['Aaron Legend', 'Elias Truncado', 'Nicolás Raro']);
    });
  });

  // ---------------------------------------------------------------- E5

  describe('E5 — rango de OVR (FR-004, 08-sobres FR-068)', () => {
    it('excluye a los de OVR menor y a los que no tienen reputación', async () => {
      const { body } = await get('/players?minOvr=70&maxOvr=99&limit=100').expect(200);
      const names = body.data.map((p: any) => p.name);
      expect(body.data.every((p: any) => p.ovr !== null && p.ovr >= 70)).toBe(true);
      expect(names).not.toContain('Zoltan SinStats');
      expect(names).not.toContain('Dario Comun');
      expect(names).not.toContain('Pablo SinReputacion');
    });

    it('el extremo superior es inclusivo', async () => {
      const { body } = await get('/players?minOvr=91&maxOvr=91&limit=100').expect(200);
      expect(body.data.map((p: any) => p.name)).toEqual(['Aaron Legend']);
    });

    it('solo un máximo también excluye a los que no tienen reputación', async () => {
      const { body } = await get('/players?maxOvr=75&limit=100').expect(200);
      expect(body.data.map((p: any) => p.name).sort()).toEqual(['Dario Comun', 'Nicolás Raro']);
    });
  });

  // ---------------------------------------------------------------- E6

  describe('E6 — filtros de valores múltiples y combinación (FR-001, FR-002, FR-007)', () => {
    it('dos ligas devuelven jugadores de ambas y de ninguna otra', async () => {
      const { body } = await get('/players?league=E2E Premier&league=E2E Liga&limit=100').expect(200);
      expect(body.meta.total).toBe(LISTED_COUNT);
    });

    it('una sola liga acota el conjunto', async () => {
      const { body } = await get('/players?league=E2E Liga&limit=100').expect(200);
      expect(body.data.map((p: any) => p.name).sort()).toEqual([
        'Dario Comun',
        'Nicolás Raro',
      ]);
    });

    it('dos posiciones devuelven solo esas dos', async () => {
      const { body } = await get('/players?position=FW&position=MF&limit=100').expect(200);
      expect(body.data.every((p: any) => ['FW', 'MF'].includes(p.position))).toBe(true);
      expect(body.data).toHaveLength(3);
    });

    it('combina liga, posición y rango de OVR a la vez', async () => {
      const { body } = await get(
        '/players?league=E2E Premier&position=FW&minOvr=80&limit=100',
      ).expect(200);
      expect(body.data.map((p: any) => p.name)).toEqual(['Aaron Legend']);
      expect(body.meta.total).toBe(1);
    });

    it('filtra por rango de valor de mercado (FR-003)', async () => {
      const { body } = await get('/players?minValue=3000&maxValue=5000&limit=100').expect(200);
      expect(body.data.map((p: any) => p.name).sort()).toEqual([
        'Bruno Epico',
        'Elias Truncado',
        'Nicolás Raro',
      ]);
    });
  });

  // ---------------------------------------------------------------- E7

  describe('E7 — búsqueda insensible a mayúsculas y acentos (FR-006)', () => {
    it('encuentra un nombre acentuado escribiéndolo sin acento', async () => {
      const { body } = await get('/players?search=nicolas').expect(200);
      expect(body.data.map((p: any) => p.name)).toEqual(['Nicolás Raro']);
    });

    it('devuelve lo mismo con acento y en mayúsculas', async () => {
      const sinAcento = await get('/players?search=nicolas').expect(200);
      const conAcento = await get('/players?search=NICOLÁS').expect(200);
      expect(conAcento.body.data.map((p: any) => p.id)).toEqual(
        sinAcento.body.data.map((p: any) => p.id),
      );
    });

    it('coincide con fragmentos parciales', async () => {
      const { body } = await get('/players?search=com').expect(200);
      expect(body.data.map((p: any) => p.name)).toEqual(['Dario Comun']);
    });

    it('sin coincidencias devuelve vacío, no error', async () => {
      const { body } = await get('/players?search=zzzznoexiste').expect(200);
      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
    });
  });

  // ---------------------------------------------------------------- E8

  describe('E8 — entradas inválidas (FR-016)', () => {
    it.each([
      ['position=XX', 'posición inexistente'],
      ['rarity=mythic', 'rareza inexistente'],
      ['minOvr=80&maxOvr=70', 'rango de OVR invertido'],
      ['minValue=5000&maxValue=100', 'rango de valor invertido'],
      ['page=0', 'página cero'],
      ['limit=500', 'límite fuera de tope'],
      ['minValue=-5', 'valor negativo'],
      ['minOvr=120', 'OVR fuera de rango'],
      ['nope=1', 'parámetro no reconocido'],
    ])('rechaza %s (%s) con 400', async (query) => {
      const res = await get(`/players?${query}`);
      expect(res.status).toBe(400);
    });

    it('el id con formato inválido se rechaza con 400', async () => {
      const res = await get('/players/no-es-uuid');
      expect(res.status).toBe(400);
    });

    it('un id inexistente devuelve 404', async () => {
      const res = await get('/players/00000000-0000-4000-8000-000000000000');
      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------- E9

  describe('E9 — detalle completo (FR-012 a FR-015)', () => {
    it('devuelve liga, temporada, altura y las métricas de temporada', async () => {
      const { body } = await get(`/players/${idsByName.get('Aaron Legend')}`).expect(200);

      expect(body).toMatchObject({
        name: 'Aaron Legend',
        league: 'E2E Premier',
        season: SEASON,
        height: 180,
        matchesPlayed: 12,
        goals: 10,
        assists: 5,
      });
      expect(Number(body.shotsPerGame)).toBeCloseTo(2.5, 2);
      expect(Number(body.keyPasses)).toBeCloseTo(1.2, 2);
      expect(Number(body.dribbles)).toBeCloseTo(0.8, 2);
      expect(Number(body.tackles)).toBeCloseTo(1.1, 2);
    });

    it('un jugador sin estadísticas devuelve null en las métricas, no cero', async () => {
      const { body } = await get(`/players/${idsByName.get('Zoltan SinStats')}`).expect(200);

      expect(body.season).toBeNull();
      expect(body.rating).toBeNull();
      expect(body.matchesPlayed).toBeNull();
      expect(body.shotsPerGame).toBeNull();
      expect(body.keyPasses).toBeNull();
      expect(body.dribbles).toBeNull();
      expect(body.tackles).toBeNull();
      expect(body.goals).toBeNull();
      // La altura es atributo del jugador, no de la temporada: esa sí está.
      expect(body.height).toBe(180);
    });
  });

  // ---------------------------------------------------------------- E10

  describe('E10 — variación y serie salen de las cotizaciones reales (SC-011)', () => {
    it('la serie es la de las cotizaciones guardadas, ordenada por fecha de cálculo', async () => {
      const { body } = await get(`/players/${idsByName.get('Bruno Epico')}`).expect(200);
      expect(body.priceHistory).toEqual([3000, 4000, 4500, 5000]);
    });

    it('la variación compara la última cotización con la anterior', async () => {
      const { body } = await get(`/players/${idsByName.get('Bruno Epico')}`).expect(200);
      expect(body.changePct).toBe(11.1); // (5000 − 4500) / 4500
    });

    it('la serie termina en el valor de mercado que se muestra', async () => {
      const { body } = await get(`/players/${idsByName.get('Bruno Epico')}`).expect(200);
      expect(body.priceHistory[body.priceHistory.length - 1]).toBe(body.marketValue);
    });

    it('el mismo jugador da la misma variación y serie en la grilla y en el detalle', async () => {
      const id = idsByName.get('Bruno Epico')!;
      const lista = await get('/players?search=Bruno&limit=100').expect(200);
      const detalle = await get(`/players/${id}`).expect(200);

      expect(detalle.body.changePct).toBe(lista.body.data[0].changePct);
      expect(detalle.body.priceHistory).toEqual(lista.body.data[0].priceHistory);
    });

    it('repetir la petición devuelve exactamente lo mismo', async () => {
      const id = idsByName.get('Bruno Epico')!;
      const first = await get(`/players/${id}`).expect(200);
      const second = await get(`/players/${id}`).expect(200);
      expect(second.body.changePct).toBe(first.body.changePct);
      expect(second.body.priceHistory).toEqual(first.body.priceHistory);
    });

    it('con una sola cotización hay un punto y la variación es 0', async () => {
      const { body } = await get(`/players/${idsByName.get('Nicolás Raro')}`).expect(200);
      expect(body.priceHistory).toEqual([3000]);
      expect(body.changePct).toBe(0);
    });

    it('un jugador nunca cotizado devuelve serie vacía y variación 0', async () => {
      const { body } = await get(`/players/${idsByName.get('Aaron Legend')}`).expect(200);
      expect(body.priceHistory).toEqual([]);
      expect(body.changePct).toBe(0);
    });

    it('con más de 30 cotizaciones devuelve solo las últimas 30', async () => {
      const { body } = await get(`/players/${idsByName.get('Elias Truncado')}`).expect(200);
      expect(body.priceHistory).toHaveLength(30);
      expect(body.priceHistory[0]).toBe(3971);
      expect(body.priceHistory[29]).toBe(4000);
    });

    it('cada jugador de una misma página recibe su propia serie, sin mezclarlas', async () => {
      const { body } = await get('/players?limit=100').expect(200);
      const byName = (name: string) => body.data.find((p: any) => p.name === name);

      expect(byName('Bruno Epico').priceHistory).toEqual([3000, 4000, 4500, 5000]);
      expect(byName('Nicolás Raro').priceHistory).toEqual([3000]);
      expect(byName('Aaron Legend').priceHistory).toEqual([]);
    });
  });

  // ---------------------------------------------------------------- E11

  describe('E11 — ligas del filtro (FR-011)', () => {
    it('devuelve las ligas del catálogo ordenadas por nombre', async () => {
      const { body } = await get('/leagues').expect(200);
      expect(body.map((l: any) => l.name)).toEqual(['E2E Liga', 'E2E Premier']);
      expect(body[0]).toMatchObject({ country: 'Testland' });
      expect(body[0].id).toBeDefined();
    });
  });

  // ---------------------------------------------------------------- E14

  describe('E14 — el Market muestra solo jugadores con publicaciones activas (08 FR-070, 09 FR-026)', () => {
    it('no lista a un jugador sin ninguna carta a la venta', async () => {
      const { body } = await get('/players?limit=100').expect(200);
      expect(body.data.map((p: any) => p.name)).not.toContain('Quique NoEnVenta');
      expect(body.meta.total).toBe(LISTED_COUNT);
    });

    it('el detalle de ese jugador sigue disponible (lo usan el inventario y las aperturas)', async () => {
      const { body } = await get(`/players/${idsByName.get('Quique NoEnVenta')}`).expect(200);
      expect(body).toMatchObject({ name: 'Quique NoEnVenta', ovr: 86 });
    });

    it('un jugador deja de aparecer cuando se cierran todas sus publicaciones', async () => {
      const id = idsByName.get('Dario Comun')!;
      await em.execute(
        `update "listing" set "status" = 'retirada', "closed_at" = now(), "closed_correlation_id" = 'e2e' where "player_id" = ?`,
        [id],
      );
      await app.get(PlayerService).invalidateListCache();
      try {
        const { body } = await get('/players?limit=100').expect(200);
        expect(body.data.map((p: any) => p.name)).not.toContain('Dario Comun');
      } finally {
        await relistPlatformTokens();
        await app.get(PlayerService).invalidateListCache();
      }
    });

    it('un token a la venta sin publicación activa no cuenta: el criterio es la publicación', async () => {
      await em.execute('truncate table "token_purchase", "listing"');
      await app.get(PlayerService).invalidateListCache();
      try {
        const { body } = await get('/players?limit=100').expect(200);
        expect(body).toMatchObject({ data: [], meta: { total: 0 } });
      } finally {
        await relistPlatformTokens();
        await app.get(PlayerService).invalidateListCache();
      }
    });
  });

  // ---------------------------------------------------------------- E15

  describe('E15 — cantidad de cartas a la venta (09-mercado FR-026, SC-011)', () => {
    it('cada jugador del Market informa sus publicaciones activas, también en el detalle', async () => {
      const { body } = await get('/players?limit=100').expect(200);
      expect(body.data.length).toBeGreaterThan(0);
      for (const player of body.data) expect(player.forSaleCount).toBe(100);

      const detail = await get(`/players/${idsByName.get('Dario Comun')}`).expect(200);
      expect(detail.body.forSaleCount).toBe(100);
      const notForSale = await get(`/players/${idsByName.get('Quique NoEnVenta')}`).expect(200);
      expect(notForSale.body.forSaleCount).toBe(0);
    });

    it('informa el número de carta de la publicación más antigua (15-numero-de-carta FR-003)', async () => {
      const id = idsByName.get('Dario Comun')!;
      const [oldest] = await em.execute<{ serial: number }[]>(
        `select t."serial"
           from "listing" l
           join "token" t on t."id" = l."token_id"
          where l."player_id" = ? and l."status" = 'activa'
          order by l."created_at", l."id"
          limit 1`,
        [id],
      );

      const { body } = await get('/players?limit=100').expect(200);
      expect(body.data.find((p: any) => p.id === id).firstListedSerial).toBe(oldest.serial);

      const notForSale = await get(`/players/${idsByName.get('Quique NoEnVenta')}`).expect(200);
      expect(notForSale.body.firstListedSerial).toBeNull();
    });

    it('baja cuando se cierran publicaciones, sin esperar la caché', async () => {
      const id = idsByName.get('Dario Comun')!;
      await get('/players?limit=100').expect(200); // queda en caché
      await em.execute(
        `update "listing" set "status" = 'vendida', "closed_at" = now(), "closed_correlation_id" = 'e2e'
          where "id" in (select "id" from "listing" where "player_id" = ? order by "id" limit 3)`,
        [id],
      );
      await app.get(PlayerService).invalidateListCache();
      try {
        const { body } = await get('/players?limit=100').expect(200);
        expect(body.data.find((p: any) => p.id === id).forSaleCount).toBe(97);
      } finally {
        await relistPlatformTokens();
        await app.get(PlayerService).invalidateListCache();
      }
    });

    it('los filtros siguen operando sobre los jugadores con cartas a la venta (US3-7)', async () => {
      const { body } = await get('/players?position=GK&limit=100').expect(200);
      expect(body.data.map((p: any) => p.name)).toEqual(['Dario Comun']);
      expect(body.data[0].forSaleCount).toBe(100);
    });
  });

  // ---------------------------------------------------------------- E13

  describe('E13 — una carga de reputación se ve de inmediato (08-sobres SC-020)', () => {
    it('cambia OVR y rareza del listado sin esperar el TTL de la caché', async () => {
      const id = idsByName.get('Dario Comun')!;
      // Primera lectura: deja el listado en caché.
      const before = await get('/players?search=Dario').expect(200);
      expect(before.body.data[0]).toMatchObject({ ovr: 69, rarity: 'common' });

      await request(app.getHttpServer())
        .put(`/quotes/reputation/${id}`)
        .set('x-api-key', process.env.ADMIN_API_KEY!)
        .send({ worldReputation: 89 })
        .expect(200);

      try {
        const after = await get('/players?search=Dario').expect(200);
        expect(after.body.data[0]).toMatchObject({ ovr: 89, rarity: 'legendary' });
      } finally {
        await em.nativeUpdate(Player, { id }, { worldReputation: 69 });
      }
    });
  });

  // ---------------------------------------------------------------- E12

  describe('E12 — protección de los endpoints (FR-017)', () => {
    it.each(['/players', '/leagues'])('%s responde 401 sin credencial', async (path) => {
      const res = await request(app.getHttpServer()).get(path);
      expect(res.status).toBe(401);
    });

    it('el detalle responde 401 sin credencial', async () => {
      const res = await request(app.getHttpServer()).get(`/players/${idsByName.get('Aaron Legend')}`);
      expect(res.status).toBe(401);
    });

    it('una credencial inválida también se rechaza', async () => {
      const res = await request(app.getHttpServer())
        .get('/players')
        .set('Authorization', 'Bearer no-es-un-token');
      expect(res.status).toBe(401);
    });
  });
});
