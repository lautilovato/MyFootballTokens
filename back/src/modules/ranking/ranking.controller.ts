import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_SCHEME } from '../../shared/auth/auth.constants';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { PlayerRankingDto } from './dto/ranking-response.dto';
import { RankingService } from './ranking.service';

@ApiTags('Ranking')
@Controller('ranking')
export class RankingController {
  constructor(private readonly rankingService: RankingService) {}

  @Get('players')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_SCHEME)
  @ApiOperation({
    summary: 'Top de jugadores más caros según la estrategia activa (13-ranking)',
    description:
      'Sale de la última corrida completada de la estrategia activa y considera a todos los jugadores que esa corrida cotizó, tengan o no cartas en circulación. ' +
      'Si la estrategia activa todavía no se calculó, responde 200 con `data` vacío y `calculatedAt` nulo.',
  })
  @ApiResponse({ status: 200, description: 'Ranking con las cartas en circulación de cada jugador', type: PlayerRankingDto })
  @ApiResponse({ status: 401, description: 'Sin credencial de sesión válida' })
  @ApiResponse({ status: 409, description: 'NO_ACTIVE_STRATEGY' })
  async getTopPlayers(): Promise<PlayerRankingDto> {
    return this.rankingService.getTopPlayers();
  }
}
