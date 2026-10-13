import { Player, PlayerPosition } from '../../../infrastructure/database/entities/player.entity';
import { PlayerSeasonStats } from '../../../infrastructure/database/entities/player-season-stats.entity';
import { PlayerDetailDto } from './player-response.dto';

function player(): Player {
  return Object.assign(new Player(), {
    id: '11111111-1111-4111-8111-111111111111',
    fullName: 'Bukayo Saka',
    position: PlayerPosition.FW,
    nationality: 'England',
    baseValue: '9000.00',
    height: 178,
    team: { name: 'Arsenal FC', crestUrl: null, league: { name: 'Premier League' } },
  });
}

function stats(overrides: Partial<PlayerSeasonStats> = {}): PlayerSeasonStats {
  return Object.assign(new PlayerSeasonStats(), {
    season: '2026-2027',
    matchesPlayed: 28,
    goals: 10,
    assists: 5,
    shotsPerGame: '2.50',
    keyPasses: '1.20',
    dribbles: '0.80',
    tackles: '1.10',
    rating: '7.60',
    ...overrides,
  });
}

describe('PlayerDetailDto.fromEntity', () => {
  it('expone los partidos jugados de la temporada', () => {
    const dto = PlayerDetailDto.fromEntity({ player: player(), stats: stats() });

    expect(dto.matchesPlayed).toBe(28);
    expect(dto.season).toBe('2026-2027');
    expect(dto.league).toBe('Premier League');
  });

  it('devuelve null (no 0) si el snapshot todavía no tiene partidos jugados', () => {
    const dto = PlayerDetailDto.fromEntity({
      player: player(),
      stats: stats({ matchesPlayed: null }),
    });

    expect(dto.matchesPlayed).toBeNull();
  });

  it('devuelve null en las métricas de un jugador sin estadísticas', () => {
    const dto = PlayerDetailDto.fromEntity({ player: player(), stats: null });

    expect(dto.matchesPlayed).toBeNull();
    expect(dto.rating).toBeNull();
    expect(dto.season).toBeNull();
  });
});
