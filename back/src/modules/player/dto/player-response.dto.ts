import { ApiProperty } from '@nestjs/swagger';
import { Player, PlayerPosition } from '../../../infrastructure/database/entities/player.entity';

export class PlayerResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: PlayerPosition })
  position!: PlayerPosition;

  @ApiProperty()
  team!: string;

  @ApiProperty()
  league!: string;

  @ApiProperty({ type: Number })
  baseValue!: number;

  @ApiProperty({ type: String, nullable: true })
  externalId!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty({ type: String, nullable: true })
  updatedAt!: string | null;

  static fromEntity(player: Player): PlayerResponseDto {
    const dto = new PlayerResponseDto();
    dto.id = player.id;
    dto.name = player.fullName;
    dto.position = player.position;
    dto.team = player.team.name;
    dto.league = player.team.league.name;
    dto.baseValue = Number(player.baseValue);
    dto.externalId = player.externalWhoScoredId ?? player.externalFootballDataId ?? null;
    dto.createdAt = player.createdAt.toISOString();
    dto.updatedAt = player.updatedAt ? player.updatedAt.toISOString() : null;
    return dto;
  }
}

export class PlayersPageMetaDto {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  totalPages!: number;
}

export class PlayersPageDto {
  @ApiProperty({ type: [PlayerResponseDto] })
  data!: PlayerResponseDto[];

  @ApiProperty({ type: PlayersPageMetaDto })
  meta!: PlayersPageMetaDto;
}
