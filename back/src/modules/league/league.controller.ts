import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { SWAGGER_BEARER_SCHEME } from '../../shared/auth/auth.constants';
import { LeagueResponseDto } from './dto/league-response.dto';
import { LeagueService } from './league.service';

@ApiTags('Leagues')
@Controller('leagues')
export class LeagueController {
  constructor(private readonly leagueService: LeagueService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_SCHEME)
  @ApiOperation({
    summary: 'Ligas disponibles en el catálogo, para poblar el panel de filtros',
    description: 'Devuelve las ligas que efectivamente existen, no una lista fija en el cliente.',
  })
  @ApiResponse({ status: 200, description: 'Ligas del catálogo', type: [LeagueResponseDto] })
  @ApiResponse({ status: 401, description: 'Sin credencial de sesion valida' })
  async findAll(): Promise<LeagueResponseDto[]> {
    return this.leagueService.findAll();
  }
}
