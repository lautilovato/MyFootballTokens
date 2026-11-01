import { Module } from '@nestjs/common';
import { AuthSharedModule } from '../../shared/auth/auth-shared.module';
import { PlayerModule } from '../player/player.module';
import { ValuationStrategyModule } from '../valuation-strategy/valuation-strategy.module';
import { RankingController } from './ranking.controller';
import { RankingRepository } from './ranking.repository';
import { RankingService } from './ranking.service';

@Module({
  // ValuationStrategyModule resuelve la estrategia activa; PlayerModule, las cartas del top.
  imports: [AuthSharedModule, ValuationStrategyModule, PlayerModule],
  controllers: [RankingController],
  providers: [RankingService, RankingRepository],
})
export class RankingModule {}
