import { Module } from '@nestjs/common';
import { AuthSharedModule } from '../../shared/auth/auth-shared.module';
import { ValuationStrategyController } from './valuation-strategy.controller';
import { ValuationStrategyRepository } from './valuation-strategy.repository';
import { ValuationStrategyService } from './valuation-strategy.service';

@Module({
  imports: [AuthSharedModule],
  controllers: [ValuationStrategyController],
  providers: [ValuationStrategyService, ValuationStrategyRepository],
  // El recálculo de cotizaciones resuelve la estrategia a usar a través de este service.
  exports: [ValuationStrategyService],
})
export class ValuationStrategyModule {}
