import { Entity, PrimaryKey, Property, ManyToOne, Enum } from '@mikro-orm/decorators/legacy';
import { Team } from './team.entity';

export enum PlayerPosition {
  GK = 'GK',
  DF = 'DF',
  MF = 'MF',
  FW = 'FW',
}

@Entity()
export class Player {
  @PrimaryKey({ type: 'number' })
  id!: number;

  @Property({ type: 'string' })
  fullName!: string;

  @Enum(() => PlayerPosition)
  position!: PlayerPosition;

  @Property({ type: 'string', nullable: true })
  externalWhoScoredId?: string;

  @Property({ type: 'string', nullable: true })
  externalFootballDataId?: string;

  @ManyToOne(() => Team)
  team!: Team;

  @Property({ type: 'Date', onCreate: () => new Date() })
  createdAt!: Date;

  @Property({ type: 'Date', onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date;
}