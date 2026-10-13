import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';

export const HISTORY_MAX_LIMIT = 200;

/** El rango invertido (`from > to`) lo rechaza el service: depende de los dos campos. */
export class QuoteHistoryQueryDto {
  @ApiPropertyOptional({ description: 'Desde (inclusive), ISO 8601', example: '2026-09-01T00:00:00Z' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'Hasta (inclusive), ISO 8601. Debe ser ≥ from' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: HISTORY_MAX_LIMIT, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(HISTORY_MAX_LIMIT)
  limit?: number;
}
