import { ApiProperty } from '@nestjs/swagger';
import { League } from '../../../infrastructure/database/entities/league.entity';

export class LeagueResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Premier League' })
  name!: string;

  @ApiProperty({ example: 'England' })
  country!: string;

  @ApiProperty({ type: String, nullable: true, example: 'PL' })
  code!: string | null;

  static fromEntity(league: League): LeagueResponseDto {
    const dto = new LeagueResponseDto();
    dto.id = league.id;
    dto.name = league.name;
    dto.country = league.country;
    dto.code = league.code ?? null;
    return dto;
  }
}
