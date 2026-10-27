import { Injectable } from '@nestjs/common';
import { PackType } from '../../infrastructure/database/entities/pack.entity';
import { PlayerService } from '../player/player.service';
import { PageMetaDto } from '../quotes/dto/page-meta.dto';
import { DEFAULT_HISTORY_PAGE_SIZE, OperationsHistoryQueryDto } from './dto/operations-query.dto';
import { OperationEntryDto, OperationsHistoryPageDto } from './dto/operations-response.dto';
import { kindsFor } from './history-filter';
import { HistoryRepository } from './history.repository';
import type { HistoryRow, QuoteRef } from './history.repository';

type PlayerCards = Awaited<ReturnType<PlayerService['findCardsByIds']>>;

/**
 * Historial de cartas adquiridas y vendidas (10-historial-operaciones, US1 y US4). Es de solo
 * lectura: no abre transacciones ni emite eventos.
 */
@Injectable()
export class HistoryService {
  constructor(
    private readonly historyRepository: HistoryRepository,
    private readonly playerService: PlayerService,
  ) {}

  async listOperations(userId: string, query: OperationsHistoryQueryDto): Promise<OperationsHistoryPageDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_HISTORY_PAGE_SIZE;

    const { total, rows } = await this.historyRepository.findPage(userId, kindsFor(query.type ?? 'all'), page, limit);

    const playerIds = [...new Set(rows.map((r) => r.playerId))];
    const quoteIds = [...new Set(rows.flatMap((r) => (r.quoteId ? [r.quoteId] : [])))];
    const [players, quotes] = await Promise.all([
      this.playerService.findCardsByIds(playerIds),
      this.historyRepository.findQuoteRefs(quoteIds),
    ]);

    const dto = new OperationsHistoryPageDto();
    dto.data = rows.map((row) => this.toEntry(row, players, quotes));
    dto.meta = PageMetaDto.of(total, page, limit);
    return dto;
  }

  private toEntry(row: HistoryRow, players: PlayerCards, quotes: Map<string, QuoteRef>): OperationEntryDto {
    const entry = new OperationEntryDto();
    entry.id = row.id;
    entry.kind = row.kind;
    entry.at = row.at;
    entry.tokenId = row.tokenId;
    entry.serial = row.serial;
    entry.rarity = row.rarity;
    entry.player = players.get(row.playerId)!;
    entry.packType = (row.packType as PackType | null) ?? null;
    entry.price = row.price;
    entry.balanceBefore = row.balanceBefore;
    entry.balanceAfter = row.balanceAfter;
    entry.counterparty = row.counterparty;
    entry.quote = this.toQuote(row, quotes);
    return entry;
  }

  /** Solo compras y ventas; nulo si no se encontró la cotización (FR-016). */
  private toQuote(row: HistoryRow, quotes: Map<string, QuoteRef>): OperationEntryDto['quote'] {
    const ref = row.quoteId ? quotes.get(row.quoteId) : undefined;
    if (!ref) return null;
    return {
      id: ref.id,
      calculatedAt: ref.calculatedAt,
      strategy: { key: ref.strategyKey, name: ref.strategyName, version: ref.version },
    };
  }
}
