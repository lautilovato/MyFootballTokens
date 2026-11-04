interface AdminStatCardProps {
  label: string;
  value: string;
  hint?: string;
  /** Depende del período elegido (11-admin-panel FR-037). */
  inPeriod?: boolean;
}

/** Un número del panel, con la marca de si depende del período. */
export function AdminStatCard({ label, value, hint, inPeriod = false }: AdminStatCardProps) {
  return (
    <div className="bevel flex min-w-0 flex-col gap-1 bg-navy-card p-4">
      <dt className="flex items-center justify-between gap-2 text-xs text-slate-400">
        <span>{label}</span>
        <span className={`shrink-0 text-[0.65rem] uppercase tracking-wider ${inPeriod ? 'text-neon-blue' : 'text-slate-500'}`}>
          {inPeriod ? 'Período' : 'Hoy'}
        </span>
      </dt>
      <dd className="title-display break-words text-2xl text-slate-100">{value}</dd>
      {hint && <dd className="text-xs text-slate-400">{hint}</dd>}
    </div>
  );
}
