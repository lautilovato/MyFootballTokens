import { Controller, Get, HttpCode, Post, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../shared/auth/api-key.guard';
import { SWAGGER_API_KEY_SCHEME, SWAGGER_BEARER_SCHEME } from '../../shared/auth/auth.constants';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../../shared/auth/jwt-auth.guard';
import { ApiErrorFilter } from '../../shared/http/api-error.filter';
import { CreditBalanceDto } from './dto/credit-balance.dto';
import { InitialGrantsResultDto } from './dto/initial-grants-result.dto';
import { CreditsService } from './credits.service';

/**
 * ATENCION: los guards van POR RUTA, nunca a nivel de clase (05-auth research #3): este
 * controller mezcla la consulta del usuario con un disparo administrativo.
 */
@ApiTags('Credits')
@Controller('credits')
@UseFilters(ApiErrorFilter)
export class CreditsController {
  constructor(private readonly creditsService: CreditsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_SCHEME)
  @ApiOperation({ summary: 'Saldo del usuario de la sesión (FR-003)' })
  @ApiResponse({ status: 200, type: CreditBalanceDto })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  async getBalance(@CurrentUser() user: AuthenticatedUser): Promise<CreditBalanceDto> {
    return this.creditsService.getBalance(user.id);
  }

  @Post('initial-grants')
  @HttpCode(200)
  @UseGuards(ApiKeyGuard)
  @ApiSecurity(SWAGGER_API_KEY_SCHEME)
  @ApiOperation({
    summary: 'Entrega la cantidad inicial a los usuarios que todavía no la recibieron (FR-002)',
    description: 'Idempotente. También corre sola al arrancar la aplicación.',
  })
  @ApiResponse({ status: 200, type: InitialGrantsResultDto })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED — clave administrativa ausente o incorrecta' })
  async backfillInitialGrants(): Promise<InitialGrantsResultDto> {
    return this.creditsService.backfillInitialGrants();
  }
}
