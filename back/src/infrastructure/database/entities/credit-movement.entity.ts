import { randomUUID } from 'node:crypto';
import { Entity, Enum, PrimaryKey, Property, ManyToOne } from '@mikro-orm/decorators/legacy';
import { User } from './user.entity';

/**
 * Tipos de movimiento (08-sobres FR-006, 09-mercado FR-020). Agregar uno es ampliar el CHECK,
 * sin tocar filas.
 */
export enum CreditMovementType {
  INITIAL_GRANT = 'entrega_inicial',
  PACK_PURCHASE = 'compra_sobre',
  TOKEN_PURCHASE = 'compra_token',
  TOKEN_SALE = 'venta_token',
}

/**
 * Un cambio de saldo (FR-006). Inmutable: un trigger de la base rechaza UPDATE y DELETE
 * (FR-040, research #4). `amount` lleva signo: positivo acredita, negativo debita.
 */
@Entity()
export class CreditMovement {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @ManyToOne(() => User)
  user!: User;

  @Enum(() => CreditMovementType)
  type!: CreditMovementType;

  @Property({ type: 'integer' })
  amount!: number;

  @Property({ type: 'integer' })
  balanceBefore!: number;

  @Property({ type: 'integer' })
  balanceAfter!: number;

  /** `'pack_opening'` o `'token_purchase'`; nulo para la entrega inicial (FR-041). */
  @Property({ type: 'string', nullable: true })
  referenceType?: string | null;

  @Property({ type: 'uuid', nullable: true })
  referenceId?: string | null;

  @Property({ type: 'string' })
  correlationId!: string;

  @Property({ type: 'Date', onCreate: () => new Date() })
  createdAt!: Date;
}
