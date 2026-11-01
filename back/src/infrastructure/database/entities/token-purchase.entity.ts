import { randomUUID } from 'node:crypto';
import { Entity, PrimaryKey, Property, ManyToOne, OneToOne } from '@mikro-orm/decorators/legacy';
import { CreditMovement } from './credit-movement.entity';
import { Listing } from './listing.entity';
import { Player } from './player.entity';
import { PlayerQuote } from './player-quote.entity';
import { Token } from './token.entity';
import { User } from './user.entity';

/**
 * La compra de una publicación: una carta (09-mercado FR-010, FR-028). Inmutable por trigger
 * (FR-030). Una publicación se vende una sola vez: lo garantiza el índice único sobre
 * `listing_id` (SC-003).
 */
@Entity()
export class TokenPurchase {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @OneToOne(() => Listing, { owner: true, unique: true })
  listing!: Listing;

  @ManyToOne(() => Token)
  token!: Token;

  @ManyToOne(() => Player)
  player!: Player;

  /** Siempre el de la sesión (FR-016). */
  @ManyToOne(() => User)
  buyer!: User;

  /** Nulo = la plataforma. */
  @ManyToOne(() => User, { nullable: true })
  seller?: User | null;

  /** Precio que confirmó el comprador (FR-013). */
  @Property({ type: 'integer' })
  acceptedPrice!: number;

  /** Precio cobrado = cotización vigente del jugador en el instante de la compra (FR-001). */
  @Property({ type: 'integer' })
  price!: number;

  @Property({ type: 'string' })
  rarity!: string;

  @Property({ type: 'integer' })
  buyerBalanceBefore!: number;

  @Property({ type: 'integer' })
  buyerBalanceAfter!: number;

  @Property({ type: 'integer', nullable: true })
  sellerBalanceBefore?: number | null;

  @Property({ type: 'integer', nullable: true })
  sellerBalanceAfter?: number | null;

  @ManyToOne(() => CreditMovement)
  buyerMovement!: CreditMovement;

  @ManyToOne(() => CreditMovement, { nullable: true })
  sellerMovement?: CreditMovement | null;

  /**
   * La cotización del jugador vigente cuando se fijó el precio (10-historial-operaciones,
   * research #1). Con ella, la estrategia y la versión de la compra son parte de su registro
   * inmutable. Nula solo en compras anteriores a la migración para las que no se encontró una.
   */
  @ManyToOne(() => PlayerQuote, { nullable: true })
  quote?: PlayerQuote | null;

  @Property({ type: 'string' })
  correlationId!: string;

  @Property({ type: 'Date', onCreate: () => new Date() })
  createdAt!: Date;
}
