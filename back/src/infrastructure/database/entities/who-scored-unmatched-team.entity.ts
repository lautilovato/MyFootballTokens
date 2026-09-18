import { randomUUID } from 'node:crypto';
import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/decorators/legacy';
import { League } from './league.entity';

@Entity()
@Unique({ properties: ['whoScoredExternalId', 'league'] })
export class WhoScoredUnmatchedTeam {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @Property({ type: 'string' })
  whoScoredExternalId!: string;

  @Property({ type: 'string' })
  whoScoredName!: string;

  @ManyToOne(() => League)
  league!: League;

  @Property({ type: 'decimal', precision: 4, scale: 3, nullable: true })
  bestCandidateSimilarity?: string;

  @Property({ type: 'Date', onCreate: () => new Date() })
  createdAt!: Date;
}
