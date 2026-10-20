import { ApiProperty } from '@nestjs/swagger';
import { PACK_TYPES } from '../pack-config.rules';
import type { PackTypeKey } from '../pack-config.rules';

export class RarityProbabilitiesDto {
  @ApiProperty({ minimum: 0, maximum: 1 })
  common!: number;

  @ApiProperty({ minimum: 0, maximum: 1 })
  rare!: number;

  @ApiProperty({ minimum: 0, maximum: 1 })
  epic!: number;

  @ApiProperty({ minimum: 0, maximum: 1 })
  legendary!: number;
}

export class PackTypeInfoDto {
  @ApiProperty({ enum: PACK_TYPES })
  type!: PackTypeKey;

  @ApiProperty({ example: 200, description: 'Precio vigente en créditos' })
  price!: number;

  @ApiProperty({ example: 4, description: 'Cartas por sobre' })
  cards!: number;

  @ApiProperty({ example: 4120, description: 'Sobres sin abrir del tipo' })
  remaining!: number;

  @ApiProperty({
    type: RarityProbabilitiesDto,
    nullable: true,
    description:
      'Proporción de cada rareza entre las cartas de los sobres sin abrir del tipo, en este momento (FR-010). Nulo si el tipo está agotado.',
  })
  probabilities!: RarityProbabilitiesDto | null;
}

export class PackCatalogResponseDto {
  @ApiProperty({ description: 'Falso si todavía no se generó ningún sobre (FR-061)' })
  stockGenerated!: boolean;

  @ApiProperty({ type: [PackTypeInfoDto], description: 'Los cuatro tipos, de menor a mayor' })
  types!: PackTypeInfoDto[];
}
