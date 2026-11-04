import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';

/**
 * Instante en que se pregunta la cotización vigente (10-historial-operaciones FR-027, FR-028).
 * Que no esté a más de 24 horas en el futuro lo valida el service: depende del reloj.
 */
export class QuoteAtQueryDto {
  @ApiProperty({
    description:
      'Instante, ISO 8601 con zona horaria. Para buscar «un día», el final de ese día en la zona del usuario.',
    example: '2026-10-14T02:59:59.999Z',
  })
  @IsISO8601()
  at!: string;
}
