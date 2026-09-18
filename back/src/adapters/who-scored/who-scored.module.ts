import { Module } from '@nestjs/common';
import { WhoScoredAdapter } from './who-scored.adapter';
import { WhoScoredClient } from './who-scored.client';
import { WhoScoredParser } from './who-scored.parser';

@Module({
  providers: [WhoScoredClient, WhoScoredParser, WhoScoredAdapter],
  exports: [WhoScoredAdapter],
})
export class WhoScoredModule {}
