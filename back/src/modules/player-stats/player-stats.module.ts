import { Module } from '@nestjs/common';
import { WhoScoredModule } from '../../adapters/who-scored/who-scored.module';
import { PlayerStatsController } from './player-stats.controller';
import { PlayerStatsRepository } from './player-stats.repository';
import { PlayerStatsService } from './player-stats.service';

@Module({
  imports: [WhoScoredModule],
  controllers: [PlayerStatsController],
  providers: [PlayerStatsService, PlayerStatsRepository],
})
export class PlayerStatsModule {}
