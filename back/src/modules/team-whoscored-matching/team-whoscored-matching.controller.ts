import { Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TeamWhoScoredMatchingResultDto } from './dto/team-whoscored-matching-result.dto';
import { TeamWhoScoredMatchingService } from './team-whoscored-matching.service';

@ApiTags('TeamWhoScoredMatching')
@Controller('team-whoscored-matching')
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
