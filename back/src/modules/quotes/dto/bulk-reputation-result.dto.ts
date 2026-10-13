import { ApiProperty } from '@nestjs/swagger';

export class BulkReputationResultDto {
  @ApiProperty({ type: [String], format: 'uuid', description: 'Jugadores actualizados.' })
  updated!: string[];

  @ApiProperty({ type: [String], format: 'uuid', description: 'Ids que no existen en el catálogo.' })
  notFound!: string[];
}

export class ReputationResponseDto {
  @ApiProperty({ format: 'uuid' })
  playerId!: string;

  @ApiProperty({ type: Number, nullable: true, minimum: 0, maximum: 100 })
  worldReputation!: number | null;
}
