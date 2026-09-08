import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import KeyvRedis from '@keyv/redis';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './infrastructure/database/database.module';
import { LoggingModule } from './shared/logging/logging.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { PlayerModule } from './modules/player/player.module';

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
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => ({
        stores: [
          new KeyvRedis(`redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`),
        ],
        ttl: Number(process.env.PLAYERS_CACHE_TTL_SECONDS ?? 60) * 1000,
      }),
    }),
    PlayerModule,
    IngestionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
