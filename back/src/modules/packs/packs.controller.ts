import { Body, Controller, Get, HttpCode, Post, Query, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../shared/auth/api-key.guard';
import { SWAGGER_API_KEY_SCHEME, SWAGGER_BEARER_SCHEME } from '../../shared/auth/auth.constants';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../../shared/auth/jwt-auth.guard';
import { ApiErrorFilter } from '../../shared/http/api-error.filter';
import { OpenPackDto } from './dto/open-pack.dto';
import { PackCatalogResponseDto } from './dto/pack-catalog-response.dto';
import { OpeningsQueryDto } from './dto/openings-query.dto';
import { PackOpeningResponseDto, PackOpeningsPageDto } from './dto/pack-opening-response.dto';
import { StockSyncResultDto } from './dto/stock-sync-result.dto';
import { PacksService } from './packs.service';

/**
 * ATENCION: los guards van POR RUTA, nunca a nivel de clase (05-auth research #3): este
 * controller mezcla las operaciones del usuario con el disparo administrativo del stock.
 */
@ApiTags('Packs')
@Controller('packs')
@UseFilters(ApiErrorFilter)
export class PacksController {
  constructor(private readonly packsService: PacksService) {}

  @Get('types')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_SCHEME)
  @ApiOperation({ summary: 'Tipos de sobre con precio, cartas, stock y probabilidades en vivo (FR-010)' })
  @ApiResponse({ status: 200, type: PackCatalogResponseDto })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  async getCatalog(): Promise<PackCatalogResponseDto> {
    return this.packsService.getCatalog();
  }

  @Post('openings')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_SCHEME)
  @ApiOperation({
    summary: 'Abre un sobre del tipo elegido (FR-018 a FR-027)',
    description:
      'Validaciones en este orden: sesión, entrada, tipo, sobres generados, stock del tipo y saldo. Atómica: ante cualquier error no se cobra ni se entrega nada.',
  })
  @ApiResponse({ status: 201, type: PackOpeningResponseDto })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 404, description: 'PACK_TYPE_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'PACKS_NOT_AVAILABLE, PACK_SOLD_OUT o INSUFFICIENT_CREDITS' })
  @ApiResponse({ status: 422, description: 'VALIDATION_ERROR' })
  @ApiResponse({ status: 500, description: 'INTERNAL_ERROR, sin efectos' })
  async open(@CurrentUser() user: AuthenticatedUser, @Body() body: OpenPackDto): Promise<PackOpeningResponseDto> {
    return this.packsService.open(user.id, body.type);
  }

  @Get('openings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_SCHEME)
  @ApiOperation({ summary: 'Historial de aperturas del usuario, de la más reciente a la más antigua (FR-039)' })
  @ApiResponse({ status: 200, type: PackOpeningsPageDto })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 422, description: 'VALIDATION_ERROR' })
  async listOpenings(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OpeningsQueryDto,
  ): Promise<PackOpeningsPageDto> {
    return this.packsService.listOpenings(user.id, query);
  }

  @Post('stock/sync')
  @HttpCode(200)
  @UseGuards(ApiKeyGuard)
  @ApiSecurity(SWAGGER_API_KEY_SCHEME)
  @ApiOperation({
    summary: 'Emite los tokens faltantes y genera un lote con los tokens elegibles (FR-012, FR-029)',
    description: 'Idempotente. También la disparan el scheduler y cada corrida de cotización.',
  })
  @ApiResponse({ status: 200, type: StockSyncResultDto })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED — clave administrativa ausente o incorrecta' })
  async syncStock(): Promise<StockSyncResultDto> {
    return this.packsService.syncStock();
  }
}
