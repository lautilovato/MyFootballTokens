import { ApiProperty } from '@nestjs/swagger';
import { PlayerCardDto } from '../../player/dto/player-response.dto';
import type { Rarity } from '../../player/rarity';
import { PACK_TYPES } from '../pack-config.rules';
import type { PackTypeKey } from '../pack-config.rules';

export class OpeningCardDto {
  @ApiProperty({ format: 'uuid' })
  tokenId!: string;

  @ApiProperty({ minimum: 1, maximum: 100 })
  serial!: number;

  @ApiProperty({ enum: ['common', 'rare', 'epic', 'legendary'], description: 'Rareza en el momento cero (FR-038)' })
  rarity!: Rarity;

  @ApiProperty({ description: 'Cotización del jugador en el momento cero, en créditos (FR-026)' })
  quotePrice!: number;

  @ApiProperty({
    type: PlayerCardDto,
    description:
      'La carta del jugador tal como la devuelve GET /players, con su OVR, rareza y cotización actuales. La rareza y la cotización del momento cero son las de arriba.',
  })
  player!: PlayerCardDto;
}

export class PackOpeningResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: PACK_TYPES })
  type!: PackTypeKey;

  @ApiProperty({ description: 'Precio efectivamente cobrado' })
  price!: number;

  @ApiProperty()
  cardCount!: number;

  @ApiProperty()
  balanceBefore!: number;

  @ApiProperty({ description: 'Saldo real después de la apertura' })
  balanceAfter!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  openedAt!: string;

  @ApiProperty({ type: [OpeningCardDto] })
  cards!: OpeningCardDto[];
}

export class PackOpeningsMetaDto {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  totalPages!: number;
}

export class PackOpeningsPageDto {
  @ApiProperty({ type: [PackOpeningResponseDto] })
  data!: PackOpeningResponseDto[];

  @ApiProperty({ type: PackOpeningsMetaDto })
  meta!: PackOpeningsMetaDto;
}
