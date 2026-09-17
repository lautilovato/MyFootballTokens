import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../shared/auth/api-key.guard';
import { SWAGGER_API_KEY_SCHEME } from '../../shared/auth/auth.constants';
import { IngestionResultDto } from './dto/ingestion-result.dto';
import { IngestionService } from './ingestion.service';

@ApiTags('Ingestion')
@Controller('ingestion')
@UseGuards(ApiKeyGuard)
@ApiSecurity(SWAGGER_API_KEY_SCHEME)
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
