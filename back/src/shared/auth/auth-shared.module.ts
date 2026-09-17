import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { AUTH_ENV } from './auth.constants';
import { ApiKeyGuard } from './api-key.guard';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * Módulo transversal de autenticación (research #4).
 *
 * Los guards los consumen cuatro módulos de dominio distintos, así que no
 * pueden depender de AuthModule: eso acoplaría player, player-stats, ingestion
 * y team-whoscored-matching al módulo de dominio de auth. Acá viven la
 * registración de JwtModule y los dos guards, y de acá los toma todo el mundo
 * —AuthModule incluido, que lo usa para firmar—.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env[AUTH_ENV.jwtSecret],
        signOptions: {
          expiresIn: (process.env[AUTH_ENV.jwtExpiration] ?? '2h') as SignOptions['expiresIn'],
        },
      }),
    }),
  ],
  providers: [JwtAuthGuard, ApiKeyGuard],
  exports: [JwtModule, JwtAuthGuard, ApiKeyGuard],
})
export class AuthSharedModule {}
