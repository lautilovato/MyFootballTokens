import { ApiProperty } from '@nestjs/swagger';

/** Resultado de una compra (FR-017, contrato `Purchase`). */
export class PurchaseResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  listingId!: string;

  @ApiProperty({ format: 'uuid' })
  tokenId!: string;

  @ApiProperty({ minimum: 1, maximum: 100 })
  serial!: number;

  @ApiProperty({ format: 'uuid' })
  playerId!: string;

  @ApiProperty({ enum: ['common', 'rare', 'epic', 'legendary'] })
  rarity!: string;

  @ApiProperty({
    minimum: 1,
    description: 'Precio cobrado = cotización vigente del jugador en ese instante: un solo dato (FR-001, FR-017)',
  })
  price!: number;

  @ApiProperty({ minimum: 0 })
  balanceAfter!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  purchasedAt!: Date;
}
