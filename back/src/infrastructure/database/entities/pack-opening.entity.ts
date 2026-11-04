import { randomUUID } from 'node:crypto';
import { Entity, Enum, PrimaryKey, Property, ManyToOne, OneToOne } from '@mikro-orm/decorators/legacy';
import { CreditMovement } from './credit-movement.entity';
import { Pack, PackType } from './pack.entity';
import { User } from './user.entity';

/**
 * Una apertura de sobre (08-sobres FR-037). Inmutable por trigger (FR-040). Un sobre se abre una
 * sola vez: lo garantiza el índice único sobre `pack_id` (FR-022).
 */
@Entity()
export class PackOpening {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  /** Siempre el de la sesión (FR-025). */
  @ManyToOne(() => User)
  user!: User;

  @OneToOne(() => Pack, { owner: true, unique: true })
  pack!: Pack;

  @Enum(() => PackType)
  packType!: PackType;

  @Property({ type: 'integer' })
  price!: number;

  @Property({ type: 'smallint' })
  cardCount!: number;

  @Property({ type: 'integer' })
  balanceBefore!: number;

  @Property({ type: 'integer' })
  balanceAfter!: number;

  /** Precio vigente al abrir y parámetros del lote del sobre (FR-046). */
  @Property({ type: 'json' })
  params!: Record<string, unknown>;

  @ManyToOne(() => CreditMovement)
  creditMovement!: CreditMovement;

  @Property({ type: 'string' })
  correlationId!: string;

  @Property({ type: 'Date', onCreate: () => new Date() })
  createdAt!: Date;
}
