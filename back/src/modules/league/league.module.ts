import { Module } from '@nestjs/common';
import { AuthSharedModule } from '../../shared/auth/auth-shared.module';
import { LeagueController } from './league.controller';
import { LeagueRepository } from './league.repository';
import { LeagueService } from './league.service';

@Module({
  imports: [AuthSharedModule],
  controllers: [LeagueController],
  providers: [LeagueService, LeagueRepository],
})
export class LeagueModule {}
