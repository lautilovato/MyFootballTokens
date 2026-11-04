import { Controller, Get, Param, ParseUUIDPipe, Query, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_SCHEME } from '../../shared/auth/auth.constants';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../../shared/auth/jwt-auth.guard';
import { ApiErrorFilter } from '../../shared/http/api-error.filter';
import { InventoryQueryDto } from './dto/inventory-query.dto';
import { InventoryResponseDto } from './dto/inventory-response.dto';
import { TokenHistoryResponseDto } from './dto/token-history-response.dto';
import { TokensService } from './tokens.service';

/**
 * Inventario e historial de un token (08-sobres US3, US4). El usuario sale siempre de la
 * sesión: no hay forma de pedir el inventario o el historial de otro (FR-047).
 *
 * Esta feature no ofrece ninguna operación que saque un token del inventario (FR-036).
 */
@ApiTags('Inventory')
@Controller()
@UseFilters(ApiErrorFilter)
export class TokensController {
  constructor(private readonly tokensService: TokensService) {}

  @Get('inventory')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_SCHEME)
  @ApiOperation({
    summary: 'Tokens que el usuario posee hoy, agrupados por jugador (FR-033 a FR-035)',
    description: 'Ordenado por reputación (OVR) del jugador de mayor a menor y, ante empate, por id. Pagina jugadores.',
  })
  @ApiResponse({ status: 200, type: InventoryResponseDto })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 422, description: 'VALIDATION_ERROR' })
  async getInventory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: InventoryQueryDto,
  ): Promise<InventoryResponseDto> {
    return this.tokensService.getInventory(user.id, query);
  }

  @Get('tokens/:tokenId/history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_SCHEME)
  @ApiOperation({ summary: 'Historial de un token que el usuario posee o poseyó (FR-031)' })
  @ApiParam({ name: 'tokenId', format: 'uuid' })
  @ApiResponse({ status: 200, type: TokenHistoryResponseDto })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 404, description: 'TOKEN_NOT_FOUND (inexistente, ajeno o nunca poseído: no se distingue)' })
  @ApiResponse({ status: 422, description: 'VALIDATION_ERROR' })
  async getHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
  ): Promise<TokenHistoryResponseDto> {
    return this.tokensService.getHistory(tokenId, user.id);
  }
}
