import { Injectable } from '@nestjs/common';
import { EntityManager, LockMode } from '@mikro-orm/postgresql';
import { ValuationStrategy } from '../../infrastructure/database/entities/valuation-strategy.entity';
import {
  StrategyWeights,
  ValuationStrategyVersion,
} from '../../infrastructure/database/entities/valuation-strategy-version.entity';

/** Una estrategia junto con su versión vigente (la de número `currentVersion`). */
export interface StrategyWithVersion {
  strategy: ValuationStrategy;
  version: ValuationStrategyVersion;
}

export interface NewVersionData {
  weights: StrategyWeights;
  baseValue: number;
  scaleFactor: number;
  minPrice: number;
  defaultReputation: number;
}

/**
 * Persistencia de estrategias y versiones. Las versiones son solo INSERT: ningún método de esta
 * clase actualiza ni borra una `valuation_strategy_version` (FR-011).
 *
 * Todas las lecturas van sobre un `fork()`: la corrida automática no tiene RequestContext, y con
 * el EntityManager global una estrategia ya cargada conservaría `active` y `currentVersion`
 * viejos después de una activación o de una versión nueva.
 */
@Injectable()
export class ValuationStrategyRepository {
  constructor(private readonly em: EntityManager) {}

  async findActive(): Promise<StrategyWithVersion | null> {
    const strategy = await this.em.fork().findOne(ValuationStrategy, { active: true });
    return strategy ? this.withCurrentVersion(strategy) : null;
  }

  async findByKey(key: string): Promise<StrategyWithVersion | null> {
    const strategy = await this.em.fork().findOne(ValuationStrategy, { key });
    return strategy ? this.withCurrentVersion(strategy) : null;
  }

  async findAllWithCurrentVersion(): Promise<StrategyWithVersion[]> {
    const strategies = await this.em.fork().find(ValuationStrategy, {}, { orderBy: { key: 'asc' } });
    return Promise.all(strategies.map((strategy) => this.withCurrentVersion(strategy)));
  }

  /** `null` si la estrategia no existe; si existe, sus versiones de la más nueva a la más vieja. */
  async findVersions(key: string): Promise<ValuationStrategyVersion[] | null> {
    const strategy = await this.em.fork().findOne(ValuationStrategy, { key });
    if (!strategy) return null;
    return this.em.fork().find(
      ValuationStrategyVersion,
      { strategy: strategy.id },
      { orderBy: { version: 'desc' } },
    );
  }

  /**
   * Inserta la versión `currentVersion + 1` (FR-011). La fila de la estrategia se bloquea para
   * que dos guardados simultáneos no compitan por el mismo número de versión.
   */
  async createVersion(key: string, data: NewVersionData): Promise<ValuationStrategyVersion | null> {
    return this.em.fork().transactional(async (tx) => {
      const strategy = await tx.findOne(
        ValuationStrategy,
        { key },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!strategy) return null;

      const version = tx.create(ValuationStrategyVersion, {
        strategy,
        version: strategy.currentVersion + 1,
        ...data,
        createdAt: new Date(),
      });
      strategy.currentVersion = version.version;
      await tx.flush();
      return version;
    });
  }

  /**
   * Activa una estrategia y desactiva la anterior en la misma transacción (FR-013). El orden
   * importa: el índice único parcial no admite dos activas ni por un instante.
   */
  async activate(key: string): Promise<StrategyWithVersion | null> {
    const activated = await this.em.fork().transactional(async (tx) => {
      const strategy = await tx.findOne(ValuationStrategy, { key });
      if (!strategy) return null;

      await tx.nativeUpdate(ValuationStrategy, { active: true, key: { $ne: key } }, { active: false });
      await tx.nativeUpdate(ValuationStrategy, { key }, { active: true });
      return strategy.id;
    });
    if (!activated) return null;

    const strategy = await this.em.fork().findOneOrFail(ValuationStrategy, { id: activated });
    return this.withCurrentVersion(strategy);
  }

  private async withCurrentVersion(strategy: ValuationStrategy): Promise<StrategyWithVersion> {
    const version = await this.em.fork().findOneOrFail(ValuationStrategyVersion, {
      strategy: strategy.id,
      version: strategy.currentVersion,
    });
    return { strategy, version };
  }
}
