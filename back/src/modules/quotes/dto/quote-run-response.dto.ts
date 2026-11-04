import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  QuoteRun,
  QuoteRunStatus,
  QuoteRunTrigger,
} from '../../../infrastructure/database/entities/quote-run.entity';
import { PageMetaDto } from './page-meta.dto';

export class StrategyRefDto {
  @ApiProperty({ example: 'performance' })
  key!: string;

  @ApiProperty({ example: 'Performance', description: 'Nombre legible de la estrategia (10-historial-operaciones)' })
  name!: string;

  @ApiProperty({ example: 1 })
  version!: number;
}

export class QuoteRunResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: QuoteRunTrigger })
  trigger!: QuoteRunTrigger;

  @ApiProperty({ enum: QuoteRunStatus })
  status!: QuoteRunStatus;

  @ApiPropertyOptional({ type: StrategyRefDto, nullable: true })
  strategy!: StrategyRefDto | null;

  @ApiPropertyOptional({ nullable: true, example: '2025-2026' })
  season!: string | null;

  @ApiProperty()
  startedAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  finishedAt!: Date | null;

  @ApiProperty({ description: 'Jugadores cotizados en la corrida.' })
  quotedCount!: number;

  @ApiProperty({ description: 'Jugadores del catálogo sin estadísticas de la temporada (FR-022).' })
  skippedCount!: number;

  @ApiPropertyOptional({ nullable: true })
  failureReason!: string | null;

  @ApiProperty()
  correlationId!: string;

  /** Requiere `strategyVersion.strategy` populado cuando la corrida tiene estrategia. */
  static fromEntity(run: QuoteRun): QuoteRunResponseDto {
    const dto = new QuoteRunResponseDto();
    dto.id = run.id;
    dto.trigger = run.trigger;
    dto.status = run.status;
    dto.strategy = run.strategyVersion
      ? {
          key: run.strategyVersion.strategy.key,
          name: run.strategyVersion.strategy.name,
          version: run.strategyVersion.version,
        }
      : null;
    dto.season = run.season ?? null;
    dto.startedAt = run.startedAt;
    dto.finishedAt = run.finishedAt ?? null;
    dto.quotedCount = run.quotedCount;
    dto.skippedCount = run.skippedCount;
    dto.failureReason = run.failureReason ?? null;
    dto.correlationId = run.correlationId;
    return dto;
  }
}

export class QuoteRunsPageDto {
  @ApiProperty({ type: [QuoteRunResponseDto], description: 'De la más reciente a la más vieja' })
  data!: QuoteRunResponseDto[];

  @ApiProperty({ type: PageMetaDto })
  meta!: PageMetaDto;
}
