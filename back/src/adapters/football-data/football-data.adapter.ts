import { Injectable } from '@nestjs/common';
import { PlayerPosition } from '../../infrastructure/database/entities/player.entity';
import {
  FootballDataCompetitionDto,
  FootballDataCompetitionTeamsDto,
} from './dtos/competition.dto';
import { FootballDataTeamDto } from './dtos/team.dto';
import { FootballDataClient } from './football-data.client';

const POSITION_MAP: Record<string, PlayerPosition> = {
  Goalkeeper: PlayerPosition.GK,
  Defence: PlayerPosition.DF,
  Midfield: PlayerPosition.MF,
  Offence: PlayerPosition.FW,
};

export interface NormalizedLeague {
  externalId: number;
  code: string;
  name: string;
  country: string;
}

export interface NormalizedTeam {
  externalId: number;
  name: string;
  shortName: string | null;
  tla: string | null;
  crestUrl: string | null;
}

export interface NormalizedPlayer {
  footballDataId: number;
  name: string;
  position: PlayerPosition;
  dateOfBirth: string | null;
  nationality: string | null;
  shirtNumber: number | null;
}

/** Aísla la forma cruda de Football-Data.org: nada fuera de este archivo conoce sus DTOs. */
@Injectable()
export class FootballDataAdapter {
  constructor(private readonly client: FootballDataClient) {}

  async getLeague(code: string): Promise<NormalizedLeague> {
    const dto = await this.client.get<FootballDataCompetitionDto>(`/competitions/${code}`);
    return { externalId: dto.id, code: dto.code, name: dto.name, country: dto.area.name };
  }

  async getTeamsByLeague(code: string): Promise<Array<{ externalId: number }>> {
    const dto = await this.client.get<FootballDataCompetitionTeamsDto>(
      `/competitions/${code}/teams`,
    );
    return dto.teams.map((team) => ({ externalId: team.id }));
  }

  async getTeamWithSquad(
    externalTeamId: number,
  ): Promise<{ team: NormalizedTeam; players: NormalizedPlayer[] }> {
    const dto = await this.client.get<FootballDataTeamDto>(`/teams/${externalTeamId}`);
    return {
      team: {
        externalId: dto.id,
        name: dto.name,
        shortName: dto.shortName,
        tla: dto.tla,
        crestUrl: dto.crest,
      },
      players: dto.squad.map((member) => ({
        footballDataId: member.id,
        name: member.name,
        position: member.position ? (POSITION_MAP[member.position] ?? PlayerPosition.UNKNOWN) : PlayerPosition.UNKNOWN,
        dateOfBirth: member.dateOfBirth,
        nationality: member.nationality,
        shirtNumber: member.shirtNumber,
      })),
    };
  }
}
