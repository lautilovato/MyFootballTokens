import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { NormalizedMatchStats, NormalizedSeasonStats } from '../../adapters/who-scored/who-scored.adapter';
import { Player } from '../../infrastructure/database/entities/player.entity';
import { PlayerMatchStats } from '../../infrastructure/database/entities/player-match-stats.entity';
import { PlayerSeasonStats } from '../../infrastructure/database/entities/player-season-stats.entity';
import { Team } from '../../infrastructure/database/entities/team.entity';
import { WhoScoredUnmatchedPlayer } from '../../infrastructure/database/entities/who-scored-unmatched-player.entity';
import { MatchCandidate } from '../../shared/matching/name-matcher';

@Injectable()
export class PlayerStatsRepository {
  constructor(private readonly em: EntityManager) {}

  /** Equipos con mapeo manual a WhoScored (research.md #5) — solo estos participan del refresh. */
  async findTeamsWithWhoScoredMapping(): Promise<Team[]> {
    return this.em.find(Team, { externalWhoScoredId: { $ne: null } });
  }

  async countTeamsWithoutMapping(): Promise<number> {
    return this.em.count(Team, { externalWhoScoredId: null });
  }

  /** Un query por equipo, reusado para todos los candidatos de ese equipo (spec.md §4.5). */
  async findCandidatesByTeam(team: Team): Promise<MatchCandidate[]> {
    const players = await this.em.find(Player, { team });
    return players.map((player) => ({ id: player.id, fullName: player.fullName }));
  }

  async findPlayerById(id: string): Promise<Player | null> {
    return this.em.findOne(Player, { id });
  }

  /** Upsert por `(player, season)` — nunca duplica el snapshot de una temporada (spec.md §9). */
  async upsertSeasonStats(player: Player, data: NormalizedSeasonStats): Promise<void> {
    const fields = {
      season: data.season,
      goals: data.goals,
      assists: data.assists,
      shotsPerGame: data.shotsPerGame.toFixed(2),
      keyPasses: data.keyPasses.toFixed(2),
      dribbles: data.dribbles.toFixed(2),
      tackles: data.tackles.toFixed(2),
      rating: data.rating.toFixed(2),
      lastRefreshedAt: new Date(),
    };

    let stats = await this.em.findOne(PlayerSeasonStats, { player, season: data.season });
    if (!stats) {
      stats = this.em.create(PlayerSeasonStats, { player, createdAt: new Date(), ...fields });
    } else {
      this.em.assign(stats, fields);
    }
    this.em.persist(stats);
    await this.em.flush();
  }

  /** `height` se completa una sola vez, nunca se reescribe si ya tiene valor (spec.md §3). */
  async setHeightIfEmpty(player: Player, height: number | null): Promise<void> {
    if (height === null || player.height != null) return;
    player.height = height;
    this.em.persist(player);
    await this.em.flush();
  }

  async linkWhoScoredId(player: Player, externalWhoScoredId: string): Promise<void> {
    if (player.externalWhoScoredId === externalWhoScoredId) return;
    player.externalWhoScoredId = externalWhoScoredId;
    this.em.persist(player);
    await this.em.flush();
  }

  /** Upsert por `(whoScoredExternalId, team)` — no duplica la entrada de revisión (spec.md §4.4). */
  async upsertUnmatchedPlayer(
    team: Team,
    whoScoredExternalId: string,
    whoScoredName: string,
    bestCandidateSimilarity: number | null,
  ): Promise<void> {
    const fields = {
      whoScoredName,
      bestCandidateSimilarity:
        bestCandidateSimilarity === null ? undefined : bestCandidateSimilarity.toFixed(3),
    };

    let entry = await this.em.findOne(WhoScoredUnmatchedPlayer, { whoScoredExternalId, team });
    if (!entry) {
      entry = this.em.create(WhoScoredUnmatchedPlayer, {
        team,
        whoScoredExternalId,
        createdAt: new Date(),
        ...fields,
      });
    } else {
      this.em.assign(entry, fields);
    }
    this.em.persist(entry);
    await this.em.flush();
  }

  /** Upsert por `(player, whoScoredMatchId)` — no duplica un partido ya persistido (spec.md §9). */
  async upsertMatchStats(player: Player, data: NormalizedMatchStats): Promise<void> {
    const fields = {
      matchDate: data.matchDate,
      season: data.season,
      goals: data.goals,
      assists: data.assists,
      shots: data.shots,
      keyPasses: data.keyPasses,
      dribbles: data.dribbles,
      tackles: data.tackles,
      rating: data.rating.toFixed(2),
    };

    let stats = await this.em.findOne(PlayerMatchStats, {
      player,
      whoScoredMatchId: data.whoScoredMatchId,
    });
    if (!stats) {
      stats = this.em.create(PlayerMatchStats, {
        player,
        whoScoredMatchId: data.whoScoredMatchId,
        createdAt: new Date(),
        ...fields,
      });
    } else {
      this.em.assign(stats, fields);
    }
    this.em.persist(stats);
    await this.em.flush();
  }

  async findMatchStatsByPlayer(player: Player): Promise<PlayerMatchStats[]> {
    return this.em.find(PlayerMatchStats, { player }, { orderBy: { matchDate: 'desc' } });
  }
}
