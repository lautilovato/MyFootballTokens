import { Module } from '@nestjs/common';
import { TheSportsDbModule } from '../../adapters/the-sports-db/the-sports-db.module';
import { AuthSharedModule } from '../../shared/auth/auth-shared.module';
import { PlayerModule } from '../player/player.module';
import { PlayerImagesController } from './player-images.controller';
import { PlayerImagesRepository } from './player-images.repository';
import { PlayerImagesService } from './player-images.service';

@Module({
  imports: [TheSportsDbModule, AuthSharedModule, PlayerModule],
  controllers: [PlayerImagesController],
  providers: [PlayerImagesService, PlayerImagesRepository],
})
export class PlayerImagesModule {}
