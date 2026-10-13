import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_OPENINGS_PAGE_SIZE = 20;
export const MAX_OPENINGS_PAGE_SIZE = 100;

/** Paginación del historial de aperturas (FR-039). */
export class OpeningsQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_OPENINGS_PAGE_SIZE, default: DEFAULT_OPENINGS_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_OPENINGS_PAGE_SIZE)
  limit?: number;
}
