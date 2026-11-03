import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PinoLoggerService } from '../../shared/logging/pino-logger.service';
import {
  DEFAULT_TIMEZONE,
  METRICS_TTL_MS,
  metricsCacheKey,
  metricsFromSnapshot,
  validatePeriod,
  type AdminPeriod,
} from './admin.model';
import { AdminRepository } from './admin.repository';
import type { AdminMetricsQueryDto } from './dto/admin-metrics-query.dto';
import type { AdminMetricsDto } from './dto/admin-metrics-response.dto';

const LOG_CONTEXT = 'AdminService';

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
    const key = metricsCacheKey(period);

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
    return metricsFromSnapshot(snapshot, period, new Date());
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

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
