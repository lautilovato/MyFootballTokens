import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

interface UserMenuProps {
  username: string | null | undefined;
  links: { to: string; label: string }[];
  onLogout: () => void;
}

/**
 * El usuario del encabezado y lo que se desprende de él, entre eso el cierre de sesión
 * (12-menu-principal FR-010). Se cierra al elegir algo, con Escape y con un clic afuera.
 */
export function UserMenu({ username, links, onLogout }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const itemClass = 'block w-full px-4 py-2 text-left text-sm hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none';

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Menú de ${username ?? 'usuario'}`}
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-2 text-slate-200 hover:text-white"
      >
        {username}
        <svg
          viewBox="0 0 12 12"
          aria-hidden="true"
          className={`size-3 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
        >
          <path d="m2 4 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div id={panelId} className="absolute top-full right-0 z-50 mt-3 w-44 overflow-hidden rounded-sm border border-white/10 bg-navy-card py-1 shadow-lg shadow-black/40">
          {links.map(({ to, label }) => (
            <Link key={to} to={to} onClick={() => setOpen(false)} className={`${itemClass} text-slate-200`}>
              {label}
            </Link>
          ))}
          <button type="button" onClick={onLogout} className={`${itemClass} text-error-red`}>
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
