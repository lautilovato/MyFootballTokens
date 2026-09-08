import { Injectable, LoggerService } from '@nestjs/common';
import pino, { type Logger } from 'pino';
import { CorrelationIdStore } from './correlation-id.store';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

@Injectable()
export class PinoLoggerService implements LoggerService {
  readonly pino: Logger;

  constructor() {
    this.pino = pino({
      level: process.env.LOG_LEVEL ?? 'info',
      timestamp: pino.stdTimeFunctions.isoTime,
    });
  }

  log(message: unknown, context?: string): void {
    this.child(context).info(this.toMessage(message));
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.child(context).error({ trace }, this.toMessage(message));
  }

  warn(message: unknown, context?: string): void {
    this.child(context).warn(this.toMessage(message));
  }

  debug(message: unknown, context?: string): void {
    this.child(context).debug(this.toMessage(message));
  }

  verbose(message: unknown, context?: string): void {
    this.child(context).trace(this.toMessage(message));
  }

  /** Structured business-event log, e.g. `logger.event('PlayerService', 'players queried', { league, count }); */
  event(context: string, message: string, data: Record<string, unknown> = {}): void {
    this.child(context).info(data, message);
  }

  private child(context?: string): Logger {
    const correlationId = CorrelationIdStore.getId();
    return this.pino.child({
      ...(context ? { context } : {}),
      ...(correlationId ? { correlationId } : {}),
    });
  }

  private toMessage(message: unknown): string {
    return typeof message === 'string' ? message : JSON.stringify(message);
  }
}
