import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
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
import { StrategyConfigDto } from './dto/strategy-config.dto';
import { StrategyResponseDto, StrategyVersionDto } from './dto/strategy-response.dto';
import { ValuationStrategyService } from './valuation-strategy.service';

/**
 * ATENCION: los guards van POR RUTA (05-auth research #3). Las lecturas usan sesión de usuario
 * (FR-033) y la creación de versiones y la activación, la clave administrativa (FR-032).
 */
@ApiTags('ValuationStrategies')
@Controller('valuation-strategies')
export class ValuationStrategyController {
  constructor(private readonly valuationStrategyService: ValuationStrategyService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_SCHEME)
  @ApiOperation({ summary: 'Lista las estrategias con su versión vigente y estado (FR-015)' })
  @ApiResponse({ status: 200, description: 'Estrategias', type: [StrategyResponseDto] })
  @ApiResponse({ status: 401, description: 'Sin credencial de sesión válida' })
  async list(): Promise<StrategyResponseDto[]> {
    return this.valuationStrategyService.list();
  }

  @Get(':key/versions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_SCHEME)
  @ApiOperation({ summary: 'Todas las versiones de una estrategia, de la más nueva a la más vieja' })
  @ApiParam({ name: 'key', example: 'performance' })
  @ApiResponse({ status: 200, description: 'Versiones', type: [StrategyVersionDto] })
  @ApiResponse({ status: 401, description: 'Sin credencial de sesión válida' })
  @ApiResponse({ status: 404, description: 'Estrategia inexistente' })
  async listVersions(@Param('key') key: string): Promise<StrategyVersionDto[]> {
    return this.valuationStrategyService.listVersions(key);
  }

  @Post(':key/versions')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity(SWAGGER_API_KEY_SCHEME)
  @ApiOperation({
    summary: 'Crea una versión nueva e inmutable con la configuración completa (FR-011, FR-012)',
  })
  @ApiParam({ name: 'key', example: 'performance' })
  @ApiResponse({ status: 201, description: 'Versión creada', type: StrategyVersionDto })
  @ApiResponse({ status: 400, description: 'Configuración inválida; no se crea ninguna versión' })
  @ApiResponse({ status: 401, description: 'Clave administrativa ausente o incorrecta' })
  @ApiResponse({ status: 404, description: 'Estrategia inexistente' })
  async createVersion(
    @Param('key') key: string,
    @Body() body: StrategyConfigDto,
  ): Promise<StrategyVersionDto> {
    return this.valuationStrategyService.createVersion(key, body);
  }

  @Post(':key/activate')
  @HttpCode(200)
  @UseGuards(ApiKeyGuard)
  @ApiSecurity(SWAGGER_API_KEY_SCHEME)
  @ApiOperation({
    summary: 'Activa la estrategia y desactiva la anterior de forma atómica (FR-013)',
  })
  @ApiParam({ name: 'key', example: 'prestige' })
  @ApiResponse({ status: 200, description: 'Estrategia activa', type: StrategyResponseDto })
  @ApiResponse({ status: 401, description: 'Clave administrativa ausente o incorrecta' })
  @ApiResponse({ status: 404, description: 'Estrategia inexistente' })
  async activate(@Param('key') key: string): Promise<StrategyResponseDto> {
    return this.valuationStrategyService.activate(key);
  }
}
