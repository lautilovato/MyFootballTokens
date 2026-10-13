import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { instanceToPlain } from 'class-transformer';
import type { StrategyWeights } from '../../infrastructure/database/entities/valuation-strategy-version.entity';
import { PinoLoggerService } from '../../shared/logging/pino-logger.service';
import { StrategyConfigDto } from './dto/strategy-config.dto';
import { StrategyResponseDto, StrategyVersionDto } from './dto/strategy-response.dto';
import { validateStrategyConfig } from './strategy-config.rules';
import { StrategyWithVersion, ValuationStrategyRepository } from './valuation-strategy.repository';

const LOG_CONTEXT = 'ValuationStrategyService';

@Injectable()
export class ValuationStrategyService {
  constructor(
    private readonly repository: ValuationStrategyRepository,
    private readonly logger: PinoLoggerService,
  ) {}

  /**
   * Versión vigente de la estrategia activa. La migración deja siempre una activa, pero si
   * alguien la desactivara por fuera de la API el recálculo debe fallar con un motivo claro en
   * lugar de cotizar con cualquier cosa (US1-7).
   */
  async getActiveVersion(): Promise<StrategyWithVersion> {
    const active = await this.repository.findActive();
    if (!active) {
      throw new ConflictException({
        code: 'NO_ACTIVE_STRATEGY',
        message: 'No hay ninguna estrategia de valuación activa',
      });
    }
    return active;
  }

  async getVersionByKey(key: string): Promise<StrategyWithVersion> {
    const found = await this.repository.findByKey(key);
    if (!found) throw this.notFound(key);
    return found;
  }

  async list(): Promise<StrategyResponseDto[]> {
    const strategies = await this.repository.findAllWithCurrentVersion();
    return strategies.map(({ strategy, version }) => StrategyResponseDto.fromEntity(strategy, version));
  }

  async listVersions(key: string): Promise<StrategyVersionDto[]> {
    const versions = await this.repository.findVersions(key);
    if (!versions) throw this.notFound(key);
    return versions.map((version) => StrategyVersionDto.fromEntity(version));
  }

  /**
   * Crea una versión nueva e inmutable (FR-011). Si la configuración no pasa las reglas
   * semánticas, se rechaza con todos los motivos y no se crea nada (FR-012).
   */
  async createVersion(key: string, dto: StrategyConfigDto): Promise<StrategyVersionDto> {
    // Se guarda como objeto plano: el DTO transformado trae instancias de clase.
    const weights = instanceToPlain(dto.weights, { exposeUnsetFields: false }) as StrategyWeights;
    const config = { ...dto, weights };

    const errors = validateStrategyConfig(config);
    if (errors.length > 0) throw new BadRequestException(errors);

    const version = await this.repository.createVersion(key, config);
    if (!version) throw this.notFound(key);

    this.logger.event(LOG_CONTEXT, 'strategy version created', { strategy: key, version: version.version });
    return StrategyVersionDto.fromEntity(version);
  }

  /** Rige desde el próximo recálculo: las cotizaciones vigentes no cambian (FR-014). */
  async activate(key: string): Promise<StrategyResponseDto> {
    const activated = await this.repository.activate(key);
    if (!activated) throw this.notFound(key);

    this.logger.event(LOG_CONTEXT, 'strategy activated', {
      strategy: key,
      version: activated.version.version,
    });
    return StrategyResponseDto.fromEntity(activated.strategy, activated.version);
  }

  private notFound(key: string): NotFoundException {
    return new NotFoundException(`Strategy ${key} not found`);
  }
}
