import { ApiProperty } from '@nestjs/swagger';
import { MarketPageMetaDto } from './player-listings-response.dto';

/** Una compra vista desde el usuario de la sesión (FR-029, contrato `Operation`). */
export class MarketOperationDto {
  @ApiProperty({ format: 'uuid' })
  purchaseId!: string;

  @ApiProperty({ enum: ['compra', 'venta'] })
  kind!: 'compra' | 'venta';

  @ApiProperty({ format: 'uuid' })
  tokenId!: string;

  @ApiProperty({ minimum: 1, maximum: 100 })
  serial!: number;

  @ApiProperty({ format: 'uuid' })
  playerId!: string;

  @ApiProperty({ enum: ['common', 'rare', 'epic', 'legendary'] })
  rarity!: string;

  @ApiProperty({ minimum: 1, description: 'Precio de la operación = cotización del jugador en ese instante' })
  price!: number;

  @ApiProperty({ minimum: 0, description: 'Saldo del usuario antes de la operación' })
  balanceBefore!: number;

  @ApiProperty({ minimum: 0, description: 'Saldo del usuario después de la operación' })
  balanceAfter!: number;

  @ApiProperty({ enum: ['plataforma', 'otro_usuario'], description: 'La contraparte nunca se identifica' })
  counterparty!: 'plataforma' | 'otro_usuario';

  @ApiProperty({ type: String, format: 'date-time' })
  at!: Date;
}

export class OperationsResponseDto {
  @ApiProperty({ type: [MarketOperationDto] })
  data!: MarketOperationDto[];

  @ApiProperty({ type: MarketPageMetaDto })
  meta!: MarketPageMetaDto;
}
