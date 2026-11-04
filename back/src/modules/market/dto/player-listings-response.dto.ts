import { ApiProperty } from '@nestjs/swagger';

/** Una carta a la venta, sin identificar al vendedor (FR-027). */
export class PlayerListingDto {
  @ApiProperty({ format: 'uuid' })
  listingId!: string;

  @ApiProperty({ format: 'uuid' })
  tokenId!: string;

  @ApiProperty({ minimum: 1, maximum: 100 })
  serial!: number;

  @ApiProperty({ description: 'Publicación del usuario de la sesión: no se puede comprar (FR-011)' })
  mine!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  listedAt!: Date;
}

export class MarketPageMetaDto {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  totalPages!: number;
}

/** Cartas a la venta de un jugador (contrato `PlayerListingsPage`). */
export class PlayerListingsResponseDto {
  @ApiProperty({ format: 'uuid' })
  playerId!: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Precio de cada carta = cotización vigente del jugador; nulo si no tiene cotización',
  })
  price!: number | null;

  @ApiProperty({ type: [PlayerListingDto] })
  data!: PlayerListingDto[];

  @ApiProperty({ type: MarketPageMetaDto })
  meta!: MarketPageMetaDto;
}
