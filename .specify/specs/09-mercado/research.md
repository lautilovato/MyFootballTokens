# Research: Mercado de Tokens (Compra y Venta)

**Feature**: `09-mercado` | **Fecha**: 2026-10-20 | **Spec**: [spec.md](./spec.md) (revisión 4)

Cada decisión sigue el formato Decision / Rationale / Alternatives considered. El plan no
tenía incógnitas abiertas en el Technical Context: todas se resolvieron con el código ya
existente de las features 05 a 08, que fija los patrones a reutilizar.

---

### 1. Un módulo de dominio nuevo: `market`

**Decision**: crear `back/src/modules/market/` con los cinco elementos de §7. Publicar,
retirar, comprar y consultar el historial de operaciones viven ahí. El módulo importa
`PlayerModule` para las cartas (`findCardsByIds`) y para invalidar la caché del Market.

**Rationale**: compra y venta son un dominio propio, con entidades propias (publicación y
compra). Igual que `packs`, la operación central mueve saldos, tokens y eventos en una sola
transacción con SQL explícito. Repartirla entre `credits`, `tokens` y `market` obligaría a
pasar la transacción entre módulos.

**Alternatives considered**:
- *Sumarlo a `tokens`*: mezclaría la lectura del inventario con una operación financiera, y
  `tokens` ya es dependencia de `packs`.
- *Dos módulos, `listings` y `purchases`*: la compra cierra la publicación en la misma
  transacción, así que estarían acoplados igual.

---

### 2. Precio del token = `round(player.base_value)`

**Decision**: el precio de un token es `round(player.base_value)`. `base_value = 0` significa
«sin cotización» y produce `PRICE_NOT_AVAILABLE`. El precio se lee dentro de la transacción de
cada compra y no se guarda en la publicación.

**Rationale**: `player.base_value` es el espejo de la última cotización que mantiene la spec 07
(`update "player" set "base_value" = q."price"` al cerrar cada corrida). Es el mismo dato y el
mismo redondeo que usan los sobres para el momento cero (`nullif(round(p."base_value")::int, 0)`),
así que un token vale en el mercado exactamente lo que se registró como cotización al abrirlo
(FR-001, constitución v4.1.0 §5 «Mercado»). Como la publicación no guarda precio, un recálculo
cambia el de todas las cartas a la venta en el mismo instante, sin tocar ninguna fila (FR-002).

**Alternatives considered**:
- *Leer `player_quote` (última fila por jugador)*: es la misma información con una subconsulta
  más; el espejo existe justamente para estas lecturas.
- *Guardar el precio en la publicación y actualizarlo en cada recálculo*: duplica la fuente de
  verdad y abre una ventana en la que el precio publicado y la cotización difieren.

Como el precio es la cotización, el «precio pagado» y la «cotización del jugador en ese instante»
que piden FR-017, FR-023 y FR-028 son el mismo número. Se guarda una sola columna (`price`) y la
respuesta la documenta como tal.

---

### 3. Publicación: tabla `listing`, con una sola transición permitida

**Decision**: tabla `listing` con `status` en `activa`, `vendida` o `retirada`. Tiene un índice
único parcial sobre `token_id` donde `status = 'activa'` (FR-004). El vendedor nulo representa a
la plataforma (FR-008). Un trigger permite un único `UPDATE`: pasar de `activa` a `vendida` o
`retirada`, cargando `closed_at` y `closed_correlation_id`. Rechaza cualquier otro cambio y todo
`DELETE` (FR-030).

**Rationale**: la publicación tiene un ciclo de vida, así que no puede ser inmutable como
`credit_movement`. Pero lo único que cambia es su cierre, y la base puede garantizarlo con la
misma técnica que 08 (research #4): la integridad no depende solo del código. El índice único
parcial impide dos publicaciones activas del mismo token aunque dos pedidos lleguen a la vez.

**Alternatives considered**:
- *Un estado `en_venta_usuario` en `token`*: la spec fija que no se agregan estados (los cuatro
  siguen sumando 100) y que el token publicado sigue `de_usuario`.
- *Publicación inmutable más una tabla de cierres*: cumple igual la auditoría, pero cada lectura
  del mercado necesitaría un anti-join para saber qué está activo.

---

### 4. Compra: una transacción, con validación en el orden de FR-012

**Decision**: `MarketRepository.purchase` corre en `em.fork().transactional`:

1. `select … from "listing" where "id" = ? for update`: sin fila → `LISTING_NOT_FOUND`;
   `status <> 'activa'` → `LISTING_NOT_ACTIVE`; vendedor igual al comprador → `OWN_LISTING`.
2. Lee `round(p."base_value")` del jugador del token: 0 → `PRICE_NOT_AVAILABLE`; mayor que
   `acceptedPrice` → `PRICE_CHANGED`.
3. Bloquea las filas de `user` de comprador y vendedor en orden de id (#5).
4. Débito condicional del comprador (`… "credits" >= ? returning "credits"`): sin fila →
   `INSUFFICIENT_CREDITS`. Crédito al vendedor si es un usuario.
5. `update "token"` condicionado al dueño y al estado esperados; si no afecta exactamente una
   fila, error interno y rollback.
6. Cierra la publicación como `vendida` e inserta los movimientos, la compra y el evento `venta`,
   referenciados entre sí (FR-030).

**Rationale**: es el mismo esquema que la apertura de sobres (08 research #8), que ya cumple
SC-002 y SC-003. El `for update` sobre la publicación serializa compra contra compra y compra
contra retiro (FR-015, US1-10, US2-10): el segundo pedido espera, relee el estado ya cerrado y
recibe `LISTING_NOT_ACTIVE`. El débito condicional cubre dos compras simultáneas de un mismo
comprador sin saldo para ambas (US2-11).

**Alternatives considered**:
- *Bloqueo optimista con una columna de versión*: obliga a reintentar en el cliente y no mejora
  la latencia para una carta por compra.
- *Validar fuera de la transacción y ejecutar dentro*: deja una carrera entre la validación y el
  débito; la constitución §6 pide validar, pero la transacción revalida igual.

---

### 5. Orden de bloqueo de los usuarios para evitar interbloqueos

**Decision**: antes de tocar los saldos, la compra bloquea las filas de `user` de comprador y
vendedor con un solo `select … where "id" in (?, ?) order by "id" for update`.

**Rationale**: si A le compra a B mientras B le compra a A, cada transacción bloquearía primero
su propio saldo y después el del otro: un interbloqueo. Con un orden global de bloqueo, la
segunda transacción espera a la primera.

**Alternatives considered**: *dejar que Postgres detecte el interbloqueo y aborte una*: funciona,
pero devuelve un 500 a un usuario que no hizo nada mal.

---

### 6. Retiro y publicación: bloqueo de la fila y chequeo previo

**Decision**:
- **Publicar**: `select … from "token" where "id" = ? and "owner_id" = ? and "status" = 'de_usuario' for update`;
  sin fila → `TOKEN_NOT_FOUND`. Con el token bloqueado, si ya tiene una publicación activa →
  `TOKEN_ALREADY_LISTED`. Si el jugador no tiene cotización → `PRICE_NOT_AVAILABLE`. Después
  inserta la publicación y el evento `puesta_en_venta`.
- **Retirar**: `select … from "listing" where "id" = ? for update`; sin fila, o con un vendedor
  distinto del usuario (incluida la plataforma) → `LISTING_NOT_FOUND`; si no está activa →
  `LISTING_NOT_ACTIVE`. Después cierra la publicación e inserta el evento `retiro_de_venta`.

**Rationale**: el bloqueo del token hace que el chequeo de «ya publicado» y el insert sean
atómicos; el índice único parcial (#3) queda como red de seguridad. Para el retiro, una
publicación ajena responde igual que una inexistente, como pide la tabla de errores.

**Alternatives considered**: *capturar la violación del índice único*: aborta la transacción, y
el error de Postgres habría que traducirlo; el chequeo previo da el código correcto directamente.

---

### 7. Movimientos y eventos: se extienden los CHECK de 08

**Decision**: la migración reemplaza los CHECK:
- `credit_movement.type` suma `compra_token` y `venta_token`, con `reference_type = 'token_purchase'`.
- `token_event.type` suma `retiro_de_venta` y `venta`.

Los eventos de publicación y retiro van con `from_status = to_status = 'de_usuario'` y el mismo
dueño en origen y destino, con `reference_type = 'listing'`. El evento `venta` va de
`de_usuario` (o `en_venta_plataforma`) a `de_usuario`, del vendedor (o null) al comprador, con
`quote_price` = precio pagado y la rareza vigente.

**Rationale**: la spec 08 dejó los modelos abiertos a tipos futuros (FR-006, FR-030) y los
triggers de inmutabilidad ya cubren las dos tablas. Como `findHistoryVisibleTo` busca eventos
con `to_owner_id` igual al usuario, el comprador ve el historial completo sin cambios (FR-024),
y el vendedor lo sigue viendo porque ya fue destino de la entrega en sobre.

**Alternatives considered**: *eventos sin `to_status` para la publicación*: la columna es
`not null` en 08 y cambiarla rompería la invariante «el último evento determina estado y dueño».

---

### 8. El Market y el detalle

**Decision**:
- **Market**: el filtro de `GET /players` pasa a ser
  `exists (select 1 from "listing" where "player_id" = p."id" and "status" = 'activa')`. La
  publicación guarda `player_id` desnormalizado e indexado para esta consulta. Cada carta del
  listado suma `forSaleCount` (campo nuevo, aditivo), contado en una consulta aparte por página,
  como las estadísticas.
- **Detalle**: endpoint nuevo `GET /market/players/{playerId}/listings`, paginado, de la
  publicación más antigua a la más nueva, con `price`, `total` y `mine` por publicación. No
  identifica a los vendedores (FR-027).
- **Caché**: cada publicación, retiro y compra llama a `PlayerService.invalidateListCache()`,
  que sube la versión de las claves del listado. Así el Market nunca muestra un jugador sin
  cartas a la venta (SC-011).

**Rationale**: como todo token `en_venta_plataforma` tiene una publicación activa (FR-008),
contar publicaciones activas cubre usuarios y plataforma con una sola condición, y reemplaza
`FOR_SALE_TOKEN_STATUSES`. Un campo nuevo en la respuesta no rompe a los clientes de 06. El
detalle va en un endpoint aparte porque se pagina y depende del usuario de la sesión (`mine`),
mientras que `GET /players/{id}` es igual para todos.

**Alternatives considered**:
- *Agregar las publicaciones a `GET /players/{id}`*: lo vuelve dependiente de la sesión y
  mezcla dos paginaciones.
- *TTL corto en lugar de invalidar*: dejaría segundos en los que el Market miente.

---

### 9. Inventario: marca «a la venta» y precio

**Decision**: `GET /inventory` suma a cada token `listingId` (nulo si no está publicado). El
precio ya viaja en `player.marketValue`, que es `base_value`. El cambio es aditivo.

**Rationale**: con `listingId`, el cliente puede retirar sin otra consulta (FR-025, FR-036).

**Alternatives considered**: *un endpoint «mis publicaciones»*: la spec no lo pide; el inventario
ya lista todos los tokens del usuario.

---

### 10. Tokens de la plataforma

**Decision**: el modelo y la compra soportan publicaciones con `seller_id` nulo. Ningún flujo las
crea: la eliminación de cuentas (spec 08 FR-043) va a crearlas en la misma transacción que pasa
el token a `en_venta_plataforma`. Un e2e las inserta a mano para probar la compra a la plataforma
(US2-4, FR-019).

**Rationale**: cumple FR-008 y FR-019 sin implementar la eliminación de cuentas, igual que 08
dejó `en_venta_plataforma` solo en el modelo (08 research #15).

**Alternatives considered**: *dejar la compra a la plataforma para la spec de eliminación*: la
spec 09 la incluye explícitamente.

---

### 11. Límite de frecuencia en las operaciones del mercado

**Decision**: `ThrottlerGuard` y `@Throttle` se aplican **por ruta, solo en los tres `POST`**
del mercado: 30 pedidos por minuto y por IP, configurable con `MARKET_RATE_LIMIT_MAX`. El límite
se pasa como función (`limit: () => …`), así se lee en cada pedido y no depende del orden en que
se cargan los módulos respecto de `dotenv`. Al
superarlo responde 429 `RATE_LIMITED` con el formato `ApiError`. Los `GET` no llevan el guard:
a nivel de clase heredarían el límite global de `ThrottlerModule.forRoot`, que es el de auth (5
por minuto, `DEFAULT_RATE_LIMIT_MAX` en `back/src/shared/auth/auth.constants.ts`), y bastaría
con abrir unos pocos detalles de jugador para recibir un 429.

**Rationale**: era el único punto «Outstanding» de `/speckit-clarify`. `@nestjs/throttler` ya está
en el stack (05). Un usuario real no publica ni compra 30 cartas por minuto, así que el límite
solo frena scripts.

**Hallazgo (fuera de alcance)**: `ThrottlerGuard` no está registrado en ningún lugar del backend
(ni como `APP_GUARD` ni con `@UseGuards`), así que el `@Throttle` de `auth.controller.ts` hoy no
tiene efecto. El mercado registra el guard en sus tres rutas `POST`; arreglar el de `auth` queda para
otro cambio.

**Alternatives considered**: *sin límite*: el mercado mueve créditos y no cuesta nada protegerlo.

---

### 12. Errores, validación y Swagger

**Decision**: `MarketController` usa `@UseFilters(ApiErrorFilter)`, como `packs`. Los DTOs de
entrada usan `class-validator` bajo el `ValidationPipe` global, que ya tiene
`forbidNonWhitelisted: true`. Por eso un `price` en la publicación o un `userId` en cualquier
pedido responden 422 `VALIDATION_ERROR` (US1-3, US1-12, US2-14) sin código adicional. Las
excepciones de dominio llevan `{ code, message }` en el body.

**Rationale**: reutiliza el formato y el filtro de 08 (research #10) sin cambiar los contratos
de 05 a 07.

---

### 13. Cliente web

**Decision**:
- **`services/market.service.ts`**: publicar, retirar, listar las publicaciones de un jugador,
  comprar y un mensaje por código de error (FR-042).
- **Inventario**: `InventoryPage` agrega, debajo de cada `PlayerCard`, un componente
  presentacional `ListingControls` con la marca «A la venta» y el botón para publicar o retirar.
  Las dos acciones confirman con `ConfirmModal` (FR-036, FR-037).
- **Detalle**: `PlayerDetailPanel` reemplaza la maqueta del bloque de compra por el componente
  presentacional `MarketListings` (lista, «Comprar» por carta ajena y «Tuya» en las propias),
  sin selector de cantidad (FR-038). `HomePage` orquesta: pide las publicaciones al abrir el
  detalle, confirma con `ConfirmModal` y, tras una compra, refresca el saldo (`useCredits`), las
  publicaciones y el listado (FR-039 a FR-042).
- **Market**: `PlayerGrid` muestra «N a la venta» debajo de cada carta.

**Rationale**: `PlayerCard` está congelado (06 FR-020), así que la marca y la cantidad van fuera
de la carta. Los componentes no hablan con la red (§7): reciben datos y callbacks de la página.

**Alternatives considered**: *una página aparte para el mercado*: la spec ubica la compra en el
panel de detalle y la publicación en el inventario.
