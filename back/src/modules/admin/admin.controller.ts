import { Controller, Get, Query, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../../shared/auth/admin.guard';
import { SWAGGER_BEARER_SCHEME } from '../../shared/auth/auth.constants';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { ApiErrorFilter } from '../../shared/http/api-error.filter';
import { AdminService } from './admin.service';
import { AdminMetricsQueryDto } from './dto/admin-metrics-query.dto';
import { AdminMetricsDto } from './dto/admin-metrics-response.dto';

/** ATENCION: el orden de los guards importa: `AdminGuard` necesita al usuario de `JwtAuthGuard`. */
@ApiTags('Admin')
@Controller('admin')
@UseFilters(ApiErrorFilter)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('metrics')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth(SWAGGER_BEARER_SCHEME)
  @ApiOperation({
    summary: 'Métricas agregadas de la plataforma, para administradores',
    description:
      'Solo lectura. `from` y `to` acotan las métricas de período; las de estado y las conciliaciones no cambian. ' +
      'Sin `from` ni `to`, toda la historia. Los datos pueden tener hasta 1 minuto de antigüedad; `refresh=true` los recalcula. ' +
      'La clave administrativa no habilita este endpoint.',
  })
  @ApiResponse({ status: 200, type: AdminMetricsDto })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — sesión válida sin el rol de administrador' })
  @ApiResponse({ status: 422, description: 'VALIDATION_ERROR — período o zona horaria inválidos' })
  @ApiResponse({ status: 500, description: 'INTERNAL_ERROR' })
  async getMetrics(@Query() query: AdminMetricsQueryDto): Promise<AdminMetricsDto> {
    return this.adminService.getMetrics(query);
  }
}
