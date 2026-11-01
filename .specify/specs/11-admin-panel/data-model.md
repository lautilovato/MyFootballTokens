# Data Model: Rol de Administrador y Panel de Métricas de la Plataforma

## Cambios persistidos

### `user` (modificada)

| Columna | Tipo | Regla |
|---|---|---|
| `role` | `text not null default 'user'` | CHECK `role in ('user', 'admin')` |

- Migración `Migration20261031120000`: agrega la columna con su default y su CHECK. Las cuentas
  existentes quedan como `user` (FR-001).
- Entidad: `UserRole { USER = 'user', ADMIN = 'admin' }` en `user.entity.ts`.
- El rol solo cambia por el seed o directamente en la base (FR-002).

## Respuesta de autenticación

`UserPublicDto` suma `role` (`user` | `admin`). El payload del JWT no cambia.

## Datos derivados (no se persisten)

La forma completa está en [contracts/admin.openapi.yaml](./contracts/admin.openapi.yaml).

| Bloque | Origen |
|---|---|
| `users` | `user` (solo `role = 'user'`), `pack_opening`, `token_purchase` |
| `cards` | `token.status`, `listing` activas |
| `rarity` | `token` `de_usuario` + `player.world_reputation` |
| `packs` | `pack.status` (estado), `pack_opening` (período) |
| `market` | `token_purchase` |
| `credits` | `credit_movement`, `token_purchase`, suma de `user.credits` |
| `activity` | `pack_opening`, `token_purchase` |
| `reconciliation` | las de arriba, sobre toda la historia |

### Fórmulas

- **Créditos emitidos**: suma de `credit_movement.amount` de tipo `entrega_inicial`.
- **Créditos cobrados**: suma de `-amount` de tipo `compra_sobre` más suma de `token_purchase.price`
  con `seller_id` nulo.
- **Conciliación de créditos**: `emitidos - cobrados = suma de user.credits`, sobre toda la
  historia. `difference` = esperado menos real.
- **Conciliación de cartas**: `difference` = emitidas menos la suma de los cuatro estados.
  `affectedPlayers` = jugadores cuya cantidad de tokens no es 100.

## Validación del período

| Regla | Resultado |
|---|---|
| Sin `from` ni `to` | «Todo» |
| Solo uno de los dos | 422 |
| Fecha que no existe o mal formada | 422 |
| `to` posterior a hoy, en `timezone` | 422 |
| `from` posterior a `to` | 422 |
| `timezone` desconocida | 422 |
| Sin `timezone` | `UTC` |
