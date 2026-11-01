# Feature Specification: Menú Principal

**Feature Branch**: `feat/main-menu`

**Created**: 2026-10-31

**Status**: Implemented

**Input**: User description: "Agregar una page de home, para no entrar directamente al mercado. Cuatro secciones principales, imitando un poco al menú de FIFA: Mercado, Sobres, Ranking (luego se hará una page para esto) y Mi perfil."

**Depende de**: `06-home` (el Market), `08-sobres`, `10-historial-operaciones` (Mi perfil) y `11-admin-panel` (el acceso al panel sigue en el encabezado).

**Modifica**: `06-home`: el Market deja de ser la entrada de la aplicación y pasa de `/` a `/market`. Por convención del proyecto, la spec 06 no se edita.

**Habilita (fuera de alcance acá)**: la pantalla de Ranking.

## Requirements

- **FR-001**: Al iniciar sesión o registrarse, el usuario MUST llegar al menú principal, en la raíz de la aplicación. Sin sesión, MUST ser llevado a iniciar sesión.
- **FR-002**: El Market MUST estar en `/market`, con sus filtros y su jugador seleccionado en la URL como hasta ahora.
- **FR-003**: El menú MUST mostrar cuatro secciones en mosaico, al estilo del menú de FIFA: Mercado como sección destacada, Sobres, Ranking y Mi perfil.
- **FR-004**: Mercado, Sobres y Mi perfil MUST llevar a su pantalla. El encabezado MUST ofrecer un acceso a Mercado, y su logo MUST volver al menú.
- **FR-005**: Ranking MUST verse como «Próximamente» y MUST NOT poder abrirse hasta que exista su pantalla.
- **FR-006**: El menú MUST poder usarse con teclado, con foco visible, y MUST respetar `prefers-reduced-motion`.
- **FR-007**: El menú MUST verse correctamente en pantallas de teléfono, sin desplazamiento horizontal de la página.

**Encabezado** (revisión con el equipo, 2026-10-31)

- **FR-008**: Los accesos a Mercado, Sobres y, para administradores, Admin MUST mostrarse en el encabezado solo fuera de la home, centrados en la pantalla. En la home, Admin MUST seguir disponible desde el menú del usuario.
- **FR-009**: El saldo MUST mostrarse con un ícono de la moneda del juego al lado, y el usuario MUST verse separado del saldo.
- **FR-010**: Un menú que se abre desde el usuario, disponible en todas las pantallas con sesión, MUST ofrecer Mis cartas, Mis operaciones (la pantalla de Mi perfil, que contiene el historial) y Cerrar sesión. MUST cerrarse al elegir algo, con Escape y con un clic afuera.

## Assumptions

- **Solo frontend**: no cambia el backend ni los datos.
- **Sin direcciones viejas**: `/` pasa a ser el menú. Un enlace guardado a `/?...` con filtros del Market cae en el menú, porque la aplicación todavía no está publicada.
- **Inventario y Admin**: no son secciones del menú principal. Inventario está en el menú del usuario, y Admin en el encabezado fuera de la home.
- **Spec sin plan**: es un cambio chico de una pantalla, sin datos ni decisiones de arquitectura, así que no lleva plan ni tareas.
