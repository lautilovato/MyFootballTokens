import { Module } from '@nestjs/common';
import { AuthSharedModule } from '../../shared/auth/auth-shared.module';
import { CreditsController } from './credits.controller';
import { CreditsRepository } from './credits.repository';
import { CreditsService } from './credits.service';

/**
 * Saldo de créditos de los usuarios (08-sobres US1). Exporta `CreditsService` para que `auth`
 * acredite la entrega inicial en la misma transacción del registro (research #3).
 */
@Module({
  imports: [AuthSharedModule],
  controllers: [CreditsController],
  providers: [CreditsService, CreditsRepository],
  exports: [CreditsService],
})
export class CreditsModule {}
