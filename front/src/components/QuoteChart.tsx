import type { KeyboardEvent, MouseEvent } from 'react';
import type { ApiQuote } from '../services/quotes.service';
import { buildSeries, changePoints, markersToDraw, seriesId, strategyLabel } from '../services/quote.mapper';
import type { MarkerShape, SeriesStyle } from '../services/quote.mapper';

interface QuoteChartProps {
  /** Del más viejo al más nuevo. */
  quotes: ApiQuote[];
  playerName: string;
  selectedIndex: number | null;
  /** Cotización a resaltar, por ejemplo la vigente en una operación o en una fecha buscada. */
  highlightIndex?: number | null;
  onSelect: (index: number) => void;
}

const WIDTH = 640;
const HEIGHT = 300;
const MARGIN = { top: 14, right: 16, bottom: 34, left: 60 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;
const X_TICKS = 5;
const Y_TICKS = 5;

const formatCredits = (value: number) => value.toLocaleString('es-AR');
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });

/** Marcador de una serie: círculo, cuadrado, triángulo o rombo, centrado en (x, y). */
function Marker({ shape, x, y, size, color }: { shape: MarkerShape; x: number; y: number; size: number; color: string }) {
  const style = { fill: color, stroke: 'var(--color-navy-deep)', strokeWidth: 1 };
  switch (shape) {
    case 'square':
      return <rect x={x - size} y={y - size} width={size * 2} height={size * 2} style={style} />;
    case 'triangle':
      return <polygon points={`${x},${y - size * 1.2} ${x - size * 1.1},${y + size} ${x + size * 1.1},${y + size}`} style={style} />;
    case 'diamond':
      return <polygon points={`${x},${y - size * 1.3} ${x + size * 1.3},${y} ${x},${y + size * 1.3} ${x - size * 1.3},${y}`} style={style} />;
    default:
      return <circle cx={x} cy={y} r={size} style={style} />;
  }
}

/**
 * Gráfico de la serie completa de cotizaciones de un jugador (10-historial-operaciones FR-021 a
 * FR-024). SVG propio, sin librería de gráficos (constitución §2, research #7).
 *
 * - Ejes con fechas abajo y precios a la izquierda; el eje horizontal es proporcional al tiempo.
 * - Cada estrategia+versión tiene un color y una forma de marcador, con leyenda. Los cambios
 *   se marcan además con una línea vertical punteada, así el significado no depende del color.
 * - Con muchas cotizaciones solo llevan marcador los cambios, la elegida y la resaltada.
 * - Un solo tab stop: con el gráfico enfocado, las flechas mueven la selección. Clic o toque
 *   eligen la cotización más cercana en el eje horizontal.
 */
export function QuoteChart({ quotes, playerName, selectedIndex, highlightIndex = null, onSelect }: QuoteChartProps) {
  if (quotes.length === 0) return null;

  const times = quotes.map((q) => new Date(q.calculatedAt).getTime());
  const prices = quotes.map((q) => q.price);
  const tMin = times[0];
  const tMax = times[times.length - 1];
  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);
  const pad = Math.max((rawMax - rawMin) * 0.08, 1);
  const pMin = Math.max(rawMin - pad, 0);
  const pMax = rawMax + pad;

  const xOf = (time: number) => MARGIN.left + (tMax === tMin ? PLOT_W / 2 : ((time - tMin) / (tMax - tMin)) * PLOT_W);
  const yOf = (price: number) => MARGIN.top + PLOT_H - ((price - pMin) / (pMax - pMin)) * PLOT_H;

  const series = buildSeries(quotes);
  const styleOf = (index: number): SeriesStyle => series.find((s) => s.id === seriesId(quotes[index].strategy))!;
  const changes = changePoints(quotes);
  const markers = markersToDraw(quotes, selectedIndex, highlightIndex);

  const line = quotes.map((q, i) => `${xOf(times[i]).toFixed(1)},${yOf(q.price).toFixed(1)}`).join(' ');
  const yTicks = [...new Set(Array.from({ length: Y_TICKS }, (_, i) => Math.round(pMin + ((pMax - pMin) * i) / (Y_TICKS - 1))))];
  const xTicks = tMax === tMin ? [tMin] : Array.from({ length: X_TICKS }, (_, i) => tMin + ((tMax - tMin) * i) / (X_TICKS - 1));

  const nearest = (pointerX: number): number => {
    let best = 0;
    for (let i = 1; i < times.length; i++) {
      if (Math.abs(xOf(times[i]) - pointerX) < Math.abs(xOf(times[best]) - pointerX)) best = i;
    }
    return best;
  };

  const handleClick = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    onSelect(nearest(((event.clientX - rect.left) / rect.width) * WIDTH));
  };

  const handleKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const current = selectedIndex ?? quotes.length - 1;
    const target =
      event.key === 'ArrowLeft'
        ? current - 1
        : event.key === 'ArrowRight'
          ? current + 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? quotes.length - 1
              : null;
    if (target === null) return;
    event.preventDefault();
    onSelect(Math.min(Math.max(target, 0), quotes.length - 1));
  };

  const current = selectedIndex !== null ? quotes[selectedIndex] : null;
  const valueText = current
    ? `${formatDate(current.calculatedAt)}, ${formatCredits(current.price)} créditos, ${strategyLabel(current.strategy)}`
    : 'Sin cotización elegida';

  return (
    <figure>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full cursor-crosshair rounded border border-white/10 bg-navy-deep/60 text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-neon-blue"
        role="slider"
        tabIndex={0}
        aria-label={`Cotizaciones de ${playerName}, ${quotes.length} en total. Con las flechas elegís una cotización.`}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={quotes.length - 1}
        aria-valuenow={selectedIndex ?? quotes.length - 1}
        aria-valuetext={valueText}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        {yTicks.map((tick) => (
          <g key={`y${tick}`}>
            <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={yOf(tick)} y2={yOf(tick)} stroke="currentColor" strokeOpacity={0.15} />
            <text x={MARGIN.left - 8} y={yOf(tick) + 4} textAnchor="end" fontSize={11} fill="currentColor">
              {formatCredits(tick)}
            </text>
          </g>
        ))}
        {xTicks.map((tick, i) => (
          <text
            key={`x${tick}`}
            x={xOf(tick)}
            y={HEIGHT - 10}
            // Las fechas de los extremos se alinean hacia adentro: centradas, la última se cortaría.
            textAnchor={xTicks.length === 1 ? 'middle' : i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
            fontSize={11}
            fill="currentColor"
          >
            {formatDate(new Date(tick).toISOString())}
          </text>
        ))}

        {/* Cambios de estrategia o versión: línea vertical punteada. */}
        {changes.map((index) => (
          <line
            key={`c${index}`}
            data-testid="strategy-change"
            x1={xOf(times[index])}
            x2={xOf(times[index])}
            y1={MARGIN.top}
            y2={MARGIN.top + PLOT_H}
            stroke="currentColor"
            strokeDasharray="4 4"
            strokeOpacity={0.5}
          />
        ))}

        <polyline points={line} fill="none" stroke="currentColor" strokeWidth={1.5} strokeOpacity={0.8} />

        {highlightIndex !== null && quotes[highlightIndex] && (
          <circle
            data-testid="highlight"
            cx={xOf(times[highlightIndex])}
            cy={yOf(prices[highlightIndex])}
            r={11}
            fill="none"
            stroke="var(--color-gold-bright)"
            strokeWidth={2}
            strokeDasharray="3 3"
          />
        )}
        {selectedIndex !== null && quotes[selectedIndex] && (
          <line
            x1={xOf(times[selectedIndex])}
            x2={xOf(times[selectedIndex])}
            y1={MARGIN.top}
            y2={MARGIN.top + PLOT_H}
            stroke="var(--color-neon-blue)"
            strokeOpacity={0.6}
          />
        )}

        {markers.map((index) => {
          const style = styleOf(index);
          return (
            <Marker
              key={`m${index}`}
              shape={style.shape}
              color={style.color}
              x={xOf(times[index])}
              y={yOf(prices[index])}
              size={index === selectedIndex ? 6 : 4}
            />
          );
        })}
      </svg>

      <figcaption>
        <ul aria-label="Leyenda de estrategias" className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-300">
          {series.map((style) => (
            <li key={style.id} className="flex items-center gap-1.5">
              <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden="true">
                <Marker shape={style.shape} color={style.color} x={7} y={7} size={4.5} />
              </svg>
              {style.label}
            </li>
          ))}
          {changes.length > 0 && (
            <li className="text-slate-500">Las líneas punteadas marcan un cambio de estrategia o de versión.</li>
          )}
        </ul>
      </figcaption>
    </figure>
  );
}
