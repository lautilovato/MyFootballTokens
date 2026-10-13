import { Module } from '@nestjs/common';
import { AuthSharedModule } from '../../shared/auth/auth-shared.module';
import { PacksModule } from '../packs/packs.module';
import { PlayerModule } from '../player/player.module';
import { ValuationStrategyModule } from '../valuation-strategy/valuation-strategy.module';
import { QuotesController } from './quotes.controller';
import { QuotesRepository } from './quotes.repository';
import { QuotesService } from './quotes.service';

@Module({
  // ValuationStrategyModule resuelve la estrategia de cada corrida; PlayerModule, la caché del
  // listado que hay que invalidar cuando cambia el precio espejo (research #10, #12).
  // PacksModule (08-sobres): una corrida o una carga de reputación vuelven elegibles a jugadores
  // para el stock de sobres y cambian las rarezas publicadas (research #6, #9).
  imports: [AuthSharedModule, ValuationStrategyModule, PlayerModule, PacksModule],
  controllers: [QuotesController],
  providers: [QuotesService, QuotesRepository],
})
export class QuotesModule {}
