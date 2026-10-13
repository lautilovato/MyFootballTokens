import { Controller, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../shared/auth/api-key.guard';
import { SWAGGER_API_KEY_SCHEME } from '../../shared/auth/auth.constants';
import { PlayerImagesRefreshResultDto } from './dto/player-images-refresh-result.dto';
import {
  DEFAULT_REFRESH_LIMIT,
  MAX_REFRESH_LIMIT,
  PlayerImagesService,
} from './player-images.service';

@ApiTags('PlayerImages')
@Controller('player-images')
@UseGuards(ApiKeyGuard)
@ApiSecurity(SWAGGER_API_KEY_SCHEME)
export class PlayerImagesController {
  constructor(private readonly playerImagesService: PlayerImagesService) {}

  @Post('refresh')
  @ApiOperation({
    summary:
      'Busca en TheSportsDB la ilustración cartoon de los jugadores del catálogo que aún no tienen imagen y guarda su URL',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: `Jugadores a revisar en esta corrida (por defecto ${DEFAULT_REFRESH_LIMIT}, máximo ${MAX_REFRESH_LIMIT}). Cada uno cuesta 2 a 3 peticiones a ~2 s cada una.`,
  })
  @ApiResponse({ status: 200, description: 'Corrida finalizada', type: PlayerImagesRefreshResultDto })
  @ApiResponse({ status: 401, description: 'Clave administrativa ausente o incorrecta' })
  async refresh(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<PlayerImagesRefreshResultDto> {
    return this.playerImagesService.refresh(limit);
  }
}
