# Data Model: Créditos, Sobres e Inventario

**Feature**: `08-sobres` | **Date**: 2026-10-13 | **Plan**: [plan.md](./plan.md)

Todas las entidades viven en `back/src/infrastructure/database/entities/` (constitución §7).
Los nombres de columna siguen la convención de MikroORM del proyecto (`snake_case`). Los
enums se guardan como `text` con un `CHECK`, igual que en 07.

## Resumen

| Tabla | Nueva / cambia | Inmutable | Filas esperadas |
|---|---|---|---|
| `user` | cambia: `+ credits` | no | una por cuenta |
| `credit_movement` | nueva | sí (trigger) | una por entrega inicial y por apertura |
| `token` | nueva | no (estado y dueño cambian) | 100 por jugador (264.400 hoy) |
| `token_event` | nueva | sí (trigger) | ~3 por token a lo largo del ciclo de esta feature |
| `pack_batch` | nueva | no | una por lote generado |
| `pack` | nueva | no (pasa a abierto) | ~70.000 con el catálogo actual |
| `pack_opening` | nueva | sí (trigger) | una por apertura |
| `pack_opening_card` | nueva | sí (trigger) | una por carta entregada |
| `player` | sin cambios de esquema; `world_reputation` pasa a ser el OVR | — | — |

Invariantes globales:

- **Tokens** (FR-023): para cada jugador, `count(token)` es 0 (sin emitir) o exactamente 100,
  sumando los cuatro estados.
- **Créditos** (FR-007, SC-013):
  `Σ user.credits = Σ credit_movement.amount (entrega_inicial) − Σ |credit_movement.amount| (compra_sobre)`.
- **Saldo por usuario** (SC-012): la suma ordenada de sus movimientos reconstruye `user.credits`.
- **Estado del token** (FR-032, SC-014): el último `token_event` de cada token coincide con su
  `status` y `owner_id`.

---

## `user` (cambia)

| Campo | Tipo | Reglas |
|---|---|---|
| `credits` | `integer not null default 0` | `CHECK (credits >= 0)` (FR-004). Solo lo cambian los movimientos de `credits` y `packs`. |

El resto del usuario no cambia (05-auth).

## `credit_movement` (nueva, inmutable)

Un cambio de saldo (FR-006).

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `user` | |
| `type` | `text` | `CHECK in ('entrega_inicial', 'compra_sobre')`. Extensible (FR-006): agregar un tipo es ampliar el `CHECK`, sin tocar filas. |
| `amount` | `integer` | Con signo: `+` acredita, `−` debita. Nunca 0. |
| `balance_before` | `integer` | `>= 0` |
| `balance_after` | `integer` | `>= 0`, y `balance_after = balance_before + amount` (`CHECK`). |
| `reference_type` | `text null` | `'pack_opening'` para `compra_sobre`; nulo para la entrega inicial. |
| `reference_id` | `uuid null` | Id de la operación que lo originó (FR-041). |
| `correlation_id` | `varchar(255)` | De la petición, o uno propio en procesos sin petición (FR-006, FR-050). |
| `created_at` | `timestamptz` | |

Índices:

- `credit_movement_user_initial_unique`: único parcial `(user_id) where type = 'entrega_inicial'`
  (FR-002, research #3).
- `(user_id, created_at)` para reconstruir el saldo de un usuario en orden.

## `token` (nueva)

Uno de los 100 tokens de un jugador: una carta (FR-028).

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `uuid` PK | Inmutable (FR-028). |
| `player_id` | `uuid` FK → `player` | |
| `serial` | `smallint` | `CHECK (serial between 1 and 100)`; `unique (player_id, serial)`. |
| `status` | `text` | `CHECK in ('reservado', 'en_sobre', 'de_usuario', 'en_venta_plataforma')`. |
| `owner_id` | `uuid null` FK → `user` | Nulo = plataforma. `CHECK ((status = 'de_usuario') = (owner_id is not null))`. |
| `pack_id` | `uuid null` FK → `pack` | Sobre en que se asignó. Se conserva después de abrirlo. |
| `created_at` / `updated_at` | `timestamptz` | |

Índices: `unique (player_id, serial)`; `(owner_id, player_id) where status = 'de_usuario'`
(inventario); `(pack_id)`; `(player_id) where status = 'reservado'` (elegibles para el stock).

### Transiciones de estado

```text
                 emision
   (sin token) ───────────► reservado
                               │ asignacion_a_sobre (lote, FR-012)
                               ▼
                            en_sobre
                               │ entrega_en_sobre (apertura, FR-023)
                               ▼
                           de_usuario ──── devolucion_a_plataforma + puesta_en_venta ───► en_venta_plataforma
                                           (FR-043: definida, sin flujo en esta feature)
```

No hay transición de vuelta a `reservado` ni a `en_sobre` desde `de_usuario` (los tokens
devueltos no vuelven a los sobres).

## `token_event` (nueva, inmutable)

Cada cambio de estado o de dueño de un token (FR-030).

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `uuid` PK | |
| `token_id` | `uuid` FK → `token` | |
| `type` | `text` | `CHECK in ('emision', 'asignacion_a_sobre', 'entrega_en_sobre', 'devolucion_a_plataforma', 'puesta_en_venta')`. Extensible. |
| `from_status` / `to_status` | `text null` / `text` | `from_status` nulo solo en `emision`. |
| `from_owner_id` / `to_owner_id` | `uuid null` | Nulo = plataforma. |
| `quote_price` | `integer null` | Cotización del jugador en ese instante (`player.base_value`); nula si nunca cotizó. |
| `rarity` | `text null` | Rareza vigente en ese instante; nula sin reputación. |
| `reference_type` / `reference_id` | `text null` / `uuid null` | `'pack_batch'` o `'pack_opening'`. |
| `correlation_id` | `varchar(255)` | |
| `created_at` | `timestamptz` | |

Índice: `(token_id, created_at)`.

Visibilidad (FR-031): un usuario ve el historial de un token si alguna vez fue su dueño (existe
un evento con `to_owner_id = usuario`). En la respuesta, los dueños que no son él se muestran
como `otro_usuario` y los eventos `asignacion_a_sobre` se omiten.

## `pack_batch` (nueva)

Un lote de sobres generado de una vez (FR-012).

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `uuid` PK | |
| `number` | `serial` | Número correlativo, legible («Lote 3»). |
| `token_count` | `integer` | Múltiplo de 100 (jugadores completos). |
| `params` | `jsonb` | Configuración aplicada: por tipo, cartas, probabilidades objetivo y participación (FR-046). |
| `composition` | `jsonb` | Por tipo: cantidad de sobres y cartas por rareza al generarlo (verificación de SC-005 y SC-007). |
| `correlation_id` | `varchar(255)` | |
| `created_at` | `timestamptz` | |

## `pack` (nueva)

Una unidad del stock.

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `uuid` PK | |
| `batch_id` | `uuid` FK → `pack_batch` | |
| `type` | `text` | `CHECK in ('common', 'rare', 'epic', 'legendary')`. |
| `card_count` | `smallint` | Cantidad de tokens con `pack_id = id` (verificado por test, SC-005). |
| `status` | `text` | `CHECK in ('sin_abrir', 'abierto')`. |
| `opened_at` | `timestamptz null` | Not null si y solo si `status = 'abierto'` (`CHECK`). |
| `created_at` | `timestamptz` | |

Índice: `(type, id) where status = 'sin_abrir'` (sorteo y conteo de stock, research #8).

El contenido de un sobre sin abrir nunca se expone en una respuesta ni en un log (FR-015).

## `pack_opening` (nueva, inmutable)

Una apertura (FR-037).

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `user` | El de la sesión (FR-025). |
| `pack_id` | `uuid` FK → `pack`, **unique** | Un sobre se abre una sola vez (FR-022). |
| `pack_type` | `text` | |
| `price` | `integer` | `> 0` |
| `card_count` | `smallint` | |
| `balance_before` / `balance_after` | `integer` | `CHECK (balance_after = balance_before - price)` (SC-008). |
| `params` | `jsonb` | Parámetros del tipo aplicados (precio vigente al abrir y los del lote) (FR-046). |
| `credit_movement_id` | `uuid` FK → `credit_movement` | FR-041. |
| `correlation_id` | `varchar(255)` | |
| `created_at` | `timestamptz` | |

Índice: `(user_id, created_at desc)` (historial, FR-039).

## `pack_opening_card` (nueva, inmutable)

Una carta entregada en una apertura (FR-038).

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `uuid` PK | |
| `opening_id` | `uuid` FK → `pack_opening` | |
| `token_id` | `uuid` FK → `token` | `unique (opening_id, token_id)`. |
| `player_id` | `uuid` FK → `player` | |
| `serial` | `smallint` | |
| `rarity` | `text` | Rareza en el momento cero. |
| `quote_price` | `integer` | Cotización del jugador en el momento cero (siempre presente: un jugador sin cotización no entra al stock, FR-027). |

## Configuración (no persistida; validada al arrancar)

`INITIAL_CREDITS` (lo valida `CreditsService`) y `PACK_TYPES_CONFIG` (lo valida
`packs/pack-config.rules.ts`) (research #11). Reglas de FR-045:

| Regla | Detalle |
|---|---|
| Enteros positivos | `INITIAL_CREDITS`, `price` y `cards` de cada tipo. |
| Probabilidades | No negativas y al menos una positiva por tipo. Se normalizan a 1. |
| Participaciones | No negativas y al menos una positiva. Se normalizan a 1. |
| Partición exacta | Las cantidades de cartas de los tipos con participación positiva tienen que poder sumar exactamente 100 (combinación entera no negativa). |
| Monotonía (FR-009) | Ordenados `common < rare < epic < legendary`, `p[epic] + p[legendary]` no decrece. |

Valores por defecto (Assumptions de la spec):

| Tipo | Precio | Cartas | `common` | `rare` | `epic` | `legendary` | Participación |
|---|---|---|---|---|---|---|---|
| `common` | 100 | 3 | 0,78 | 0,18 | 0,035 | 0,005 | 0,50 |
| `rare` | 200 | 4 | 0,55 | 0,32 | 0,10 | 0,03 | 0,28 |
| `epic` | 400 | 5 | 0,35 | 0,35 | 0,24 | 0,06 | 0,14 |
| `legendary` | 800 | 6 | 0,20 | 0,30 | 0,30 | 0,20 | 0,08 |

## Cambios en `player` (sin migración de esquema)

- `world_reputation` pasa a ser el **OVR** (FR-067): `ovr = min(99, world_reputation)`, nulo si
  no está cargada.
- Rareza (FR-016): `>= 88` `legendary`, `80–87` `epic`, `70–79` `rare`, `< 70` o nula `common`.
- Índice nuevo `player (world_reputation)` para los filtros de OVR y rareza de la home.
- La carga inicial de reputación (EA FC 27) ya está en `Migration20261013180000`.
