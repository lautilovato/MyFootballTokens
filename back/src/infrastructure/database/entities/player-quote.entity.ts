import { randomUUID } from 'node:crypto';
import { Entity, Enum, PrimaryKey, Property, ManyToOne } from '@mikro-orm/decorators/legacy';
import { Player } from './player.entity';
import { QuoteRun, QuoteRunTrigger } from './quote-run.entity';
import { Metric, ValuationStrategyVersion } from './valuation-strategy-version.entity';

/** Qué perfil de pesos se aplicó al jugador: el de su posición o el general. */
export enum PositionProfile {
  GENERAL = 'GENERAL',
  GK = 'GK',
  DF = 'DF',
  MF = 'MF',
  FW = 'FW',
}

/** Aporte de una métrica al score (FR-002b). `contribution = weight × normalized / S⁺`. */
export interface BreakdownItem {
  metric: Metric;
  raw: number | null;
  normalized: number;
  weight: number;
  contribution: number;
}

/**
 * Precio de un jugador, y el score del que se deriva, en un momento dado (data-model.md).
 * Inmutable y acumulativa: un recálculo solo agrega filas (FR-017). El desglose guardado
 * alcanza para reproducir score y precio junto con la versión referenciada (SC-002).
 */
@Entity()
export class PlayerQuote {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @ManyToOne(() => Player)
  player!: Player;

  @ManyToOne(() => QuoteRun)
  run!: QuoteRun;

  @ManyToOne(() => ValuationStrategyVersion)
  strategyVersion!: ValuationStrategyVersion;

  @Enum(() => QuoteRunTrigger)
  origin!: QuoteRunTrigger;

  @Property({ type: 'string' })
  season!: string;

  /** Score ≥ 0 y sin tope superior: precisión holgada para jugadores muy por encima del p95. */
  @Property({ type: 'decimal', precision: 9, scale: 4 })
  score!: string;

  /** Suma de contribuciones antes de aplicar el piso en 0; difiere de `score` solo si es negativa. */
  @Property({ type: 'decimal', precision: 8, scale: 4 })
  rawScore!: string;

  @Property({ type: 'integer' })
  price!: number;

  @Enum(() => PositionProfile)
  positionProfile!: PositionProfile;

  @Property({ type: 'decimal', precision: 6, scale: 4 })
  positiveWeightSum!: string;

  @Property({ type: 'json' })
  breakdown!: BreakdownItem[];

  @Property({ type: 'boolean' })
  usedDefaultReputation!: boolean;

  @Property({ type: 'boolean' })
  missingMatchesPlayed!: boolean;

  @Property({ type: 'Date' })
  calculatedAt!: Date;
}
