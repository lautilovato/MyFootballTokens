import { Injectable } from '@nestjs/common';
import { PinoLoggerService } from '../../shared/logging/pino-logger.service';
import { LeagueResponseDto } from './dto/league-response.dto';
import { LeagueRepository } from './league.repository';

@Injectable()
export class LeagueService {
  constructor(
    private readonly leagueRepository: LeagueRepository,
    private readonly logger: PinoLoggerService,
  ) {}

  async findAll(): Promise<LeagueResponseDto[]> {
    const leagues = await this.leagueRepository.findAll();

    this.logger.event('LeagueService', 'leagues queried', { resultCount: leagues.length });

    return leagues.map((league) => LeagueResponseDto.fromEntity(league));
  }
}
