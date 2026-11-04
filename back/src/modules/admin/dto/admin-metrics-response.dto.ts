import { ApiProperty } from '@nestjs/swagger';

class AdminPeriodDto {
  @ApiProperty({ type: String, format: 'date', nullable: true })
  from!: string | null;

  @ApiProperty({ type: String, format: 'date', nullable: true })
  to!: string | null;

  @ApiProperty()
  timezone!: string;
}

class AdminUsersDto {
  @ApiProperty({ description: 'Estado. No cuenta administradores.' })
  registered!: number;

  @ApiProperty({ description: 'Período' })
  new!: number;

  @ApiProperty({ description: 'Período: abrieron un sobre, compraron o vendieron' })
  active!: number;
}

class AdminCardsDto {
  @ApiProperty()
  issued!: number;

  @ApiProperty()
  inCirculation!: number;

  @ApiProperty()
  inPacks!: number;

  @ApiProperty()
  reserved!: number;

  @ApiProperty()
  platformSale!: number;

  @ApiProperty({ description: 'Publicaciones activas. Se superpone con los estados.' })
  listed!: number;
}

class AdminRarityDto {
  @ApiProperty()
  common!: number;

  @ApiProperty()
  rare!: number;

  @ApiProperty()
  epic!: number;

  @ApiProperty()
  legendary!: number;
}

class AdminPackTypeDto {
  @ApiProperty({ enum: ['common', 'rare', 'epic', 'legendary'] })
  type!: string;

  @ApiProperty({ description: 'Estado' })
  remaining!: number;

  @ApiProperty({ description: 'Período' })
  opened!: number;

  @ApiProperty()
  soldOut!: boolean;
}

class AdminPacksDto {
  @ApiProperty({ description: 'Estado' })
  remaining!: number;

  @ApiProperty({ description: 'Período' })
  opened!: number;

  @ApiProperty({ type: [AdminPackTypeDto] })
  byType!: AdminPackTypeDto[];
}

class AdminTopSaleDto {
  @ApiProperty()
  price!: number;

  @ApiProperty({ format: 'uuid' })
  playerId!: string;

  @ApiProperty()
  playerName!: string;

  @ApiProperty({ format: 'date-time' })
  at!: string;
}

class AdminTopPlayerDto {
  @ApiProperty({ format: 'uuid' })
  playerId!: string;

  @ApiProperty()
  playerName!: string;

  @ApiProperty()
  sales!: number;

  @ApiProperty()
  volume!: number;
}

class AdminMarketDto {
  @ApiProperty()
  sales!: number;

  @ApiProperty({ type: Number, nullable: true, description: 'Nulo sin ventas (FR-016)' })
  averagePrice!: number | null;

  @ApiProperty()
  volume!: number;

  @ApiProperty({ type: AdminTopSaleDto, nullable: true })
  topSale!: AdminTopSaleDto | null;

  @ApiProperty({ type: [AdminTopPlayerDto] })
  topPlayers!: AdminTopPlayerDto[];
}

class AdminCreditsDto {
  @ApiProperty({ description: 'Período' })
  issued!: number;

  @ApiProperty({ description: 'Período' })
  collected!: number;

  @ApiProperty({ description: 'Estado' })
  inCirculation!: number;
}

class AdminActivityBucketDto {
  @ApiProperty({ format: 'date' })
  start!: string;

  @ApiProperty()
  packsOpened!: number;

  @ApiProperty()
  sales!: number;
}

class AdminActivityDto {
  @ApiProperty({ enum: ['day', 'week', 'month'] })
  unit!: string;

  @ApiProperty({ type: [AdminActivityBucketDto] })
  buckets!: AdminActivityBucketDto[];
}

class AdminCardsReconciliationDto {
  @ApiProperty()
  ok!: boolean;

  @ApiProperty()
  difference!: number;

  @ApiProperty()
  affectedPlayers!: number;
}

class AdminCreditsReconciliationDto {
  @ApiProperty()
  ok!: boolean;

  @ApiProperty()
  expected!: number;

  @ApiProperty()
  actual!: number;

  @ApiProperty()
  difference!: number;
}

class AdminReconciliationDto {
  @ApiProperty({ type: AdminCardsReconciliationDto })
  cards!: AdminCardsReconciliationDto;

  @ApiProperty({ type: AdminCreditsReconciliationDto })
  credits!: AdminCreditsReconciliationDto;
}

/** Solo cantidades agregadas y nombres de jugadores: ningún dato de usuarios (FR-031). */
export class AdminMetricsDto {
  @ApiProperty({ format: 'date-time' })
  computedAt!: string;

  @ApiProperty({ type: AdminPeriodDto })
  period!: AdminPeriodDto;

  @ApiProperty({ type: AdminUsersDto })
  users!: AdminUsersDto;

  @ApiProperty({ type: AdminCardsDto })
  cards!: AdminCardsDto;

  @ApiProperty({ type: AdminRarityDto })
  rarity!: AdminRarityDto;

  @ApiProperty({ type: AdminPacksDto })
  packs!: AdminPacksDto;

  @ApiProperty({ type: AdminMarketDto })
  market!: AdminMarketDto;

  @ApiProperty({ type: AdminCreditsDto })
  credits!: AdminCreditsDto;

  @ApiProperty({ type: AdminActivityDto })
  activity!: AdminActivityDto;

  @ApiProperty({ type: AdminReconciliationDto })
  reconciliation!: AdminReconciliationDto;
}
