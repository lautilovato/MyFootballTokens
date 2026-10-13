import { Player, PlayerPosition } from '../../../infrastructure/database/entities/player.entity';
import { PlayerSeasonStats } from '../../../infrastructure/database/entities/player-season-stats.entity';
import { PlayerCardDto, PlayerDetailDto } from './player-response.dto';

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

// 08-sobres FR-067 a FR-069: el OVR es la reputación cargada, no el rating de temporada.
describe('PlayerCardDto.fromEntity — OVR y rareza', () => {
  it('toma el OVR de la reputación aunque el rating diga otra cosa', () => {
    const withReputation = Object.assign(player(), { worldReputation: 88 });
    const dto = PlayerCardDto.fromEntity({ player: withReputation, stats: stats({ rating: '6.10' }) });

    expect(dto.ovr).toBe(88);
    expect(dto.rarity).toBe('legendary');
  });

  it('presenta una reputación de 100 como OVR 99', () => {
    const dto = PlayerCardDto.fromEntity({ player: Object.assign(player(), { worldReputation: 100 }), stats: null });
    expect(dto.ovr).toBe(99);
  });

  it('sin reputación cargada, OVR nulo y rareza common (FR-068)', () => {
    const dto = PlayerCardDto.fromEntity({ player: Object.assign(player(), { worldReputation: null }), stats: stats() });

    expect(dto.ovr).toBeNull();
    expect(dto.rarity).toBe('common');
  });

  it('el detalle muestra el mismo OVR y la misma rareza que la carta (FR-069)', () => {
    const row = { player: Object.assign(player(), { worldReputation: 82 }), stats: stats() };
    const card = PlayerCardDto.fromEntity(row);
    const detail = PlayerDetailDto.fromEntity(row);

    expect(detail.ovr).toBe(card.ovr);
    expect(detail.rarity).toBe(card.rarity);
    expect(card.rarity).toBe('epic');
  });
});
