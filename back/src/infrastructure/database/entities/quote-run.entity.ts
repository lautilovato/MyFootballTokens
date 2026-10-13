import { randomUUID } from 'node:crypto';
import { Entity, Enum, PrimaryKey, Property, ManyToOne } from '@mikro-orm/decorators/legacy';
import { Metric, ValuationStrategyVersion } from './valuation-strategy-version.entity';

export enum QuoteRunTrigger {
  AUTOMATIC = 'AUTOMATIC',
  MANUAL = 'MANUAL',
}

export enum QuoteRunStatus {
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

/** Percentiles 5 y 95 de cada métrica en el lote (research #4). */
export type NormalizationBounds = Partial<Record<Metric, { p5: number; p95: number }>>;

/**
 * Una ejecución del recálculo (FR-029). Nunca hay dos en `RUNNING` a la vez: lo garantiza el
 * índice único parcial `quote_run_one_running` de la migración (research #2).
 */
@Entity()
export class QuoteRun {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @Enum(() => QuoteRunTrigger)
  trigger!: QuoteRunTrigger;

  /** Nulo solo si la corrida se omitió o falló antes de resolver la estrategia. */
  @ManyToOne(() => ValuationStrategyVersion, { nullable: true })
  strategyVersion?: ValuationStrategyVersion | null;

  @Enum(() => QuoteRunStatus)
  status!: QuoteRunStatus;

  @Property({ type: 'string', nullable: true })
  season?: string | null;

  @Property({ type: 'Date' })
  startedAt!: Date;

  @Property({ type: 'Date', nullable: true })
  finishedAt?: Date | null;

  @Property({ type: 'integer', default: 0 })
  quotedCount: number = 0;

  @Property({ type: 'integer', default: 0 })
  skippedCount: number = 0;

  @Property({ type: 'text', nullable: true })
  failureReason?: string | null;

  @Property({ type: 'json', nullable: true })
  normalizationBounds?: NormalizationBounds | null;

  @Property({ type: 'string' })
  correlationId!: string;
}
