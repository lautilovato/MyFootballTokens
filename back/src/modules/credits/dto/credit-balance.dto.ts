import { ApiProperty } from '@nestjs/swagger';

export class CreditBalanceDto {
  @ApiProperty({ type: Number, minimum: 0, example: 2000, description: 'Saldo en créditos enteros (FR-003, FR-005)' })
  credits!: number;
}
