import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { League } from '../src/infrastructure/database/entities/league.entity';
import { Player, PlayerPosition } from '../src/infrastructure/database/entities/player.entity';
import { PlayerSeasonStats } from '../src/infrastructure/database/entities/player-season-stats.entity';
import { Team } from '../src/infrastructure/database/entities/team.entity';
import { User } from '../src/infrastructure/database/entities/user.entity';

const SEASON = '2025-2026';

/**
 * Jugadores del fixture, elegidos para cubrir los cuatro cortes de rareza y los bordes de la
 * derivación del OVR (data-model.md §2.1 y §2.2), más un jugador sin estadísticas (FR-030)
 * y uno con nombre acentuado para la búsqueda sin acentos (FR-006).
 */
const FIXTURES = [
  { name: 'Aaron Legend',     pos: PlayerPosition.FW, rating: '8.63', ovr: 86, rarity: 'legendary', value: '9000.00', nat: 'Norway',    league: 'E2E Premier' },
  { name: 'Bruno Epico',      pos: PlayerPosition.MF, rating: '7.70', ovr: 77, rarity: 'epic',      value: '5000.00', nat: 'Portugal',  league: 'E2E Premier' },
  { name: 'Nicolás Raro',     pos: PlayerPosition.DF, rating: '7.08', ovr: 70, rarity: 'rare',      value: '3000.00', nat: 'Argentina', league: 'E2E Liga'    },
  { name: 'Dario Comun',      pos: PlayerPosition.GK, rating: '6.94', ovr: 69, rarity: 'common',    value: '1000.00', nat: 'Italy',     league: 'E2E Liga'    },
  { name: 'Elias Truncado',   pos: PlayerPosition.FW, rating: '7.49', ovr: 74, rarity: 'rare',      value: '4000.00', nat: 'England',   league: 'E2E Premier' },
  { name: 'Zoltan SinStats',  pos: PlayerPosition.MF, rating: null,   ovr: null, rarity: 'common',  value: '500.00',  nat: 'Hungary',   league: 'E2E Liga'    },
] as const;

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
    token = await registerAndLogin();
  });

  afterAll(async () => {
    await cleanDatabase();
    await app.close();
  });

  async function cleanDatabase() {
    await em.nativeDelete(PlayerSeasonStats, {});
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
    return ids;
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
        total: FIXTURES.length,
        page: 1,
        limit: 100,
        totalPages: 1,
      });

      const legend = body.data.find((p: any) => p.name === 'Aaron Legend');
      expect(legend).toMatchObject({
        position: 'FW',
        ovr: 86,
        rarity: 'legendary',
        goals: 10,
        assists: 5,
        marketValue: 9000,
        supply: { minted: 100, total: 100 },
      });
      expect(legend.club).toEqual({ name: 'E2E Premier FC', crestUrl: null });
      expect(legend.nationality).toEqual({ name: 'Norway', code: 'no' });
      expect(legend.priceHistory).toHaveLength(30);
      expect(typeof legend.changePct).toBe('number');
    });

    it('incluye al jugador sin estadísticas, con métricas nulas y rareza common (FR-010, FR-015, FR-030)', async () => {
      const { body } = await get('/players?limit=100').expect(200);
      const sinStats = body.data.find((p: any) => p.name === 'Zoltan SinStats');

      expect(sinStats).toBeDefined();
      expect(sinStats.ovr).toBeNull();
      expect(sinStats.rarity).toBe('common');
      // null, no 0: es lo que permite distinguir "sin dato" de un cero real.
      expect(sinStats.goals).toBeNull();
      expect(sinStats.assists).toBeNull();
    });

    it('devuelve el código de bandera de las selecciones británicas (research #7)', async () => {
      const { body } = await get('/players?search=Truncado').expect(200);
      expect(body.data[0].nationality).toEqual({ name: 'England', code: 'gb-eng' });
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
      expect(ids2).toHaveLength(3);
      expect(ids1.filter((id: string) => ids2.includes(id))).toEqual([]);
      // El LEFT JOIN a las stats no debe multiplicar filas: el total cuenta jugadores.
      expect(page1.body.meta.total).toBe(FIXTURES.length);
      expect(new Set([...ids1, ...ids2]).size).toBe(FIXTURES.length);
    });

    it('una página fuera de rango devuelve vacío con el total correcto', async () => {
      const { body } = await get('/players?page=99&limit=20').expect(200);
      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(FIXTURES.length);
    });
  });

  // ---------------------------------------------------------------- E3

  describe('E3 — el OVR deriva del rating (FR-027, FR-028)', () => {
    it.each([
      ['Aaron Legend', 86],
      ['Bruno Epico', 77],
      ['Nicolás Raro', 70],
      ['Dario Comun', 69],
      ['Elias Truncado', 74],
    ])('%s tiene OVR %i', async (name, expected) => {
      const id = idsByName.get(name)!;
      const { body } = await get(`/players/${id}`).expect(200);
      expect(body.ovr).toBe(expected);
    });

    it('el detalle expone el rating del que se deriva el OVR', async () => {
      const { body } = await get(`/players/${idsByName.get('Elias Truncado')}`).expect(200);
      expect(Number(body.rating)).toBeCloseTo(7.49, 2);
      // Trunca, no redondea: 7.49 da 74 y no 75.
      expect(body.ovr).toBe(74);
    });
  });

  // ---------------------------------------------------------------- E4

  describe('E4 — cortes de rareza (FR-029)', () => {
    it.each([
      ['legendary', 85, 99],
      ['epic', 77, 84],
      ['rare', 70, 76],
    ])('%s cae dentro de [%i, %i]', async (rarity, min, max) => {
      const { body } = await get(`/players?rarity=${rarity}&limit=100`).expect(200);
      expect(body.data.length).toBeGreaterThan(0);
      for (const player of body.data) {
        expect(player.rarity).toBe(rarity);
        expect(player.ovr).toBeGreaterThanOrEqual(min);
        expect(player.ovr).toBeLessThanOrEqual(max);
      }
    });

    it('common agrupa a los de OVR bajo y a los que no tienen estadísticas', async () => {
      const { body } = await get('/players?rarity=common&limit=100').expect(200);
      const names = body.data.map((p: any) => p.name).sort();
      expect(names).toEqual(['Dario Comun', 'Zoltan SinStats']);
    });

    it('varias rarezas se unen', async () => {
      const { body } = await get('/players?rarity=legendary&rarity=rare&limit=100').expect(200);
      const names = body.data.map((p: any) => p.name).sort();
      expect(names).toEqual(['Aaron Legend', 'Elias Truncado', 'Nicolás Raro']);
    });
  });

  // ---------------------------------------------------------------- E5

  describe('E5 — rango de OVR (FR-004, FR-030)', () => {
    it('excluye a los de OVR menor y a los que no tienen OVR', async () => {
      const { body } = await get('/players?minOvr=70&maxOvr=99&limit=100').expect(200);
      expect(body.data.every((p: any) => p.ovr !== null && p.ovr >= 70)).toBe(true);
      expect(body.data.map((p: any) => p.name)).not.toContain('Zoltan SinStats');
      expect(body.data.map((p: any) => p.name)).not.toContain('Dario Comun');
    });

    it('el extremo superior es inclusivo', async () => {
      const { body } = await get('/players?minOvr=86&maxOvr=86&limit=100').expect(200);
      expect(body.data.map((p: any) => p.name)).toEqual(['Aaron Legend']);
    });
  });

  // ---------------------------------------------------------------- E6

  describe('E6 — filtros de valores múltiples y combinación (FR-001, FR-002, FR-007)', () => {
    it('dos ligas devuelven jugadores de ambas y de ninguna otra', async () => {
      const { body } = await get('/players?league=E2E Premier&league=E2E Liga&limit=100').expect(200);
      expect(body.meta.total).toBe(FIXTURES.length);
    });

    it('una sola liga acota el conjunto', async () => {
      const { body } = await get('/players?league=E2E Liga&limit=100').expect(200);
      expect(body.data.map((p: any) => p.name).sort()).toEqual([
        'Dario Comun',
        'Nicolás Raro',
        'Zoltan SinStats',
      ]);
    });

    it('dos posiciones devuelven solo esas dos', async () => {
      const { body } = await get('/players?position=FW&position=MF&limit=100').expect(200);
      expect(body.data.every((p: any) => ['FW', 'MF'].includes(p.position))).toBe(true);
      expect(body.data).toHaveLength(4);
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

  describe('E10 — determinismo del mercado simulado (SC-011, research #5)', () => {
    it('el mismo jugador da el mismo changePct en la grilla y en el detalle', async () => {
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

    it('la serie termina en el valor de mercado que se muestra', async () => {
      const { body } = await get(`/players/${idsByName.get('Bruno Epico')}`).expect(200);
      expect(body.priceHistory[body.priceHistory.length - 1]).toBe(body.marketValue);
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
