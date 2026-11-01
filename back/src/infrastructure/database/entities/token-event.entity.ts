import { randomUUID } from 'node:crypto';
import { Entity, Enum, PrimaryKey, Property, ManyToOne } from '@mikro-orm/decorators/legacy';
import { Token, TokenStatus } from './token.entity';

/**
 * Tipos de evento (08-sobres FR-030, 09-mercado FR-023). `devolucion_a_plataforma` está definido
 * pero ningún flujo lo produce todavía (08 research #15).
 */
export enum TokenEventType {
  EMISSION = 'emision',
  PACK_ASSIGNMENT = 'asignacion_a_sobre',
  PACK_DELIVERY = 'entrega_en_sobre',
  RETURN_TO_PLATFORM = 'devolucion_a_plataforma',
  PUT_ON_SALE = 'puesta_en_venta',
  SALE_WITHDRAWAL = 'retiro_de_venta',
  SALE = 'venta',
}

/**
 * Un cambio de estado o de dueño de un token (FR-030). Inmutable por trigger (FR-040). El dueño
 * nulo es la plataforma. El último evento de un token coincide con su estado actual (FR-032).
 */
@Entity()
export class TokenEvent {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @ManyToOne(() => Token)
  token!: Token;

  @Enum(() => TokenEventType)
  type!: TokenEventType;

  /** Nulo solo en la emisión. */
  @Enum({ items: () => TokenStatus, nullable: true })
  fromStatus?: TokenStatus | null;

  @Enum(() => TokenStatus)
  toStatus!: TokenStatus;

  @Property({ type: 'uuid', nullable: true })
  fromOwnerId?: string | null;

  @Property({ type: 'uuid', nullable: true })
  toOwnerId?: string | null;

  /** Cotización del jugador en ese instante; nula si nunca cotizó. */
  @Property({ type: 'integer', nullable: true })
  quotePrice?: number | null;

  /** Rareza vigente en ese instante; nula si el jugador no tiene reputación. */
  @Property({ type: 'string', nullable: true })
  rarity?: string | null;

  /** `'pack_batch'`, `'pack_opening'`, `'listing'` o `'token_purchase'` (FR-041). */
  @Property({ type: 'string', nullable: true })
  referenceType?: string | null;

  @Property({ type: 'uuid', nullable: true })
  referenceId?: string | null;

  @Property({ type: 'string' })
  correlationId!: string;

  @Property({ type: 'Date', onCreate: () => new Date() })
  createdAt!: Date;
}
