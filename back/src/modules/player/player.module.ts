import { Module } from '@nestjs/common';
import { AuthSharedModule } from '../../shared/auth/auth-shared.module';
import { PlayerController } from './player.controller';
import { PlayerRepository } from './player.repository';
import { PlayerService } from './player.service';

@Module({
  imports: [AuthSharedModule],
  controllers: [PlayerController],
  providers: [PlayerService, PlayerRepository],
  // La caché del listado la invalidan los procesos que cambian el catálogo (research #8).
  exports: [PlayerService],
})
export class PlayerModule {}
