import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { SWAGGER_BEARER_SCHEME } from '../../shared/auth/auth.constants';
import { PlayerPosition } from '../../infrastructure/database/entities/player.entity';
import { GetPlayersFilterDto, RARITIES } from './dto/get-players-filter.dto';
import { PlayerDetailDto, PlayersPageDto } from './dto/player-response.dto';
import { PlayerService } from './player.service';

@ApiTags('Players')
@Controller('players')
export class PlayerController {
  constructor(private readonly playerService: PlayerService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_SCHEME)
  @ApiOperation({
    summary: 'Listado paginado y filtrado de jugadores para la grilla del mercado',
    description:
      'Todos los filtros son opcionales y se combinan con AND. Los parámetros de valores múltiples se envían repitiendo la clave: ?league=Premier League&league=La Liga',
  })
  @ApiQuery({ name: 'league', required: false, isArray: true, type: String, example: 'Premier League' })
  @ApiQuery({ name: 'team', required: false, isArray: true, type: String, example: 'Manchester City' })
  @ApiQuery({ name: 'position', required: false, isArray: true, enum: PlayerPosition })
  @ApiQuery({ name: 'rarity', required: false, isArray: true, enum: RARITIES })
  @ApiQuery({ name: 'minValue', required: false, type: Number, example: 100 })
  @ApiQuery({ name: 'maxValue', required: false, type: Number, example: 10000 })
  @ApiQuery({
    name: 'minOvr',
    required: false,
    type: Number,
    example: 70,
    description: 'Excluye a los jugadores sin estadísticas de temporada: no tienen OVR que comparar.',
  })
  @ApiQuery({ name: 'maxOvr', required: false, type: Number, example: 99 })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    example: 'nicolas',
    description: 'Fragmento del nombre. Parcial, insensible a mayúsculas y acentos.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'Lista paginada de jugadores', type: PlayersPageDto })
  @ApiResponse({
    status: 400,
    description: 'Parámetro inválido: enum desconocido, rango invertido o valor fuera de límites',
  })
  @ApiResponse({ status: 401, description: 'Sin credencial de sesion valida' })
  async findAll(@Query() filter: GetPlayersFilterDto): Promise<PlayersPageDto> {
    return this.playerService.findAll(filter);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_SCHEME)
  @ApiOperation({ summary: 'Detalle de un jugador para el panel lateral' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Jugador encontrado', type: PlayerDetailDto })
  @ApiResponse({ status: 400, description: 'El id no tiene formato UUID válido' })
  @ApiResponse({ status: 401, description: 'Sin credencial de sesion valida' })
  @ApiResponse({ status: 404, description: 'No existe un jugador con ese id' })
  async findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<PlayerDetailDto> {
    return this.playerService.findOne(id);
  }
}
