import { randomUUID } from 'node:crypto';
import { Entity, PrimaryKey, Property, ManyToOne, Enum } from '@mikro-orm/decorators/legacy';
import { Team } from './team.entity';

export enum PlayerPosition {
  GK = 'GK',
  DF = 'DF',
  MF = 'MF',
  FW = 'FW',
  UNKNOWN = 'UNKNOWN',
}

@Entity()
export class Player {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @Property({ type: 'string' })
  fullName!: string;

  @Enum(() => PlayerPosition)
  position!: PlayerPosition;

  @Property({ type: 'string', unique: true, nullable: true })
  externalWhoScoredId?: string;

  @Property({ type: 'string', unique: true, nullable: true })
  externalFootballDataId?: string;

  @Property({ type: 'date', nullable: true })
  dateOfBirth?: string;

  @Property({ type: 'string', nullable: true })
  nationality?: string;

  @Property({ type: 'number', nullable: true })
  shirtNumber?: number;

  @Property({ type: 'number', nullable: true })
  height?: number; // cm, atributo del jugador (no de temporada) — se completa una sola vez

  /** Ilustración cartoon de TheSportsDB (`strCartoon`). Nulo si no se encontró o no tiene. */
  @Property({ type: 'string', nullable: true })
  imageUrl?: string;

  /**
   * Cuándo se buscó la imagen por última vez, haya o no resultado. Sin esto, los jugadores que
   * TheSportsDB no conoce se reintentarían en cada corrida y agotarían el cupo de peticiones.
   */
  @Property({ type: 'Date', nullable: true })
  imageCheckedAt?: Date;

  /**
   * Reputación mundial 0–100 (07-cotizacion FR-023): renombre del jugador más allá de sus
   * números de la temporada. Nulo = sin cargar; el cálculo usa la reputación por defecto de la
   * versión de estrategia. El rango lo garantiza un CHECK en la base.
   */
  @Property({ type: 'smallint', nullable: true })
  worldReputation?: number | null;

  /**
   * Espejo del precio de la última cotización del jugador (07-cotizacion research #10). Solo lo
   * reescribe la corrida de recálculo; la fuente de verdad es `player_quote`. 0 = nunca cotizado.
   */
  @Property({ type: 'decimal', precision: 10, scale: 2 })
  baseValue!: string;

  @ManyToOne(() => Team)
  team!: Team;

  @Property({ type: 'Date', onCreate: () => new Date() })
  createdAt!: Date;

  @Property({ type: 'Date', onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date;
}