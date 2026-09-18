import { Injectable } from '@nestjs/common';
import { FootballDataAdapter } from '../../adapters/football-data/football-data.adapter';
import { PinoLoggerService } from '../../shared/logging/pino-logger.service';
import { IngestionResultDto } from './dto/ingestion-result.dto';
import { IngestionRepository } from './ingestion.repository';

const LEAGUE_CODES = ['PL', 'BL1', 'PD', 'SA', 'FL1'];

@Injectable()
export class IngestionService {
  constructor(
    private readonly adapter: FootballDataAdapter,
    private readonly repository: IngestionRepository,
    private readonly logger: PinoLoggerService,
  ) {}

  /** Orquesta liga -> equipos -> planteles; una falla puntual no aborta el resto (User Story 3). */
  async run(): Promise<IngestionResultDto> {
    let teams = 0;
    let players = 0;

    for (const code of LEAGUE_CODES) {
      try {
        const leagueData = await this.adapter.getLeague(code);
        const league = await this.repository.upsertLeague(leagueData);
        const teamRefs = await this.adapter.getTeamsByLeague(code);

        for (const ref of teamRefs) {
          try {
            const { team: teamData, players: playersData } = await this.adapter.getTeamWithSquad(
              ref.externalId,
            );
            const team = await this.repository.upsertTeam(teamData, league);
            for (const playerData of playersData) {
              await this.repository.upsertPlayer(playerData, team);
              players++;
            }
            teams++;
          } catch (error) {
            this.logger.event('IngestionService', 'no se pudo procesar el equipo', {
              league: code,
              externalTeamId: ref.externalId,
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }
      } catch (error) {
        this.logger.event('IngestionService', 'no se pudo procesar la liga', {
          league: code,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const result: IngestionResultDto = { leagues: LEAGUE_CODES.length, teams, players };
    this.logger.event('IngestionService', 'ingesta finalizada', { ...result });
    return result;
  }
}
