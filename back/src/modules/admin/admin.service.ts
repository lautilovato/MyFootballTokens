import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PinoLoggerService } from '../../shared/logging/pino-logger.service';
import { validatePeriod, type AdminPeriod } from './admin-period';
import { AdminRepository, type AdminSnapshot } from './admin.repository';
import type { AdminMetricsQueryDto } from './dto/admin-metrics-query.dto';
import type { AdminMetricsDto } from './dto/admin-metrics-response.dto';

const LOG_CONTEXT = 'AdminService';
const PACK_TYPES = ['common', 'rare', 'epic', 'legendary'] as const;
const DEFAULT_TIMEZONE = 'UTC';
/** Los datos nunca tienen más de 1 minuto de antigüedad (FR-026, SC-008). */
const METRICS_TTL_MS = 60_000;

/** Lectura de las métricas del panel de administración (11-admin-panel). */
@Injectable()
export class AdminService {
  constructor(
    private readonly adminRepository: AdminRepository,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly logger: PinoLoggerService,
  ) {}

  async getMetrics(query: AdminMetricsQueryDto): Promise<AdminMetricsDto> {
    const timezone = query.timezone ?? DEFAULT_TIMEZONE;
    const invalid = validatePeriod(query.from, query.to, timezone);
    if (invalid) throw new BadRequestException(invalid);

    const period: AdminPeriod = { from: query.from ?? null, to: query.to ?? null, timezone };
    const key = `admin:metrics:${period.from ?? 'all'}:${period.to ?? 'all'}:${timezone}`;

    if (query.refresh !== 'true') {
      const cached = await this.cacheGet(key);
      if (cached) return cached;
    }

    const metrics = await this.compute(period);
    await this.cacheSet(key, metrics);
    return metrics;
  }

  private async compute(period: AdminPeriod): Promise<AdminMetricsDto> {
    const snapshot = await this.adminRepository.loadSnapshot(period);
    return {
      computedAt: new Date().toISOString(),
      period,
      users: snapshot.users,
      cards: cardsOf(snapshot),
      rarity: {
        common: snapshot.rarity.common ?? 0,
        rare: snapshot.rarity.rare ?? 0,
        epic: snapshot.rarity.epic ?? 0,
        legendary: snapshot.rarity.legendary ?? 0,
      },
      packs: packsOf(snapshot),
      market: {
        ...snapshot.market,
        topSale: snapshot.topSale && { ...snapshot.topSale, at: snapshot.topSale.at.toISOString() },
        topPlayers: snapshot.topPlayers,
      },
      credits: { ...snapshot.credits, inCirculation: snapshot.creditsInCirculation },
      activity: snapshot.activity,
      reconciliation: reconciliationOf(snapshot),
    };
  }

  private async cacheGet(key: string): Promise<AdminMetricsDto | undefined> {
    try {
      return (await this.cache.get<AdminMetricsDto>(key)) ?? undefined;
    } catch (error) {
      this.logger.warn(`admin cache read failed: ${describe(error)}`, LOG_CONTEXT);
      return undefined;
    }
  }

  private async cacheSet(key: string, value: AdminMetricsDto): Promise<void> {
    try {
      await this.cache.set(key, value, METRICS_TTL_MS);
    } catch (error) {
      this.logger.warn(`admin cache write failed: ${describe(error)}`, LOG_CONTEXT);
    }
  }
}

function cardsOf({ tokensByStatus, listed }: AdminSnapshot): AdminMetricsDto['cards'] {
  const count = (status: string) => tokensByStatus[status] ?? 0;
  return {
    issued: Object.values(tokensByStatus).reduce((sum, n) => sum + n, 0),
    inCirculation: count('de_usuario'),
    inPacks: count('en_sobre'),
    reserved: count('reservado'),
    platformSale: count('en_venta_plataforma'),
    listed,
  };
}

function packsOf({ packsRemaining, packsOpened }: AdminSnapshot): AdminMetricsDto['packs'] {
  const byType = PACK_TYPES.map((type) => {
    const remaining = packsRemaining[type] ?? 0;
    return { type, remaining, opened: packsOpened[type] ?? 0, soldOut: remaining === 0 };
  });
  return {
    remaining: byType.reduce((sum, row) => sum + row.remaining, 0),
    opened: byType.reduce((sum, row) => sum + row.opened, 0),
    byType,
  };
}

/** Sobre toda la historia, sin importar el período (FR-024). Solo informa: no corrige (FR-025). */
function reconciliationOf(snapshot: AdminSnapshot): AdminMetricsDto['reconciliation'] {
  const cards = cardsOf(snapshot);
  const cardsDifference = cards.issued - (cards.inCirculation + cards.inPacks + cards.reserved + cards.platformSale);
  const expected = snapshot.creditsAllTime.issued - snapshot.creditsAllTime.collected;
  const actual = snapshot.creditsInCirculation;
  return {
    cards: {
      ok: cardsDifference === 0 && snapshot.playersWithoutFullEmission === 0,
      difference: cardsDifference,
      affectedPlayers: snapshot.playersWithoutFullEmission,
    },
    credits: { ok: expected === actual, expected, actual, difference: expected - actual },
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
