import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { createObserveModule } from '@nestjs/observe';
import KeyvRedis from '@keyv/redis';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './infrastructure/database/database.module';
import {
  DEFAULT_RATE_LIMIT_MAX,
  DEFAULT_RATE_LIMIT_TTL_SECONDS,
} from './shared/auth/auth.constants';
import { LoggingModule } from './shared/logging/logging.module';
import { AuthModule } from './modules/auth/auth.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { LeagueModule } from './modules/league/league.module';
import { PlayerModule } from './modules/player/player.module';
import { PlayerStatsModule } from './modules/player-stats/player-stats.module';
import { TeamWhoScoredMatchingModule } from './modules/team-whoscored-matching/team-whoscored-matching.module';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

// Telemetría de https://observe.nestjs.com (tracing, métricas, errores). Solo se activa con
// credenciales reales: con las de ejemplo el agente recibía 401 en cada envío y lo logueaba
// como error. Sin OBSERVE_APP_KEY / OBSERVE_APP_SECRET la app arranca sin telemetría.
const observeAppKey = process.env.OBSERVE_APP_KEY;
const observeAppSecret = process.env.OBSERVE_APP_SECRET;
const observeImports =
  observeAppKey && observeAppSecret
    ? [ObserveModule.forRoot({ appKey: observeAppKey, appSecret: observeAppSecret, serviceId: 'back' })]
    : [];

@Module({
  imports: [
    ...observeImports,
    LoggingModule,
    DatabaseModule,
    // Limite de intentos para /auth (FR-013, research #7). Almacenamiento en
    // memoria: correcto mientras haya una sola instancia.
    ThrottlerModule.forRoot([
      {
        ttl:
          Number(process.env.AUTH_RATE_LIMIT_TTL ?? DEFAULT_RATE_LIMIT_TTL_SECONDS) * 1000,
        limit: Number(process.env.AUTH_RATE_LIMIT_MAX ?? DEFAULT_RATE_LIMIT_MAX),
      },
    ]),
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => ({
        stores: [
          new KeyvRedis(`redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`),
        ],
        ttl: Number(process.env.PLAYERS_CACHE_TTL_SECONDS ?? 60) * 1000,
      }),
    }),
    AuthModule,
    PlayerModule,
    LeagueModule,
    IngestionModule,
    PlayerStatsModule,
    TeamWhoScoredMatchingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
