import { ApiProperty } from '@nestjs/swagger';

export class IngestionResultDto {
  @ApiProperty({ description: 'Ligas configuradas procesadas (siempre 5).' })
  leagues!: number;

  @ApiProperty({ description: 'Equipos con upsert exitoso en esta corrida.' })
  teams!: number;

  @ApiProperty({ description: 'Jugadores con upsert exitoso en esta corrida.' })
  players!: number;
}
