import type { ReactNode } from 'react';

/**
 * Contenedor que emula una tarjeta coleccionable: esquinas biseladas por
 * clip-path, fondo oscuro y aura neon azul (FR-023, FR-024). Los titulos usan
 * la tipografia condensada en negrita (FR-025). De fondo, la Bombonera desde arriba, oscurecida
 * para que el formulario se lea bien. Su licencia (CC BY-SA 4.0) exige el crédito del pie.
 */
export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main
      data-full-bleed
      className="relative flex min-h-screen items-center justify-center bg-navy-deep bg-[linear-gradient(rgb(6_11_24/0.35),rgb(6_11_24/0.55)),url(/auth-stadium.jpg)] bg-cover bg-center px-4 py-10"
    >
      <section className="bevel card-glow w-full max-w-md bg-navy p-8 sm:p-10">
        <h1 className="title-display mb-8 text-3xl text-neon-blue sm:text-4xl">{title}</h1>
        {children}
      </section>
      <p className="absolute right-3 bottom-2 text-xs text-slate-300">
        Foto:{' '}
        <a
          href="https://commons.wikimedia.org/wiki/File:Vista_a%C3%A9rea_del_Estadio_Alberto_J._Armando_%22La_Bombonera%22_06.jpg"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          ProtoplasmaKid
        </a>
        ,{' '}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.es" target="_blank" rel="noreferrer" className="underline">
          CC BY-SA 4.0
        </a>
      </p>
    </main>
  );
}
