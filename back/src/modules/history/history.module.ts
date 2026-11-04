import { Module } from '@nestjs/common';
import { AuthSharedModule } from '../../shared/auth/auth-shared.module';
import { PlayerModule } from '../player/player.module';
import { HistoryController } from './history.controller';
import { HistoryRepository } from './history.repository';
import { HistoryService } from './history.service';

/**
 * Historial de cartas adquiridas y vendidas (10-historial-operaciones). Lee las aperturas de
 * sobres (08) y las compras (09) con SQL propio y usa `PlayerService` para las cartas.
 */
@Module({
  imports: [AuthSharedModule, PlayerModule],
  controllers: [HistoryController],
  providers: [HistoryService, HistoryRepository],
})
export class HistoryModule {}
