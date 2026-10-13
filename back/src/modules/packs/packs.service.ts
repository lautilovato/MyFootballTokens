import { randomInt, randomUUID } from 'node:crypto';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { CorrelationIdStore } from '../../shared/logging/correlation-id.store';
import { PinoLoggerService } from '../../shared/logging/pino-logger.service';
import { ovrFromReputation } from '../player/ovr';
import { PlayerService } from '../player/player.service';
import { Rarity, rarityFromOvr } from '../player/rarity';
import { TokensService } from '../tokens/tokens.service';
import { PackCatalogResponseDto } from './dto/pack-catalog-response.dto';
import { DEFAULT_OPENINGS_PAGE_SIZE, OpeningsQueryDto } from './dto/openings-query.dto';
import { OpeningCardDto, PackOpeningResponseDto, PackOpeningsPageDto } from './dto/pack-opening-response.dto';
import { StockSyncResultDto } from './dto/stock-sync-result.dto';
import { PACK_TYPES, PackTypeKey, PacksConfig, RARITY_ORDER, isPackType, parsePacksConfig } from './pack-config.rules';
import { planBatch } from './pack-stock-planner';
import {
  InsufficientCreditsError,
  OpenedCard,
  OpenedPack,
  PackSoldOutError,
  PacksRepository,
} from './packs.repository';

const LOG_CONTEXT = 'PacksService';

/** Contador que versiona la caché del catálogo (research #9). */
export const PACKS_STOCK_VERSION_KEY = 'packs:stock-version';

/** Nombre del job en `SchedulerRegistry`. */
export const PACKS_CRON_JOB_NAME = 'packs-stock-sync';

const DEFAULT_STOCK_CRON = '*/15 * * * *';

export const PACK_ERRORS = {
  typeNotFound: { code: 'PACK_TYPE_NOT_FOUND', message: 'El tipo de sobre no existe' },
  notAvailable: { code: 'PACKS_NOT_AVAILABLE', message: 'Todavía no hay sobres disponibles' },
  soldOut: { code: 'PACK_SOLD_OUT', message: 'No quedan sobres de ese tipo' },
  insufficientCredits: { code: 'INSUFFICIENT_CREDITS', message: 'El saldo no alcanza para abrir este sobre' },
} as const;

/** Rareza de un jugador según su reputación: la misma regla que la home (FR-016, FR-069). */
export function rarityOfReputation(reputation: number | null): Rarity {
  return rarityFromOvr(ovrFromReputation(reputation));
}

@Injectable()
export class PacksService implements OnModuleInit {
  private config!: PacksConfig;

  constructor(
    private readonly packsRepository: PacksRepository,
    private readonly tokensService: TokensService,
    private readonly playerService: PlayerService,
    private readonly logger: PinoLoggerService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  /**
   * Valida la configuración de los tipos de sobre (FR-045): con una configuración inválida la
   * aplicación no arranca (research #11). Después registra el job de sincronización del stock.
   */
  onModuleInit(): void {
    const parsed = parsePacksConfig(process.env);
    if (!parsed.ok) {
      throw new Error(`Configuración de sobres inválida (PACK_TYPES_CONFIG): ${parsed.errors.join('; ')}`);
    }
    this.config = parsed.config;
    this.logger.event(LOG_CONTEXT, 'packs config loaded', {
      types: Object.fromEntries(PACK_TYPES.map((t) => [t, { price: this.config[t].price, cards: this.config[t].cards }])),
    });
    this.registerScheduler();
  }

  // --------------------------------------------------------------------------- stock

  /**
   * Emite los tokens que falten y arma un lote con los tokens elegibles (FR-012, FR-029).
   * Idempotente: sin tokens nuevos ni elegibles no hace nada.
   */
  async syncStock(): Promise<StockSyncResultDto> {
    const correlationId = CorrelationIdStore.getId() ?? randomUUID();
    const emittedTokens = await this.tokensService.emitMissing();

    const params = this.batchParams();
    const batch = await this.packsRepository.generateBatch(
      (tokens) =>
        planBatch(
          tokens.map((t) => ({ tokenId: t.tokenId, rarity: rarityOfReputation(t.reputation) })),
          this.config,
          randomInt,
        ),
      params,
      correlationId,
    );

    if (batch) {
      await this.bumpStockVersion();
      // Solo conteos: el contenido de los sobres nunca va a un log (FR-015).
      this.logger.event(LOG_CONTEXT, 'pack batch generated', {
        batch: batch.number,
        tokens: batch.tokenCount,
        packs: batch.packs,
      });
    }
    return { emittedTokens, batch };
  }

  /** Para disparos automáticos: un fallo queda en el log y no rompe la operación de origen. */
  async syncStockSafely(reason: string): Promise<void> {
    try {
      await this.syncStock();
    } catch (error) {
      this.logger.warn(
        `stock sync after ${reason} failed: ${error instanceof Error ? error.message : String(error)}`,
        LOG_CONTEXT,
      );
    }
  }

  /**
   * Invalida el catálogo cacheado. Lo llaman la apertura, la generación de un lote y las cargas
   * de reputación, que cambian las rarezas publicadas (research #9).
   */
  async bumpStockVersion(): Promise<void> {
    try {
      const current = (await this.cache.get<number>(PACKS_STOCK_VERSION_KEY)) ?? 0;
      // TTL 0 = sin expiración: el contador debe sobrevivir al TTL de las entradas que versiona.
      await this.cache.set(PACKS_STOCK_VERSION_KEY, current + 1, 0);
    } catch (error) {
      this.logger.warn(`packs cache invalidation failed: ${describe(error)}`, LOG_CONTEXT);
    }
  }

  // --------------------------------------------------------------------------- catálogo

  /** Tipos de sobre con precio, cartas, stock y probabilidades en vivo (FR-010). */
  async getCatalog(): Promise<PackCatalogResponseDto> {
    const version = (await this.cacheGet<number>(PACKS_STOCK_VERSION_KEY)) ?? 0;
    const cacheKey = `packs:types:v${version}`;
    const cached = await this.cacheGet<PackCatalogResponseDto>(cacheKey);
    if (cached) return cached;

    const [stockGenerated, remaining, cards] = await Promise.all([
      this.packsRepository.anyPackGenerated(),
      this.packsRepository.countUnopenedByType(),
      this.packsRepository.countUnopenedCardsByTypeAndRarity(),
    ]);

    const result: PackCatalogResponseDto = {
      stockGenerated,
      types: PACK_TYPES.map((type) => {
        const total = RARITY_ORDER.reduce((sum, r) => sum + cards[type][r], 0);
        return {
          type,
          price: this.config[type].price,
          cards: this.config[type].cards,
          remaining: remaining[type],
          probabilities:
            remaining[type] === 0 || total === 0
              ? null
              : {
                  common: cards[type].common / total,
                  rare: cards[type].rare / total,
                  epic: cards[type].epic / total,
                  legendary: cards[type].legendary / total,
                },
        };
      }),
    };

    await this.cacheSet(cacheKey, result);
    return result;
  }

  // --------------------------------------------------------------------------- apertura

  /**
   * Abre un sobre del tipo elegido (FR-018 a FR-027). Valida en el orden de la spec: tipo,
   * sobres generados, stock del tipo y, dentro de la transacción, saldo.
   */
  async open(userId: string, type: string): Promise<PackOpeningResponseDto> {
    if (!isPackType(type)) throw new NotFoundException({ ...PACK_ERRORS.typeNotFound });
    if (!(await this.packsRepository.anyPackGenerated())) throw new ConflictException({ ...PACK_ERRORS.notAvailable });
    if ((await this.packsRepository.countUnopenedByType())[type] === 0) {
      throw new ConflictException({ ...PACK_ERRORS.soldOut });
    }

    const price = this.config[type].price;
    let opened: OpenedPack;
    try {
      opened = await this.packsRepository.openPack({
        userId,
        type,
        price,
        correlationId: CorrelationIdStore.getId() ?? randomUUID(),
        rarityOf: rarityOfReputation,
      });
    } catch (error) {
      if (error instanceof PackSoldOutError) throw new ConflictException({ ...PACK_ERRORS.soldOut });
      if (error instanceof InsufficientCreditsError) {
        throw new ConflictException({ ...PACK_ERRORS.insufficientCredits });
      }
      throw error;
    }

    await this.bumpStockVersion();
    this.logger.event(LOG_CONTEXT, 'pack opened', {
      opening: opened.id,
      type,
      price,
      cards: opened.cardCount,
      tokens: opened.cardCount,
      movements: 1,
    });
    return this.toResponse(opened);
  }

  /**
   * Historial de aperturas del usuario (FR-039). Las cartas muestran la rareza y la cotización
   * registradas en el momento cero (FR-038) junto con la carta actual del jugador.
   */
  async listOpenings(userId: string, query: OpeningsQueryDto): Promise<PackOpeningsPageDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_OPENINGS_PAGE_SIZE;
    const { total, openings } = await this.packsRepository.findOpeningsPage(userId, page, limit);
    const players = await this.playerService.findCardsByIds(openings.flatMap((o) => o.cards.map((c) => c.playerId)));
    return {
      data: openings.map((opening) => this.toResponseWith(opening, players)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Completa las cartas con la carta del jugador que usa la home (research #13). */
  async toResponse(opened: OpenedPack): Promise<PackOpeningResponseDto> {
    const players = await this.playerService.findCardsByIds(opened.cards.map((c) => c.playerId));
    return this.toResponseWith(opened, players);
  }

  private toResponseWith(opened: OpenedPack, players: Map<string, OpeningCardDto['player']>): PackOpeningResponseDto {
    return {
      id: opened.id,
      type: opened.type,
      price: opened.price,
      cardCount: opened.cardCount,
      balanceBefore: opened.balanceBefore,
      balanceAfter: opened.balanceAfter,
      openedAt: opened.openedAt.toISOString(),
      cards: opened.cards.map((card) => this.toCard(card, players)),
    };
  }

  private toCard(card: OpenedCard, players: Map<string, OpeningCardDto['player']>): OpeningCardDto {
    return {
      tokenId: card.tokenId,
      serial: card.serial,
      rarity: card.rarity,
      quotePrice: card.quotePrice,
      player: players.get(card.playerId)!,
    };
  }

  // --------------------------------------------------------------------------- internos

  /** Parámetros del lote: los que rigen para los sobres que se generan ahora (FR-046). */
  private batchParams(): Record<string, unknown> {
    return Object.fromEntries(
      PACK_TYPES.map((t: PackTypeKey) => [
        t,
        { cards: this.config[t].cards, probabilities: this.config[t].probabilities, share: this.config[t].share },
      ]),
    );
  }

  /**
   * Job de sincronización del stock (FR-012), como red de seguridad de los disparos directos:
   * por ejemplo, para los jugadores que trae una nueva ingesta. Mismo patrón que el recálculo
   * de cotizaciones: expresión del entorno, Correlation ID propio y errores sin propagar.
   */
  private registerScheduler(): void {
    if (process.env.PACKS_SCHEDULER_ENABLED === 'false') {
      this.logger.event(LOG_CONTEXT, 'packs scheduler disabled');
      return;
    }
    const cronTime = process.env.PACKS_STOCK_CRON?.trim() || DEFAULT_STOCK_CRON;
    let job: CronJob;
    try {
      job = CronJob.from({
        cronTime,
        onTick: () => CorrelationIdStore.run(randomUUID(), () => this.syncStockSafely('scheduled tick')),
        start: false,
      });
    } catch (error) {
      // Una expresión mal escrita no debe tirar la API: queda el disparo manual.
      this.logger.error(`invalid PACKS_STOCK_CRON "${cronTime}": ${describe(error)}`, undefined, LOG_CONTEXT);
      return;
    }
    this.schedulerRegistry.addCronJob(PACKS_CRON_JOB_NAME, job);
    job.start();
    this.logger.event(LOG_CONTEXT, 'packs scheduler registered', { cron: cronTime, nextRun: job.nextDate().toISO() });
  }

  private async cacheGet<T>(key: string): Promise<T | undefined> {
    try {
      return (await this.cache.get<T>(key)) ?? undefined;
    } catch (error) {
      this.logger.warn(`packs cache read failed: ${describe(error)}`, LOG_CONTEXT);
      return undefined;
    }
  }

  private async cacheSet(key: string, value: unknown): Promise<void> {
    try {
      await this.cache.set(key, value);
    } catch (error) {
      this.logger.warn(`packs cache write failed: ${describe(error)}`, LOG_CONTEXT);
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
