import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { firstValueFrom } from 'rxjs';
import { PinoLoggerService } from '../../shared/logging/pino-logger.service';

const MAX_RETRIES = 3;

@Injectable()
export class FootballDataClient {
  private readonly baseURL = process.env.FOOTBALL_DATA_BASE_URL;
  private readonly apiKey = process.env.FOOTBALL_DATA_API_KEY;
  private readonly intervalMs = Math.ceil(
    60_000 / Number(process.env.FOOTBALL_DATA_RATE_LIMIT_PER_MINUTE ?? 10),
  );

  /** Encola cada request para no superar el rate limit del plan free (ver research.md #2). */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly http: HttpService,
    private readonly logger: PinoLoggerService,
  ) {}

  async get<T>(path: string): Promise<T> {
    const task = this.queue.then(() => this.delay(this.intervalMs)).then(() => this.request<T>(path));
    this.queue = task.catch(() => undefined);
    return task as Promise<T>;
  }

  private async request<T>(path: string, attempt = 1): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.http.get<T>(path, {
          baseURL: this.baseURL,
          headers: { 'X-Auth-Token': this.apiKey ?? '' },
        }),
      );
      return response.data;
    } catch (error: unknown) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;

      if (status === 429 && attempt <= MAX_RETRIES) {
        this.logger.event('FootballDataClient', 'rate limit alcanzado, reintentando', {
          path,
          attempt,
        });
        await this.delay(this.intervalMs * attempt);
        return this.request<T>(path, attempt + 1);
      }

      this.logger.event('FootballDataClient', 'request a Football-Data.org falló', {
        path,
        status: status ?? null,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
