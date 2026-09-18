import type { InputHTMLAttributes } from 'react';
import { FieldError } from './FieldError';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

/** Etiquetas de alto contraste sobre fondo oscuro (FR-025). */
export function Input({ label, error, id, ...rest }: Props) {
  const inputId = id ?? rest.name ?? label;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-semibold tracking-wide text-slate-100">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        className={`bevel bg-navy-card px-4 py-2.5 text-slate-50 outline-none transition
          placeholder:text-slate-500 focus:ring-2 ${
            error ? 'ring-2 ring-error-red' : 'focus:ring-neon-blue'
          }`}
        {...rest}
      />
      <FieldError message={error} />
    </div>
  );
}
