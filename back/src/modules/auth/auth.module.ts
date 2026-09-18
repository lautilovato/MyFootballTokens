import { Module } from '@nestjs/common';
import { AuthSharedModule } from '../../shared/auth/auth-shared.module';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';

@Module({
  // La registración de JwtModule vive en AuthSharedModule para que los cuatro
  // módulos que usan los guards no tengan que importar este módulo de dominio.
  imports: [AuthSharedModule],
  controllers: [AuthController],
  providers: [AuthService, AuthRepository],
})
export class AuthModule {}
