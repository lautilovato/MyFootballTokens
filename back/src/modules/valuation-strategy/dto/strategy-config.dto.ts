import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { WEIGHT_MAX, WEIGHT_MIN } from '../strategy-config.rules';

/**
 * Un peso por métrica del catálogo; una métrica ausente vale 0. Con `forbidNonWhitelisted`, una
 * métrica desconocida (por ejemplo `cards`) se rechaza con 400 antes de llegar al service.
 */
export class WeightsDto {
  @ApiPropertyOptional({ minimum: WEIGHT_MIN, maximum: WEIGHT_MAX })
  @IsOptional() @IsNumber() @Min(WEIGHT_MIN) @Max(WEIGHT_MAX)
  goals?: number;

  @ApiPropertyOptional({ minimum: WEIGHT_MIN, maximum: WEIGHT_MAX })
  @IsOptional() @IsNumber() @Min(WEIGHT_MIN) @Max(WEIGHT_MAX)
  assists?: number;

  @ApiPropertyOptional({ minimum: WEIGHT_MIN, maximum: WEIGHT_MAX })
  @IsOptional() @IsNumber() @Min(WEIGHT_MIN) @Max(WEIGHT_MAX)
  shots?: number;

  @ApiPropertyOptional({ minimum: WEIGHT_MIN, maximum: WEIGHT_MAX })
  @IsOptional() @IsNumber() @Min(WEIGHT_MIN) @Max(WEIGHT_MAX)
  keyPasses?: number;

  @ApiPropertyOptional({ minimum: WEIGHT_MIN, maximum: WEIGHT_MAX })
  @IsOptional() @IsNumber() @Min(WEIGHT_MIN) @Max(WEIGHT_MAX)
  dribbles?: number;

  @ApiPropertyOptional({ minimum: WEIGHT_MIN, maximum: WEIGHT_MAX })
  @IsOptional() @IsNumber() @Min(WEIGHT_MIN) @Max(WEIGHT_MAX)
  tackles?: number;

  @ApiPropertyOptional({ minimum: WEIGHT_MIN, maximum: WEIGHT_MAX })
  @IsOptional() @IsNumber() @Min(WEIGHT_MIN) @Max(WEIGHT_MAX)
  rating?: number;

  @ApiPropertyOptional({ minimum: WEIGHT_MIN, maximum: WEIGHT_MAX })
  @IsOptional() @IsNumber() @Min(WEIGHT_MIN) @Max(WEIGHT_MAX)
  absence?: number;

  @ApiPropertyOptional({ minimum: WEIGHT_MIN, maximum: WEIGHT_MAX })
  @IsOptional() @IsNumber() @Min(WEIGHT_MIN) @Max(WEIGHT_MAX)
  worldReputation?: number;
}

/** Un perfil por posición reemplaza completo a los pesos generales para esa posición. */
export class ByPositionDto {
  @ApiPropertyOptional({ type: WeightsDto })
  @IsOptional() @ValidateNested() @Type(() => WeightsDto)
  GK?: WeightsDto;

  @ApiPropertyOptional({ type: WeightsDto })
  @IsOptional() @ValidateNested() @Type(() => WeightsDto)
  DF?: WeightsDto;

  @ApiPropertyOptional({ type: WeightsDto })
  @IsOptional() @ValidateNested() @Type(() => WeightsDto)
  MF?: WeightsDto;

  @ApiPropertyOptional({ type: WeightsDto })
  @IsOptional() @ValidateNested() @Type(() => WeightsDto)
  FW?: WeightsDto;
}

export class StrategyWeightsDto {
  @ApiProperty({ type: WeightsDto })
  @IsDefined() @IsObject() @ValidateNested() @Type(() => WeightsDto)
  general!: WeightsDto;

  @ApiPropertyOptional({ type: ByPositionDto })
  @IsOptional() @ValidateNested() @Type(() => ByPositionDto)
  byPosition?: ByPositionDto;
}

/** Configuración completa de una versión nueva (FR-010). Cada POST crea una versión inmutable. */
export class StrategyConfigDto {
  @ApiProperty({ type: StrategyWeightsDto })
  @IsDefined() @IsObject() @ValidateNested() @Type(() => StrategyWeightsDto)
  weights!: StrategyWeightsDto;

  @ApiProperty({ minimum: 0, example: 100, description: 'Precio de un jugador con score 0' })
  @IsInt() @Min(0)
  baseValue!: number;

  @ApiProperty({ minimum: 1, example: 900 })
  @IsInt() @Min(1)
  scaleFactor!: number;

  @ApiProperty({ minimum: 1, example: 10 })
  @IsInt() @Min(1)
  minPrice!: number;

  @ApiProperty({ minimum: 0, maximum: 100, example: 20 })
  @IsInt() @Min(0) @Max(100)
  defaultReputation!: number;
}
