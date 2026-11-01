import { Link, NavLink } from 'react-router-dom';

interface AppHeaderProps {
  username: string | null | undefined;
  /** Nulo mientras no se conoce. */
  balance: number | null;
  onLogout: () => void;
  /** Muestra el acceso al panel (11-admin-panel FR-012). */
  isAdmin?: boolean;
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  `bevel px-4 py-1 text-sm ${isActive ? 'bg-neon-blue/20 text-neon-blue' : 'bg-navy-card text-slate-200'}`;

/**
 * Encabezado de las pantallas con sesión (08-sobres FR-052, FR-053): accesos a Sobres,
 * Inventario y Mi perfil (10-historial-operaciones FR-001), saldo, usuario y cierre de sesión. Presentacional: recibe el saldo, no lo pide.
 */
export function AppHeader({ username, balance, onLogout, isAdmin = false }: AppHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
      <Link to="/" className="title-display text-2xl text-neon-blue">
        MyFootballTokens
      </Link>
      <nav className="flex flex-wrap items-center gap-2" aria-label="Secciones">
        <NavLink to="/packs" className={navClass}>
          Sobres
        </NavLink>
        <NavLink to="/inventory" className={navClass}>
          Mis cartas
        </NavLink>
        <NavLink to="/profile" className={navClass}>
          Mi perfil
        </NavLink>
        {isAdmin && (
          <NavLink to="/admin" className={navClass}>
            Admin
          </NavLink>
        )}
      </nav>
      <div className="flex items-center gap-4 text-sm">
        <span className="font-semibold text-gold-bright" aria-label="Saldo">
          {balance === null ? '—' : `${balance.toLocaleString('es-AR')} créditos`}
        </span>
        <span className="text-slate-400">{username}</span>
        <button onClick={onLogout} className="bevel bg-navy-card px-4 py-1 text-slate-200">
          Cerrar sesion
        </button>
      </div>
    </header>
  );
}
