import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ActivityBucket, ActivityUnit } from '../services/admin.service';

interface AdminActivityChartProps {
  unit: ActivityUnit;
  buckets: ActivityBucket[];
}

const UNIT_LABEL: Record<ActivityUnit, string> = { day: 'por día', week: 'por semana', month: 'por mes' };
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const AXIS_TICK = { fill: '#94a3b8', fontSize: 12 };
const TOOLTIP_STYLE = { backgroundColor: 'var(--color-navy)', border: '1px solid rgb(255 255 255 / 0.1)', color: '#e8eefc' };

/** `2026-10-05` → `5 oct`; por mes, `oct 2026`. */
export function bucketLabel(start: string, unit: ActivityUnit): string {
  const [year, month, day] = start.split('-').map(Number);
  return unit === 'month' ? `${MONTHS[month - 1]} ${year}` : `${day} ${MONTHS[month - 1]}`;
}

/**
 * Aperturas y ventas a lo largo del período (11-admin-panel US4, FR-022). La tabla, desplegable
 * porque un período largo tiene muchos tramos, es la alternativa en texto (FR-028).
 */
export function AdminActivityChart({ unit, buckets }: AdminActivityChartProps) {
  const title = `Actividad ${UNIT_LABEL[unit]}`;
  const data = buckets.map((bucket) => ({ ...bucket, label: bucketLabel(bucket.start, unit) }));
  const hasActivity = buckets.some((bucket) => bucket.packsOpened > 0 || bucket.sales > 0);

  return (
    <figure className="bevel flex min-w-0 flex-col gap-3 bg-navy-card p-4">
      <figcaption className="title-display text-sm text-slate-200">{title}</figcaption>

      {hasActivity ? (
        <div className="h-64 w-full" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} stroke="rgb(255 255 255 / 0.06)" />
              <XAxis dataKey="label" tick={AXIS_TICK} stroke="#334155" minTickGap={16} />
              <YAxis allowDecimals={false} width={36} tick={AXIS_TICK} stroke="#334155" />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgb(255 255 255 / 0.05)' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="packsOpened" name="Sobres abiertos" fill="var(--color-gold-bright)" maxBarSize={28} isAnimationActive={false} />
              <Bar dataKey="sales" name="Ventas" fill="var(--color-neon-blue)" maxBarSize={28} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-sm text-slate-400">No hubo actividad en este período.</p>
      )}

      {buckets.length > 0 && (
        <details className="text-sm text-slate-300">
          <summary className="cursor-pointer text-xs text-slate-400">Ver los datos</summary>
          <div className="mt-2 max-h-56 overflow-y-auto">
            <table className="w-full">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr className="text-left text-xs text-slate-400">
                  <th scope="col" className="font-normal">
                    Desde
                  </th>
                  <th scope="col" className="text-right font-normal">
                    Sobres abiertos
                  </th>
                  <th scope="col" className="text-right font-normal">
                    Ventas
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.start} className="border-t border-white/5">
                    <th scope="row" className="py-1 text-left font-normal">
                      {row.label}
                    </th>
                    <td className="py-1 text-right">{row.packsOpened}</td>
                    <td className="py-1 text-right">{row.sales}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </figure>
  );
}
