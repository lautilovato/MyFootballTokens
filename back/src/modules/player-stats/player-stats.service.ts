import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { WhoScoredAdapter } from '../../adapters/who-scored/who-scored.adapter';
import { WhoScoredBlockedException } from '../../adapters/who-scored/who-scored.client';
import { PinoLoggerService } from '../../shared/logging/pino-logger.service';
import { PlayerMatchStatsResponseDto, MatchStatsDto } from './dto/player-match-stats-response.dto';
import { PlayerStatsRefreshResultDto } from './dto/player-stats-refresh-result.dto';
import { findBestMatch, jaroWinkler, normalizeName } from '../../shared/matching/name-matcher';
import { PlayerStatsRepository } from './player-stats.repository';

@Injectable()
export class PlayerStatsService {
  constructor(
    private readonly adapter: WhoScoredAdapter,
    private readonly repository: PlayerStatsRepository,
    private readonly logger: PinoLoggerService,
  ) {}

  /**
   * Refresh periódico agregado por temporada (spec.md §2, §6). Una falla puntual de equipo
   * no aborta el lote; un bloqueo generalizado sí (research.md #7).
   */
  async refresh(): Promise<PlayerStatsRefreshResultDto> {
    const threshold = Number(process.env.WHO_SCORED_MATCH_THRESHOLD ?? 0.85);
    const teams = await this.repository.findTeamsWithWhoScoredMapping();
    const teamsSkipped = await this.repository.countTeamsWithoutMapping();

    let teamsProcessed = 0;
    let playersUpdated = 0;
    let playersUnmatched = 0;

    for (const team of teams) {
      try {
        const candidates = await this.repository.findCandidatesByTeam(team);
        const squadStats = await this.adapter.getSquadStats(team.externalWhoScoredId!);

        for (const row of squadStats) {
          const match = findBestMatch(row.whoScoredName, candidates, threshold);

          if (!match) {
            const bestSimilarity =
              candidates.length === 0
                ? null
                : Math.max(
                    ...candidates.map((c) =>
                      jaroWinkler(normalizeName(row.whoScoredName), normalizeName(c.fullName)),
                    ),
                  );
            await this.repository.upsertUnmatchedPlayer(
              team,
              row.whoScoredPlayerId,
              row.whoScoredName,
              bestSimilarity,
            );
            playersUnmatched++;
            continue;
          }

          const player = await this.repository.findPlayerById(match.candidate.id);
          if (!player) continue;

          await this.repository.linkWhoScoredId(player, row.whoScoredPlayerId);
          await this.repository.setHeightIfEmpty(player, row.height);
          await this.repository.upsertSeasonStats(player, row);
          playersUpdated++;
        }
        teamsProcessed++;
      } catch (error) {
        if (error instanceof WhoScoredBlockedException) {
          this.logger.event('PlayerStatsService', 'bloqueo generalizado detectado, aborta el resto de la corrida', {
            teamsProcessed,
            message: error.message,
          });
          break;
        }
        this.logger.event('PlayerStatsService', 'no se pudo procesar el equipo', {
          team: team.id,
          externalWhoScoredId: team.externalWhoScoredId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const result: PlayerStatsRefreshResultDto = {
      teamsProcessed,
      teamsSkipped,
      playersUpdated,
      playersUnmatched,
    };
    this.logger.event('PlayerStatsService', 'refresh finalizado', { ...result });
    return result;
  }

  /** Detalle partido a partido bajo demanda de un jugador puntual (spec.md §2). */
  async getPlayerMatches(playerId: string): Promise<PlayerMatchStatsResponseDto> {
    const player = await this.repository.findPlayerById(playerId);
    if (!player) {
      throw new NotFoundException(`Player ${playerId} not found`);
    }
    if (!player.externalWhoScoredId) {
      throw new ConflictException(`Player ${playerId} no tiene match con WhoScored todavía`);
    }

    const matches = await this.adapter.getPlayerMatchLog(player.externalWhoScoredId);
    for (const match of matches) {
      await this.repository.upsertMatchStats(player, match);
    }

    const persisted = await this.repository.findMatchStatsByPlayer(player);

    this.logger.event('PlayerStatsService', 'partido a partido consultado', {
      playerId,
      matches: persisted.length,
    });

    return {
      playerId: player.id,
      playerName: player.fullName,
      matches: persisted.map((entity) => MatchStatsDto.fromEntity(entity)),
    };
  }
}
