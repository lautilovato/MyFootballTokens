import { ApiProperty } from '@nestjs/swagger';
import { QuoteDto } from './current-quote-response.dto';
import { PageMetaDto } from './page-meta.dto';

export class QuoteHistoryResponseDto {
  @ApiProperty({ type: [QuoteDto], description: 'Cotizaciones de la más vieja a la más nueva' })
  data!: QuoteDto[];

  @ApiProperty({ type: PageMetaDto })
  meta!: PageMetaDto;
}
