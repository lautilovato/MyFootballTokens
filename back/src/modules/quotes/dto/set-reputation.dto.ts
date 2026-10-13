import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsInt, Max, Min, ValidateIf } from 'class-validator';

export class SetReputationDto {
  @ApiProperty({
    type: Number,
    minimum: 0,
    maximum: 100,
    nullable: true,
    description: 'Reputación mundial 0–100. null la borra (vuelve a usarse la de por defecto).',
    example: 95,
  })
  // `null` es un valor válido (borra la carga); `undefined` —el campo ausente— no lo es.
  @IsDefined()
  @ValidateIf((dto: SetReputationDto) => dto.worldReputation !== null)
  @IsInt()
  @Min(0)
  @Max(100)
  worldReputation!: number | null;
}
