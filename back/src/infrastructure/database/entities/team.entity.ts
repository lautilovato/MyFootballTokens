import {Collection } from '@mikro-orm/core';
import { Entity, PrimaryKey, Property, OneToMany, ManyToOne } from '@mikro-orm/decorators/legacy';
import {League} from './league.entity';
import { Player } from './player.entity';

@Entity()
export class Team {
  @PrimaryKey({ type: 'number' })
  id!: number;

  @Property({ type: 'string' })
  name!: string;

  @ManyToOne(() => League)
  league!: League;

  @OneToMany(() => Player, player => player.team)
  players = new Collection<Player>(this);
}