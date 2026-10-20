import { randomUUID } from 'node:crypto';
import { Entity, Enum, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/decorators/legacy';
import { Pack } from './pack.entity';
import { Player } from './player.entity';
import { User } from './user.entity';

/**
 * Estados de un token (08-sobres, «Estados de un token»). `en_venta_plataforma` existe en el
 * modelo para que la invariante de FR-023 lo contemple, pero ningún flujo de esta feature lo
 * produce (research #15).
 */
export enum TokenStatus {
  RESERVED = 'reservado',
  IN_PACK = 'en_sobre',
  OWNED = 'de_usuario',
  PLATFORM_SALE = 'en_venta_plataforma',
}

/**
 * Estados en que un token está a la venta: los que muestra el Market (08-sobres FR-070). Hoy
 * solo la venta de la plataforma; la spec del mercado va a sumar las publicaciones de usuarios.
 */
export const FOR_SALE_TOKEN_STATUSES: readonly TokenStatus[] = [TokenStatus.PLATFORM_SALE];

/**
 * Uno de los 100 tokens de un jugador: una carta (FR-028). El estado y el dueño actuales están
 * desnormalizados acá para que inventario y stock se lean sin reconstruir eventos (research #5);
 * cada cambio deja además su fila en `token_event`.
 */
@Entity()
@Unique({ properties: ['player', 'serial'] })
export class Token {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @ManyToOne(() => Player)
  player!: Player;

  /** 1–100, único dentro del jugador (CHECK en la base). */
  @Property({ type: 'smallint' })
  serial!: number;

  @Enum(() => TokenStatus)
  status!: TokenStatus;

  /** Nulo = la plataforma, que no es un usuario (constitución §5, FR-042). */
  @ManyToOne(() => User, { nullable: true })
  owner?: User | null;

  /** Sobre al que se asignó. Se conserva después de abrirlo. */
  @ManyToOne(() => Pack, { nullable: true })
  pack?: Pack | null;

  @Property({ type: 'Date', onCreate: () => new Date() })
  createdAt!: Date;

  @Property({ type: 'Date', onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date;
}
