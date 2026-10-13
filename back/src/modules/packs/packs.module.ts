import { Module } from '@nestjs/common';
import { AuthSharedModule } from '../../shared/auth/auth-shared.module';
import { PlayerModule } from '../player/player.module';
import { TokensModule } from '../tokens/tokens.module';
import { PacksController } from './packs.controller';
import { PacksRepository } from './packs.repository';
import { PacksService } from './packs.service';

/**
 * Sobres (08-sobres US2, US7): stock, catálogo, apertura e historial de aperturas. Exporta
 * `PacksService` para que `quotes` sincronice el stock tras una corrida o una carga de
 * reputación (research #6).
 */
@Module({
  imports: [AuthSharedModule, TokensModule, PlayerModule],
  controllers: [PacksController],
  providers: [PacksService, PacksRepository],
  exports: [PacksService],
})
export class PacksModule {}
