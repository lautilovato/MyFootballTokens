import { ApiProperty } from '@nestjs/swagger';
import { ValuationStrategy } from '../../../infrastructure/database/entities/valuation-strategy.entity';
import {
  type StrategyWeights,
  ValuationStrategyVersion,
} from '../../../infrastructure/database/entities/valuation-strategy-version.entity';
import { StrategyWeightsDto } from './strategy-config.dto';

export class StrategyVersionDto {
  @ApiProperty({ minimum: 1 })
  version!: number;

  @ApiProperty({ type: StrategyWeightsDto })
  weights!: StrategyWeights;

  @ApiProperty()
  baseValue!: number;

  @ApiProperty()
  scaleFactor!: number;

  @ApiProperty()
  minPrice!: number;

  @ApiProperty()
  defaultReputation!: number;

  @ApiProperty()
  createdAt!: Date;

  static fromEntity(version: ValuationStrategyVersion): StrategyVersionDto {
    const dto = new StrategyVersionDto();
    dto.version = version.version;
    dto.weights = version.weights;
    dto.baseValue = version.baseValue;
    dto.scaleFactor = version.scaleFactor;
    dto.minPrice = version.minPrice;
    dto.defaultReputation = version.defaultReputation;
    dto.createdAt = version.createdAt;
    return dto;
  }
}

export class StrategyResponseDto {
  @ApiProperty({ example: 'performance' })
  key!: string;

  @ApiProperty({ example: 'Performance' })
  name!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  active!: boolean;

  @ApiProperty({ type: StrategyVersionDto })
  currentVersion!: StrategyVersionDto;

  static fromEntity(
    strategy: ValuationStrategy,
    version: ValuationStrategyVersion,
  ): StrategyResponseDto {
    const dto = new StrategyResponseDto();
    dto.key = strategy.key;
    dto.name = strategy.name;
    dto.description = strategy.description;
    dto.active = strategy.active;
    dto.currentVersion = StrategyVersionDto.fromEntity(version);
    return dto;
  }
}
