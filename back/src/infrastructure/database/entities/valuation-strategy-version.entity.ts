import { randomUUID } from 'node:crypto';
import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/decorators/legacy';
import { ValuationStrategy } from './valuation-strategy.entity';

/** Catálogo cerrado de métricas que puede ponderar una estrategia (07-cotizacion FR-003). */
export const METRICS = [
  'goals',
  'assists',
  'shots',
  'keyPasses',
  'dribbles',
  'tackles',
  'rating',
  'absence',
  'worldReputation',
] as const;

export type Metric = (typeof METRICS)[number];

/** Peso por métrica; una métrica ausente vale 0. */
export type Weights = Partial<Record<Metric, number>>;

/** Posiciones que admiten un perfil de pesos propio. UNKNOWN usa siempre los generales. */
export const STRATEGY_POSITIONS = ['GK', 'DF', 'MF', 'FW'] as const;

export type StrategyPositionKey = (typeof STRATEGY_POSITIONS)[number];

/** Un perfil por posición reemplaza completo a los pesos generales: no se mezclan. */
export interface StrategyWeights {
  general: Weights;
  byPosition?: Partial<Record<StrategyPositionKey, Weights>>;
}

/**
 * Configuración de una estrategia en un momento dado (data-model.md). Inmutable: cambiar la
 * configuración crea una versión nueva, y las cotizaciones siguen apuntando a la suya (FR-011).
 */
@Entity()
@Unique({ properties: ['strategy', 'version'] })
export class ValuationStrategyVersion {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @ManyToOne(() => ValuationStrategy)
  strategy!: ValuationStrategy;

  @Property({ type: 'integer' })
  version!: number;

  @Property({ type: 'json' })
  weights!: StrategyWeights;

  /** Precio de un jugador con score 0. */
  @Property({ type: 'integer' })
  baseValue!: number;

  @Property({ type: 'integer' })
  scaleFactor!: number;

  @Property({ type: 'integer' })
  minPrice!: number;

  /** Reputación que se asume para un jugador sin carga (FR-025, research #8). */
  @Property({ type: 'smallint' })
  defaultReputation!: number;

  @Property({ type: 'Date', onCreate: () => new Date() })
  createdAt!: Date;
}
