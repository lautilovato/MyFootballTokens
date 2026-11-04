import { randomUUID } from 'node:crypto';
import { Entity, Enum, PrimaryKey, Property, ManyToOne } from '@mikro-orm/decorators/legacy';
import { Player } from './player.entity';
import { Token } from './token.entity';
import { User } from './user.entity';

/** Estados de una publicación (09-mercado FR-007). Solo se pasa de `activa` a uno de los otros dos. */
export enum ListingStatus {
  ACTIVE = 'activa',
  SOLD = 'vendida',
  WITHDRAWN = 'retirada',
}

/**
 * Un token puesto a la venta (09-mercado, research #3). No tiene precio propio: vale la
 * cotización vigente de su jugador en cada instante (FR-002). Un trigger de la base solo permite
 * cerrarla; a lo sumo una activa por token (índice único parcial, FR-004).
 */
@Entity()
export class Listing {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @ManyToOne(() => Token)
  token!: Token;

  /** Desnormalizado para el Market y la lista del detalle (research #8). */
  @ManyToOne(() => Player)
  player!: Player;

  /** Nulo = la plataforma, que no es un usuario (FR-008). */
  @ManyToOne(() => User, { nullable: true })
  seller?: User | null;

  @Enum(() => ListingStatus)
  status!: ListingStatus;

  @Property({ type: 'Date', onCreate: () => new Date() })
  createdAt!: Date;

  @Property({ type: 'string' })
  correlationId!: string;

  /** Nulo si y solo si la publicación está activa. */
  @Property({ type: 'Date', nullable: true })
  closedAt?: Date | null;

  @Property({ type: 'string', nullable: true })
  closedCorrelationId?: string | null;
}
