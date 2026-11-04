import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { SWAGGER_BEARER_SCHEME } from '../../shared/auth/auth.constants';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../../shared/auth/jwt-auth.guard';
import { ApiErrorFilter } from '../../shared/http/api-error.filter';
import { CreateListingDto } from './dto/create-listing.dto';
import { ListingResponseDto } from './dto/listing-response.dto';
import { OperationsQueryDto } from './dto/operations-query.dto';
import { OperationsResponseDto } from './dto/operations-response.dto';
import { PlayerListingsQueryDto } from './dto/player-listings-query.dto';
import { PlayerListingsResponseDto } from './dto/player-listings-response.dto';
import { PurchaseDto } from './dto/purchase.dto';
import { PurchaseResponseDto } from './dto/purchase-response.dto';
import { MarketService } from './market.service';

/**
 * Límite de los `POST` del mercado (research #11). Va como función para leerse en cada pedido:
 * como valor fijo se evaluaría al cargar este módulo y dependería de que `dotenv` ya haya corrido.
 */
const MARKET_THROTTLE = {
  default: { limit: () => Number(process.env.MARKET_RATE_LIMIT_MAX ?? 30), ttl: 60_000 },
};

/**
 * ATENCION: los guards van POR RUTA (05-auth research #3). `ThrottlerGuard` va solo en los `POST`:
 * a nivel de clase, los `GET` heredarían el límite global de `ThrottlerModule.forRoot`, que es el
 * de auth (5 por minuto, research #11).
 */
@ApiTags('Market')
@Controller('market')
@UseFilters(ApiErrorFilter)
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Post('listings')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle(MARKET_THROTTLE)
  @ApiBearerAuth(SWAGGER_BEARER_SCHEME)
  @ApiOperation({
    summary: 'Pone a la venta una carta propia (FR-003 a FR-005)',
    description:
      'El precio no se envía: es la cotización vigente del jugador y cambia con ella (FR-002). Validaciones en este orden: sesión, entrada, token propio, publicación activa previa y cotización vigente.',
  })
  @ApiResponse({ status: 201, type: ListingResponseDto })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 404, description: 'TOKEN_NOT_FOUND — inexistente o de otro usuario, sin distinguir' })
  @ApiResponse({ status: 409, description: 'TOKEN_ALREADY_LISTED o PRICE_NOT_AVAILABLE' })
  @ApiResponse({ status: 422, description: 'VALIDATION_ERROR — incluye un precio o un usuario en el pedido' })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED' })
  @ApiResponse({ status: 500, description: 'INTERNAL_ERROR, sin efectos' })
  async publish(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateListingDto): Promise<ListingResponseDto> {
    return this.marketService.publish(user.id, body.tokenId);
  }

  @Post('listings/:listingId/withdraw')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle(MARKET_THROTTLE)
  @ApiBearerAuth(SWAGGER_BEARER_SCHEME)
  @ApiOperation({ summary: 'Retira una publicación activa propia (FR-006, FR-007)' })
  @ApiResponse({ status: 200, type: ListingResponseDto })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 404, description: 'LISTING_NOT_FOUND — inexistente, de otro usuario o de la plataforma' })
  @ApiResponse({ status: 409, description: 'LISTING_NOT_ACTIVE — ya vendida o retirada' })
  @ApiResponse({ status: 422, description: 'VALIDATION_ERROR' })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED' })
  @ApiResponse({ status: 500, description: 'INTERNAL_ERROR, sin efectos' })
  async withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Param('listingId', ParseUUIDPipe) listingId: string,
  ): Promise<ListingResponseDto> {
    return this.marketService.withdraw(user.id, listingId);
  }

  @Get('players/:playerId/listings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_SCHEME)
  @ApiOperation({
    summary: 'Cartas a la venta de un jugador, de la publicación más antigua a la más nueva (FR-027)',
    description: 'No identifica a los vendedores; `mine` marca las publicaciones del usuario de la sesión. Sin límite de frecuencia.',
  })
  @ApiResponse({ status: 200, type: PlayerListingsResponseDto })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 404, description: 'PLAYER_NOT_FOUND' })
  @ApiResponse({ status: 422, description: 'VALIDATION_ERROR' })
  async listPlayerListings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('playerId', ParseUUIDPipe) playerId: string,
    @Query() query: PlayerListingsQueryDto,
  ): Promise<PlayerListingsResponseDto> {
    return this.marketService.listPlayerListings(playerId, user.id, query);
  }

  @Get('operations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_SCHEME)
  @ApiOperation({
    summary: 'Compras y ventas del usuario, de la más reciente a la más antigua (FR-029)',
    description: 'La contraparte nunca se identifica. Sin límite de frecuencia.',
  })
  @ApiResponse({ status: 200, type: OperationsResponseDto })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 422, description: 'VALIDATION_ERROR' })
  async listOperations(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OperationsQueryDto,
  ): Promise<OperationsResponseDto> {
    return this.marketService.listOperations(user.id, query);
  }

  @Post('purchases')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle(MARKET_THROTTLE)
  @ApiBearerAuth(SWAGGER_BEARER_SCHEME)
  @ApiOperation({
    summary: 'Compra una carta a la venta (FR-010 a FR-017)',
    description:
      'Una carta por compra. Validaciones en este orden: sesión, entrada, publicación existente, activa, ajena, con cotización, precio vigente no mayor que acceptedPrice y saldo (FR-012). Se cobra el precio vigente. Atómica: ante cualquier error no se cobra ni se transfiere nada.',
  })
  @ApiResponse({ status: 201, type: PurchaseResponseDto })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 404, description: 'LISTING_NOT_FOUND' })
  @ApiResponse({
    status: 409,
    description: 'LISTING_NOT_ACTIVE, OWN_LISTING, PRICE_NOT_AVAILABLE, PRICE_CHANGED o INSUFFICIENT_CREDITS',
  })
  @ApiResponse({ status: 422, description: 'VALIDATION_ERROR — incluye un usuario en el pedido' })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED' })
  @ApiResponse({ status: 500, description: 'INTERNAL_ERROR, sin efectos' })
  async purchase(@CurrentUser() user: AuthenticatedUser, @Body() body: PurchaseDto): Promise<PurchaseResponseDto> {
    return this.marketService.purchase(user.id, body.listingId, body.acceptedPrice);
  }
}
