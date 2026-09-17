import type { ButtonHTMLAttributes } from 'react';

/** Accion primaria con acento dorado/metalico (FR-024). */
export function Button({ children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className="bevel title-display bg-gradient-to-b from-gold-bright to-gold px-6 py-3
        text-navy-deep transition hover:brightness-110 disabled:cursor-not-allowed
        disabled:opacity-50"
      {...rest}
    >
      {children}
    </button>
  );
}
