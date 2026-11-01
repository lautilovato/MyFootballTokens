# Data Model: Historial de Operaciones y Consulta de Cotizaciones por Fecha

**Feature**: `10-historial-operaciones` | **Plan**: [plan.md](./plan.md) | **Spec**:
[spec.md](./spec.md)

La feature es de lectura. Tiene **un cambio de esquema** (una columna) y dos estructuras
derivadas que no se persisten: la entrada del historial y la cotización vigente en un instante.

## Cambio de esquema

### `token_purchase` (09, se amplía)

| Columna | Tipo | Null | Descripción |
|---|---|---|---|
| `quote_id` | `uuid` | sí | La cotización del jugador vigente cuando se fijó el precio de la compra. FK a `player_quote(id)`. |

- Se completa en `purchase()` en la misma sentencia que lee `player.base_value` (research #1).
- Nulo solo en compras anteriores a la migración para las que no se encontró cotización.
- La fila sigue siendo inmutable: el trigger `token_purchase_immutable` rechaza `UPDATE` y
  `DELETE` salvo durante el relleno de la migración.
- No se agrega índice: la compra se une a la cotización por su clave primaria, y ninguna consulta
  busca compras a partir de la cotización.

**Migración `Migration20261026120000`**, en una transacción:

1. `alter table token_purchase add column quote_id uuid null`.
2. `alter table token_purchase add constraint token_purchase_quote_id_foreign foreign key
   (quote_id) references player_quote (id)`.
3. `alter table token_purchase disable trigger token_purchase_immutable`.
4. Relleno: para cada compra, la cotización del mismo jugador con `calculated_at <= created_at`,
   ordenando por «precio igual al cobrado» primero y por `calculated_at` descendente después, y
   tomando la primera.
5. `alter table token_purchase enable trigger token_purchase_immutable`.

`down`: borra la FK y la columna. Como la columna se agrega y se quita dentro de la migración,
el `down` no necesita tocar el trigger.

Como en las migraciones anteriores, se genera con `migration:create` para actualizar
`.snapshot.json` y se descartan las líneas que propongan borrar índices, CHECK o triggers que las
entidades no declaran (`Migration20261013191200`, `Migration20261020120000`).

### Entidad `TokenPurchase`

Suma `quote?: PlayerQuote | null` (`@ManyToOne`, nullable). Es el único archivo de entidad que
se modifica; `history` no define entidades.

## Estructuras derivadas

### Entrada del historial (no se persiste)

Una carta que el usuario adquirió o vendió. Se construye al leer.

| Campo | Tipo | Sobre | Compra | Venta | Fuente |
|---|---|---|---|---|---|
| `id` | string | ✓ | ✓ | ✓ | `pack_opening_card.id`, o `token_purchase.id` con el prefijo del tipo |
| `kind` | `sobre` \| `compra` \| `venta` | ✓ | ✓ | ✓ | la rama de la consulta |
| `at` | timestamptz | ✓ | ✓ | ✓ | `pack_opening.created_at` o `token_purchase.created_at` |
| `tokenId` | uuid | ✓ | ✓ | ✓ | `token_id` |
| `serial` | int | ✓ | ✓ | ✓ | `pack_opening_card.serial`, o `token.serial` |
| `rarity` | string | ✓ | ✓ | ✓ | `pack_opening_card.rarity`, o `token_purchase.rarity` (el de ese instante) |
| `player` | tarjeta del jugador | ✓ | ✓ | ✓ | `PlayerService.findCardsByIds` |
| `packType` | `common` \| `rare` \| `epic` \| `legendary` | ✓ | — | — | `pack_opening.pack_type` |
| `price` | int | — | ✓ | ✓ | `token_purchase.price` (cotización de ese instante) |
| `balanceBefore` | int | — | ✓ | ✓ | `buyer_balance_before` o `seller_balance_before` |
| `balanceAfter` | int | — | ✓ | ✓ | `buyer_balance_after` o `seller_balance_after` |
| `counterparty` | `plataforma` \| `otro_usuario` | — | ✓ | ✓ | `seller_id` nulo → plataforma; en ventas siempre `otro_usuario` |
| `quote` | `{ id, calculatedAt, strategy: { key, name, version } }` o nulo | — | ✓ | ✓ | `player_quote` ⨝ versión ⨝ estrategia, por `quote_id` |

- En una entrada de **sobre**, `price`, `balanceBefore`, `balanceAfter`, `counterparty` y `quote`
  son siempre nulos (clarificación del 2026-10-26, FR-005, FR-015): la interfaz muestra «Primer
  propietario» y el tipo de sobre. El precio y el saldo del sobre no se exponen acá.
- En compras y ventas, `quote` es nulo solo si `quote_id` es nulo; la interfaz dice «estrategia
  no disponible».
- Ningún campo identifica a la contraparte (FR-007): la compra de un usuario a otro muestra
  `otro_usuario` desde los dos lados.

**Relación con el tipo de filtro**:

| `type` | Ramas |
|---|---|
| `all` (por defecto) | sobre + compra + venta |
| `acquired` | sobre + compra |
| `sold` | venta |

**Orden**: `at desc, operation_id desc, token_id` (research #3). El total y las páginas cuentan
entradas, es decir, cartas.

### Cotización vigente en un instante (no se persiste)

Resultado de `calculated_at <= at` ordenado por `calculated_at desc limit 1` sobre `player_quote`
del jugador (índice `player_quote(player_id, calculated_at desc)`).

| Campo | Descripción |
|---|---|
| `quoted` | `false` si no hay ninguna cotización hasta `at` |
| `quote` | precio, score, fecha de cálculo, origen, `strategy { key, name, version }` y perfil de posición; nulo si `quoted` es `false` |
| `firstQuotedAt` | fecha de la primera cotización del jugador; solo se calcula cuando `quoted` es `false`; nulo si nunca fue cotizado |

## Entidades que se leen y no cambian

| Entidad | Para qué | Spec |
|---|---|---|
| `pack_opening`, `pack_opening_card` | cartas recibidas en sobres, con su rareza de ese instante | 08 FR-037, FR-038 |
| `token_purchase` | compras y ventas con precio, saldos y rareza de ese instante | 09 FR-028 |
| `token` | número de serie de la carta en compras y ventas | 08 |
| `player_quote` | cotizaciones, score, origen y versión de estrategia | 07 FR-016 |
| `valuation_strategy_version`, `valuation_strategy` | versión y nombre de la estrategia de cada cotización | 07 FR-011 |

## Invariantes (cubiertas por tests)

1. **Completitud** (SC-001): para un usuario, `#sobre = Σ pack_opening.card_count`,
   `#compra = #{ token_purchase.buyer_id = u }` y `#venta = #{ token_purchase.seller_id = u }`.
2. **Valores de origen** (SC-002): `price`, saldos y rareza de cada entrada son iguales a los de la
   fila registrada, y no cambian al recalcular la cotización del jugador ni al activar otra
   estrategia.
3. **Aislamiento** (SC-003): ninguna entrada proviene de una fila donde el usuario no sea el
   comprador, el vendedor o el titular de la apertura.
4. **Coherencia de la cotización de una compra** (SC-007): `token_purchase.price` es igual a
   `player_quote.price` de su `quote_id` en toda compra posterior a la migración.
5. **Coherencia con la búsqueda por instante**: para toda compra, la cotización de `/at` con
   `at = created_at` es la de su `quote_id`, salvo dentro de la ventana de un recálculo en curso
   (research #1), donde `quote_id` prevalece.
6. **Orden y paginación** (FR-008): recorrer todas las páginas devuelve cada entrada exactamente
   una vez, en orden descendente.
7. **Sólo lectura** (FR-037): consultar el historial o `/at` no cambia el conteo ni el contenido
   de `pack_opening`, `token_purchase`, `credit_movement`, `token_event` ni `player_quote`.
