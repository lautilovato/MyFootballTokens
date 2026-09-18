import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  NormalizedLeague,
  NormalizedPlayer,
  NormalizedTeam,
} from '../../adapters/football-data/football-data.adapter';
import { League } from '../../infrastructure/database/entities/league.entity';
import { Player } from '../../infrastructure/database/entities/player.entity';
import { Team } from '../../infrastructure/database/entities/team.entity';

@Injectable()
export class IngestionRepository {
  constructor(private readonly em: EntityManager) {}

  /** Upsert por `code` — clave de idempotencia de League (ver data-model.md). */
  async upsertLeague(data: NormalizedLeague): Promise<League> {
    let league = await this.em.findOne(League, { code: data.code });
    if (!league) {
      league = this.em.create(League, data);
    } else {
      this.em.assign(league, data);
    }
    this.em.persist(league);
    await this.em.flush();
    return league;
  }

  /** Upsert por `externalId` — clave de idempotencia de Team (ver data-model.md). */
  async upsertTeam(data: NormalizedTeam, league: League): Promise<Team> {
    let team = await this.em.findOne(Team, { externalId: data.externalId });
    if (!team) {
      team = this.em.create(Team, { ...data, league });
    } else {
      this.em.assign(team, { ...data, league });
    }
    this.em.persist(team);
    await this.em.flush();
    return team;
  }

  /**
   * Upsert por `externalFootballDataId` — clave de idempotencia de Player. `baseValue` se
   * setea únicamente al crear (research.md #6): nunca se reescribe en un update, para no
   * pisar una cotización ya calculada por una spec futura.
   */
  async upsertPlayer(data: NormalizedPlayer, team: Team): Promise<Player> {
    const externalFootballDataId = String(data.footballDataId);
    const fields = {
      fullName: data.name,
      position: data.position,
      dateOfBirth: data.dateOfBirth ?? undefined,
      nationality: data.nationality ?? undefined,
      shirtNumber: data.shirtNumber ?? undefined,
      team,
    };

    let player = await this.em.findOne(Player, { externalFootballDataId });
    if (!player) {
      player = this.em.create(Player, {
        externalFootballDataId,
        baseValue: '0.00',
        createdAt: new Date(),
        ...fields,
      });
    } else {
      this.em.assign(player, fields);
    }
    this.em.persist(player);
    await this.em.flush();
    return player;
  }
}
