# Data Model: Mercado de Tokens (Compra y Venta)

**Feature**: `09-mercado` | **Fecha**: 2026-10-20 | Decisiones en [research.md](./research.md)

Dos tablas nuevas (`listing` y `token_purchase`), CHECK ampliados en dos tablas de 08
(`credit_movement` y `token_event`) y ninguna columna nueva en tablas existentes. Todo va en una
migración: `Migration20261020120000.ts`. Las entidades de MikroORM van en
`back/src/infrastructure/database/entities/` (§7).

Convención heredada de 08: la **plataforma no es un usuario** y se representa con un id de
usuario nulo (`seller_id`, `from_owner_id`, `to_owner_id`).

---

## `listing` — Publicación *(nueva)*

Un token puesto a la venta. No tiene precio propio: su precio es `round(player.base_value)` en
cada instante (FR-002, research #2).

| Columna | Tipo | Nulo | Regla |
|---|---|---|---|
| `id` | uuid | no | PK |
| `token_id` | uuid | no | FK `token` |
| `player_id` | uuid | no | FK `player`. Desnormalizado para el Market (research #8) |
| `seller_id` | uuid | sí | FK `user`. Nulo = la plataforma (FR-008) |
| `status` | text | no | `activa` \| `vendida` \| `retirada` |
| `created_at` | timestamptz | no | Fecha de publicación |
| `correlation_id` | varchar(255) | no | De la petición que la creó |
| `closed_at` | timestamptz | sí | Nulo si y solo si `status = 'activa'` |
| `closed_correlation_id` | varchar(255) | sí | De la venta o el retiro que la cerró |

**Restricciones**:
- `listing_status_check`: `status in ('activa', 'vendida', 'retirada')`.
- `listing_closed_check`: `(status = 'activa') = (closed_at is null)` y
  `(closed_at is null) = (closed_correlation_id is null)`.
- `listing_token_active_unique`: índice único parcial `(token_id) where status = 'activa'`. A lo
  sumo una publicación activa por token (FR-004).
- `listing_player_active_index`: `(player_id, created_at, id) where status = 'activa'`. Sirve
  al filtro del Market, al conteo `forSaleCount` y a la lista del detalle ordenada por antigüedad.
- `listing_seller_index`: `(seller_id) where seller_id is not null`.

**Trigger `listing_close_only`** (`before update or delete`):
- `DELETE` → excepción.
- `UPDATE` → solo se permite si `OLD.status = 'activa'`, `NEW.status in ('vendida', 'retirada')`
  y ninguna otra columna cambia salvo `closed_at` y `closed_correlation_id` (FR-030).

**Transiciones**:

```text
           publicar                vender
(ninguna) ─────────▶ activa ─────────────▶ vendida
                       │
                       └──── retirar ─────▶ retirada
```

Volver a publicar un token retirado crea una fila nueva (FR-007).

---

## `token_purchase` — Compra *(nueva, inmutable)*

La compra de una publicación: una carta (FR-010, FR-028).

| Columna | Tipo | Nulo | Regla |
|---|---|---|---|
| `id` | uuid | no | PK |
| `listing_id` | uuid | no | FK `listing`, **único**: una publicación se vende una sola vez (SC-003) |
| `token_id` | uuid | no | FK `token` |
| `player_id` | uuid | no | FK `player` |
| `buyer_id` | uuid | no | FK `user` |
| `seller_id` | uuid | sí | FK `user`. Nulo = la plataforma |
| `accepted_price` | int | no | Precio que confirmó el comprador (FR-013) |
| `price` | int | no | Precio cobrado = cotización vigente del jugador (FR-001) |
| `rarity` | varchar(255) | no | Rareza vigente en el instante |
| `buyer_balance_before` | int | no | |
| `buyer_balance_after` | int | no | |
| `seller_balance_before` | int | sí | Nulo si vende la plataforma |
| `seller_balance_after` | int | sí | Nulo si vende la plataforma |
| `buyer_movement_id` | uuid | no | FK `credit_movement` (`compra_token`) |
| `seller_movement_id` | uuid | sí | FK `credit_movement` (`venta_token`). Nulo si vende la plataforma |
| `correlation_id` | varchar(255) | no | |
| `created_at` | timestamptz | no | |

**Restricciones**:
- `token_purchase_price_check`: `price > 0 and price <= accepted_price`.
- `token_purchase_buyer_balance_check`: `buyer_balance_after >= 0 and buyer_balance_after = buyer_balance_before - price`.
- `token_purchase_seller_check`: o los cuatro campos del vendedor (`seller_id`, saldos y
  movimiento) son nulos, o ninguno lo es y `seller_balance_after = seller_balance_before + price`
  (FR-018: sin comisión).
- `token_purchase_not_self_check`: `seller_id is null or seller_id <> buyer_id` (FR-011).
- Índices: `(buyer_id, created_at desc)` y `(seller_id, created_at desc) where seller_id is not null`,
  para el historial de operaciones (FR-029).
- Trigger `token_purchase_immutable` con la función `forbid_mutation()` de 08.

---

## `credit_movement` *(08, se amplía el CHECK)*

- `credit_movement_type_check`: suma `compra_token` y `venta_token` (FR-020).
- `compra_token`: `amount = -price`, `user_id` = comprador, `reference_type = 'token_purchase'`.
- `venta_token`: `amount = +price`, `user_id` = vendedor, `reference_type = 'token_purchase'`.
- Una compra a la plataforma deja solo el `compra_token`: esos créditos salen de circulación
  (FR-019, FR-021).

Invariante (SC-007), que se verifica en los e2e:
`sum(user.credits) = sum(entrega_inicial) − sum(compra_sobre) − Σ precio de compras a la plataforma`.

---

## `token_event` *(08, se amplía el CHECK)*

- `token_event_type_check`: suma `retiro_de_venta` y `venta` (FR-023).

| Evento | `from_status` → `to_status` | `from_owner_id` → `to_owner_id` | `quote_price` | `reference_type` |
|---|---|---|---|---|
| `puesta_en_venta` (usuario) | `de_usuario` → `de_usuario` | vendedor → vendedor | precio vigente | `listing` |
| `retiro_de_venta` | `de_usuario` → `de_usuario` | vendedor → vendedor | precio vigente | `listing` |
| `venta` (de un usuario) | `de_usuario` → `de_usuario` | vendedor → comprador | precio pagado | `token_purchase` |
| `venta` (de la plataforma) | `en_venta_plataforma` → `de_usuario` | null → comprador | precio pagado | `token_purchase` |

El historial de un token (08 FR-031) suma `listing` y `token_purchase` a los `reference_type`
posibles, y `retiro_de_venta` y `venta` a los tipos visibles.

---

## `token` *(08, sin cambios de esquema)*

En una venta, `owner_id` pasa del vendedor al comprador (o de null al comprador, y `status` de
`en_venta_plataforma` a `de_usuario`). Los cuatro estados siguen sumando 100 por jugador (FR-022).

---

## Derivados (no se persisten)

- **Precio del token**: `round(player.base_value)`; 0 = sin cotización (research #2).
- **`forSaleCount` de un jugador**: publicaciones activas del jugador (FR-026).
- **Marca «a la venta» del inventario**: el token tiene una publicación activa (FR-025).
- **Operación del historial (FR-029)**: una fila de `token_purchase` vista desde el usuario:
  `compra` si es el comprador y `venta` si es el vendedor, con sus saldos antes y después y la
  contraparte sin identificar.

## Entidades de MikroORM

- `listing.entity.ts`: enum `ListingStatus`.
- `token-purchase.entity.ts`.
- `credit-movement.entity.ts`: `CreditMovementType` suma `TOKEN_PURCHASE = 'compra_token'` y
  `TOKEN_SALE = 'venta_token'`.
- `token-event.entity.ts`: `TokenEventType` suma `SALE_WITHDRAWAL = 'retiro_de_venta'` y
  `SALE = 'venta'`.
- `token.entity.ts`: se elimina `FOR_SALE_TOKEN_STATUSES`; el Market pasa a leer `listing`.
