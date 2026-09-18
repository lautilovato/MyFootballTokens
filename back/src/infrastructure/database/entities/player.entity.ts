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

  @Property({ type: 'decimal', precision: 10, scale: 2 })
  baseValue!: string;

  @ManyToOne(() => Team)
  team!: Team;

  @Property({ type: 'Date', onCreate: () => new Date() })
  createdAt!: Date;

  @Property({ type: 'Date', onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date;
}