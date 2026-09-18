import { ApiProperty } from '@nestjs/swagger';

export class TeamWhoScoredMatchingResultDto {
  @ApiProperty({ description: 'Ligas con al menos un equipo sin mapear, procesadas en esta corrida.' })
  leaguesProcessed!: number;

  @ApiProperty({ description: 'Ligas donde todos los equipos ya tenían externalWhoScoredId.' })
  leaguesSkipped!: number;

  @ApiProperty({ description: 'Equipos con externalWhoScoredId seteado en esta corrida.' })
  teamsMatched!: number;

  @ApiProperty({ description: 'Filas de WhoScored registradas en la cola de revisión manual.' })
  teamsUnmatched!: number;
}
