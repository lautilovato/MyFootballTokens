import { ApiProperty } from '@nestjs/swagger';

export class PlayerImagesRefreshResultDto {
  @ApiProperty({ description: 'Jugadores revisados en esta corrida.' })
  processed!: number;

  @ApiProperty({ description: 'Jugadores a los que se les guardó la imagen cartoon.' })
  matched!: number;

  @ApiProperty({ description: 'Sin candidato confiable en TheSportsDB (nombre, fecha o club no corroboran).' })
  noMatch!: number;

  @ApiProperty({ description: 'Se encontró al jugador pero TheSportsDB no tiene ilustración cartoon para él.' })
  noCartoon!: number;

  @ApiProperty({ description: 'Falló la consulta; no se marcan como revisados y se reintentan en la próxima corrida.' })
  failed!: number;

  @ApiProperty({ description: 'Jugadores del catálogo que siguen pendientes de revisar tras esta corrida.' })
  remaining!: number;

  @ApiProperty({ type: [String], description: 'Nombres de los jugadores sin candidato confiable, para revisión manual.' })
  unmatchedNames!: string[];
}
