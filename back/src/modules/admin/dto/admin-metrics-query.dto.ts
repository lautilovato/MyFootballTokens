import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsTimeZone } from 'class-validator';

/** Período del panel. Las reglas entre campos están en `admin-period.ts`. */
export class AdminMetricsQueryDto {
  @ApiPropertyOptional({ format: 'date', description: 'Junto con `to`. Sin ninguno de los dos, toda la historia.' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ default: 'UTC', description: 'Zona horaria IANA del administrador (FR-038)' })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;

  @ApiPropertyOptional({ enum: ['true'], description: 'Saltea la caché y calcula de nuevo (FR-026)' })
  @IsOptional()
  @IsIn(['true'])
  refresh?: string;
}
