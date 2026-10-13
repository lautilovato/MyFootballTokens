import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID, ValidateNested } from 'class-validator';
import { SetReputationDto } from './set-reputation.dto';

export const BULK_REPUTATION_MAX_ITEMS = 1000;

export class ReputationItemDto extends SetReputationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  playerId!: string;
}

/**
 * Un ítem con formato inválido rechaza el lote completo antes de tocar la base (FR-034). Lo que
 * no aborta el lote es un id bien formado que no existe: se informa en `notFound` (FR-024).
 */
export class BulkReputationDto {
  @ApiProperty({ type: [ReputationItemDto], minItems: 1, maxItems: BULK_REPUTATION_MAX_ITEMS })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BULK_REPUTATION_MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ReputationItemDto)
  items!: ReputationItemDto[];
}
