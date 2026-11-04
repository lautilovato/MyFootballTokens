import type { TheSportsDbCandidate } from '../../adapters/the-sports-db/the-sports-db.adapter';
import { jaroWinkler, normalizeName, sharesSurname } from '../../shared/matching/name-matcher';

/**
 * Cruce jugador <-> candidato de TheSportsDB. Función pura: sin NestJS ni red.
 *
 * La búsqueda de TheSportsDB es por texto y trae homónimos y retirados (buscar "Pedri" devuelve
 * a "Pedrinho"), así que el nombre solo no alcanza. Un candidato se acepta únicamente si el
 * nombre coincide Y hay otra señal que lo corrobore: la misma fecha de nacimiento o el mismo
 * club. Ante la duda no se vincula — mejor sin imagen que con la de otra persona.
 */

export interface PlayerToMatch {
  fullName: string;
  /** `YYYY-MM-DD`, o `null` si Football-Data no lo informó. */
  dateOfBirth: string | null;
  teamName: string;
}

const TIE_EPSILON = 0.01;

/**
 * Texto a enviar al buscador de TheSportsDB. No encuentra nombres con apóstrofe: "Ibrahim
 * M'Baye" no devuelve nada, pero "Ibrahim Mbaye" sí. Los acentos, en cambio, los tolera.
 */
export function toSearchTerm(name: string): string {
  return name.replace(/['’‘`´]/g, '').replace(/\s+/g, ' ').trim();
}

// Prefijos y sufijos de razón social que cada fuente escribe distinto ("Coventry City FC" vs
// "Coventry City", "Real Sociedad de Fútbol" vs "Real Sociedad"). Se descartan a ambos lados.
const CLUB_NOISE = new Set([
  'fc', 'cf', 'afc', 'ssc', 'sc', 'rcd', 'ud', 'cd', 'rc', 'as', 'ac', 'us', 'fk', 'sad',
  'club', 'de', 'del', 'la', 'le', 'les', 'calcio', 'futbol', 'football',
]);

const CLUB_TOKEN_SIMILARITY = 0.9;

function clubTokens(name: string): string[] {
  return normalizeName(name)
    .split(' ')
    .filter((token) => token && !CLUB_NOISE.has(token) && !/^\d+$/.test(token));
}

/**
 * Dos nombres de club coinciden si todas las palabras de uno aparecen, con tolerancia, en el
 * otro: "Racing Club de Lens" ⊇ "Lens", "Hamburger SV" ~ "Hamburg SV".
 *
 * Se compara palabra por palabra y no el nombre entero: Jaro-Winkler premia tanto el prefijo
 * común que "Manchester City" y "Manchester United" salen casi iguales.
 */
export function clubsMatch(a: string, b: string): boolean {
  const tokensA = clubTokens(a);
  const tokensB = clubTokens(b);
  if (tokensA.length === 0 || tokensB.length === 0) return false;

  const coveredBy = (inner: string[], outer: string[]) =>
    inner.every((token) => outer.some((other) => jaroWinkler(token, other) >= CLUB_TOKEN_SIMILARITY));

  return coveredBy(tokensA, tokensB) || coveredBy(tokensB, tokensA);
}

/** El mejor candidato que supera nombre + corroboración, o `null` si ninguno o si hay empate. */
export function pickBestCandidate(
  player: PlayerToMatch,
  candidates: TheSportsDbCandidate[],
  threshold: number,
): TheSportsDbCandidate | null {
  const target = normalizeName(player.fullName);

  const ranked = candidates
    .filter((candidate) => candidate.isSoccer)
    .map((candidate) => ({
      candidate,
      similarity: jaroWinkler(target, normalizeName(candidate.name)),
      dateMatch: player.dateOfBirth !== null && candidate.dateBorn === player.dateOfBirth,
      clubMatch: candidate.team !== null && clubsMatch(player.teamName, candidate.team),
    }))
    .filter(
      (row) =>
        row.similarity >= threshold &&
        sharesSurname(player.fullName, row.candidate.name) &&
        (row.dateMatch || row.clubMatch),
    )
    .sort((a, b) => Number(b.dateMatch) - Number(a.dateMatch) || b.similarity - a.similarity);

  const best = ranked[0];
  if (!best) return null;

  const runnerUp = ranked[1];
  if (
    runnerUp &&
    runnerUp.dateMatch === best.dateMatch &&
    best.similarity - runnerUp.similarity < TIE_EPSILON
  ) {
    return null;
  }

  return best.candidate;
}
