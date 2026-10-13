import { randomUUID } from 'node:crypto';
import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/decorators/legacy';
import { PackOpening } from './pack-opening.entity';
import { Player } from './player.entity';
import { Token } from './token.entity';

/**
 * Una carta entregada en una apertura (08-sobres FR-038): la foto del momento cero. Inmutable
 * por trigger (FR-040); la apertura la sigue mostrando aunque el token cambie de dueño.
 */
@Entity()
@Unique({ properties: ['opening', 'token'] })
export class PackOpeningCard {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @ManyToOne(() => PackOpening)
  opening!: PackOpening;

  @ManyToOne(() => Token)
  token!: Token;

  @ManyToOne(() => Player)
  player!: Player;

  @Property({ type: 'smallint' })
  serial!: number;

  /** Rareza en el momento cero. */
  @Property({ type: 'string' })
  rarity!: string;

  /** Cotización del jugador en el momento cero (siempre presente, FR-027). */
  @Property({ type: 'integer' })
  quotePrice!: number;
}
