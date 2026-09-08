import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import { AppModule } from '../src/app.module';
import {
  FootballDataAdapter,
  NormalizedLeague,
  NormalizedPlayer,
  NormalizedTeam,
} from '../src/adapters/football-data/football-data.adapter';
import { League } from '../src/infrastructure/database/entities/league.entity';
import { Player, PlayerPosition } from '../src/infrastructure/database/entities/player.entity';
import { Team } from '../src/infrastructure/database/entities/team.entity';
import { IngestionService } from '../src/modules/ingestion/ingestion.service';

const LEAGUE_CODES = ['PL', 'BL1', 'PD', 'SA', 'FL1'];

/**
 * Fixture determinístico: reemplaza al FootballDataAdapter real para que el e2e no dependa
 * de la red ni de una API key real de Football-Data.org (ver quickstart.md, Escenarios 1-3).
 */
class FakeFootballDataAdapter {
  failingTeamExternalId: number | null = null;

  async getLeague(code: string): Promise<NormalizedLeague> {
    const idx = LEAGUE_CODES.indexOf(code);
    return { externalId: 900 + idx, code, name: `Fixture League ${code}`, country: 'Testland' };
  }

  async getTeamsByLeague(code: string): Promise<Array<{ externalId: number }>> {
    const idx = LEAGUE_CODES.indexOf(code);
    return [{ externalId: 950 + idx }];
  }

  async getTeamWithSquad(
    externalTeamId: number,
  ): Promise<{ team: NormalizedTeam; players: NormalizedPlayer[] }> {
    if (externalTeamId === this.failingTeamExternalId) {
      throw new Error('simulated team failure');
    }
    return {
      team: {
        externalId: externalTeamId,
        name: `Fixture Team ${externalTeamId}`,
        shortName: null,
        tla: null,
        crestUrl: null,
      },
      players: [
        {
          footballDataId: externalTeamId * 10 + 1,
          name: `Fixture Player ${externalTeamId}`,
          position: PlayerPosition.MF,
          dateOfBirth: null,
          nationality: null,
          shirtNumber: null,
        },
      ],
    };
  }
}

describe('Ingestion (e2e)', () => {
  let app: INestApplication;
  let em: EntityManager;
  let ingestionService: IngestionService;
  let fakeAdapter: FakeFootballDataAdapter;

  beforeAll(async () => {
    fakeAdapter = new FakeFootballDataAdapter();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(FootballDataAdapter)
      .useValue(fakeAdapter)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    em = app.get(EntityManager);
    ingestionService = app.get(IngestionService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    fakeAdapter.failingTeamExternalId = null;
    await em.nativeDelete(Player, {});
    await em.nativeDelete(Team, {});
    await em.nativeDelete(League, {});
  });

  it('crea el catálogo completo en la primera corrida (User Story 1)', async () => {
    const result = await ingestionService.run();

    expect(result).toEqual({ leagues: 5, teams: 5, players: 5 });
    expect(await em.count(League, {})).toBe(5);
    expect(await em.count(Team, {})).toBe(5);
    expect(await em.count(Player, {})).toBe(5);
  });

  it('no duplica registros en una segunda corrida (User Story 2)', async () => {
    await ingestionService.run();
    const secondResult = await ingestionService.run();

    expect(secondResult).toEqual({ leagues: 5, teams: 5, players: 5 });
    expect(await em.count(League, {})).toBe(5);
    expect(await em.count(Team, {})).toBe(5);
    expect(await em.count(Player, {})).toBe(5);
  });

  it('no reescribe baseValue en una re-ingesta (research.md #6)', async () => {
    await ingestionService.run();

    // externalFootballDataId de PL (índice 0 en LEAGUE_CODES): team 950 -> player 950*10+1
    const player = await em.findOneOrFail(Player, { externalFootballDataId: '9501' });
    player.baseValue = '42.00';
    await em.flush();
    em.clear();

    await ingestionService.run();

    const updated = await em.findOneOrFail(Player, { id: player.id });
    expect(updated.baseValue).toBe('42.00');
  });

  it('persiste el resto de las ligas/equipos ante la falla de un equipo puntual (User Story 3)', async () => {
    const [{ externalId: failingTeamId }] = await fakeAdapter.getTeamsByLeague('BL1');
    fakeAdapter.failingTeamExternalId = failingTeamId;

    const result = await ingestionService.run();

    expect(result.leagues).toBe(5);
    expect(result.teams).toBe(4);
    expect(result.players).toBe(4);
    expect(await em.count(League, {})).toBe(5);
    expect(await em.count(Team, {})).toBe(4);
    expect(await em.count(Player, {})).toBe(4);
  });
});
