import { Controller, Get, Query, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_SCHEME } from '../../shared/auth/auth.constants';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../../shared/auth/jwt-auth.guard';
import { ApiErrorFilter } from '../../shared/http/api-error.filter';
import { OperationsHistoryQueryDto } from './dto/operations-query.dto';
import { OperationsHistoryPageDto } from './dto/operations-response.dto';
import { HistoryService } from './history.service';

/**
 * ATENCION: los guards van POR RUTA (05-auth research #3). Son lecturas: sin límite de
 * frecuencia (research #12).
 */
@ApiTags('History')
@Controller('history')
@UseFilters(ApiErrorFilter)
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get('operations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_SCHEME)
  @ApiOperation({
    summary: 'Cartas adquiridas (por sobre o por compra) y vendidas del usuario, de la más reciente a la más antigua',
    description:
      'Una entrada por carta; las de un mismo sobre aparecen juntas. Las cartas de sobre no informan precio, saldos ni cotización. ' +
      'Las compras y ventas informan el precio, los saldos antes y después y la cotización que fijó el precio, con su estrategia y versión. ' +
      'El usuario es siempre el de la sesión y la contraparte nunca se identifica. El total y las páginas cuentan cartas y respetan `type`.',
  })
  @ApiResponse({ status: 200, description: 'Página del historial (vacía si no hizo operaciones)', type: OperationsHistoryPageDto })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 422, description: 'VALIDATION_ERROR — filtro desconocido o paginación fuera de límites' })
  @ApiResponse({ status: 500, description: 'INTERNAL_ERROR' })
  async listOperations(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OperationsHistoryQueryDto,
  ): Promise<OperationsHistoryPageDto> {
    return this.historyService.listOperations(user.id, query);
  }
}
