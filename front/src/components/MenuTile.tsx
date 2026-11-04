import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export type MenuTileAccent = 'blue' | 'gold' | 'violet' | 'green';

interface MenuTileProps {
  title: string;
  description: string;
  icon: ReactNode;
  accent: MenuTileAccent;
  /** Sin destino, la sección todavía no existe: se ve, pero no se puede abrir. */
  to?: string;
  /** La sección principal: título más grande. */
  featured?: boolean;
  className?: string;
}

/** Clases completas: Tailwind solo genera las que encuentra escritas en el código. */
const ACCENTS: Record<MenuTileAccent, { glow: string; icon: string; bar: string }> = {
  blue: { glow: 'from-neon-blue/30', icon: 'text-neon-blue', bar: 'bg-neon-blue' },
  gold: { glow: 'from-gold-bright/25', icon: 'text-gold-bright', bar: 'bg-gold-bright' },
  violet: { glow: 'from-violet-400/25', icon: 'text-violet-300', bar: 'bg-violet-400' },
  green: { glow: 'from-neon-green/25', icon: 'text-neon-green', bar: 'bg-neon-green' },
};

/**
 * Una sección del menú principal, al estilo de los mosaicos del menú de FIFA (12-menu-principal).
 * El foco va adentro porque `bevel` recorta todo lo que sale del borde.
 */
export function MenuTile({ title, description, icon, accent, to, featured = false, className = '' }: MenuTileProps) {
  const colors = ACCENTS[accent];
  const content = (
    <>
      <span aria-hidden="true" className={`absolute inset-0 bg-gradient-to-br ${colors.glow} to-transparent`} />
      <span
        aria-hidden="true"
        className={`absolute -right-6 -bottom-6 ${colors.icon} opacity-20 transition-transform duration-300 group-hover:scale-110 group-focus-visible:scale-110 motion-reduce:transition-none ${
          featured ? 'size-72' : 'size-40'
        }`}
      >
        {icon}
      </span>

      <span className="relative flex h-full flex-col justify-end gap-1 p-6">
        {!to && (
          <span className="absolute top-5 right-6 text-[0.65rem] tracking-widest text-slate-300 uppercase">Próximamente</span>
        )}
        <span className={`title-display text-slate-100 ${featured ? 'text-5xl' : 'text-3xl'}`}>{title}</span>
        <span className="max-w-sm text-sm text-slate-300">{description}</span>
      </span>

      <span
        aria-hidden="true"
        className={`absolute bottom-0 left-0 h-1 w-full origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100 group-focus-visible:scale-x-100 motion-reduce:transition-none ${colors.bar}`}
      />
    </>
  );

  const base = `group bevel relative block min-h-44 overflow-hidden bg-navy-card ${className}`;

  if (!to) {
    return (
      <div aria-disabled="true" className={`${base} opacity-70`}>
        {content}
      </div>
    );
  }

  return (
    <Link
      to={to}
      className={`${base} outline-none transition-[filter] duration-300 hover:brightness-125 focus-visible:ring-2 focus-visible:ring-neon-blue focus-visible:ring-inset focus-visible:brightness-125 motion-reduce:transition-none`}
    >
      {content}
    </Link>
  );
}
