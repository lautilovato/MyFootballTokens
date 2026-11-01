import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_LISTINGS_PAGE_SIZE = 20;
export const MAX_LISTINGS_PAGE_SIZE = 100;

/** Paginación de las cartas a la venta de un jugador (FR-027). */
export class PlayerListingsQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_LISTINGS_PAGE_SIZE, default: DEFAULT_LISTINGS_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LISTINGS_PAGE_SIZE)
  limit?: number;
}
