import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { QuoteRun } from '../../infrastructure/database/entities/quote-run.entity';
import { PinoLoggerService } from '../../shared/logging/pino-logger.service';
import { PlayerService } from '../player/player.service';
import { ValuationStrategyService } from '../valuation-strategy/valuation-strategy.service';
import type { PlayerRankingDto, RankingEntryDto } from './dto/ranking-response.dto';
import { RankingRepository } from './ranking.repository';

const LOG_CONTEXT = 'RankingService';

/** Cantidad de jugadores del ranking (13-ranking FR-001). */
export const RANKING_SIZE = 10;

/** Las cartas en circulación cambian con cada sobre abierto: nunca atrasan más de 1 minuto. */
const RANKING_TTL_MS = 60_000;

@Injectable()
export class RankingService {
  constructor(
    private readonly rankingRepository: RankingRepository,
    private readonly valuationStrategyService: ValuationStrategyService,
    private readonly playerService: PlayerService,
    private readonly logger: PinoLoggerService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * Top de jugadores de la estrategia activa (FR-001, FR-002). Se resuelve desde su última corrida
   * y no desde `player.base_value`: ese espejo guarda la última corrida de cualquier estrategia, y
   * activar otra no recalcula nada (07-cotizacion FR-014). La clave de caché incluye la corrida,
   * así que activar una estrategia o terminar un recálculo cambian el ranking al instante.
   */
  async getTopPlayers(): Promise<PlayerRankingDto> {
    const { strategy, version } = await this.valuationStrategyService.getActiveVersion();
    const strategyRef = { key: strategy.key, name: strategy.name, version: version.version };

    const run = await this.rankingRepository.findLatestCompletedRun(strategy.id);
    if (!run) return { strategy: strategyRef, calculatedAt: null, data: [] };

    const cacheKey = `ranking:players:${run.id}`;
    const cached = await this.cacheGet(cacheKey);
    if (cached) return cached;

    const result: PlayerRankingDto = {
      strategy: { ...strategyRef, version: run.strategyVersion!.version },
      calculatedAt: run.finishedAt!.toISOString(),
      data: await this.loadEntries(run),
    };
    await this.cacheSet(cacheKey, result);

    this.logger.event(LOG_CONTEXT, 'player ranking queried', {
      strategy: strategy.key,
      runId: run.id,
      players: result.data.length,
    });
    return result;
  }

  private async loadEntries(run: QuoteRun): Promise<RankingEntryDto[]> {
    const top = await this.rankingRepository.findTopOfRun(run.id, RANKING_SIZE);
    const playerIds = top.map((row) => row.playerId);

    const [cards, circulation] = await Promise.all([
      this.playerService.findCardsByIds(playerIds),
      this.rankingRepository.countInCirculation(playerIds),
    ]);

    return top.map(({ playerId, price }, index) => ({
      rank: index + 1,
      inCirculation: circulation.get(playerId) ?? 0,
      player: { ...cards.get(playerId)!, marketValue: price },
    }));
  }

  private async cacheGet(key: string): Promise<PlayerRankingDto | undefined> {
    try {
      return (await this.cache.get<PlayerRankingDto>(key)) ?? undefined;
    } catch (error) {
      this.logger.warn(`ranking cache read failed: ${describe(error)}`, LOG_CONTEXT);
      return undefined;
    }
  }

  private async cacheSet(key: string, value: PlayerRankingDto): Promise<void> {
    try {
      await this.cache.set(key, value, RANKING_TTL_MS);
    } catch (error) {
      this.logger.warn(`ranking cache write failed: ${describe(error)}`, LOG_CONTEXT);
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
