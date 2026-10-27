import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { HISTORY_TYPES } from '../history-filter';
import type { HistoryType } from '../history-filter';

export const DEFAULT_HISTORY_PAGE_SIZE = 20;
export const MAX_HISTORY_PAGE_SIZE = 100;

/** Filtro y paginación del historial de cartas adquiridas y vendidas (FR-008, FR-009). */
export class OperationsHistoryQueryDto {
  @ApiPropertyOptional({
    enum: HISTORY_TYPES,
    default: 'all',
    description: '`acquired`: cartas de sobres y compras. `sold`: ventas.',
  })
  @IsOptional()
  @IsIn(HISTORY_TYPES)
  type?: HistoryType;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_HISTORY_PAGE_SIZE, default: DEFAULT_HISTORY_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_HISTORY_PAGE_SIZE)
  limit?: number;
}
