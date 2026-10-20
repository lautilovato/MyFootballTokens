import { ApiProperty } from '@nestjs/swagger';

export class InitialGrantsResultDto {
  @ApiProperty({ type: Number, example: 3, description: 'Usuarios que recibieron la entrega en esta ejecución' })
  granted!: number;

  @ApiProperty({ type: Number, example: 2000, description: 'Cantidad entregada a cada uno' })
  amount!: number;
}
