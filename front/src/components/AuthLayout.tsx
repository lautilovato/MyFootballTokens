import type { ReactNode } from 'react';

/**
 * Contenedor que emula una tarjeta coleccionable: esquinas biseladas por
 * clip-path, fondo oscuro y aura neon azul (FR-023, FR-024). Los titulos usan
 * la tipografia condensada en negrita (FR-025).
 */
export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-navy-deep px-4 py-10">
      <section className="bevel card-glow w-full max-w-md bg-navy p-8 sm:p-10">
        <h1 className="title-display mb-8 text-3xl text-neon-blue sm:text-4xl">{title}</h1>
        {children}
      </section>
    </main>
  );
}
