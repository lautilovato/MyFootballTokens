import { randomUUID } from 'node:crypto';
import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/decorators/legacy';
import { Player } from './player.entity';

@Entity()
@Unique({ properties: ['player', 'season'] })
export class PlayerSeasonStats {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @ManyToOne(() => Player)
  player!: Player;

  @Property({ type: 'string' })
  season!: string; // "2025-2026"

  @Property({ type: 'number' })
  goals!: number;

  @Property({ type: 'number' })
  assists!: number;

  @Property({ type: 'decimal', precision: 4, scale: 2 })
  shotsPerGame!: string;

  @Property({ type: 'decimal', precision: 4, scale: 2 })
  keyPasses!: string;

  @Property({ type: 'decimal', precision: 4, scale: 2 })
  dribbles!: string;

  @Property({ type: 'decimal', precision: 4, scale: 2 })
  tackles!: string;

  @Property({ type: 'decimal', precision: 4, scale: 2 })
  rating!: string;

  @Property({ type: 'Date' })
  lastRefreshedAt!: Date;

  @Property({ type: 'Date', onCreate: () => new Date() })
  createdAt!: Date;

  @Property({ type: 'Date', onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date;
}
