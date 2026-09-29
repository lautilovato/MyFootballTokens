import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { PlayerPosition } from '../../../infrastructure/database/entities/player.entity';
import { OVR_MAX } from '../ovr';
import { Rarity } from '../rarity';

export const RARITIES: Rarity[] = ['legendary', 'epic', 'rare', 'common'];

/**
 * Los parámetros repetibles llegan como string cuando aparecen una sola vez
 * (`?position=FW`) y como array cuando se repiten (`?position=FW&position=MF`).
 * Normalizar siempre a array evita tener que contemplar los dos casos en el repositorio.
 */
function toArray({ value }: { value: unknown }): unknown[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return Array.isArray(value) ? value : [value];
}

/**
 * Un rango invertido se rechaza, no se interpreta al revés (FR-016): interpretarlo en
 * silencio devolvería resultados que la persona no pidió y ocultaría el error de la interfaz.
 */
@ValidatorConstraint({ name: 'notGreaterThan', async: false })
class NotGreaterThan implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const [otherField] = args.constraints as [string];
    const other = (args.object as Record<string, unknown>)[otherField];
    if (value === undefined || other === undefined) return true;
    return Number(value) <= Number(other);
  }

  defaultMessage(args: ValidationArguments): string {
    const [otherField] = args.constraints as [string];
    return `${args.property} must not be greater than ${otherField}`;
  }
}

export class GetPlayersFilterDto {
  @ApiPropertyOptional({
    description: 'Nombre de liga. Repetible: ?league=Premier League&league=La Liga',
    type: [String],
    example: ['Premier League'],
  })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  league?: string[];

  @ApiPropertyOptional({ description: 'Nombre de equipo. Repetible.', type: [String] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  team?: string[];

  @ApiPropertyOptional({ enum: PlayerPosition, isArray: true, description: 'Repetible.' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(PlayerPosition, { each: true })
  position?: PlayerPosition[];

  @ApiPropertyOptional({
    enum: RARITIES,
    isArray: true,
    description: 'Repetible. Se traduce a un rango sobre el rating de temporada.',
  })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(RARITIES as unknown as object, { each: true })
  rarity?: Rarity[];

  @ApiPropertyOptional({ minimum: 0, description: 'Valor de mercado mínimo, inclusivo' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Validate(NotGreaterThan, ['maxValue'])
  minValue?: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Valor de mercado máximo, inclusivo' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxValue?: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: OVR_MAX,
    description: 'OVR mínimo, inclusivo. Excluye a los jugadores sin estadísticas (FR-030).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(OVR_MAX)
  @Validate(NotGreaterThan, ['maxOvr'])
  minOvr?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: OVR_MAX, description: 'OVR máximo, inclusivo.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(OVR_MAX)
  maxOvr?: number;

  @ApiPropertyOptional({
    description: 'Fragmento del nombre. Parcial, insensible a mayúsculas y acentos.',
    example: 'nicolas',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  search?: string;

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
