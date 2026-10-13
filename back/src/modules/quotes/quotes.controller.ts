import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { QuoteRunTrigger } from '../../infrastructure/database/entities/quote-run.entity';
import { ApiKeyGuard } from '../../shared/auth/api-key.guard';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import {
  SWAGGER_API_KEY_SCHEME,
  SWAGGER_BEARER_SCHEME,
} from '../../shared/auth/auth.constants';
import { BulkReputationDto } from './dto/bulk-reputation.dto';
import { BulkReputationResultDto, ReputationResponseDto } from './dto/bulk-reputation-result.dto';
import { CurrentQuoteResponseDto } from './dto/current-quote-response.dto';
import { QuoteHistoryQueryDto } from './dto/quote-history-query.dto';
import { QuoteHistoryResponseDto } from './dto/quote-history-response.dto';
import { ListRunsQueryDto } from './dto/list-runs-query.dto';
import { QuoteRunResponseDto, QuoteRunsPageDto } from './dto/quote-run-response.dto';
import { RecalculateRequestDto } from './dto/recalculate-request.dto';
import { SetReputationDto } from './dto/set-reputation.dto';
import { QuotesService } from './quotes.service';

/**
 * ATENCION: los guards van POR RUTA, nunca a nivel de clase (05-auth research #3). Este
 * controller mezcla disparos administrativos (recálculo, reputación) con consultas de usuario
 * (cotización actual, historial).
 */
@ApiTags('Quotes')
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post('recalculate')
  @HttpCode(200)
  @UseGuards(ApiKeyGuard)
  @ApiSecurity(SWAGGER_API_KEY_SCHEME)
  @ApiOperation({
    summary: 'Dispara un recálculo completo de score y cotización de todos los jugadores',
  })
  @ApiResponse({ status: 200, description: 'Corrida completada', type: QuoteRunResponseDto })
  @ApiResponse({ status: 400, description: 'Entrada inválida' })
  @ApiResponse({ status: 401, description: 'Clave administrativa ausente o incorrecta' })
  @ApiResponse({ status: 404, description: 'strategyKey inexistente' })
  @ApiResponse({
    status: 409,
    description: 'RUN_IN_PROGRESS, NO_ACTIVE_STRATEGY o NO_SEASON_DATA',
  })
  @ApiResponse({
    status: 500,
    description: 'La corrida falló; quedó registrada como FAILED y no se persistió ninguna cotización',
  })
  async recalculate(@Body() body: RecalculateRequestDto): Promise<QuoteRunResponseDto> {
    return this.quotesService.runRecalculation(QuoteRunTrigger.MANUAL, body.strategyKey);
  }

  @Get('runs')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity(SWAGGER_API_KEY_SCHEME)
  @ApiOperation({ summary: 'Lista las corridas, de la más reciente a la más vieja (FR-029)' })
  @ApiResponse({ status: 200, description: 'Página de corridas', type: QuoteRunsPageDto })
  @ApiResponse({ status: 400, description: 'Paginación fuera de límites' })
  @ApiResponse({ status: 401, description: 'Clave administrativa ausente o incorrecta' })
  async listRuns(@Query() query: ListRunsQueryDto): Promise<QuoteRunsPageDto> {
    return this.quotesService.listRuns(query);
  }

  @Get('players/:playerId/current')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_SCHEME)
  @ApiOperation({ summary: 'Cotización actual con score, desglose por métrica y variación (FR-019)' })
  @ApiParam({ name: 'playerId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Cotización actual, o quoted=false si el jugador nunca fue cotizado',
    type: CurrentQuoteResponseDto,
  })
  @ApiResponse({ status: 400, description: 'playerId no es un UUID' })
  @ApiResponse({ status: 401, description: 'Sin credencial de sesión válida' })
  @ApiResponse({ status: 404, description: 'El jugador no existe' })
  async getCurrent(
    @Param('playerId', ParseUUIDPipe) playerId: string,
  ): Promise<CurrentQuoteResponseDto> {
    return this.quotesService.getCurrent(playerId);
  }

  @Get('players/:playerId/history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_SCHEME)
  @ApiOperation({ summary: 'Historial cronológico (más viejo primero) de score y precio (FR-020)' })
  @ApiParam({ name: 'playerId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Página del historial', type: QuoteHistoryResponseDto })
  @ApiResponse({ status: 400, description: 'Fecha inválida, rango invertido o paginación fuera de límites' })
  @ApiResponse({ status: 401, description: 'Sin credencial de sesión válida' })
  @ApiResponse({ status: 404, description: 'El jugador no existe' })
  async getHistory(
    @Param('playerId', ParseUUIDPipe) playerId: string,
    @Query() query: QuoteHistoryQueryDto,
  ): Promise<QuoteHistoryResponseDto> {
    return this.quotesService.getHistory(playerId, query);
  }

  // La ruta de lote va antes que la parametrizada para que Express no la confunda con un id.
  @Put('reputation')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity(SWAGGER_API_KEY_SCHEME)
  @ApiOperation({ summary: 'Carga en lote de la reputación mundial; los inexistentes no abortan al resto (FR-024)' })
  @ApiResponse({ status: 200, description: 'Resultado por jugador', type: BulkReputationResultDto })
  @ApiResponse({
    status: 400,
    description: 'Algún ítem tiene formato inválido; se rechaza el lote completo sin efectos (FR-034)',
  })
  @ApiResponse({ status: 401, description: 'Clave administrativa ausente o incorrecta' })
  async setReputationBulk(@Body() body: BulkReputationDto): Promise<BulkReputationResultDto> {
    return this.quotesService.setReputationBulk(body);
  }

  @Put('reputation/:playerId')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity(SWAGGER_API_KEY_SCHEME)
  @ApiOperation({ summary: 'Establece la reputación mundial de un jugador (FR-024)' })
  @ApiParam({ name: 'playerId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Reputación actualizada', type: ReputationResponseDto })
  @ApiResponse({ status: 400, description: 'Reputación fuera de 0–100 o no entera' })
  @ApiResponse({ status: 401, description: 'Clave administrativa ausente o incorrecta' })
  @ApiResponse({ status: 404, description: 'El jugador no existe' })
  async setReputation(
    @Param('playerId', ParseUUIDPipe) playerId: string,
    @Body() body: SetReputationDto,
  ): Promise<ReputationResponseDto> {
    return this.quotesService.setReputation(playerId, body);
  }
}
