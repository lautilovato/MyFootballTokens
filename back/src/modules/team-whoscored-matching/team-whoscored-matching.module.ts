import { Module } from '@nestjs/common';
import { WhoScoredModule } from '../../adapters/who-scored/who-scored.module';
import { TeamWhoScoredMatchingController } from './team-whoscored-matching.controller';
import { TeamWhoScoredMatchingRepository } from './team-whoscored-matching.repository';
import { TeamWhoScoredMatchingService } from './team-whoscored-matching.service';

@Module({
  imports: [WhoScoredModule],
  controllers: [TeamWhoScoredMatchingController],
  providers: [TeamWhoScoredMatchingService, TeamWhoScoredMatchingRepository],
})
export class TeamWhoScoredMatchingModule {}
