import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface AdminBarDatum {
  label: string;
  value: number;
  /** Color de la barra, como variable de la paleta. */
  color?: string;
}

interface AdminBarChartProps {
  title: string;
  data: AdminBarDatum[];
  /** Encabezado de la columna de valores en la tabla. */
  valueLabel: string;
  empty: string;
}

const AXIS_TICK = { fill: '#94a3b8', fontSize: 12 };
const TOOLTIP_STYLE = { backgroundColor: 'var(--color-navy)', border: '1px solid rgb(255 255 255 / 0.1)', color: '#e8eefc' };
const TOOLTIP_ITEM_STYLE = { color: '#e8eefc' };

/**
 * Barras por categoría (11-admin-panel US3). La tabla es la alternativa en texto: los datos no
 * dependen de la forma ni del color de las barras (FR-028, constitución §2).
 */
export function AdminBarChart({ title, data, valueLabel, empty }: AdminBarChartProps) {
  const hasData = data.some((datum) => datum.value > 0);

  return (
    <figure className="bevel flex min-w-0 flex-col gap-3 bg-navy-card p-4">
      <figcaption className="title-display text-sm text-slate-200">{title}</figcaption>

      {hasData ? (
        <div className="h-48 w-full" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
              <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} stroke="#334155" />
              <YAxis type="category" dataKey="label" width={96} tick={AXIS_TICK} stroke="#334155" />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                cursor={{ fill: 'rgb(255 255 255 / 0.05)' }}
                formatter={(value) => [value, valueLabel]}
              />
              <Bar dataKey="value" maxBarSize={28} radius={[0, 2, 2, 0]} isAnimationActive={false}>
                {data.map((datum) => (
                  <Cell key={datum.label} fill={datum.color ?? 'var(--color-neon-blue)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-sm text-slate-400">{empty}</p>
      )}

      <table className="w-full text-sm">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr className="text-left text-xs text-slate-400">
            <th scope="col" className="font-normal">
              Categoría
            </th>
            <th scope="col" className="text-right font-normal">
              {valueLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((datum) => (
            <tr key={datum.label} className="border-t border-white/5">
              <th scope="row" className="py-1 text-left font-normal text-slate-300">
                {datum.label}
              </th>
              <td className="py-1 text-right text-slate-100">{datum.value.toLocaleString('es-AR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
