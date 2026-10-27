/**
 * Mapeos puros de las cotizaciones para la interfaz (10-historial-operaciones). Sin DOM ni red.
 */

export interface StrategyRef {
  key: string;
  name: string;
  version: number;
}

/** «Performance v2»: la estrategia con su versión, como se muestra junto a cada cotización. */
export function strategyLabel(strategy: StrategyRef): string {
  return `${strategy.name} v${strategy.version}`;
}

export type MarkerShape = 'circle' | 'square' | 'triangle' | 'diamond';

/** Forma y color con que el gráfico dibuja las cotizaciones de una estrategia+versión. */
export interface SeriesStyle {
  /** Identifica a la estrategia+versión: `performance@2`. */
  id: string;
  label: string;
  color: string;
  shape: MarkerShape;
}

/**
 * Formas en ciclo: el significado de la serie no depende solo del color (FR-024, SC-011). Los
 * colores son los de la paleta del tema, para que sigan el resto de la interfaz.
 */
const SHAPES: MarkerShape[] = ['circle', 'square', 'triangle', 'diamond'];
const COLORS = ['var(--color-neon-blue)', 'var(--color-gold-bright)', 'var(--color-neon-green)', 'var(--color-error-red)'];

/** Con hasta esta cantidad de cotizaciones el gráfico dibuja un marcador en cada una. */
export const MAX_FULL_MARKERS = 60;

export const seriesId = (strategy: StrategyRef): string => `${strategy.key}@${strategy.version}`;

interface WithStrategy {
  strategy: StrategyRef;
}

/**
 * Un estilo por estrategia+versión, en el orden en que aparecen en la serie. Si hay más
 * combinaciones que formas o colores, el ciclo se repite desplazado para no repetir el par.
 */
export function buildSeries(quotes: WithStrategy[]): SeriesStyle[] {
  const styles: SeriesStyle[] = [];
  for (const { strategy } of quotes) {
    const id = seriesId(strategy);
    if (styles.some((s) => s.id === id)) continue;
    const index = styles.length;
    styles.push({
      id,
      label: strategyLabel(strategy),
      color: COLORS[index % COLORS.length],
      shape: SHAPES[(index + Math.floor(index / COLORS.length)) % SHAPES.length],
    });
  }
  return styles;
}

/** Índices donde cambia la estrategia o la versión respecto de la cotización anterior. */
export function changePoints(quotes: WithStrategy[]): number[] {
  const points: number[] = [];
  for (let i = 1; i < quotes.length; i++) {
    if (seriesId(quotes[i].strategy) !== seriesId(quotes[i - 1].strategy)) points.push(i);
  }
  return points;
}

/**
 * Qué cotizaciones llevan marcador. Con pocas, todas. Con muchas, solo la primera, los cambios de
 * estrategia o versión, la elegida y la resaltada: 500 marcas serían ilegibles (spec, casos
 * borde). Toda cotización sigue siendo accesible por la lista y por la búsqueda por fecha.
 */
export function markersToDraw(quotes: WithStrategy[], selectedIndex: number | null, highlightIndex: number | null): number[] {
  if (quotes.length <= MAX_FULL_MARKERS) return quotes.map((_, i) => i);

  const indices = new Set<number>([0, ...changePoints(quotes)]);
  for (const extra of [selectedIndex, highlightIndex]) {
    if (extra !== null && extra >= 0 && extra < quotes.length) indices.add(extra);
  }
  return [...indices].sort((a, b) => a - b);
}
