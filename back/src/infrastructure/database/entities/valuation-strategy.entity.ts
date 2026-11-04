import { randomUUID } from 'node:crypto';
import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';

/**
 * Criterio de valuación identificado por una clave estable (`performance`, `prestige`). La
 * configuración vive en sus versiones; esta fila solo sabe cuál es la vigente y si está activa.
 *
 * Nunca hay dos activas: lo garantiza el índice único parcial `valuation_strategy_one_active`
 * de la migración (FR-013), que la entidad no puede declarar.
 *
 * Sin colección inversa de versiones a propósito: la referencia circular entre las dos entidades
 * rompe los metadatos de los decoradores cuando Jest las carga como ESM. Las versiones se
 * consultan por `strategy` desde el repositorio.
 */
@Entity()
export class ValuationStrategy {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @Property({ type: 'string', unique: true })
  key!: string;

  @Property({ type: 'string' })
  name!: string;

  @Property({ type: 'text' })
  description!: string;

  @Property({ type: 'boolean' })
  active!: boolean;

  @Property({ type: 'integer' })
  currentVersion!: number;

  @Property({ type: 'Date', onCreate: () => new Date() })
  createdAt!: Date;
}
