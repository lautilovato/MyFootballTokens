import { randomUUID } from 'node:crypto';
import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';

/**
 * Un lote de sobres generado de una vez con los tokens de los jugadores que se volvieron
 * elegibles (08-sobres FR-012). Guarda los parámetros con que se armó (FR-046) y su composición
 * al generarse (verificación de SC-005 y SC-007).
 */
@Entity()
export class PackBatch {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  /** Número correlativo y legible («Lote 3»). Lo asigna la secuencia de la base. */
  @Property({ type: 'integer', autoincrement: true, unique: true })
  number!: number;

  /** Múltiplo de 100: el lote siempre reparte jugadores completos. */
  @Property({ type: 'integer' })
  tokenCount!: number;

  @Property({ type: 'json' })
  params!: Record<string, unknown>;

  @Property({ type: 'json' })
  composition!: Record<string, unknown>;

  @Property({ type: 'string' })
  correlationId!: string;

  @Property({ type: 'Date', onCreate: () => new Date() })
  createdAt!: Date;
}
