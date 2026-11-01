import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { CorrelationIdStore } from '../../shared/logging/correlation-id.store';
import { PinoLoggerService } from '../../shared/logging/pino-logger.service';
import { PlayerService } from '../player/player.service';
import { DEFAULT_INVENTORY_PAGE_SIZE, InventoryQueryDto } from './dto/inventory-query.dto';
import { InventoryResponseDto } from './dto/inventory-response.dto';
import { TokenHistoryResponseDto } from './dto/token-history-response.dto';
import { TokensRepository } from './tokens.repository';

const LOG_CONTEXT = 'TokensService';

export const TOKEN_NOT_FOUND = { code: 'TOKEN_NOT_FOUND', message: 'El token no existe o no es tuyo' } as const;

@Injectable()
export class TokensService {
  constructor(
    private readonly tokensRepository: TokensRepository,
    private readonly playerService: PlayerService,
    private readonly logger: PinoLoggerService,
  ) {}

  /** Emite los 100 tokens de cada jugador que todavía no los tenga (FR-029). */
  async emitMissing(): Promise<number> {
    const correlationId = CorrelationIdStore.getId() ?? randomUUID();
    const emitted = await this.tokensRepository.emitMissing(correlationId);
    if (emitted > 0) this.logger.event(LOG_CONTEXT, 'tokens emitted', { tokens: emitted });
    return emitted;
  }

  /**
   * Inventario del usuario (FR-033 a FR-035). Cada jugador trae la misma carta que la home, con
   * su cotización vigente, así la rareza coincide en todo el sistema (FR-069, research #13).
   */
  async getInventory(userId: string, query: InventoryQueryDto): Promise<InventoryResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_INVENTORY_PAGE_SIZE;
    const { total, players, tokens } = await this.tokensRepository.findInventoryPage(userId, page, limit);
    const cards = await this.playerService.findCardsByIds(players.map((p) => p.player_id));

    return {
      data: players.map((row) => ({
        player: cards.get(row.player_id)!,
        reputation: row.reputation === null ? null : Number(row.reputation),
        count: Number(row.count),
        tokens: tokens
          .filter((t) => t.player_id === row.player_id)
          .map((t) => ({ id: t.id, serial: Number(t.serial), listingId: t.listing_id ?? null })),
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Historial de un token que el usuario posee o poseyó (FR-031). */
  async getHistory(tokenId: string, userId: string): Promise<TokenHistoryResponseDto> {
    const found = await this.tokensRepository.findHistoryVisibleTo(tokenId, userId);
    // Mismo error para ajeno e inexistente: no revela si el token existe.
    if (!found) throw new NotFoundException({ ...TOKEN_NOT_FOUND });
    return TokenHistoryResponseDto.from(found.token, found.events, userId);
  }
}
