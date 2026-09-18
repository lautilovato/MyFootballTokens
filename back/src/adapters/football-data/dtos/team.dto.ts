import { FootballDataSquadMemberDto } from './squad-member.dto';

export interface FootballDataTeamDto {
  id: number;
  name: string;
  shortName: string | null;
  tla: string | null;
  crest: string | null;
  squad: FootballDataSquadMemberDto[];
}
