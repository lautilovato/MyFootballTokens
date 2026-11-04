import { ApiProperty } from '@nestjs/swagger';
import { PlayerCardDto } from '../../player/dto/player-response.dto';

export class InventoryTokenDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ minimum: 1, maximum: 100 })
  serial!: number;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Publicación activa del token; nulo si no está a la venta (09-mercado FR-025)',
  })
  listingId!: string | null;
}

export class InventoryItemDto {
  @ApiProperty({
    type: PlayerCardDto,
    description: 'La carta del jugador tal como la devuelve GET /players, con su cotización vigente en marketValue',
  })
  player!: PlayerCardDto;

  @ApiProperty({ type: Number, nullable: true, description: 'Reputación mundial del jugador (su OVR, FR-067)' })
  reputation!: number | null;

  @ApiProperty({ minimum: 1, description: 'Tokens del jugador que el usuario posee hoy' })
  count!: number;

  @ApiProperty({ type: [InventoryTokenDto] })
  tokens!: InventoryTokenDto[];
}

export class InventoryMetaDto {
  @ApiProperty({ description: 'Jugadores distintos del inventario' })
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  totalPages!: number;
}

export class InventoryResponseDto {
  @ApiProperty({ type: [InventoryItemDto] })
  data!: InventoryItemDto[];

  @ApiProperty({ type: InventoryMetaDto })
  meta!: InventoryMetaDto;
}
