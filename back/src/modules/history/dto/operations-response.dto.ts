import { ApiProperty } from '@nestjs/swagger';
import { PackType } from '../../../infrastructure/database/entities/pack.entity';
import { PlayerCardDto } from '../../player/dto/player-response.dto';
import { PageMetaDto } from '../../quotes/dto/page-meta.dto';
import { StrategyRefDto } from '../../quotes/dto/quote-run-response.dto';
import type { HistoryKind } from '../history-filter';

/** La cotización que fijó el precio de una compra o venta, con su estrategia y versión (FR-015). */
export class OperationQuoteDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  calculatedAt!: Date;

  @ApiProperty({ type: StrategyRefDto })
  strategy!: StrategyRefDto;
}

/**
 * Una carta que el usuario adquirió o vendió. Los campos de compra y venta son nulos en las
 * entradas de sobre: una carta de sobre no tiene precio de compra y la interfaz muestra «Primer
 * propietario» (FR-005, FR-015).
 */
export class OperationEntryDto {
  @ApiProperty({ description: 'Identificador de la entrada (no el del token)' })
  id!: string;

  @ApiProperty({
    enum: ['sobre', 'compra', 'venta'],
    description: '`sobre` y `compra` son adquiridas (FR-009); `venta` es vendida.',
  })
  kind!: HistoryKind;

  @ApiProperty({ type: String, format: 'date-time' })
  at!: Date;

  @ApiProperty({ format: 'uuid' })
  tokenId!: string;

  @ApiProperty({ minimum: 1, maximum: 100 })
  serial!: number;

  @ApiProperty({ enum: ['common', 'rare', 'epic', 'legendary'], description: 'La rareza de ese instante' })
  rarity!: string;

  @ApiProperty({ type: PlayerCardDto })
  player!: PlayerCardDto;

  @ApiProperty({ enum: PackType, nullable: true, description: 'Solo sobre' })
  packType!: PackType | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Solo compra y venta: es la cotización del jugador en ese instante (09 FR-017)',
  })
  price!: number | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Solo compra y venta' })
  balanceBefore!: number | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Solo compra y venta' })
  balanceAfter!: number | null;

  @ApiProperty({
    enum: ['plataforma', 'otro_usuario'],
    nullable: true,
    description: 'Solo compra y venta. Nunca identifica a la otra parte (FR-007)',
  })
  counterparty!: 'plataforma' | 'otro_usuario' | null;

  @ApiProperty({
    type: OperationQuoteDto,
    nullable: true,
    description: 'Solo compra y venta. Nulo si no se puede determinar: «estrategia no disponible» (FR-016)',
  })
  quote!: OperationQuoteDto | null;
}

export class OperationsHistoryPageDto {
  @ApiProperty({ type: [OperationEntryDto] })
  data!: OperationEntryDto[];

  @ApiProperty({ type: PageMetaDto })
  meta!: PageMetaDto;
}
