import { useAuth } from '../services/useAuth';

/** Zona protegida minima, para poder verificar FR-020 y la rehidratacion. */
export default function HomePage() {
  const { user, logout } = useAuth();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-navy-deep">
      <h1 className="title-display text-3xl text-neon-blue">MyFootballTokens</h1>
      <p className="text-slate-300">Sesion iniciada como {user?.username}</p>
      <button onClick={logout} className="bevel bg-navy-card px-5 py-2 text-slate-200">
        Cerrar sesion
      </button>
    </main>
  );
}
