import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TheSportsDbAdapter } from './the-sports-db.adapter';
import { TheSportsDbClient } from './the-sports-db.client';

@Module({
  imports: [HttpModule],
  providers: [TheSportsDbClient, TheSportsDbAdapter],
  exports: [TheSportsDbAdapter],
})
export class TheSportsDbModule {}
