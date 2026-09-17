import { ApiProperty } from '@nestjs/swagger';

export class PlayerStatsRefreshResultDto {
  @ApiProperty({ description: 'Equipos con al menos un upsert exitoso.' })
  teamsProcessed!: number;

  @ApiProperty({ description: 'Equipos sin externalWhoScoredId mapeado.' })
  teamsSkipped!: number;

  @ApiProperty({ description: 'Jugadores con snapshot de temporada actualizado.' })
  playersUpdated!: number;

  @ApiProperty({ description: 'Jugadores de WhoScored registrados para revisión manual.' })
  playersUnmatched!: number;
}
