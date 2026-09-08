import { Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IngestionResultDto } from './dto/ingestion-result.dto';
import { IngestionService } from './ingestion.service';

@ApiTags('Ingestion')
@Controller('ingestion')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('players')
  @ApiOperation({
    summary: 'Dispara la ingesta completa del catálogo (5 ligas, equipos, jugadores)',
  })
  @ApiResponse({ status: 200, description: 'Ingesta finalizada', type: IngestionResultDto })
  async run(): Promise<IngestionResultDto> {
    return this.ingestionService.run();
  }
}
