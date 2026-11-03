# Feature Specification: Número de carta en todas las cartas

**Feature Branch**: `feat/ranking`

**Created**: 2026-11-01

**Status**: Implemented

**Input**: User description: "En todas las cartas quiero que se vea el número de la carta como en el inventario, por ejemplo Epic 82/100, y sacar Minted 100/100. Revisá que en el mercado no se ve el número de carta."

**Depende de**: `06-home` (carta y Market), `08-sobres` (número de serie) y `09-mercado` (publicaciones).

**Modifica**: `06-home`: la carta deja de mostrar «Minted». `09-mercado` FR-026: el Market deja de mostrar debajo de cada carta la cantidad a la venta, que la API sigue informando. Por convención del proyecto, esas specs no se editan.

## Requirements

- **FR-001**: La carta MUST mostrar la rareza y el número con el formato «Epic 82/100», y MUST NOT mostrar «Minted».
- **FR-002**: Una carta de un token puntual (inventario y apertura de sobres) MUST mostrar el número de ese token.
- **FR-003**: Cada carta del Market MUST mostrar el número de la publicación activa más antigua del jugador, la primera de la lista de su detalle. La respuesta de jugadores MUST informarlo, nulo si el jugador no tiene cartas a la venta.
- **FR-004**: Una carta que no representa un token puntual (Ranking) MUST mostrar solo el total, como «Epic /100»: no se le asigna un número que no le corresponde.
- **FR-005**: El detalle del jugador MUST mostrar las cartas en circulación sobre el total, con la cuenta real de tokens en poder de usuarios (mismo criterio que 13-ranking FR-005), y MUST NOT mostrar el `supply.minted` simulado.

## Assumptions

- **Varias cartas a la venta**: el Market sigue mostrando una carta por jugador. El número es el de la primera publicación, y las demás se ven en el detalle.
- **Spec sin plan**: no agrega entidades ni migraciones, así que no lleva plan ni tareas.
