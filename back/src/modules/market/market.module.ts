import { Module } from '@nestjs/common';
import { AuthSharedModule } from '../../shared/auth/auth-shared.module';
import { PlayerModule } from '../player/player.module';
import { MarketController } from './market.controller';
import { MarketRepository } from './market.repository';
import { MarketService } from './market.service';

/**
 * Mercado de tokens (09-mercado): publicar, retirar, comprar e historial de operaciones. Usa
 * `PlayerService` para invalidar la caché del Market después de cada cambio (research #8).
 */
@Module({
  imports: [AuthSharedModule, PlayerModule],
  controllers: [MarketController],
  providers: [MarketService, MarketRepository],
})
export class MarketModule {}
