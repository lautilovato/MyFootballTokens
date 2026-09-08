export interface FootballDataSquadMemberDto {
  id: number;
  firstName: string | null;
  lastName: string | null;
  name: string;
  position: string | null; // "Goalkeeper" | "Defence" | "Midfield" | "Offence"
  dateOfBirth: string | null;
  nationality: string | null;
  shirtNumber: number | null;
}
