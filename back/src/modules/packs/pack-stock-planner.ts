/**
 * Armado de un lote de sobres (08-sobres FR-012 a FR-014, research #6).
 *
 * Utilidad pura: sin NestJS, sin inyección, sin base de datos (constitución §7, excepción de
 * utilidades puras). Recibe los tokens elegibles con su rareza y devuelve los sobres, con
 * partición exacta: cada token en exactamente un sobre y cada sobre con las cartas de su tipo.
 *
 * Tres pasos:
 *  1. Cantidad de sobres por tipo según la participación, ajustada para que las cartas sumen
 *     exactamente la cantidad de tokens.
 *  2. Cuántas cartas de cada rareza van a cada tipo: ajuste proporcional iterativo (IPF) sobre
 *     los objetivos, respetando a la vez los cupos de cada tipo y los tokens de cada rareza, y
 *     redondeo que preserva ambos márgenes.
 *  3. Mezcla aleatoria y corte en sobres.
 */
import type { Rarity } from '../player/rarity';
import { PACK_TYPES, PackTypeKey, PacksConfig, RARITY_ORDER } from './pack-config.rules';

export interface EligibleToken {
  tokenId: string;
  rarity: Rarity;
}

export interface PlannedPack {
  type: PackTypeKey;
  tokenIds: string[];
}

export interface TypeComposition {
  packs: number;
  cards: Record<Rarity, number>;
}

export interface PlannedBatch {
  packs: PlannedPack[];
  composition: Record<PackTypeKey, TypeComposition>;
}

/** Entero uniforme en [0, maxExclusive). En producción, `crypto.randomInt`. */
export type RandomInt = (maxExclusive: number) => number;

/** Rango de la búsqueda de ajustes alrededor del redondeo hacia abajo (paso 1). */
const MAX_ADJUSTMENT = 6;
const IPF_MAX_ITERATIONS = 2000;
const IPF_TOLERANCE = 1e-9;

export function planBatch(tokens: EligibleToken[], config: PacksConfig, random: RandomInt): PlannedBatch {
  const total = tokens.length;
  const emptyComposition = Object.fromEntries(
    PACK_TYPES.map((t) => [t, { packs: 0, cards: zeroByRarity() }]),
  ) as Record<PackTypeKey, TypeComposition>;
  if (total === 0) return { packs: [], composition: emptyComposition };

  const packCounts = planPackCounts(total, config);
  const slots = Object.fromEntries(PACK_TYPES.map((t) => [t, packCounts[t] * config[t].cards])) as Record<
    PackTypeKey,
    number
  >;

  const byRarity = groupByRarity(tokens);
  const supply = Object.fromEntries(RARITY_ORDER.map((r) => [r, byRarity[r].length])) as Record<Rarity, number>;
  const matrix = planRarityMatrix(slots, supply, config);

  // Paso 3: repartir los tokens de cada rareza entre los tipos según la matriz, y mezclar.
  for (const rarity of RARITY_ORDER) shuffle(byRarity[rarity], random);
  const cursor = zeroByRarity();
  const packs: PlannedPack[] = [];
  const composition = emptyComposition;

  for (const type of PACK_TYPES) {
    const assigned: string[] = [];
    for (const rarity of RARITY_ORDER) {
      const count = matrix[type][rarity];
      assigned.push(...byRarity[rarity].slice(cursor[rarity], cursor[rarity] + count).map((t) => t.tokenId));
      cursor[rarity] += count;
      composition[type].cards[rarity] = count;
    }
    shuffle(assigned, random);

    const cards = config[type].cards;
    for (let i = 0; i < assigned.length; i += cards) {
      packs.push({ type, tokenIds: assigned.slice(i, i + cards) });
    }
    composition[type].packs = packCounts[type];
  }

  return { packs, composition };
}

/**
 * Paso 1: cantidad de sobres por tipo. Parte de `floor(participación × N / cartas)` y busca el
 * ajuste más chico (en tokens desviados de la participación) que haga que las cartas sumen N
 * exactamente (FR-013).
 */
export function planPackCounts(total: number, config: PacksConfig): Record<PackTypeKey, number> {
  const active = PACK_TYPES.filter((t) => config[t].share > 0);
  const target = Object.fromEntries(active.map((t) => [t, config[t].share * total])) as Record<PackTypeKey, number>;
  const base = Object.fromEntries(
    PACK_TYPES.map((t) => [t, active.includes(t) ? Math.floor(target[t] / config[t].cards) : 0]),
  ) as Record<PackTypeKey, number>;

  let best: { counts: Record<PackTypeKey, number>; cost: number } | null = null;
  const adjustments = Array.from({ length: active.length }, () => 0);

  const search = (index: number, sum: number): void => {
    if (index === active.length) {
      if (sum !== total) return;
      const counts = { ...base };
      let cost = 0;
      active.forEach((t, i) => {
        counts[t] = base[t] + adjustments[i];
        cost += Math.abs(counts[t] * config[t].cards - target[t]);
      });
      if (!best || cost < best.cost) best = { counts, cost };
      return;
    }
    const type = active[index];
    for (let delta = -MAX_ADJUSTMENT; delta <= MAX_ADJUSTMENT; delta++) {
      if (base[type] + delta < 0) continue;
      adjustments[index] = delta;
      search(index + 1, sum + (base[type] + delta) * config[type].cards);
    }
  };
  search(0, 0);

  if (best) return (best as { counts: Record<PackTypeKey, number> }).counts;
  return exactCountsFallback(total, active, config);
}

/**
 * Último recurso del paso 1, si la búsqueda local no encuentra una suma exacta: una
 * combinación cualquiera que sume N (FR-045 garantiza que existe para lotes de jugadores
 * completos). Respeta la partición exacta aunque se aleje de la participación.
 */
function exactCountsFallback(total: number, active: PackTypeKey[], config: PacksConfig): Record<PackTypeKey, number> {
  const previous = Array.from<PackTypeKey | null>({ length: total + 1 }).fill(null);
  const reachable = Array.from({ length: total + 1 }, () => false);
  reachable[0] = true;
  for (let sum = 1; sum <= total; sum++) {
    for (const type of active) {
      const cards = config[type].cards;
      if (cards <= sum && reachable[sum - cards]) {
        reachable[sum] = true;
        previous[sum] = type;
        break;
      }
    }
  }
  if (!reachable[total]) {
    throw new Error(`no hay combinación de sobres que reparta exactamente ${total} tokens`);
  }
  const counts = Object.fromEntries(PACK_TYPES.map((t) => [t, 0])) as Record<PackTypeKey, number>;
  for (let sum = total; sum > 0; ) {
    const type = previous[sum]!;
    counts[type]++;
    sum -= config[type].cards;
  }
  return counts;
}

/**
 * Paso 2: cartas de cada rareza por tipo. IPF sobre la semilla `cupos × probabilidades`: alterna
 * escalar filas (cupos de cada tipo) y columnas (tokens de cada rareza) hasta converger. Una
 * celda con probabilidad 0 queda en 0 y una positiva queda positiva (FR-014), salvo que eso
 * haga imposible repartir: entonces esa fila o columna se siembra uniforme.
 */
export function planRarityMatrix(
  slots: Record<PackTypeKey, number>,
  supply: Record<Rarity, number>,
  config: PacksConfig,
): Record<PackTypeKey, Record<Rarity, number>> {
  const types = PACK_TYPES.filter((t) => slots[t] > 0);
  const rarities = RARITY_ORDER.filter((r) => supply[r] > 0);

  const seed: Record<string, Record<string, number>> = {};
  for (const t of types) {
    seed[t] = {};
    for (const r of rarities) seed[t][r] = slots[t] * config[t].probabilities[r];
  }
  // Sin ningún tipo que acepte una rareza disponible, o sin rareza disponible para un tipo, el
  // reparto exacto sería imposible: se siembra uniforme.
  for (const r of rarities) {
    if (types.every((t) => seed[t][r] === 0)) for (const t of types) seed[t][r] = 1;
  }
  for (const t of types) {
    if (rarities.every((r) => seed[t][r] === 0)) for (const r of rarities) seed[t][r] = 1;
  }

  const m = seed;
  for (let iteration = 0; iteration < IPF_MAX_ITERATIONS; iteration++) {
    for (const t of types) {
      const row = rarities.reduce((s, r) => s + m[t][r], 0);
      if (row > 0) for (const r of rarities) m[t][r] *= slots[t] / row;
    }
    let maxError = 0;
    for (const r of rarities) {
      const col = types.reduce((s, t) => s + m[t][r], 0);
      if (col > 0) for (const t of types) m[t][r] *= supply[r] / col;
    }
    for (const t of types) {
      const row = rarities.reduce((s, r) => s + m[t][r], 0);
      maxError = Math.max(maxError, Math.abs(row - slots[t]));
    }
    if (maxError < IPF_TOLERANCE) break;
  }

  return roundPreservingMargins(m, types, rarities, slots, supply);
}

/**
 * Redondeo a enteros que respeta los cupos de cada tipo y los tokens de cada rareza: piso de
 * cada celda y después reparte las unidades que faltan priorizando los mayores restos.
 */
function roundPreservingMargins(
  m: Record<string, Record<string, number>>,
  types: PackTypeKey[],
  rarities: Rarity[],
  slots: Record<PackTypeKey, number>,
  supply: Record<Rarity, number>,
): Record<PackTypeKey, Record<Rarity, number>> {
  const result = Object.fromEntries(PACK_TYPES.map((t) => [t, zeroByRarity()])) as Record<
    PackTypeKey,
    Record<Rarity, number>
  >;
  const rowLeft = { ...slots };
  const colLeft = { ...supply };
  const remainders: { t: PackTypeKey; r: Rarity; rest: number; seeded: boolean }[] = [];

  for (const t of types) {
    for (const r of rarities) {
      const value = Math.max(0, m[t][r]);
      const floor = Math.floor(value + 1e-9);
      result[t][r] = floor;
      rowLeft[t] -= floor;
      colLeft[r] -= floor;
      remainders.push({ t, r, rest: value - floor, seeded: m[t][r] > 0 });
    }
  }

  // Mayores restos primero; las celdas sin semilla, solo si no queda otra.
  remainders.sort((a, b) => Number(b.seeded) - Number(a.seeded) || b.rest - a.rest);
  for (const cell of remainders) {
    if (rowLeft[cell.t] > 0 && colLeft[cell.r] > 0 && (cell.seeded || cell.rest > 0)) {
      result[cell.t][cell.r]++;
      rowLeft[cell.t]--;
      colLeft[cell.r]--;
    }
  }
  // Lo que todavía falte (casos degenerados): esquina noroeste sobre los déficits.
  for (const t of types) {
    for (const r of rarities) {
      const units = Math.min(rowLeft[t], colLeft[r]);
      if (units > 0) {
        result[t][r] += units;
        rowLeft[t] -= units;
        colLeft[r] -= units;
      }
    }
  }
  return result;
}

function groupByRarity(tokens: EligibleToken[]): Record<Rarity, EligibleToken[]> {
  const groups = { common: [], rare: [], epic: [], legendary: [] } as Record<Rarity, EligibleToken[]>;
  for (const token of tokens) groups[token.rarity].push(token);
  return groups;
}

function zeroByRarity(): Record<Rarity, number> {
  return { common: 0, rare: 0, epic: 0, legendary: 0 };
}

/** Fisher–Yates en el lugar. */
function shuffle<T>(items: T[], random: RandomInt): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
}
