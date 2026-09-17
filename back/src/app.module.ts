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
import { PlayerModule } from './modules/player/player.module';
import { PlayerStatsModule } from './modules/player-stats/player-stats.module';
import { TeamWhoScoredMatchingModule } from './modules/team-whoscored-matching/team-whoscored-matching.module';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'back',
    }),
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
    IngestionModule,
    PlayerStatsModule,
    TeamWhoScoredMatchingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
