/**
 * Validación semántica de la configuración de una estrategia (07-cotizacion FR-012,
 * data-model.md «Reglas de validación»).
 *
 * Utilidad pura (constitución §7): sin decoradores, sin inyección, sin base de datos. Cubre lo
 * que `class-validator` no expresa sobre el DTO —al menos un peso positivo por perfil, a lo
 * sumo 4 decimales— y vuelve a chequear el resto, para que la regla no dependa de que el DTO
 * esté bien decorado.
 */
import {
  METRICS,
  STRATEGY_POSITIONS,
} from '../../infrastructure/database/entities/valuation-strategy-version.entity';

export const WEIGHT_MIN = -1;
export const WEIGHT_MAX = 1;
const WEIGHT_DECIMALS = 4;

export interface StrategyConfigInput {
  weights: { general: Record<string, unknown>; byPosition?: Record<string, unknown> };
  baseValue: number;
  scaleFactor: number;
  minPrice: number;
  defaultReputation: number;
}

const KNOWN_METRICS: ReadonlySet<string> = new Set(METRICS);
const KNOWN_POSITIONS: ReadonlySet<string> = new Set(STRATEGY_POSITIONS);

function hasAtMostDecimals(value: number, decimals: number): boolean {
  const scaled = value * 10 ** decimals;
  return Math.abs(scaled - Math.round(scaled)) < 1e-9;
}

function validateProfile(label: string, profile: unknown): string[] {
  if (typeof profile !== 'object' || profile === null || Array.isArray(profile)) {
    return [`${label}: debe ser un objeto de pesos por métrica`];
  }

  const errors: string[] = [];
  let positives = 0;

  for (const [metric, weight] of Object.entries(profile)) {
    if (!KNOWN_METRICS.has(metric)) {
      errors.push(`${label}: métrica desconocida "${metric}"`);
      continue;
    }
    if (typeof weight !== 'number' || !Number.isFinite(weight)) {
      errors.push(`${label}.${metric}: el peso debe ser numérico`);
      continue;
    }
    if (weight < WEIGHT_MIN || weight > WEIGHT_MAX) {
      errors.push(`${label}.${metric}: el peso debe estar entre ${WEIGHT_MIN} y ${WEIGHT_MAX}`);
    }
    if (!hasAtMostDecimals(weight, WEIGHT_DECIMALS)) {
      errors.push(`${label}.${metric}: el peso admite a lo sumo ${WEIGHT_DECIMALS} decimales`);
    }
    if (weight > 0) positives++;
  }

  // Sin positivos, S⁺ = 0 y el score no tiene escala (FR-007).
  if (positives === 0) errors.push(`${label}: debe tener al menos un peso positivo`);
  return errors;
}

/** Devuelve los motivos de rechazo; un arreglo vacío significa configuración válida. */
export function validateStrategyConfig(config: StrategyConfigInput): string[] {
  const errors = validateProfile('weights.general', config.weights?.general);

  for (const [position, profile] of Object.entries(config.weights?.byPosition ?? {})) {
    if (!KNOWN_POSITIONS.has(position)) {
      errors.push(`weights.byPosition: posición desconocida "${position}"`);
      continue;
    }
    errors.push(...validateProfile(`weights.byPosition.${position}`, profile));
  }

  if (!Number.isInteger(config.baseValue) || config.baseValue < 0) {
    errors.push('baseValue: debe ser un entero mayor o igual a 0');
  }
  if (!Number.isInteger(config.scaleFactor) || config.scaleFactor <= 0) {
    errors.push('scaleFactor: debe ser un entero positivo');
  }
  if (!Number.isInteger(config.minPrice) || config.minPrice < 1) {
    errors.push('minPrice: debe ser un entero mayor o igual a 1');
  }
  if (
    !Number.isInteger(config.defaultReputation) ||
    config.defaultReputation < 0 ||
    config.defaultReputation > 100
  ) {
    errors.push('defaultReputation: debe ser un entero entre 0 y 100');
  }

  return errors;
}
