import { randomUUID } from 'node:crypto';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleInit,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob, validateCronExpression } from 'cron';
import { QuoteRunTrigger } from '../../infrastructure/database/entities/quote-run.entity';
import { CorrelationIdStore } from '../../shared/logging/correlation-id.store';
import { PinoLoggerService } from '../../shared/logging/pino-logger.service';
import { PlayerService } from '../player/player.service';
import { ValuationStrategyService } from '../valuation-strategy/valuation-strategy.service';
import { BulkReputationDto } from './dto/bulk-reputation.dto';
import { BulkReputationResultDto, ReputationResponseDto } from './dto/bulk-reputation-result.dto';
import { CurrentQuoteResponseDto, QuoteDto } from './dto/current-quote-response.dto';
import { QuoteHistoryQueryDto } from './dto/quote-history-query.dto';
import { PageMetaDto } from './dto/page-meta.dto';
import { QuoteHistoryResponseDto } from './dto/quote-history-response.dto';
import { ListRunsQueryDto } from './dto/list-runs-query.dto';
import { QuoteRunResponseDto, QuoteRunsPageDto } from './dto/quote-run-response.dto';
import { SetReputationDto } from './dto/set-reputation.dto';
import { QuotesRepository } from './quotes.repository';
import { calculateQuotes } from './score-calculator';

const LOG_CONTEXT = 'QuotesService';

/**
 * Contador que versiona el espacio de claves de la cotización actual (research #11). Cada
 * corrida confirmada lo incrementa y todas las entradas viejas quedan inalcanzables al instante.
 */
export const QUOTES_VERSION_KEY = 'quotes:version';

/** Nombre del job en `SchedulerRegistry`. */
export const QUOTES_CRON_JOB_NAME = 'quotes-weekly-recalculation';

/** Lunes 03:00 (research #1). Configurable con QUOTES_RECALC_CRON sin tocar código (FR-027). */
const DEFAULT_RECALC_CRON = '0 3 * * 1';

@Injectable()
export class QuotesService implements OnModuleInit, OnApplicationBootstrap {
  constructor(
    private readonly quotesRepository: QuotesRepository,
    private readonly valuationStrategyService: ValuationStrategyService,
    private readonly playerService: PlayerService,
    private readonly logger: PinoLoggerService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  /**
   * Registra el recálculo semanal (research #1). Se registra a mano y no con `@Cron` porque la
   * expresión y la zona vienen del entorno. El cron no recupera disparos perdidos mientras el
   * proceso estuvo caído: a lo sumo corre la siguiente fecha programada (US5-3).
   */
  onModuleInit(): void {
    if (process.env.QUOTES_SCHEDULER_ENABLED === 'false') {
      this.logger.event(LOG_CONTEXT, 'quote scheduler disabled');
      return;
    }

    const cronTime = process.env.QUOTES_RECALC_CRON?.trim() || DEFAULT_RECALC_CRON;
    const timeZone = process.env.QUOTES_RECALC_TIMEZONE?.trim() || undefined;

    // Una expresión mal escrita no debe tirar la API entera: se loguea y la corrida queda
    // disponible a mano por POST /quotes/recalculate.
    const validation = validateCronExpression(cronTime);
    if (!validation.valid) {
      this.logger.error(
        `invalid QUOTES_RECALC_CRON "${cronTime}": ${validation.error?.message ?? 'unknown error'}`,
        undefined,
        LOG_CONTEXT,
      );
      return;
    }

    const job = CronJob.from({
      cronTime,
      timeZone,
      onTick: () => this.runScheduled(),
      start: false,
    });
    this.schedulerRegistry.addCronJob(QUOTES_CRON_JOB_NAME, job);
    job.start();

    this.logger.event(LOG_CONTEXT, 'quote scheduler registered', {
      cron: cronTime,
      timeZone: timeZone ?? 'server',
      nextRun: job.nextDate().toISO(),
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.recoverInterruptedRuns();
  }

  /** Cierra como FAILED las corridas que un reinicio dejó en RUNNING (US5-3). */
  async recoverInterruptedRuns(): Promise<void> {
    const recovered = await this.quotesRepository.failInterruptedRuns();
    if (recovered > 0) {
      this.logger.event(LOG_CONTEXT, 'interrupted quote runs recovered', { recovered });
    }
  }

  /**
   * Disparo del scheduler. Corre con un Correlation ID propio —no hay petición HTTP de la cual
   * heredarlo— y nunca propaga errores: el fallo queda registrado en la corrida y en los logs,
   * y la semana siguiente se intenta de nuevo (US5-4).
   */
  async runScheduled(): Promise<void> {
    const correlationId = randomUUID();
    await CorrelationIdStore.run(correlationId, async () => {
      try {
        await this.runRecalculation(QuoteRunTrigger.AUTOMATIC);
      } catch (error) {
        this.logger.warn(
          `scheduled quote run did not complete: ${error instanceof Error ? error.message : String(error)}`,
          LOG_CONTEXT,
        );
      }
    });
  }

  /**
   * Una corrida completa de recálculo (research #3): resuelve estrategia y temporada, toma el
   * lock de corrida, calcula en memoria y persiste el lote en una sola transacción. Si algo
   * falla después de tomar el lock, la corrida queda FAILED con el motivo y el error se
   * propaga; las cotizaciones vigentes no cambian.
   */
  async runRecalculation(
    trigger: QuoteRunTrigger,
    strategyKey?: string,
  ): Promise<QuoteRunResponseDto> {
    const correlationId = CorrelationIdStore.getId() ?? randomUUID();

    const { strategy, version } = strategyKey
      ? await this.valuationStrategyService.getVersionByKey(strategyKey)
      : await this.valuationStrategyService.getActiveVersion();

    const season = await this.quotesRepository.findCurrentSeason();
    if (season === null) {
      throw new ConflictException({
        code: 'NO_SEASON_DATA',
        message: 'No hay estadísticas de temporada cargadas para cotizar',
      });
    }

    const runId = await this.quotesRepository.tryStartRun(trigger, correlationId);
    if (runId === null) {
      await this.quotesRepository.insertSkippedRun(trigger, correlationId);
      this.logger.event(LOG_CONTEXT, 'quote run skipped', { trigger, reason: 'run in progress' });
      throw new ConflictException({
        code: 'RUN_IN_PROGRESS',
        message: 'Ya hay un recálculo de cotizaciones en curso',
      });
    }

    const startedAt = Date.now();
    this.logger.event(LOG_CONTEXT, 'quote run started', {
      runId,
      trigger,
      strategy: strategy.key,
      version: version.version,
      season,
    });

    try {
      const rows = await this.quotesRepository.loadSeasonBatch(season);
      const { quotes, bounds } = calculateQuotes(rows, version);
      const catalogSize = await this.quotesRepository.countCatalogPlayers();

      await this.quotesRepository.persistBatch({
        runId,
        strategyVersionId: version.id,
        trigger,
        season,
        quotes,
        bounds,
        skippedCount: catalogSize - quotes.length,
      });

      this.logger.event(LOG_CONTEXT, 'quote run completed', {
        runId,
        trigger,
        strategy: strategy.key,
        version: version.version,
        quoted: quotes.length,
        skipped: catalogSize - quotes.length,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.quotesRepository.markRunFailed(runId, reason, version.id);
      this.logger.error(
        `quote run failed: ${reason}`,
        error instanceof Error ? error.stack : undefined,
        LOG_CONTEXT,
      );
      throw error;
    }

    await this.afterRunCommitted();
    return QuoteRunResponseDto.fromEntity(await this.quotesRepository.findRunById(runId));
  }

  /**
   * Cotización vigente con desglose y variación (FR-019). Se sirve desde Redis con claves
   * versionadas; si Redis no responde, se lee de la base (resiliencia, §3).
   */
  async getCurrent(playerId: string): Promise<CurrentQuoteResponseDto> {
    const version = (await this.cacheGet<number>(QUOTES_VERSION_KEY)) ?? 0;
    const cacheKey = `quotes:current:v${version}:${playerId}`;

    const cached = await this.cacheGet<CurrentQuoteResponseDto>(cacheKey);
    if (cached) return cached;

    if (!(await this.quotesRepository.playerExists(playerId))) {
      throw new NotFoundException(`Player ${playerId} not found`);
    }

    const [latest, previous] = await this.quotesRepository.findLatestTwo(playerId);
    const result = CurrentQuoteResponseDto.from(playerId, latest ?? null, previous ?? null);
    await this.cacheSet(cacheKey, result);

    this.logger.event(LOG_CONTEXT, 'current quote queried', { playerId, quoted: result.quoted });
    return result;
  }

  async getHistory(playerId: string, query: QuoteHistoryQueryDto): Promise<QuoteHistoryResponseDto> {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from > to) {
      throw new BadRequestException('from must not be greater than to');
    }

    if (!(await this.quotesRepository.playerExists(playerId))) {
      throw new NotFoundException(`Player ${playerId} not found`);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const [rows, total] = await this.quotesRepository.findHistory(playerId, { from, to, page, limit });

    return { data: rows.map((row) => QuoteDto.fromEntity(row)), meta: PageMetaDto.of(total, page, limit) };
  }

  async listRuns(query: ListRunsQueryDto): Promise<QuoteRunsPageDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [runs, total] = await this.quotesRepository.findRuns(page, limit);
    return {
      data: runs.map((run) => QuoteRunResponseDto.fromEntity(run)),
      meta: PageMetaDto.of(total, page, limit),
    };
  }

  /**
   * Reputación mundial de un jugador (FR-024). No invalida ninguna caché de cotización: el
   * cambio rige recién desde el próximo recálculo (FR-026).
   */
  async setReputation(playerId: string, dto: SetReputationDto): Promise<ReputationResponseDto> {
    const found = await this.quotesRepository.setReputation(playerId, dto.worldReputation);
    if (!found) throw new NotFoundException(`Player ${playerId} not found`);

    this.logger.event(LOG_CONTEXT, 'world reputation updated', { players: 1 });
    return { playerId, worldReputation: dto.worldReputation };
  }

  /** Carga en lote: los ids inexistentes se informan, no abortan al resto (FR-024). */
  async setReputationBulk(dto: BulkReputationDto): Promise<BulkReputationResultDto> {
    // Si un id viene repetido, gana la última aparición, como si se hubieran enviado en orden.
    const byPlayer = new Map(dto.items.map((item) => [item.playerId, item.worldReputation]));
    const updated = await this.quotesRepository.setReputationBulk(
      [...byPlayer].map(([playerId, value]) => ({ playerId, value })),
    );

    const updatedSet = new Set(updated);
    const result = {
      updated: [...byPlayer.keys()].filter((playerId) => updatedSet.has(playerId)),
      notFound: [...byPlayer.keys()].filter((playerId) => !updatedSet.has(playerId)),
    };

    this.logger.event(LOG_CONTEXT, 'world reputation updated', {
      players: result.updated.length,
      notFound: result.notFound.length,
    });
    return result;
  }

  /**
   * Invalida las cachés que dependen del precio. Las cotizaciones ya están confirmadas: un
   * Redis caído no debe convertir una corrida exitosa en un error (resiliencia, §3).
   */
  private async afterRunCommitted(): Promise<void> {
    try {
      const current = (await this.cache.get<number>(QUOTES_VERSION_KEY)) ?? 0;
      // TTL 0 = sin expiración: el contador debe sobrevivir al TTL de las entradas que versiona.
      await this.cache.set(QUOTES_VERSION_KEY, current + 1, 0);
      await this.playerService.invalidateListCache();
    } catch (error) {
      this.logger.warn(
        `cache invalidation after quote run failed: ${error instanceof Error ? error.message : String(error)}`,
        LOG_CONTEXT,
      );
    }
  }

  private async cacheGet<T>(key: string): Promise<T | undefined> {
    try {
      return (await this.cache.get<T>(key)) ?? undefined;
    } catch (error) {
      this.logger.warn(`quotes cache read failed: ${(error as Error).message}`, LOG_CONTEXT);
      return undefined;
    }
  }

  private async cacheSet(key: string, value: unknown): Promise<void> {
    try {
      await this.cache.set(key, value);
    } catch (error) {
      this.logger.warn(`quotes cache write failed: ${(error as Error).message}`, LOG_CONTEXT);
    }
  }
}
