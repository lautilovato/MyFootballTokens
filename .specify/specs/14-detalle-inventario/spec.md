# Feature Specification: Detalle de una carta en el inventario

**Feature Branch**: `feat/ranking`

**Created**: 2026-11-01

**Status**: Implemented

**Input**: User description: "En Mis cartas, si tocás una carta se puede ver la información detallada como en el mercado, pero en vez de comprar dice vender."

**Depende de**: `06-home` (panel de detalle), `08-sobres` (inventario), `09-mercado` (publicar y retirar) y `10-historial-operaciones` (gráfico completo de cotizaciones).

**Modifica**: `06-home`: el panel de detalle del Market deja de ocupar una columna y pasa a flotar (FR-005). Por convención del proyecto, la spec 06 no se edita.

## Requirements

- **FR-001**: Al tocar una carta del inventario, la pantalla MUST abrir el mismo panel de detalle del Market, con los datos del jugador y su historial de cotizaciones.
- **FR-002**: El panel MUST NOT mostrar el bloque de compra ni las cartas a la venta. En su lugar MUST indicar el número de serie de la carta tocada y ofrecer «Vender», o «Retirar» si ya está a la venta.
- **FR-003**: Vender y retirar desde el panel MUST seguir la misma confirmación que desde la carta (09-mercado FR-037), y el panel MUST mostrar el estado real de la carta al terminar.
- **FR-004**: Cerrar el panel o cambiar de página del inventario MUST ocultarlo.
- **FR-005**: Abrir el panel MUST NOT mover las cartas, ni en el inventario ni en el Market. En desktop se muestra a la derecha y, si no hay lugar al costado, por encima de las cartas.

## Assumptions

- **Controles de la carta**: siguen debajo de cada carta (09-mercado FR-036). «Vender» es la misma acción que «Poner a la venta».
- **Precio**: como en el resto del mercado, la carta se publica a la cotización vigente del jugador; no hay un precio que elegir.
- **Spec sin plan**: reutiliza pantallas y endpoints existentes, sin entidades ni migraciones nuevas, así que no lleva plan ni tareas.
