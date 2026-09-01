import { Module } from '@nestjs/common';
import { PlayerController } from './player.controller';
import { PlayerRepository } from './player.repository';
import { PlayerService } from './player.service';

@Module({
  controllers: [PlayerController],
  providers: [PlayerService, PlayerRepository],
})
export class PlayerModule {}
