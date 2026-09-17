import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import { AppModule } from '../src/app.module';
import {
  NormalizedMatchStats,
  NormalizedSeasonStats,
  WhoScoredAdapter,
} from '../src/adapters/who-scored/who-scored.adapter';
import { WhoScoredBlockedException } from '../src/adapters/who-scored/who-scored.client';
import { League } from '../src/infrastructure/database/entities/league.entity';
import { Player, PlayerPosition } from '../src/infrastructure/database/entities/player.entity';
import { PlayerMatchStats } from '../src/infrastructure/database/entities/player-match-stats.entity';
import { PlayerSeasonStats } from '../src/infrastructure/database/entities/player-season-stats.entity';
import { Team } from '../src/infrastructure/database/entities/team.entity';
import { WhoScoredUnmatchedPlayer } from '../src/infrastructure/database/entities/who-scored-unmatched-player.entity';
import { PlayerStatsService } from '../src/modules/player-stats/player-stats.service';

const SEASON_STATS: NormalizedSeasonStats = {
  whoScoredPlayerId: 'ws-1',
  whoScoredName: 'Fixture Player Matched',
  season: '2025-2026',
  goals: 3,
  assists: 1,
  shotsPerGame: 2.5,
  keyPasses: 1.2,
  dribbles: 0.8,
  tackles: 1.1,
  rating: 7.2,
  height: 180,
};

const UNMATCHED_STATS: NormalizedSeasonStats = {
  ...SEASON_STATS,
  whoScoredPlayerId: 'ws-2',
  whoScoredName: 'Completely Unknown Name',
};

const MATCH_STATS: NormalizedMatchStats = {
  whoScoredMatchId: 'match-1',
  matchDate: '2026-01-10',
  season: '2025-2026',
  goals: 1,
  assists: 0,
  shots: 3,
  keyPasses: 1,
  dribbles: 1,
  tackles: 2,
  rating: 7.1,
};

/** Fixture determinístico: reemplaza al WhoScoredAdapter real (ver quickstart.md, Escenarios 1-4). */
class FakeWhoScoredAdapter {
  squadStatsByTeam = new Map<string, NormalizedSeasonStats[]>();
  failingTeamExternalId: string | null = null;
  blockedTeamExternalId: string | null = null;
  matchLogByPlayer = new Map<string, NormalizedMatchStats[]>();

  async getSquadStats(externalTeamId: string): Promise<NormalizedSeasonStats[]> {
    if (externalTeamId === this.blockedTeamExternalId) {
      throw new WhoScoredBlockedException(5);
    }
    if (externalTeamId === this.failingTeamExternalId) {
      throw new Error('simulated team failure');
    }
    return this.squadStatsByTeam.get(externalTeamId) ?? [];
  }

  async getPlayerMatchLog(externalPlayerId: string): Promise<NormalizedMatchStats[]> {
    return this.matchLogByPlayer.get(externalPlayerId) ?? [];
  }
}

describe('PlayerStats (e2e)', () => {
  let app: INestApplication;
  let em: EntityManager;
  let playerStatsService: PlayerStatsService;
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
    playerStatsService = app.get(PlayerStatsService);
  });

  afterAll(async () => {
    // Limpia lo que haya quedado del último test — este e2e comparte la misma base Postgres
    // con otros archivos e2e (ver docker-compose.yml); un Player huérfano con FK desde
    // PlayerSeasonStats/PlayerMatchStats rompería el cleanup de otro archivo (ej.
    // ingestion.e2e-spec.ts) si no se borra acá.
    await cleanDatabase();
    await app.close();
  });

  beforeEach(async () => {
    fakeAdapter.squadStatsByTeam.clear();
    fakeAdapter.matchLogByPlayer.clear();
    fakeAdapter.failingTeamExternalId = null;
    fakeAdapter.blockedTeamExternalId = null;

    await cleanDatabase();
  });

  async function cleanDatabase() {
    await em.nativeDelete(PlayerMatchStats, {});
    await em.nativeDelete(PlayerSeasonStats, {});
    await em.nativeDelete(WhoScoredUnmatchedPlayer, {});
    await em.nativeDelete(Player, {});
    await em.nativeDelete(Team, {});
    await em.nativeDelete(League, {});
  }

  async function seedTeamWithPlayer(overrides: { externalWhoScoredId?: string | null } = {}) {
    const league = em.create(League, { name: `League ${Date.now()}-${Math.random()}`, country: 'Testland' });
    const team = em.create(Team, {
      name: 'Fixture Team',
      externalWhoScoredId: overrides.externalWhoScoredId ?? 'team-1',
      league,
    });
    const player = em.create(Player, {
      fullName: 'Fixture Player Matched',
      position: PlayerPosition.MF,
      baseValue: '0.00',
      team,
      createdAt: new Date(),
    });
    em.persist([league, team, player]);
    await em.flush();
    return { league, team, player };
  }

  it('crea el snapshot de temporada y no lo duplica en una segunda corrida (Escenario 1)', async () => {
    const { team } = await seedTeamWithPlayer();
    fakeAdapter.squadStatsByTeam.set(team.externalWhoScoredId!, [SEASON_STATS]);

    const first = await playerStatsService.refresh();
    expect(first).toEqual({ teamsProcessed: 1, teamsSkipped: 0, playersUpdated: 1, playersUnmatched: 0 });
    expect(await em.count(PlayerSeasonStats, {})).toBe(1);

    const second = await playerStatsService.refresh();
    expect(second.playersUpdated).toBe(1);
    expect(await em.count(PlayerSeasonStats, {})).toBe(1);
  });

  it('cuenta los equipos sin externalWhoScoredId como skipped', async () => {
    const league = em.create(League, { name: `League ${Date.now()}`, country: 'Testland' });
    const unmappedTeam = em.create(Team, { name: 'Sin mapeo', externalWhoScoredId: null, league });
    em.persist([league, unmappedTeam]);
    await em.flush();

    const result = await playerStatsService.refresh();
    expect(result.teamsSkipped).toBe(1);
    expect(result.teamsProcessed).toBe(0);
  });

  it('registra para revisión manual un jugador sin match, sin bloquear el resto del equipo (Escenario 2)', async () => {
    const { team } = await seedTeamWithPlayer();
    fakeAdapter.squadStatsByTeam.set(team.externalWhoScoredId!, [SEASON_STATS, UNMATCHED_STATS]);

    const result = await playerStatsService.refresh();

    expect(result.playersUpdated).toBe(1);
    expect(result.playersUnmatched).toBe(1);
    const unmatched = await em.findOneOrFail(WhoScoredUnmatchedPlayer, { whoScoredExternalId: 'ws-2' });
    expect(unmatched.whoScoredName).toBe('Completely Unknown Name');
  });

  it('una falla puntual de equipo no aborta el resto del lote (Escenario 4)', async () => {
    await seedTeamWithPlayer({ externalWhoScoredId: 'team-ok' });
    const league2 = em.create(League, { name: `League2 ${Date.now()}`, country: 'Testland' });
    const failingTeam = em.create(Team, { name: 'Failing Team', externalWhoScoredId: 'team-fail', league: league2 });
    em.persist([league2, failingTeam]);
    await em.flush();

    fakeAdapter.squadStatsByTeam.set('team-ok', [SEASON_STATS]);
    fakeAdapter.failingTeamExternalId = 'team-fail';

    const result = await playerStatsService.refresh();

    expect(result.teamsProcessed).toBe(1);
    expect(result.playersUpdated).toBe(1);
  });

  it('un bloqueo generalizado aborta el resto de la corrida sin borrar snapshots previos (Escenario 4)', async () => {
    await seedTeamWithPlayer({ externalWhoScoredId: 'team-first' });
    fakeAdapter.squadStatsByTeam.set('team-first', [SEASON_STATS]);
    await playerStatsService.refresh();
    expect(await em.count(PlayerSeasonStats, {})).toBe(1);

    const league2 = em.create(League, { name: `League3 ${Date.now()}`, country: 'Testland' });
    const blockedTeam = em.create(Team, { name: 'Blocked Team', externalWhoScoredId: 'team-blocked', league: league2 });
    em.persist([league2, blockedTeam]);
    await em.flush();
    fakeAdapter.blockedTeamExternalId = 'team-blocked';

    const result = await playerStatsService.refresh();

    // team-first ya se había procesado antes del bloqueo; team-blocked corta el resto de la
    // corrida sin llegar a persistir nada nuevo ni borrar lo ya persistido (spec.md §6).
    expect(result.teamsProcessed).toBe(1);
    expect(await em.count(PlayerSeasonStats, {})).toBe(1);
  });

  it('el detalle partido a partido no duplica filas en llamadas repetidas (Escenario 3)', async () => {
    const { player } = await seedTeamWithPlayer();
    player.externalWhoScoredId = 'ws-1';
    em.persist(player);
    await em.flush();
    fakeAdapter.matchLogByPlayer.set('ws-1', [MATCH_STATS]);

    const first = await playerStatsService.getPlayerMatches(player.id);
    expect(first.matches).toHaveLength(1);

    const second = await playerStatsService.getPlayerMatches(player.id);
    expect(second.matches).toHaveLength(1);
    expect(await em.count(PlayerMatchStats, {})).toBe(1);
  });

  it('responde 409 (ConflictException) si el jugador no tiene match con WhoScored (Escenario 3)', async () => {
    const { player } = await seedTeamWithPlayer();

    await expect(playerStatsService.getPlayerMatches(player.id)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('responde 404 (NotFoundException) si el jugador no existe', async () => {
    await expect(
      playerStatsService.getPlayerMatches('00000000-0000-0000-0000-000000000000'),
    ).rejects.toMatchObject({ status: 404 });
  });
});
