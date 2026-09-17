import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import { AppModule } from '../src/app.module';
import { NormalizedStanding, WhoScoredAdapter } from '../src/adapters/who-scored/who-scored.adapter';
import { WhoScoredBlockedException } from '../src/adapters/who-scored/who-scored.client';
import { League } from '../src/infrastructure/database/entities/league.entity';
import { Player } from '../src/infrastructure/database/entities/player.entity';
import { PlayerMatchStats } from '../src/infrastructure/database/entities/player-match-stats.entity';
import { PlayerSeasonStats } from '../src/infrastructure/database/entities/player-season-stats.entity';
import { Team } from '../src/infrastructure/database/entities/team.entity';
import { WhoScoredUnmatchedPlayer } from '../src/infrastructure/database/entities/who-scored-unmatched-player.entity';
import { WhoScoredUnmatchedTeam } from '../src/infrastructure/database/entities/who-scored-unmatched-team.entity';
import { TeamWhoScoredMatchingService } from '../src/modules/team-whoscored-matching/team-whoscored-matching.service';

/** Fixture determinístico: reemplaza al WhoScoredAdapter real (ver quickstart.md, Escenarios 1-4). */
class FakeWhoScoredAdapter {
  standingsByLeaguePath = new Map<string, NormalizedStanding[]>();
  failingLeaguePath: string | null = null;
  blockedLeaguePath: string | null = null;

  async getLeagueStandings(whoScoredPath: string): Promise<NormalizedStanding[]> {
    if (whoScoredPath === this.blockedLeaguePath) {
      throw new WhoScoredBlockedException(5);
    }
    if (whoScoredPath === this.failingLeaguePath) {
      throw new Error('simulated league failure');
    }
    return this.standingsByLeaguePath.get(whoScoredPath) ?? [];
  }
}

const PD_PATH = '/regions/206/tournaments/4/spain-laliga';
const PL_PATH = '/regions/252/tournaments/2/england-premier-league';

describe('TeamWhoScoredMatching (e2e)', () => {
  let app: INestApplication;
  let em: EntityManager;
  let service: TeamWhoScoredMatchingService;
  let fakeAdapter: FakeWhoScoredAdapter;

  beforeAll(async () => {
    fakeAdapter = new FakeWhoScoredAdapter();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(WhoScoredAdapter)
      .useValue(fakeAdapter)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    em = app.get(EntityManager);
    service = app.get(TeamWhoScoredMatchingService);
  });

  afterAll(async () => {
    await cleanDatabase();
    await app.close();
  });

  beforeEach(async () => {
    fakeAdapter.standingsByLeaguePath.clear();
    fakeAdapter.failingLeaguePath = null;
    fakeAdapter.blockedLeaguePath = null;
    await cleanDatabase();
  });

  async function cleanDatabase() {
    // Orden FK-safe completo (no solo lo que este archivo crea): ingestion.e2e-spec.ts no
    // limpia después de su último test, así que puede haber Player/stats colgando de
    // corridas anteriores en la misma base de test compartida entre archivos e2e.
    await em.nativeDelete(WhoScoredUnmatchedTeam, {});
    await em.nativeDelete(WhoScoredUnmatchedPlayer, {});
    await em.nativeDelete(PlayerMatchStats, {});
    await em.nativeDelete(PlayerSeasonStats, {});
    await em.nativeDelete(Player, {});
    await em.nativeDelete(Team, {});
    await em.nativeDelete(League, {});
  }

  async function seedLeagueWithTeams(code: string, teamNames: string[]) {
    const league = em.create(League, { name: `League ${code} ${Date.now()}`, country: 'Testland', code });
    em.persist(league);
    const teams = teamNames.map((name) => em.create(Team, { name, league }));
    em.persist(teams);
    await em.flush();
    return { league, teams };
  }

  it('mapea automáticamente los equipos con nombre coincidente (Escenario 1)', async () => {
    await seedLeagueWithTeams('PD', ['Barcelona', 'Real Madrid']);
    fakeAdapter.standingsByLeaguePath.set(PD_PATH, [
      { whoScoredTeamId: '65', whoScoredName: 'Barcelona' },
      { whoScoredTeamId: '52', whoScoredName: 'Real Madrid' },
    ]);

    const result = await service.refresh();

    expect(result.teamsMatched).toBe(2);
    expect(result.teamsUnmatched).toBe(0);
    const barcelona = await em.findOneOrFail(Team, { name: 'Barcelona' });
    expect(barcelona.externalWhoScoredId).toBe('65');
    const realMadrid = await em.findOneOrFail(Team, { name: 'Real Madrid' });
    expect(realMadrid.externalWhoScoredId).toBe('52');
  });

  it('registra en la cola de revisión una fila de WhoScored sin match por encima del umbral (Escenario 1, parte 2)', async () => {
    await seedLeagueWithTeams('PD', ['Barcelona']);
    fakeAdapter.standingsByLeaguePath.set(PD_PATH, [
      { whoScoredTeamId: '65', whoScoredName: 'Barcelona' },
      { whoScoredTeamId: '999', whoScoredName: 'Completely Unknown FC' },
    ]);

    const result = await service.refresh();

    expect(result.teamsMatched).toBe(1);
    expect(result.teamsUnmatched).toBe(1);
    const unmatched = await em.findOneOrFail(WhoScoredUnmatchedTeam, { whoScoredExternalId: '999' });
    expect(unmatched.whoScoredName).toBe('Completely Unknown FC');
  });

  it('no toca un Team con externalWhoScoredId ya cargado a mano (Escenario 2)', async () => {
    const { teams } = await seedLeagueWithTeams('PD', ['Barcelona']);
    teams[0].externalWhoScoredId = '65';
    em.persist(teams[0]);
    await em.flush();
    // Ni siquiera se registra el path de standings — si el service lo pidiera, el fake
    // devolvería [] y la liga contaría como "sin candidatos" de todas formas.

    const result = await service.refresh();

    expect(result.leaguesSkipped).toBe(1);
    expect(result.leaguesProcessed).toBe(0);
    const barcelona = await em.findOneOrFail(Team, { id: teams[0].id });
    expect(barcelona.externalWhoScoredId).toBe('65');
    expect(await em.count(WhoScoredUnmatchedTeam, {})).toBe(0);
  });

  it('no registra en revisión la fila de un equipo ya mapeado aunque otros equipos de la misma liga sigan pendientes', async () => {
    const { teams } = await seedLeagueWithTeams('PD', ['Barcelona', 'Real Madrid']);
    teams[0].externalWhoScoredId = '65'; // Barcelona ya mapeado a mano.
    em.persist(teams[0]);
    await em.flush();
    // La liga sigue trayéndose completa (Real Madrid sin mapear) — la fila de Barcelona
    // aparece igual en la tabla de posiciones real, aunque su Team ya no sea candidato.
    fakeAdapter.standingsByLeaguePath.set(PD_PATH, [
      { whoScoredTeamId: '65', whoScoredName: 'Barcelona' },
      { whoScoredTeamId: '52', whoScoredName: 'Real Madrid' },
    ]);

    const result = await service.refresh();

    expect(result.teamsMatched).toBe(1); // solo Real Madrid
    expect(result.teamsUnmatched).toBe(0); // Barcelona NO debe terminar en la cola de revisión
    expect(await em.count(WhoScoredUnmatchedTeam, { whoScoredExternalId: '65' })).toBe(0);
    const realMadrid = await em.findOneOrFail(Team, { name: 'Real Madrid' });
    expect(realMadrid.externalWhoScoredId).toBe('52');
  });

  it('correr el proceso dos veces no duplica la cola de revisión ni cambia equipos ya matcheados (Escenario 3)', async () => {
    await seedLeagueWithTeams('PD', ['Barcelona']);
    fakeAdapter.standingsByLeaguePath.set(PD_PATH, [
      { whoScoredTeamId: '65', whoScoredName: 'Barcelona' },
      { whoScoredTeamId: '999', whoScoredName: 'Completely Unknown FC' },
    ]);

    const first = await service.refresh();
    expect(first.teamsMatched).toBe(1);
    expect(first.teamsUnmatched).toBe(1);
    expect(await em.count(WhoScoredUnmatchedTeam, {})).toBe(1);

    const second = await service.refresh();
    expect(second.teamsMatched).toBe(0);
    // Barcelona (el único Team de la liga) ya quedó mapeado en la primera corrida, así que
    // la liga ahora se salta sin request (FR-002/Edge Cases) — esto es lo esperado, no un bug.
    expect(second.leaguesSkipped).toBe(1);
    expect(await em.count(WhoScoredUnmatchedTeam, {})).toBe(1);
  });

  it('una falla al obtener la tabla de una liga no aborta el resto de la corrida (Escenario 4)', async () => {
    await seedLeagueWithTeams('PD', ['Barcelona']);
    await seedLeagueWithTeams('PL', ['Arsenal']);
    fakeAdapter.standingsByLeaguePath.set(PL_PATH, [{ whoScoredTeamId: '13', whoScoredName: 'Arsenal' }]);
    fakeAdapter.failingLeaguePath = PD_PATH;

    const result = await service.refresh();

    expect(result.leaguesProcessed).toBe(1);
    expect(result.teamsMatched).toBe(1);
    const arsenal = await em.findOneOrFail(Team, { name: 'Arsenal' });
    expect(arsenal.externalWhoScoredId).toBe('13');
  });

  it('un bloqueo generalizado aborta el resto de la corrida sin borrar mapeos previos', async () => {
    await seedLeagueWithTeams('PL', ['Arsenal']);
    fakeAdapter.standingsByLeaguePath.set(PL_PATH, [{ whoScoredTeamId: '13', whoScoredName: 'Arsenal' }]);
    await service.refresh();
    const arsenal = await em.findOneOrFail(Team, { name: 'Arsenal' });
    expect(arsenal.externalWhoScoredId).toBe('13');

    await seedLeagueWithTeams('PD', ['Barcelona']);
    fakeAdapter.blockedLeaguePath = PD_PATH;

    const result = await service.refresh();

    expect(result.teamsMatched).toBe(0);
    const stillArsenal = await em.findOneOrFail(Team, { id: arsenal.id });
    expect(stillArsenal.externalWhoScoredId).toBe('13');
  });
});
