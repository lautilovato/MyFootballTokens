import { randomUUID } from 'node:crypto';
import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/decorators/legacy';
import { Player } from './player.entity';

@Entity()
@Unique({ properties: ['player', 'whoScoredMatchId'] })
export class PlayerMatchStats {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @ManyToOne(() => Player)
  player!: Player;

  @Property({ type: 'string' })
  whoScoredMatchId!: string;

  @Property({ type: 'date' })
  matchDate!: string;

  @Property({ type: 'string' })
  season!: string;

  @Property({ type: 'number' })
  goals!: number;

  @Property({ type: 'number' })
  assists!: number;

  @Property({ type: 'number' })
  shots!: number;

  @Property({ type: 'number' })
  keyPasses!: number;

  @Property({ type: 'number' })
  dribbles!: number;

  @Property({ type: 'number' })
  tackles!: number;

  @Property({ type: 'decimal', precision: 4, scale: 2 })
  rating!: string;

  @Property({ type: 'Date', onCreate: () => new Date() })
  createdAt!: Date;
}
