export interface FootballDataCompetitionDto {
  id: number;
  code: string;
  name: string;
  area: { name: string };
}

export interface FootballDataCompetitionTeamsDto {
  teams: Array<{
    id: number;
    name: string;
    shortName: string | null;
    tla: string | null;
    crest: string | null;
  }>;
}
