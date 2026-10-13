import { Module } from '@nestjs/common';
import { AuthSharedModule } from '../../shared/auth/auth-shared.module';
import { PlayerModule } from '../player/player.module';
import { TokensController } from './tokens.controller';
import { TokensRepository } from './tokens.repository';
import { TokensService } from './tokens.service';

/**
 * Tokens de los jugadores (08-sobres): emisión, inventario e historial de un token. Exporta
 * `TokensService` para que `packs` emita antes de armar el stock (research #1).
 */
@Module({
  imports: [AuthSharedModule, PlayerModule],
  controllers: [TokensController],
  providers: [TokensService, TokensRepository],
  exports: [TokensService],
})
export class TokensModule {}
