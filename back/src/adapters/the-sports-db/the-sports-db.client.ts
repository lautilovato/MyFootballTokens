import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { firstValueFrom } from 'rxjs';
import { PinoLoggerService } from '../../shared/logging/pino-logger.service';

const MAX_RETRIES = 3;

@Injectable()
export class TheSportsDbClient {
  private readonly baseURL = process.env.THESPORTSDB_BASE_URL ?? 'https://www.thesportsdb.com/api/v1/json';
  // "123" es la clave pública de prueba del plan gratuito.
  private readonly apiKey = process.env.THESPORTSDB_API_KEY ?? '123';
  private readonly intervalMs = Math.ceil(
    60_000 / Number(process.env.THESPORTSDB_RATE_LIMIT_PER_MINUTE ?? 30),
  );

  /** Encola cada request para no superar el rate limit del plan gratuito. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly http: HttpService,
    private readonly logger: PinoLoggerService,
  ) {}

  async get<T>(endpoint: string, params: Record<string, string>): Promise<T> {
    const task = this.queue
      .then(() => this.delay(this.intervalMs))
      .then(() => this.request<T>(endpoint, params));
    this.queue = task.catch(() => undefined);
    return task as Promise<T>;
  }

  private async request<T>(endpoint: string, params: Record<string, string>, attempt = 1): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.http.get<T>(`${this.baseURL}/${this.apiKey}/${endpoint}`, { params }),
      );
      return response.data;
    } catch (error: unknown) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;

      if (status === 429 && attempt <= MAX_RETRIES) {
        this.logger.event('TheSportsDbClient', 'rate limit alcanzado, reintentando', {
          endpoint,
          attempt,
        });
        await this.delay(this.intervalMs * attempt * 2);
        return this.request<T>(endpoint, params, attempt + 1);
      }

      this.logger.event('TheSportsDbClient', 'request a TheSportsDB falló', {
        endpoint,
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
