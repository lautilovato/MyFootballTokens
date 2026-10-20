import { ApiProperty } from '@nestjs/swagger';

export class GeneratedBatchDto {
  @ApiProperty({ example: 1, description: 'Número correlativo del lote' })
  number!: number;

  @ApiProperty({ example: 264400, description: 'Tokens repartidos (múltiplo de 100)' })
  tokenCount!: number;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { common: 44066, rare: 18508, epic: 7403, legendary: 3525 },
    description: 'Sobres generados por tipo',
  })
  packs!: Record<string, number>;
}

export class StockSyncResultDto {
  @ApiProperty({ description: 'Tokens emitidos en esta ejecución' })
  emittedTokens!: number;

  @ApiProperty({
    type: GeneratedBatchDto,
    nullable: true,
    description: 'Nulo si no había tokens elegibles para un lote nuevo',
  })
  batch!: GeneratedBatchDto | null;
}
