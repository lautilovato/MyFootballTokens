/**
 * Configuración de los tipos de sobre (08-sobres FR-008, FR-044 a FR-046, research #11).
 *
 * Utilidad pura: sin NestJS, sin inyección, sin base de datos (constitución §7, excepción de
 * utilidades puras). La lee y valida `PacksService` al arrancar; con una configuración inválida
 * la aplicación no arranca.
 *
 * `PACK_TYPES_CONFIG` es un JSON opcional con los cuatro tipos completos. Sin la variable rigen
 * los valores por defecto de la spec (Assumptions).
 */
import type { Rarity } from '../player/rarity';

/** De menor a mayor: el orden en que rige la monotonía de FR-009. */
export const PACK_TYPES = ['common', 'rare', 'epic', 'legendary'] as const;
export type PackTypeKey = (typeof PACK_TYPES)[number];

/** Las rarezas, de menor a mayor. */
export const RARITY_ORDER: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary'];

export type RarityProbabilities = Record<Rarity, number>;

export interface PackTypeConfig {
  /** Créditos enteros. */
  price: number;
  /** Cartas por sobre. */
  cards: number;
  /** Probabilidades objetivo por rareza, normalizadas a 1. */
  probabilities: RarityProbabilities;
  /** Parte de los tokens de cada lote que va a sobres de este tipo, normalizada a 1. */
  share: number;
}

export type PacksConfig = Record<PackTypeKey, PackTypeConfig>;

export type ParsedPacksConfig = { ok: true; config: PacksConfig } | { ok: false; errors: string[] };

/** Valores por defecto de la spec (Assumptions). */
export const DEFAULT_PACK_CONFIG: PacksConfig = {
  common: {
    price: 100,
    cards: 3,
    probabilities: { common: 0.78, rare: 0.18, epic: 0.035, legendary: 0.005 },
    share: 0.5,
  },
  rare: {
    price: 200,
    cards: 4,
    probabilities: { common: 0.55, rare: 0.32, epic: 0.1, legendary: 0.03 },
    share: 0.28,
  },
  epic: {
    price: 400,
    cards: 5,
    probabilities: { common: 0.35, rare: 0.35, epic: 0.24, legendary: 0.06 },
    share: 0.14,
  },
  legendary: {
    price: 800,
    cards: 6,
    probabilities: { common: 0.2, rare: 0.3, epic: 0.3, legendary: 0.2 },
    share: 0.08,
  },
};

/** Lote mínimo: los tokens de un jugador. FR-045 exige poder repartirlo exactamente. */
export const TOKENS_PER_PLAYER = 100;

/** Tolerancia de coma flotante para comparar proporciones. */
const EPSILON = 1e-9;

export function isPackType(value: unknown): value is PackTypeKey {
  return typeof value === 'string' && (PACK_TYPES as readonly string[]).includes(value);
}

/**
 * ¿Se puede escribir `target` como suma de las cantidades dadas, cada una usada cualquier
 * cantidad de veces (incluso cero)? Es la condición de partición exacta de FR-045.
 */
export function canSumTo(target: number, cardCounts: readonly number[]): boolean {
  const reachable = Array.from({ length: target + 1 }, () => false);
  reachable[0] = true;
  for (let total = 1; total <= target; total++) {
    reachable[total] = cardCounts.some((c) => c > 0 && c <= total && reachable[total - c]);
  }
  return reachable[target];
}

/** Lee `PACK_TYPES_CONFIG` del entorno y valida FR-045 y FR-009. */
export function parsePacksConfig(env: Record<string, string | undefined>): ParsedPacksConfig {
  const raw = env.PACK_TYPES_CONFIG?.trim();
  if (!raw) return validatePacksConfig(DEFAULT_PACK_CONFIG);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, errors: ['PACK_TYPES_CONFIG no es un JSON válido'] };
  }
  return validatePacksConfig(parsed);
}

/** Valida una configuración y la devuelve con probabilidades y participaciones normalizadas. */
export function validatePacksConfig(input: unknown): ParsedPacksConfig {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['la configuración tiene que ser un objeto con los cuatro tipos de sobre'] };
  }

  const source = input as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    if (!isPackType(key)) errors.push(`tipo de sobre desconocido: ${key}`);
  }

  const draft: Partial<Record<PackTypeKey, PackTypeConfig>> = {};
  for (const type of PACK_TYPES) {
    const entry = source[type];
    if (typeof entry !== 'object' || entry === null) {
      errors.push(`${type}: falta la configuración del tipo`);
      continue;
    }
    const { price, cards, probabilities, share } = entry as Record<string, unknown>;

    if (!isPositiveInteger(price)) errors.push(`${type}: el precio tiene que ser un entero positivo`);
    if (!isPositiveInteger(cards)) errors.push(`${type}: la cantidad de cartas tiene que ser un entero positivo`);
    if (!isNonNegativeNumber(share)) errors.push(`${type}: la participación tiene que ser un número no negativo`);

    const probs = readProbabilities(type, probabilities, errors);
    if (probs && isPositiveInteger(price) && isPositiveInteger(cards) && isNonNegativeNumber(share)) {
      draft[type] = { price, cards, probabilities: probs, share };
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  const config = draft as PacksConfig;

  const shareTotal = PACK_TYPES.reduce((sum, type) => sum + config[type].share, 0);
  if (shareTotal <= 0) {
    return { ok: false, errors: ['al menos un tipo tiene que tener participación positiva'] };
  }
  for (const type of PACK_TYPES) config[type] = { ...config[type], share: config[type].share / shareTotal };

  const activeCards = PACK_TYPES.filter((t) => config[t].share > 0).map((t) => config[t].cards);
  if (!canSumTo(TOKENS_PER_PLAYER, activeCards)) {
    errors.push(
      `las cantidades de cartas de los tipos con participación (${activeCards.join(', ')}) no pueden sumar exactamente ${TOKENS_PER_PLAYER}`,
    );
  }

  // FR-009: a mayor tipo, epic + legendary no puede bajar.
  for (let i = 1; i < PACK_TYPES.length; i++) {
    const lower = topShare(config[PACK_TYPES[i - 1]].probabilities);
    const upper = topShare(config[PACK_TYPES[i]].probabilities);
    if (upper + EPSILON < lower) {
      errors.push(
        `${PACK_TYPES[i]}: la probabilidad de epic + legendary (${upper.toFixed(4)}) es menor que la de ${PACK_TYPES[i - 1]} (${lower.toFixed(4)})`,
      );
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, config };
}

/** Probabilidad combinada de `epic` y `legendary` (FR-009). */
export function topShare(probabilities: RarityProbabilities): number {
  return probabilities.epic + probabilities.legendary;
}

function readProbabilities(type: string, value: unknown, errors: string[]): RarityProbabilities | null {
  if (typeof value !== 'object' || value === null) {
    errors.push(`${type}: faltan las probabilidades por rareza`);
    return null;
  }
  const source = value as Record<string, unknown>;
  const result = {} as RarityProbabilities;
  let valid = true;
  for (const rarity of RARITY_ORDER) {
    const p = source[rarity] ?? 0;
    if (!isNonNegativeNumber(p)) {
      errors.push(`${type}: la probabilidad de ${rarity} tiene que ser un número no negativo`);
      valid = false;
      continue;
    }
    result[rarity] = p;
  }
  if (!valid) return null;

  const total = RARITY_ORDER.reduce((sum, r) => sum + result[r], 0);
  if (total <= 0) {
    errors.push(`${type}: al menos una probabilidad tiene que ser positiva`);
    return null;
  }
  for (const rarity of RARITY_ORDER) result[rarity] = result[rarity] / total;
  return result;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
