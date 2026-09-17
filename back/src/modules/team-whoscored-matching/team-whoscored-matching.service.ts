import { Injectable } from '@nestjs/common';
import { WhoScoredAdapter } from '../../adapters/who-scored/who-scored.adapter';
import { WhoScoredBlockedException } from '../../adapters/who-scored/who-scored.client';
import { PinoLoggerService } from '../../shared/logging/pino-logger.service';
import { findBestMatch, jaroWinkler, MatchCandidate, normalizeName } from '../../shared/matching/name-matcher';
import { TeamWhoScoredMatchingResultDto } from './dto/team-whoscored-matching-result.dto';
import { TeamWhoScoredMatchingRepository } from './team-whoscored-matching.repository';

// Las 5 ligas ya soportadas por el catálogo (mismos códigos que LEAGUE_CODES en
// ingestion.service.ts), URLs verificadas en vivo (research.md #1).
const LEAGUE_WHOSCORED_PATHS: Record<string, string> = {
  PL: '/regions/252/tournaments/2/england-premier-league',
  BL1: '/regions/81/tournaments/3/germany-bundesliga',
  PD: '/regions/206/tournaments/4/spain-laliga',
  SA: '/regions/108/tournaments/5/italy-serie-a',
  FL1: '/regions/74/tournaments/22/france-ligue-1',
};

@Injectable()
export class TeamWhoScoredMatchingService {
  constructor(
    private readonly adapter: WhoScoredAdapter,
    private readonly repository: TeamWhoScoredMatchingRepository,
    private readonly logger: PinoLoggerService,
  ) {}

  /**
   * Completa Team.externalWhoScoredId por liga, comparando contra la tabla de posiciones de
   * WhoScored (spec.md FR-001/FR-003). Una falla puntual de liga no aborta las demás
   * (FR-008); un bloqueo generalizado sí (research.md #4 de 03-ingesta-stats).
   */
  async refresh(): Promise<TeamWhoScoredMatchingResultDto> {
    const threshold = Number(process.env.WHO_SCORED_MATCH_THRESHOLD ?? 0.85);
    // Una sola consulta para toda la corrida (no por liga): filas de WhoScored cuyo equipo
    // ya está mapeado se saltan sin intentar matchear — evitan ensuciar la cola de revisión
    // comparándose contra candidatos que no son los suyos (ver findLinkedWhoScoredIds).
    const linkedIds = await this.repository.findLinkedWhoScoredIds();

    let leaguesProcessed = 0;
    let leaguesSkipped = 0;
    let teamsMatched = 0;
    let teamsUnmatched = 0;

    for (const [code, whoScoredPath] of Object.entries(LEAGUE_WHOSCORED_PATHS)) {
      const league = await this.repository.findLeagueByCode(code);
      if (!league) continue;

      try {
        // Un query por liga, reusado para todas las filas de esa liga (spec.md FR-003).
        let candidates = await this.repository.findTeamsWithoutMapping(league);
        if (candidates.length === 0) {
          leaguesSkipped++;
          continue;
        }

        const standings = await this.adapter.getLeagueStandings(whoScoredPath);

        for (const row of standings) {
          if (linkedIds.has(row.whoScoredTeamId)) continue;

          const match = findBestMatch(row.whoScoredName, candidates, threshold);

          if (!match) {
            const bestSimilarity = this.bestSimilarity(row.whoScoredName, candidates);
            await this.repository.upsertUnmatchedTeam(league, row.whoScoredTeamId, row.whoScoredName, bestSimilarity);
            teamsUnmatched++;
            continue;
          }

          const team = await this.repository.findTeamById(match.candidate.id);
          if (!team) continue;

          await this.repository.linkWhoScoredId(team, row.whoScoredTeamId);
          teamsMatched++;
          // Saca al Team ya matcheado de la lista en memoria — dos filas de esta misma
          // corrida no pueden matchear al mismo Team (research.md #7).
          candidates = candidates.filter((c) => c.id !== match.candidate.id);
        }
        leaguesProcessed++;
      } catch (error) {
        if (error instanceof WhoScoredBlockedException) {
          this.logger.event(
            'TeamWhoScoredMatchingService',
            'bloqueo generalizado detectado, aborta el resto de la corrida',
            { leaguesProcessed, message: error.message },
          );
          break;
        }
        this.logger.event('TeamWhoScoredMatchingService', 'no se pudo procesar la liga', {
          league: code,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const result: TeamWhoScoredMatchingResultDto = {
      leaguesProcessed,
      leaguesSkipped,
      teamsMatched,
      teamsUnmatched,
    };
    this.logger.event('TeamWhoScoredMatchingService', 'refresh finalizado', { ...result });
    return result;
  }

  private bestSimilarity(whoScoredName: string, candidates: MatchCandidate[]): number | null {
    if (candidates.length === 0) return null;
    return Math.max(
      ...candidates.map((c) => jaroWinkler(normalizeName(whoScoredName), normalizeName(c.fullName))),
    );
  }
}
