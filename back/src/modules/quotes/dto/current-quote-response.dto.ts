import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  METRICS,
  type Metric,
} from '../../../infrastructure/database/entities/valuation-strategy-version.entity';
import {
  PlayerQuote,
  PositionProfile,
} from '../../../infrastructure/database/entities/player-quote.entity';
import { QuoteRunTrigger } from '../../../infrastructure/database/entities/quote-run.entity';
import { priceChangePct } from '../quotes.model';
import { StrategyRefDto } from './quote-run-response.dto';

export class BreakdownItemDto {
  @ApiProperty({ enum: METRICS })
  metric!: Metric;

  @ApiPropertyOptional({ nullable: true, description: 'Valor del jugador antes de normalizar' })
  raw!: number | null;

  @ApiProperty({
    minimum: 0,
    description: '0 = percentil 5 del lote, 1 = percentil 95. Sin tope: puede superar 1.',
  })
  normalized!: number;

  @ApiProperty()
  weight!: number;

  @ApiProperty({ description: 'weight × normalized / positiveWeightSum' })
  contribution!: number;
}

/** Una cotización tal como se lista en el historial (sin desglose). */
export class QuoteDto {
  @ApiProperty({ description: 'Créditos enteros', example: 724 })
  price!: number;

  @ApiProperty({ minimum: 0, example: 0.693, description: 'Sin tope superior; el piso es 0' })
  score!: number;

  @ApiProperty({ description: 'Suma de contribuciones antes del piso en 0' })
  rawScore!: number;

  @ApiProperty()
  calculatedAt!: Date;

  @ApiProperty({ enum: QuoteRunTrigger })
  origin!: QuoteRunTrigger;

  @ApiProperty({ example: '2025-2026' })
  season!: string;

  @ApiProperty({ type: StrategyRefDto })
  strategy!: StrategyRefDto;

  @ApiProperty({ enum: PositionProfile })
  positionProfile!: PositionProfile;

  @ApiProperty()
  usedDefaultReputation!: boolean;

  @ApiProperty()
  missingMatchesPlayed!: boolean;

  /** Requiere `strategyVersion.strategy` populado. */
  static fromEntity(quote: PlayerQuote): QuoteDto {
    return QuoteDto.fill(new QuoteDto(), quote);
  }

  protected static fill<T extends QuoteDto>(dto: T, quote: PlayerQuote): T {
    dto.price = quote.price;
    dto.score = Number(quote.score);
    dto.rawScore = Number(quote.rawScore);
    dto.calculatedAt = quote.calculatedAt;
    dto.origin = quote.origin;
    dto.season = quote.season;
    dto.strategy = {
      key: quote.strategyVersion.strategy.key,
      version: quote.strategyVersion.version,
    };
    dto.positionProfile = quote.positionProfile;
    dto.usedDefaultReputation = quote.usedDefaultReputation;
    dto.missingMatchesPlayed = quote.missingMatchesPlayed;
    return dto;
  }
}

export class CurrentQuoteDetailDto extends QuoteDto {
  @ApiProperty({ type: [BreakdownItemDto] })
  breakdown!: BreakdownItemDto[];

  @ApiProperty({ description: 'S⁺: suma de los pesos positivos del perfil aplicado (FR-007)' })
  positiveWeightSum!: number;

  @ApiPropertyOptional({ nullable: true, description: 'Precio de la cotización anterior' })
  previousPrice!: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Variación porcentual respecto de la anterior, con un decimal; null si no hay anterior',
  })
  changePct!: number | null;

  static fromQuotes(latest: PlayerQuote, previous: PlayerQuote | null): CurrentQuoteDetailDto {
    const dto = QuoteDto.fill(new CurrentQuoteDetailDto(), latest);
    dto.breakdown = latest.breakdown;
    dto.positiveWeightSum = Number(latest.positiveWeightSum);
    dto.previousPrice = previous?.price ?? null;
    dto.changePct = priceChangePct(latest.price, previous?.price);
    return dto;
  }
}

export class CurrentQuoteResponseDto {
  @ApiProperty({ format: 'uuid' })
  playerId!: string;

  @ApiProperty({
    description: 'false si el jugador existe pero nunca fue cotizado: no hay precio por defecto (FR-018)',
  })
  quoted!: boolean;

  @ApiPropertyOptional({ type: CurrentQuoteDetailDto, nullable: true })
  quote!: CurrentQuoteDetailDto | null;

  static from(
    playerId: string,
    latest: PlayerQuote | null,
    previous: PlayerQuote | null,
  ): CurrentQuoteResponseDto {
    const dto = new CurrentQuoteResponseDto();
    dto.playerId = playerId;
    dto.quoted = latest !== null;
    dto.quote = latest ? CurrentQuoteDetailDto.fromQuotes(latest, previous) : null;
    return dto;
  }
}
