/** La moneda del juego: acompaña a los créditos. Decorativa: el texto al lado dice el valor. */
export function CoinIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`shrink-0 ${className}`}>
      <circle cx="12" cy="12" r="11" fill="var(--color-gold)" />
      <circle cx="12" cy="12" r="11" fill="none" stroke="var(--color-gold-bright)" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="var(--color-navy-deep)" strokeOpacity="0.45" strokeWidth="1" />
      <path
        d="m12 6.8 1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z"
        fill="var(--color-navy-deep)"
        fillOpacity="0.7"
      />
    </svg>
  );
}
