import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../../shared/auth/api-key.guard';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import {
  SWAGGER_API_KEY_SCHEME,
  SWAGGER_BEARER_SCHEME,
} from '../../shared/auth/auth.constants';
import { PlayerMatchStatsResponseDto } from './dto/player-match-stats-response.dto';
import { PlayerStatsRefreshResultDto } from './dto/player-stats-refresh-result.dto';
import { PlayerStatsService } from './player-stats.service';

/**
 * ATENCION: los guards van POR RUTA, nunca a nivel de clase (research #3).
 * Este controller mezcla un disparo administrativo (POST refresh) con una
 * lectura de catalogo (GET :playerId/matches). Un @UseGuards en la clase
 * aplicaria un unico criterio a ambos y romperia FR-009 o FR-010.
 */
@ApiTags('PlayerStats')
@Controller('player-stats')
export class PlayerStatsController {
  constructor(private readonly playerStatsService: PlayerStatsService) {}

  @Post('refresh')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity(SWAGGER_API_KEY_SCHEME)
  @ApiResponse({ status: 401, description: 'Clave administrativa ausente o incorrecta' })
  @ApiOperation({
    summary: 'Dispara el refresh periódico de métricas de temporada para los equipos mapeados a WhoScored',
  })
  @ApiResponse({ status: 200, description: 'Refresh finalizado', type: PlayerStatsRefreshResultDto })
  async refresh(): Promise<PlayerStatsRefreshResultDto> {
    return this.playerStatsService.refresh();
  }

  @Get(':playerId/matches')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_SCHEME)
  @ApiResponse({ status: 401, description: 'Sin credencial de sesion valida' })
  @ApiOperation({ summary: 'Obtiene (y persiste) el detalle partido a partido de un jugador puntual' })
  @ApiParam({ name: 'playerId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Detalle partido a partido', type: PlayerMatchStatsResponseDto })
  @ApiResponse({ status: 404, description: 'El jugador no existe' })
  @ApiResponse({ status: 409, description: 'El jugador no tiene match con WhoScored todavía' })
  async getPlayerMatches(@Param('playerId') playerId: string): Promise<PlayerMatchStatsResponseDto> {
    return this.playerStatsService.getPlayerMatches(playerId);
  }
}
