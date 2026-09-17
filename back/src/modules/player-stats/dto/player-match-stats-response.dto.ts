import { ApiProperty } from '@nestjs/swagger';
import { PlayerMatchStats } from '../../../infrastructure/database/entities/player-match-stats.entity';

export class MatchStatsDto {
  @ApiProperty()
  whoScoredMatchId!: string;

  @ApiProperty({ example: '2026-09-06' })
  matchDate!: string;

  @ApiProperty({ example: '2025-2026' })
  season!: string;

  @ApiProperty()
  goals!: number;

  @ApiProperty()
  assists!: number;

  @ApiProperty()
  shots!: number;

  @ApiProperty()
  keyPasses!: number;

  @ApiProperty()
  dribbles!: number;

  @ApiProperty()
  tackles!: number;

  @ApiProperty()
  rating!: number;

  static fromEntity(entity: PlayerMatchStats): MatchStatsDto {
    const dto = new MatchStatsDto();
    dto.whoScoredMatchId = entity.whoScoredMatchId;
    dto.matchDate = entity.matchDate;
    dto.season = entity.season;
    dto.goals = entity.goals;
    dto.assists = entity.assists;
    dto.shots = entity.shots;
    dto.keyPasses = entity.keyPasses;
    dto.dribbles = entity.dribbles;
    dto.tackles = entity.tackles;
    dto.rating = Number(entity.rating);
    return dto;
  }
}

export class PlayerMatchStatsResponseDto {
  @ApiProperty({ format: 'uuid' })
  playerId!: string;

  @ApiProperty()
  playerName!: string;

  @ApiProperty({ type: [MatchStatsDto] })
  matches!: MatchStatsDto[];
}
