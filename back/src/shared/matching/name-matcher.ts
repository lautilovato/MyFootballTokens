/**
 * Matching de nombres por similitud (Jaro-Winkler), reusado por 03-ingesta-stats (jugador
 * WhoScored <-> Player) y 04-team-whoscored-matching (equipo WhoScored <-> Team). Función
 * pura: sin NestJS, sin base de datos — testeable de forma standalone. Vive en
 * /back/src/shared/ porque más de un módulo de dominio la usa (04-team-whoscored-matching
 * research.md #5).
 */

export interface MatchCandidate {
  id: string;
  fullName: string;
}

export interface MatchResult {
  candidate: MatchCandidate;
  similarity: number;
}

const TIE_EPSILON = 0.01;

// Letras que NFD no descompone en base + diacrítico (no son "letra con acento", son letras
// propias) pero que sí aparecen en nombres reales de jugadores (ej. "Ødegaard").
const NON_DECOMPOSING_LETTERS: Record<string, string> = {
  ø: 'o',
  Ø: 'o',
  æ: 'ae',
  Æ: 'ae',
  œ: 'oe',
  Œ: 'oe',
  ð: 'd',
  Ð: 'd',
  þ: 'th',
  Þ: 'th',
  ß: 'ss',
  ł: 'l',
  Ł: 'l',
};

export function normalizeName(name: string): string {
  const withMappedLetters = name.replace(
    /[øØæÆœŒðÐþÞßłŁ]/g,
    (ch) => NON_DECOMPOSING_LETTERS[ch] ?? ch,
  );
  return withMappedLetters
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Similitud Jaro-Winkler entre 0 y 1 (research.md #6). */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matchDistance = Math.max(Math.floor(Math.max(a.length, b.length) / 2) - 1, 0);
  const aMatches = Array.from<boolean>({ length: a.length }).fill(false);
  const bMatches = Array.from<boolean>({ length: b.length }).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  transpositions = transpositions / 2;

  const jaro = (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3;

  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] !== b[i]) break;
    prefix++;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Devuelve el mejor candidato por encima de `threshold`, o `null` si no hay ninguno o si
 * hay un empate entre los dos mejores (spec.md §4.2) que no se puede desempatar de forma
 * confiable con los datos disponibles en el listado de plantel de WhoScored (sin fecha de
 * nacimiento) — en ese caso, mejor no matchear (spec.md §4.3: "mejor no tener el dato que
 * vincularlo mal") y dejarlo para revisión manual.
 */
export function findBestMatch(
  whoScoredName: string,
  candidates: MatchCandidate[],
  threshold: number,
): MatchResult | null {
  const normalizedTarget = normalizeName(whoScoredName);

  const scored = candidates
    .map((candidate) => ({
      candidate,
      similarity: jaroWinkler(normalizedTarget, normalizeName(candidate.fullName)),
    }))
    .sort((a, b) => b.similarity - a.similarity);

  const best = scored[0];
  if (!best || best.similarity < threshold) return null;

  const runnerUp = scored[1];
  if (runnerUp && best.similarity - runnerUp.similarity < TIE_EPSILON) return null;

  return best;
}
