import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { SWAGGER_BEARER_SCHEME } from '../../shared/auth/auth.constants';
import { PlayerPosition } from '../../infrastructure/database/entities/player.entity';
import { GetPlayersFilterDto } from './dto/get-players-filter.dto';
import { PlayerResponseDto, PlayersPageDto } from './dto/player-response.dto';
import { PlayerService } from './player.service';

@ApiTags('Players')
@Controller('players')
export class PlayerController {
  constructor(private readonly playerService: PlayerService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_SCHEME)
  @ApiResponse({ status: 401, description: 'Sin credencial de sesion valida' })
  @ApiOperation({ summary: 'Listado paginado y filtrado de jugadores' })
  @ApiQuery({ name: 'league', required: false, example: 'Premier League' })
  @ApiQuery({ name: 'team', required: false, example: 'Manchester City' })
  @ApiQuery({ name: 'position', required: false, enum: PlayerPosition })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'Lista paginada de jugadores', type: PlayersPageDto })
  @ApiResponse({ status: 400, description: 'Parámetros de query inválidos' })
  async findAll(@Query() filter: GetPlayersFilterDto): Promise<PlayersPageDto> {
    return this.playerService.findAll(filter);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_SCHEME)
  @ApiResponse({ status: 401, description: 'Sin credencial de sesion valida' })
  @ApiOperation({ summary: 'Detalle de un jugador por id' })
  @ApiResponse({ status: 200, description: 'Jugador encontrado', type: PlayerResponseDto })
  @ApiResponse({ status: 400, description: 'El id no tiene formato UUID válido' })
  @ApiResponse({ status: 404, description: 'No existe un jugador con ese id' })
  async findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<PlayerResponseDto> {
    return this.playerService.findOne(id);
  }
}
