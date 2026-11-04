import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class RecalculateRequestDto {
  @ApiPropertyOptional({
    description:
      'Estrategia puntual para esta corrida; por defecto, la activa (FR-028). La corrida queda marcada como manual y registra la estrategia usada.',
    example: 'prestige',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{2,39}$/)
  strategyKey?: string;
}
