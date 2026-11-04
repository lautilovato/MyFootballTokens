import { ApiProperty } from '@nestjs/swagger';
import { PlayerQuote } from '../../../infrastructure/database/entities/player-quote.entity';
import { QuoteDto } from './current-quote-response.dto';

/**
 * Cotización vigente de un jugador en un instante (10-historial-operaciones FR-028 a FR-030): la
 * última calculada hasta ahí, siempre una cotización existente del historial y nunca una
 * interpolada (FR-029).
 */
export class QuoteAtResponseDto {
  @ApiProperty({ format: 'uuid' })
  playerId!: string;

  @ApiProperty({ type: String, format: 'date-time', description: 'El instante consultado, tal como se recibió' })
  at!: string;

  @ApiProperty({ description: 'false si el jugador no tenía cotización hasta `at` (no es un error, 07 FR-018)' })
  quoted!: boolean;

  @ApiProperty({ type: QuoteDto, nullable: true })
  quote!: QuoteDto | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Fecha de la primera cotización del jugador. Solo se informa cuando `quoted` es false; nulo si nunca fue cotizado.',
  })
  firstQuotedAt!: Date | null;

  static from(playerId: string, at: string, quote: PlayerQuote | null, firstQuotedAt: Date | null): QuoteAtResponseDto {
    const dto = new QuoteAtResponseDto();
    dto.playerId = playerId;
    dto.at = at;
    dto.quoted = quote !== null;
    dto.quote = quote ? QuoteDto.fromEntity(quote) : null;
    dto.firstQuotedAt = quote ? null : firstQuotedAt;
    return dto;
  }
}
