import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PlayerMatchStatsResponseDto } from './dto/player-match-stats-response.dto';
import { PlayerStatsRefreshResultDto } from './dto/player-stats-refresh-result.dto';
import { PlayerStatsService } from './player-stats.service';

@ApiTags('PlayerStats')
@Controller('player-stats')
export class PlayerStatsController {
  constructor(private readonly playerStatsService: PlayerStatsService) {}

  @Post('refresh')
  @ApiOperation({
    summary: 'Dispara el refresh periódico de métricas de temporada para los equipos mapeados a WhoScored',
  })
  @ApiResponse({ status: 200, description: 'Refresh finalizado', type: PlayerStatsRefreshResultDto })
  async refresh(): Promise<PlayerStatsRefreshResultDto> {
    return this.playerStatsService.refresh();
  }

  @Get(':playerId/matches')
  @ApiOperation({ summary: 'Obtiene (y persiste) el detalle partido a partido de un jugador puntual' })
  @ApiParam({ name: 'playerId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Detalle partido a partido', type: PlayerMatchStatsResponseDto })
  @ApiResponse({ status: 404, description: 'El jugador no existe' })
  @ApiResponse({ status: 409, description: 'El jugador no tiene match con WhoScored todavía' })
  async getPlayerMatches(@Param('playerId') playerId: string): Promise<PlayerMatchStatsResponseDto> {
    return this.playerStatsService.getPlayerMatches(playerId);
  }
}
