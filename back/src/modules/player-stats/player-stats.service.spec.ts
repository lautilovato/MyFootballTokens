import type { WhoScoredAdapter, NormalizedSeasonStats } from '../../adapters/who-scored/who-scored.adapter';
import type { PinoLoggerService } from '../../shared/logging/pino-logger.service';
import type { PlayerService } from '../player/player.service';
import type { PlayerStatsRepository } from './player-stats.repository';
import { PlayerStatsService } from './player-stats.service';

function squadRow(whoScoredPlayerId: string, whoScoredName: string): NormalizedSeasonStats {
  return {
    whoScoredPlayerId,
    whoScoredName,
    season: '2026-2027',
    matchesPlayed: 10,
    goals: 1,
    assists: 1,
    shotsPerGame: 1,
    keyPasses: 1,
    dribbles: 1,
    tackles: 1,
    rating: 7,
    height: null,
  };
}

/** Refresh contra un equipo con dos jugadores, sin WhoScored ni base de datos reales. */
function setup(squad: NormalizedSeasonStats[]) {
  const team = { id: 1, externalWhoScoredId: '23' };
  const candidates = [
    { id: 'pope', fullName: 'Nick Pope' },
    { id: 'trippier', fullName: 'Kieran Trippier' },
  ];
  const linked: Array<{ playerId: string; whoScoredId: string }> = [];
  const unmatched: string[] = [];

  const repository = {
    findTeamsWithWhoScoredMapping: async () => [team],
    countTeamsWithoutMapping: async () => 0,
    findCandidatesByTeam: async () => candidates,
    findPlayerById: async (id: string) => ({ id }),
    linkWhoScoredId: async (player: { id: string }, whoScoredId: string) => {
      linked.push({ playerId: player.id, whoScoredId });
    },
    setHeightIfEmpty: async () => {},
    upsertSeasonStats: async () => {},
    upsertUnmatchedPlayer: async (_team: unknown, _id: string, name: string) => {
      unmatched.push(name);
    },
  } as unknown as PlayerStatsRepository;
  const adapter = { getSquadStats: async () => squad } as unknown as WhoScoredAdapter;
  const logger = { event: () => {} } as unknown as PinoLoggerService;
  const playerService = { invalidateListCache: async () => {} } as unknown as PlayerService;

  const service = new PlayerStatsService(adapter, repository, logger, playerService);
  return { service, linked, unmatched };
}

describe('PlayerStatsService.refresh', () => {
  it('vincula al jugador con el mismo apellido', async () => {
    const { service, linked } = setup([squadRow('ws-1', 'Kieran Trippier')]);

    const result = await service.refresh();

    expect(linked).toEqual([{ playerId: 'trippier', whoScoredId: 'ws-1' }]);
    expect(result).toMatchObject({ teamsProcessed: 1, playersUpdated: 1, playersUnmatched: 0 });
  });

  it('no vincula a jugadores distintos que solo comparten el nombre de pila', async () => {
    // "Nick Woltemade" supera el umbral contra "Nick Pope" por el prefijo común: el filtro
    // por apellido es lo que evita vincularlos.
    const { service, linked, unmatched } = setup([squadRow('ws-2', 'Nick Woltemade')]);

    const result = await service.refresh();

    expect(linked).toEqual([]);
    expect(unmatched).toEqual(['Nick Woltemade']);
    expect(result).toMatchObject({ playersUpdated: 0, playersUnmatched: 1 });
  });
});
