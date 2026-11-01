import { ApiProperty } from '@nestjs/swagger';
import { ListingStatus } from '../../../infrastructure/database/entities/listing.entity';

/** Una publicación, tal como la ve su vendedor (contrato `Listing`). */
export class ListingResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tokenId!: string;

  @ApiProperty({ minimum: 1, maximum: 100 })
  serial!: number;

  @ApiProperty({ format: 'uuid' })
  playerId!: string;

  @ApiProperty({ enum: ListingStatus })
  status!: ListingStatus;

  @ApiProperty({ minimum: 1, description: 'Precio vigente del token = cotización vigente del jugador (FR-001)' })
  price!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  listedAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closedAt!: Date | null;
}
