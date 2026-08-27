import { Collection } from '@mikro-orm/core';
import { Entity, PrimaryKey, Property, OneToMany } from '@mikro-orm/decorators/legacy';
import { Team } from './team.entity';

@Entity()
export class League {
  @PrimaryKey({ type: 'number' })
  id!: number;

  @Property({ type: 'string', unique: true })
  name!: string; // "Premier League", "La Liga", etc.

  @Property({ type: 'string' })
  country!: string;

  @OneToMany(() => Team, team => team.league)
  teams = new Collection<Team>(this);
}