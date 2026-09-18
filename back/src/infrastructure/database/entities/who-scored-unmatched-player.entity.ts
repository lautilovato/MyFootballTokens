import { randomUUID } from 'node:crypto';
import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/decorators/legacy';
import { Team } from './team.entity';

@Entity()
@Unique({ properties: ['whoScoredExternalId', 'team'] })
export class WhoScoredUnmatchedPlayer {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @Property({ type: 'string' })
  whoScoredExternalId!: string;

  @Property({ type: 'string' })
  whoScoredName!: string;

  @ManyToOne(() => Team)
  team!: Team;

  @Property({ type: 'decimal', precision: 4, scale: 3, nullable: true })
  bestCandidateSimilarity?: string;

  @Property({ type: 'Date', onCreate: () => new Date() })
  createdAt!: Date;
}
