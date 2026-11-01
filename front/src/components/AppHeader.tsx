import { Link, NavLink, useLocation } from 'react-router-dom';
import { CoinIcon } from './CoinIcon';
import { UserMenu } from './UserMenu';

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
 * Encabezado de las pantallas con sesión (08-sobres FR-052, FR-053): el logo vuelve al menú
 * principal, accesos a Mercado y Sobres, saldo y usuario. Lo personal, como las cartas y las
 * operaciones (10-historial-operaciones FR-001), está en el menú del usuario. Presentacional:
 * recibe el saldo, no lo pide.
 *
 * En la home las secciones son los mosaicos, así que los accesos no se muestran (12-menu-principal
 * FR-008). Por eso ahí el panel pasa al menú del usuario, para que siga a mano.
 *
 * Con la barra en una sola línea, las dos columnas iguales dejan los accesos centrados en la
 * pantalla, sin importar el ancho del logo ni del saldo. Más angosta, los accesos van abajo.
 */
export function AppHeader({ username, balance, onLogout, isAdmin = false }: AppHeaderProps) {
  const isHome = useLocation().pathname === '/';
  const menuLinks = [
    { to: '/inventory', label: 'Mis cartas' },
    { to: '/profile', label: 'Mis operaciones' },
    ...(isHome && isAdmin ? [{ to: '/admin', label: 'Admin' }] : []),
  ];

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4 lg:grid lg:grid-cols-[1fr_auto_1fr]">
      <Link to="/" className="title-display justify-self-start text-2xl text-neon-blue">
        MyFootballTokens
      </Link>
      {!isHome && (
        <nav className="order-last flex w-full flex-wrap items-center justify-center gap-2 lg:order-none lg:w-auto" aria-label="Secciones">
          <NavLink to="/market" className={navClass}>
            Mercado
          </NavLink>
          <NavLink to="/packs" className={navClass}>
            Sobres
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin" className={navClass}>
              Admin
            </NavLink>
          )}
        </nav>
      )}
      {/* A la derecha aunque baje de línea: el menú del usuario abre hacia la izquierda. */}
      <div className="ml-auto flex items-center gap-6 text-sm lg:col-start-3 lg:justify-self-end">
        <span className="flex items-center gap-2 font-semibold text-gold-bright" aria-label="Saldo">
          <CoinIcon />
          {balance === null ? '—' : `${balance.toLocaleString('es-AR')} créditos`}
        </span>
        <div className="border-l border-white/10 pl-6">
          <UserMenu username={username} links={menuLinks} onLogout={onLogout} />
        </div>
      </div>
    </header>
  );
}
