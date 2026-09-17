import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiSecurity } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../shared/auth/api-key.guard';
import { SWAGGER_API_KEY_SCHEME } from '../../shared/auth/auth.constants';
import { TeamWhoScoredMatchingResultDto } from './dto/team-whoscored-matching-result.dto';
import { TeamWhoScoredMatchingService } from './team-whoscored-matching.service';

@ApiTags('TeamWhoScoredMatching')
@Controller('team-whoscored-matching')
@UseGuards(ApiKeyGuard)
@ApiSecurity(SWAGGER_API_KEY_SCHEME)
export class TeamWhoScoredMatchingController {
  constructor(private readonly teamWhoScoredMatchingService: TeamWhoScoredMatchingService) {}

  @Post('refresh')
  @ApiOperation({
    summary:
      'Completa Team.externalWhoScoredId para los equipos sin mapear de cada liga, comparando contra la tabla de posiciones de esa liga en WhoScored',
  })
  @ApiResponse({ status: 200, description: 'Corrida finalizada', type: TeamWhoScoredMatchingResultDto })
  async refresh(): Promise<TeamWhoScoredMatchingResultDto> {
    return this.teamWhoScoredMatchingService.refresh();
  }
}
