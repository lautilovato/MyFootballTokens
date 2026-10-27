import { randomUUID } from 'node:crypto';
import type { EntityManager } from '@mikro-orm/postgresql';

/**
 * 10-historial-operaciones: cotizaciones deterministas para los e2e de compras e historial, sin
 * pasar por el recálculo de 07. Cada una cuelga de su propia corrida y de una versión de
 * estrategia que se crea si todavía no existe.
 */

export interface SeedQuoteOptions {
  price: number;
  /** Por defecto, ahora. */
  calculatedAt?: Date;
  strategyKey?: string;
  strategyName?: string;
  version?: number;
  origin?: 'AUTOMATIC' | 'MANUAL';
  /** Espeja el precio en `player.base_value`, como hace el cierre de una corrida (07). Por defecto, sí. */
  mirror?: boolean;
}

export interface SeededQuote {
  id: string;
  price: number;
  calculatedAt: Date;
  strategyKey: string;
  version: number;
}

/** Devuelve el id de la versión `version` de la estrategia `key`, creando lo que falte. */
async function ensureStrategyVersion(em: EntityManager, key: string, name: string, version: number): Promise<string> {
  const [strategy] = await em.execute<{ id: string }[]>(`select "id" from "valuation_strategy" where "key" = ?`, [key]);
  let strategyId = strategy?.id;
  if (!strategyId) {
    strategyId = randomUUID();
    await em.execute(
      `insert into "valuation_strategy" ("id", "key", "name", "description", "active", "current_version", "created_at")
       values (?, ?, ?, ?, false, ?, now())`,
      [strategyId, key, name, `Estrategia de prueba ${key}`, version],
    );
  }
  const [existing] = await em.execute<{ id: string }[]>(
    `select "id" from "valuation_strategy_version" where "strategy_id" = ? and "version" = ?`,
    [strategyId, version],
  );
  if (existing) return existing.id;

  const versionId = randomUUID();
  await em.execute(
    `insert into "valuation_strategy_version"
       ("id", "strategy_id", "version", "weights", "base_value", "scale_factor", "min_price", "default_reputation", "created_at")
     values (?, ?, ?, ?::jsonb, 100, 900, 10, 20, now())`,
    [versionId, strategyId, version, JSON.stringify({ general: { rating: 1 } })],
  );
  return versionId;
}

/** Inserta una cotización del jugador y, por defecto, espeja su precio en `base_value`. */
export async function seedQuote(em: EntityManager, playerId: string, options: SeedQuoteOptions): Promise<SeededQuote> {
  const fork = em.fork();
  const strategyKey = options.strategyKey ?? 'performance';
  const version = options.version ?? 1;
  const calculatedAt = options.calculatedAt ?? new Date();
  const versionId = await ensureStrategyVersion(fork, strategyKey, options.strategyName ?? `Estrategia ${strategyKey}`, version);

  const runId = randomUUID();
  await fork.execute(
    `insert into "quote_run"
       ("id", "trigger", "strategy_version_id", "status", "season", "started_at", "finished_at", "quoted_count", "skipped_count", "correlation_id")
     values (?, ?, ?, 'COMPLETED', '2025-2026', ?, ?, 1, 0, 'e2e-seed-quote')`,
    [runId, options.origin ?? 'MANUAL', versionId, calculatedAt, calculatedAt],
  );

  const id = randomUUID();
  await fork.execute(
    `insert into "player_quote"
       ("id", "player_id", "run_id", "strategy_version_id", "origin", "season", "score", "raw_score", "price",
        "position_profile", "positive_weight_sum", "breakdown", "used_default_reputation", "missing_matches_played", "calculated_at")
     values (?, ?, ?, ?, ?, '2025-2026', 0.5, 0.5, ?, 'GENERAL', 1, '[]'::jsonb, false, false, ?)`,
    [id, playerId, runId, versionId, options.origin ?? 'MANUAL', options.price, calculatedAt],
  );
  if (options.mirror ?? true) {
    await fork.execute(`update "player" set "base_value" = ? where "id" = ?`, [options.price, playerId]);
  }
  return { id, price: options.price, calculatedAt, strategyKey, version };
}
