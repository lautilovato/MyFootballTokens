import type { MiddlewareConsumer, NestModule, OnModuleDestroy } from '@nestjs/common';
import { Global, Module } from '@nestjs/common';
import { RequestContext } from '@mikro-orm/core';
import { EntityManager, MikroORM } from '@mikro-orm/postgresql';
import config from './database.config';

@Global()
@Module({
  providers: [
    {
      provide: MikroORM,
      useFactory: () => MikroORM.init(config),
    },
    {
      provide: EntityManager,
      useFactory: (orm: MikroORM) => orm.em,
      inject: [MikroORM],
    },
  ],
  exports: [MikroORM, EntityManager],
})
export class DatabaseModule implements NestModule, OnModuleDestroy {
  constructor(private readonly orm: MikroORM) {}

  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply((_req: unknown, _res: unknown, next: (...args: unknown[]) => void) =>
        RequestContext.create(this.orm.em, next),
      )
      .forRoutes('*');
  }

  async onModuleDestroy(): Promise<void> {
    await this.orm.close();
  }
}
