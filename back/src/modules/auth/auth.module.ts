import { Module } from '@nestjs/common';
import { AuthSharedModule } from '../../shared/auth/auth-shared.module';
import { CreditsModule } from '../credits/credits.module';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';

@Module({
  // La registración de JwtModule vive en AuthSharedModule para que los cuatro
  // módulos que usan los guards no tengan que importar este módulo de dominio.
  // CreditsModule: la entrega inicial de créditos va en la transacción del registro (08-sobres).
  imports: [AuthSharedModule, CreditsModule],
  controllers: [AuthController],
  providers: [AuthService, AuthRepository],
})
export class AuthModule {}
