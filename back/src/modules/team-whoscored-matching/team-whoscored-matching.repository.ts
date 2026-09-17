import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { League } from '../../infrastructure/database/entities/league.entity';
import { Team } from '../../infrastructure/database/entities/team.entity';
import { WhoScoredUnmatchedTeam } from '../../infrastructure/database/entities/who-scored-unmatched-team.entity';
import { MatchCandidate } from '../../shared/matching/name-matcher';

@Injectable()
export class TeamWhoScoredMatchingRepository {
  constructor(private readonly em: EntityManager) {}

  async findLeagueByCode(code: string): Promise<League | null> {
    return this.em.findOne(League, { code });
  }

  /** Un query por liga, reusado para todas las filas de esa liga (spec.md FR-003, mismo principio que jugadores). */
  async findTeamsWithoutMapping(league: League): Promise<MatchCandidate[]> {
    const teams = await this.em.find(Team, { league, externalWhoScoredId: null });
    return teams.map((team) => ({ id: String(team.id), fullName: team.name }));
  }

  async findTeamById(id: string): Promise<Team | null> {
    return this.em.findOne(Team, { id: Number(id) });
  }

  /**
   * Ids de WhoScored ya vinculados a algún `Team` (de cualquier liga) — una sola consulta
   * por corrida completa, no por liga. Sin esto, una fila de la tabla de posiciones cuyo
   * equipo real ya está mapeado (y por lo tanto ya no es candidato) se compara igual contra
   * el resto de candidatos sin match, y termina registrada en la cola de revisión como si
   * fuera un caso genuinamente sin resolver — confirmado en vivo (sesión de implementación
   * 2026-09-16, ej. "Borussia Dortmund" reapareciendo como no-match después de ya estar
   * mapeado). Filtrar por este set antes de intentar matchear evita ese ruido.
   */
  async findLinkedWhoScoredIds(): Promise<Set<string>> {
    const teams = await this.em.find(Team, { externalWhoScoredId: { $ne: null } });
    return new Set(teams.map((team) => team.externalWhoScoredId!));
  }

  /** Nunca sobrescribe — solo se llama cuando `findTeamsWithoutMapping` ya confirmó que está vacío (FR-002). */
  async linkWhoScoredId(team: Team, externalWhoScoredId: string): Promise<void> {
    team.externalWhoScoredId = externalWhoScoredId;
    this.em.persist(team);
    await this.em.flush();
  }

  /** Upsert por `(whoScoredExternalId, league)` — no duplica la entrada de revisión (FR-007). */
  async upsertUnmatchedTeam(
    league: League,
    whoScoredExternalId: string,
    whoScoredName: string,
    bestCandidateSimilarity: number | null,
  ): Promise<void> {
    const fields = {
      whoScoredName,
      bestCandidateSimilarity:
        bestCandidateSimilarity === null ? undefined : bestCandidateSimilarity.toFixed(3),
    };

    let entry = await this.em.findOne(WhoScoredUnmatchedTeam, { whoScoredExternalId, league });
    if (!entry) {
      entry = this.em.create(WhoScoredUnmatchedTeam, {
        league,
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
}
