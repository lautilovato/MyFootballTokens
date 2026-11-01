import { ApiProperty } from '@nestjs/swagger';
import { PlayerCardDto } from '../../player/dto/player-response.dto';
import { StrategyRefDto } from '../../quotes/dto/quote-run-response.dto';

export class RankingEntryDto {
  @ApiProperty({ minimum: 1, example: 1, description: 'Puesto en el ranking; 1 es el jugador más caro' })
  rank!: number;

  @ApiProperty({
    minimum: 0,
    maximum: 100,
    example: 37,
    description: 'Cartas del jugador en poder de usuarios, a la venta o no (13-ranking FR-005)',
  })
  inCirculation!: number;

  @ApiProperty({
    type: PlayerCardDto,
    description: 'Carta del jugador. `marketValue` es su precio en la corrida de la que sale el ranking (FR-002)',
  })
  player!: PlayerCardDto;
}

export class PlayerRankingDto {
  @ApiProperty({ type: StrategyRefDto, description: 'Estrategia activa y versión con la que se calcularon los precios' })
  strategy!: StrategyRefDto;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Cuándo terminó la corrida. Nulo si la estrategia activa todavía no se calculó (FR-007)',
  })
  calculatedAt!: string | null;

  @ApiProperty({ type: [RankingEntryDto] })
  data!: RankingEntryDto[];
}
