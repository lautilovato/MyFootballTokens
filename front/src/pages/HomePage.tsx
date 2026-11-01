import { useCredits } from '../app/useCredits';
import { AppHeader } from '../components/AppHeader';
import { MenuTile } from '../components/MenuTile';
import { useAuth } from '../services/useAuth';

const ICON_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  className: 'size-full',
} as const;

const MarketIcon = (
  <svg {...ICON_PROPS}>
    <path d="M3 3v18h18" />
    <path d="m7 15 4-4 3 3 6-7" />
    <path d="M16 7h4v4" />
  </svg>
);

const PacksIcon = (
  <svg {...ICON_PROPS}>
    <path d="M6 2h12l1 3-1 3v11l1 3H5l1-3V8L5 5z" />
    <path d="M6 8h12" />
    <path d="m12 11 1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.2-2.4 1.2.5-2.6-1.9-1.8 2.6-.4z" />
  </svg>
);

const RankingIcon = (
  <svg {...ICON_PROPS}>
    <path d="M8 21h8" />
    <path d="M12 17v4" />
    <path d="M7 4h10v6a5 5 0 0 1-10 0z" />
    <path d="M7 6H4v2a3 3 0 0 0 3 3" />
    <path d="M17 6h3v2a3 3 0 0 1-3 3" />
  </svg>
);

const ProfileIcon = (
  <svg {...ICON_PROPS}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);

/**
 * Menú principal (12-menu-principal): la entrada a la aplicación, con sus cuatro secciones en
 * mosaico, al estilo del menú de FIFA. Ranking todavía no tiene pantalla (FR-005).
 */
export default function HomePage() {
  const { user, logout } = useAuth();
  const { balance } = useCredits();

  return (
    <main className="flex min-h-screen flex-col bg-navy-deep text-slate-200">
      <AppHeader username={user?.username} balance={balance} onLogout={logout} isAdmin={user?.role === 'admin'} />

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 sm:p-6">
        <h1 className="title-display text-2xl text-slate-100">Menú principal</h1>

        <nav aria-label="Menú principal" className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-2">
          <MenuTile
            to="/market"
            title="Mercado"
            description="Comprá y vendé cartas de jugadores a su cotización."
            icon={MarketIcon}
            accent="blue"
            featured
            className="sm:col-span-2 lg:row-span-2 lg:min-h-[28rem]"
          />
          <MenuTile
            to="/packs"
            title="Sobres"
            description="Abrí sobres y sumá cartas nuevas."
            icon={PacksIcon}
            accent="gold"
            className="sm:col-span-2"
          />
          <MenuTile title="Ranking" description="Mirá cómo te ubicás entre los demás jugadores." icon={RankingIcon} accent="violet" />
          <MenuTile to="/profile" title="Mi perfil" description="Tu saldo y tu historial de operaciones." icon={ProfileIcon} accent="green" />
        </nav>
      </div>
    </main>
  );
}
