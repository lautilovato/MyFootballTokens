import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PlayerPosition } from '../../../infrastructure/database/entities/player.entity';

export class GetPlayersFilterDto {
  @ApiPropertyOptional({ description: 'Nombre de la liga', example: 'Premier League' })
  @IsOptional()
  @IsString()
  league?: string;

  @ApiPropertyOptional({ description: 'Nombre del equipo', example: 'Manchester City' })
  @IsOptional()
  @IsString()
  team?: string;

  @ApiPropertyOptional({ enum: PlayerPosition })
  @IsOptional()
  @IsEnum(PlayerPosition)
  position?: PlayerPosition;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
