# Tasks: Mercado de Tokens (Compra y Venta)

**Input**: Design documents from `.specify/specs/09-mercado/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/market.openapi.yaml](./contracts/market.openapi.yaml), [quickstart.md](./quickstart.md)

**Tests**: SÍ se incluyen. Cada historia de la spec define un «Independent Test» con escenarios verificables, el plan fija los archivos de test (e2e por módulo en `/back`, Vitest en `/front`) y es la convención del proyecto (05 a 08).

**Organization**: las tareas se agrupan por historia de usuario para que cada una se implemente y verifique por separado. Las historias siguen el orden de la spec (revisión 4): US1 y US2 (P1), US3 (P2) y US4 (P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo: toca archivos distintos y no depende de tareas incompletas.
- **[US#]**: historia de usuario a la que pertenece. Setup, Foundational y Polish no llevan etiqueta.

## Path Conventions

Backend en `back/` y cliente en `front/`, con la estructura de §7 de la constitución v4.1.0:
entidades en `back/src/infrastructure/database/entities/`, módulos de dominio en
`back/src/modules/<dominio>/`, e2e en `back/test/`, y en el cliente `pages/`, `components/`,
`services/` y `app/`.

Convenciones que todas las tareas deben respetar (ver el código existente):

- Guards **por ruta**: `JwtAuthGuard` + `@ApiBearerAuth(SWAGGER_BEARER_SCHEME)` (`back/src/modules/packs/packs.controller.ts`). El usuario sale de `@CurrentUser()`, nunca del body ni de la query.
- `MarketController` lleva `@UseFilters(ApiErrorFilter)` a nivel de clase. Las excepciones de dominio se lanzan como `new ConflictException({ code: 'LISTING_NOT_ACTIVE', message: '…' })`, `NotFoundException({ code, message })`, etc., con mensajes en español.
- La lógica financiera va en SQL explícito dentro de `this.em.fork().transactional(async (tx) => …)`, como `PacksRepository.openPack` (`back/src/modules/packs/packs.repository.ts`). Los errores de dominio salen del repositorio como clases de error propias (`InsufficientCreditsError`, etc.) y el service los traduce a excepciones HTTP.
- El precio de un token es `round(p."base_value")::int`; `0` significa «sin cotización» (research #2). La rareza se calcula con `raritySqlCase('p."world_reputation"', 'common')` de `back/src/modules/player/rarity.ts`.
- Logs con `PinoLoggerService.event(context, message, data)`. El Correlation ID sale de `CorrelationIdStore.getId()`.
- Entidades con los decoradores de `@mikro-orm/decorators/legacy`. Los enums se guardan como `text` con `CHECK` en la migración.
- En el cliente, toda la red pasa por `httpClient` (`front/src/services/http-client.ts`); los componentes no hacen HTTP; los tests de componentes usan `createRoot` + `act` y stubean `matchMedia` (`front/src/components/__tests__/player-grid.test.tsx`). `PlayerCard` no se modifica (06 FR-020).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: configuración nueva. No hay dependencias que instalar (plan: Primary Dependencies).

- [X] T001 Agregar `MARKET_RATE_LIMIT_MAX=30` a `back/.env` y `MARKET_RATE_LIMIT_MAX=100000` a `back/.env.test`, con un comentario en cada archivo: el límite de frecuencia de los `POST` de `/market` (research #11); en test se desactiva en la práctica para que los e2e puedan hacer muchos pedidos seguidos.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: esquema, entidades, filtro de errores y esqueleto del módulo `market`, que usan todas las historias.

**⚠️ CRITICAL**: ninguna historia puede empezar hasta terminar esta fase.

### Entidades (data-model.md)

- [X] T002 [P] Crear `back/src/infrastructure/database/entities/listing.entity.ts`: enum `ListingStatus` (`ACTIVE = 'activa'`, `SOLD = 'vendida'`, `WITHDRAWN = 'retirada'`) y entidad `Listing` con `id` (uuid), `token` (ManyToOne `Token`), `player` (ManyToOne `Player`), `seller` (ManyToOne `User`, nullable: nulo = la plataforma), `status`, `createdAt`, `correlationId`, `closedAt` (nullable) y `closedCorrelationId` (nullable), con los nombres de columna de data-model.md.
- [X] T003 [P] Crear `back/src/infrastructure/database/entities/token-purchase.entity.ts`: entidad `TokenPurchase` con todas las columnas de data-model.md (`listing` único, `token`, `player`, `buyer`, `seller` nullable, `acceptedPrice`, `price`, `rarity`, saldos de comprador y vendedor, `buyerMovement`, `sellerMovement` nullable, `correlationId`, `createdAt`).
- [X] T004 [P] En `back/src/infrastructure/database/entities/credit-movement.entity.ts`, sumar a `CreditMovementType` `TOKEN_PURCHASE = 'compra_token'` y `TOKEN_SALE = 'venta_token'`.
- [X] T005 [P] En `back/src/infrastructure/database/entities/token-event.entity.ts`, sumar a `TokenEventType` `SALE_WITHDRAWAL = 'retiro_de_venta'` y `SALE = 'venta'`.
- [X] T006 Verificar que MikroORM descubra `Listing` y `TokenPurchase` sin registrarlas a mano: `back/src/infrastructure/database/database.config.ts` las toma por glob (`entitiesTs: ['src/**/*.entity.ts']`, `entities: ['dist/**/*.entity.js']`). Con `cd back && npm run build` y `npx mikro-orm debug`, las dos entidades deben aparecer en la lista.

### Migración

- [X] T007 Generar la migración con `cd back && npx mikro-orm migration:create` (después de T002 a T005), para que se actualice `back/src/infrastructure/database/migrations/.snapshot.json`. Renombrarla a `Migration20261020120000.ts` y completarla a mano con el estilo de `Migration20261013191200.ts`, quitando las líneas en que el generador propone borrar índices funcionales y parciales de migraciones anteriores:
  - Tabla `listing` con FK a `token`, `player` y `user`; los CHECK `listing_status_check` y `listing_closed_check`; el índice único parcial `listing_token_active_unique` sobre `(token_id) where status = 'activa'`; `listing_player_active_index` sobre `(player_id, created_at, id) where status = 'activa'`; y `listing_seller_index`.
  - Tabla `token_purchase` con `listing_id` único, las FK, y los CHECK `token_purchase_price_check`, `token_purchase_buyer_balance_check`, `token_purchase_seller_check` y `token_purchase_not_self_check`; índices `(buyer_id, created_at desc)` y `(seller_id, created_at desc) where seller_id is not null`.
  - Reemplazar `credit_movement_type_check` (suma `compra_token` y `venta_token`) y `token_event_type_check` (suma `retiro_de_venta` y `venta`): `drop constraint` + `add constraint`.
  - Trigger `token_purchase_immutable` con la función `forbid_mutation()` que ya existe.
  - Función `listing_close_only()` y su trigger `before update or delete on "listing"`: rechaza `DELETE`; en `UPDATE` exige `OLD.status = 'activa'`, `NEW.status in ('vendida', 'retirada')` y que no cambie ninguna columna salvo `status`, `closed_at` y `closed_correlation_id`.
  - `down()` revierte todo en orden inverso y restituye los CHECK de 08.
- [X] T008 En `back/test/support/clean-database.ts`, sumar `"token_purchase"` y `"listing"` al principio del `truncate` de `cleanPacksData`, y actualizar su comentario (los triggers de `listing` tampoco se disparan con `TRUNCATE`).

### Utilidades compartidas

- [X] T009 [P] En `back/src/shared/http/api-error.filter.ts`, traducir `ThrottlerException` (de `@nestjs/throttler`) a 429 `{ code: 'RATE_LIMITED', message: 'Demasiados pedidos; probá de nuevo en un momento' }`, antes del caso genérico de `HttpException`. Actualizar el comentario de la clase.
- [X] T010 [P] Crear `back/src/shared/http/api-error.filter.spec.ts`: unitario que verifica 401 → `UNAUTHENTICATED`, 400 del ValidationPipe → 422 `VALIDATION_ERROR` con `details`, una excepción con `code` → su status y su código, `ThrottlerException` → 429 `RATE_LIMITED`, y un `Error` cualquiera → 500 `INTERNAL_ERROR`, siempre con el `correlationId`.

### Esqueleto del módulo `market`

- [X] T011 Crear `back/src/modules/market/market.module.ts` (importa `PlayerModule`; registra `MarketController`, `MarketService` y `MarketRepository`), `market.controller.ts` vacío con `@ApiTags('Market')`, `@Controller('market')` y `@UseFilters(ApiErrorFilter)` a nivel de clase. `ThrottlerGuard` **no** va a nivel de clase: el límite global de `ThrottlerModule.forRoot` es el de auth (5 por minuto, `back/src/shared/auth/auth.constants.ts`) y frenaría los `GET` (research #11). Crear también `market.service.ts` y `market.repository.ts` vacíos, y la carpeta `dto/`. Registrar `MarketModule` en `back/src/app.module.ts`, debajo del comentario de 08-sobres.
- [X] T012 En `back/src/modules/market/market.service.ts`, declarar `MARKET_ERRORS` con `{ code, message }` en español para `TOKEN_NOT_FOUND` (reusar `TOKEN_NOT_FOUND` de `back/src/modules/tokens/tokens.service.ts`), `LISTING_NOT_FOUND`, `PLAYER_NOT_FOUND`, `TOKEN_ALREADY_LISTED`, `LISTING_NOT_ACTIVE`, `OWN_LISTING`, `PRICE_NOT_AVAILABLE`, `PRICE_CHANGED` e `INSUFFICIENT_CREDITS`. En `market.repository.ts`, declarar las clases de error de dominio que va a lanzar el repositorio (una por código).
- [X] T013 [P] Crear `back/test/support/market-fixtures.ts` sobre `packs-fixtures.ts`: `publish(app, jwt, body)`, `withdraw(app, jwt, listingId)`, `listingsOf(app, jwt, playerId, query?)`, `purchase(app, jwt, body)`, `operations(app, jwt, query?)`, `ownedTokens(em, userId)` (tokens `de_usuario` del usuario con su `player_id`), `insertPlatformListing(em, tokenId)`, que pasa un token a `en_venta_plataforma` con `owner_id` nulo e inserta su publicación activa con `seller_id` nulo (research #10), y `snapshotMarketState(em, userIds, listingId)`, que devuelve los saldos y los tokens de esos usuarios, el estado de la publicación y la cantidad de filas de `credit_movement`, `token_purchase` y `token_event`, para comparar antes y después de un rechazo.

**Checkpoint**: la migración se aplica y se revierte; `.snapshot.json` suma `listing`, `token_purchase` y los tipos nuevos sin perder las entradas de 07 y 08 (`migration:create` reescribe el snapshot desde las entidades y siempre propone borrar índices, CHECK y triggers escritos a mano, como ya pasaba en 08: no se usa su salida tal cual); `npm test -- api-error.filter` está en verde y la app arranca con el módulo `market` vacío.

---

## Phase 3: User Story 1 - Poner una carta a la venta (Priority: P1) 🎯 MVP

**Goal**: un usuario publica una carta de su inventario y puede retirarla; la carta queda marcada «a la venta» y su jugador aparece en el Market.

**Independent Test**: con un usuario con cartas, publicar una y verificar que aparece en su inventario con `listingId`, que su jugador aparece en el Market y que el token sigue siendo suyo; retirarla y verificar que el jugador sale del Market si no tiene otra publicación.

### Tests for User Story 1

- [X] T014 [P] [US1] Crear `back/test/market.e2e-spec.ts` con el `beforeAll`/`beforeEach` de `back/test/packs.e2e-spec.ts` (seed de jugadores, `syncStock`, usuarios que abren sobres para tener cartas) y un `describe('US1 — publicar y retirar')` que cubra US1-1 a US1-12: publicación activa con `price` = `marketValue` y evento `puesta_en_venta`; body con `price` o con `userId` → 422 `VALIDATION_ERROR`; segunda publicación → 409 `TOKEN_ALREADY_LISTED`; token ajeno o inexistente → 404 `TOKEN_NOT_FOUND`; jugador con `base_value = 0` → 409 `PRICE_NOT_AVAILABLE`; retiro → `retirada` con evento `retiro_de_venta`; retirar de nuevo → 409 `LISTING_NOT_ACTIVE`; retirar una ajena o de la plataforma → 404 `LISTING_NOT_FOUND`; sin sesión → 401; dos publicaciones simultáneas del mismo token → exactamente una 201 (FR-004); publicar, retirar y volver a publicar el mismo token crea una publicación nueva y deja la anterior `retirada` (FR-007); `update` o `delete` sobre `listing` fuera del cierre → falla por trigger. Agregar además un caso de límite de frecuencia por ruta: más de 5 consultas seguidas a `GET /market/players/:playerId/listings` no reciben 429 (research #11).
- [X] T015 [P] [US1] En `back/test/tokens.e2e-spec.ts`, agregar casos: el token publicado sigue en `GET /inventory` con su `listingId`; al retirarlo vuelve a `listingId: null` (FR-025).
- [X] T016 [P] [US1] En `back/test/players.e2e-spec.ts`, reemplazar los casos de FR-070 basados en `en_venta_plataforma` por: el Market está vacío sin publicaciones; un jugador aparece con una publicación activa de un usuario o de la plataforma (`insertPlatformListing`) y desaparece al retirarla, sin esperar el TTL de la caché.
- [X] T017 [P] [US1] Crear `front/src/services/__tests__/market.service.test.ts` con los casos de `publishListing` y `withdrawListing` (ruta, body sin precio, mapeo de la respuesta) y de `marketErrorMessage` para cada código de US1.
- [X] T018 [P] [US1] Crear `front/src/components/__tests__/listing-controls.test.tsx`: sin publicación muestra «Poner a la venta»; con publicación muestra la marca «A la venta» y «Retirar»; los callbacks se llaman con el token; `disabled` bloquea los botones.
- [X] T019 [P] [US1] Actualizar `front/src/pages/__tests__/inventory-page.test.tsx`: publicar pide confirmación con el precio y el aviso de que sigue a la cotización; cancelar no llama al servicio; confirmar llama a `publishListing` y la carta pasa a «A la venta»; retirar también pide confirmación; un error muestra el mensaje de su código.

### Implementation for User Story 1

- [X] T020 [P] [US1] Crear `back/src/modules/market/dto/create-listing.dto.ts` (`tokenId` con `@IsUUID()`) y `dto/listing-response.dto.ts` (`id`, `tokenId`, `serial`, `playerId`, `status`, `price`, `listedAt`, `closedAt`) según el esquema `Listing` del contrato, con `@ApiProperty`.
- [X] T021 [US1] En `back/src/modules/market/market.repository.ts`, implementar `createListing(userId, tokenId, correlationId)` según research #6: bloquea el token con `for update` filtrando dueño y estado `de_usuario` (sin fila → error de token no encontrado); si ya tiene una publicación activa → error de ya publicado; lee `round(p."base_value")::int` (0 → error de sin cotización); inserta la publicación y el evento `puesta_en_venta` (`de_usuario` → `de_usuario`, vendedor → vendedor, `quote_price` = precio, rareza vigente, `reference_type = 'listing'`). Devuelve la publicación con su precio.
- [X] T022 [US1] En `back/src/modules/market/market.repository.ts`, implementar `withdrawListing(userId, listingId, correlationId)`: bloquea la publicación con `for update`; sin fila o con `seller_id` distinto del usuario → error de no encontrada; si no está `activa` → error de no activa; cierra como `retirada` con `closed_at` y `closed_correlation_id`; inserta el evento `retiro_de_venta`.
- [X] T023 [US1] En `back/src/modules/market/market.service.ts`, implementar `publish` y `withdraw`: llaman al repositorio, traducen sus errores con `MARKET_ERRORS`, emiten un log estructurado por operación (FR-034: contexto `MarketService`, con `listingId`, `tokenId` y `playerId`) y llaman a `PlayerService.invalidateListCache()` después de cada cambio (research #8).
- [X] T024 [US1] En `back/src/modules/market/market.controller.ts`, agregar `POST /market/listings` (201) y `POST /market/listings/:listingId/withdraw` (200, con `ParseUUIDPipe`), cada uno con `@UseGuards(JwtAuthGuard, ThrottlerGuard)`, `@Throttle({ default: { limit: () => Number(process.env.MARKET_RATE_LIMIT_MAX ?? 30), ttl: 60_000 } })` y los `@ApiResponse` del contrato, incluido el 429. El límite va como función (`@nestjs/throttler` 6 lo acepta) para que se lea en cada pedido: como valor fijo se evaluaría al cargarse el módulo y dependería de que `dotenv` (en `database.config.ts`) ya haya corrido.
- [X] T025 [US1] En `back/src/modules/player/player.repository.ts`, reemplazar la condición de `FOR_SALE_TOKEN_STATUSES` por `exists (select 1 from "listing" "ls" where "ls"."player_id" = "p"."id" and "ls"."status" = 'activa')`, y quitar `FOR_SALE_TOKEN_STATUSES` de `back/src/infrastructure/database/entities/token.entity.ts` (research #8).
- [X] T026 [US1] En `back/src/modules/tokens/tokens.repository.ts`, sumar a la consulta de tokens de `findInventoryPage` un `left join "listing"` activo para devolver `listing_id`; en `back/src/modules/tokens/dto/inventory-response.dto.ts` y en `tokens.service.ts`, exponer `listingId` (nullable) en cada token (FR-025).
- [X] T027 [P] [US1] Crear `front/src/services/market.service.ts` con los tipos de la respuesta, `publishListing(tokenId)`, `withdrawListing(listingId)` y `marketErrorMessage(code)` con un mensaje en español por código del contrato (reusar `extractApiErrorCode` de `front/src/services/packs.service.ts`).
- [X] T028 [P] [US1] En `front/src/services/inventory.service.ts`, sumar `listingId: string | null` a `InventoryToken`.
- [X] T029 [P] [US1] Crear `front/src/components/ListingControls.tsx`: componente presentacional que recibe `listed`, `price`, `disabled`, `onPublish` y `onWithdraw`; muestra la marca «A la venta» y el botón que corresponde. Solo Tailwind.
- [X] T030 [US1] En `front/src/pages/InventoryPage.tsx`, renderizar `ListingControls` debajo de cada `PlayerCard`. Publicar y retirar confirman con `ConfirmModal`: la confirmación de publicar muestra el precio actual (`player.marketValue`) y avisa que el precio sigue a la cotización del jugador (FR-037). Tras el éxito, recargar el inventario; ante un error, mostrar `marketErrorMessage(code)`. Mientras una operación está en curso, deshabilitar los controles.

**Checkpoint**: `npm run test:e2e -- market tokens players` (US1) y `npm test` del cliente en verde; desde `/inventory` se publica y se retira una carta, y su jugador aparece y desaparece del Market.

---

## Phase 4: User Story 2 - Comprar una carta (Priority: P1)

**Goal**: desde el detalle de un jugador, un usuario ve las cartas a la venta, elige una y la compra al precio vigente.

**Independent Test**: con dos usuarios, uno publica y el otro compra desde el detalle; el comprador pagó exactamente el precio, el vendedor recibió ese monto, la carta cambió de inventario y la suma de saldos no cambió.

### Tests for User Story 2

- [X] T031 [P] [US2] En `back/test/market.e2e-spec.ts`, agregar `describe('US2 — comprar')` con US2-1 a US2-14: compra exitosa con saldos, inventarios, publicación `vendida`, movimientos `compra_token` y `venta_token`, fila de `token_purchase` y evento `venta`; compra a la plataforma (`insertPlatformListing`) sin `venta_token`, con el token pasando de `en_venta_plataforma` a `de_usuario`; `OWN_LISTING`; `LISTING_NOT_ACTIVE` sobre vendida y retirada; `LISTING_NOT_FOUND`; `INSUFFICIENT_CREDITS` (con `setCredits`) y saldo justo que queda en 0; `PRICE_CHANGED` con `acceptedPrice` menor y cobro del precio vigente con `acceptedPrice` mayor; `userId` en el body → 422; sin sesión → 401; el comprador puede volver a publicar de inmediato la carta comprada (caso borde «Carta comprada que se vuelve a vender»). Para cada rechazo, comparar `snapshotMarketState` (T013) antes y después del pedido: saldos, inventarios, estado de la publicación y cantidad de filas de `credit_movement`, `token_purchase` y `token_event` deben quedar idénticos (FR-014, US2-12, SC-002).
- [X] T032 [US2] En `back/test/market.e2e-spec.ts`, agregar `describe('US2 — concurrencia, atomicidad e invariantes')`: dos compradores simultáneos sobre la misma publicación → un 201 y un 409 sin cobro al perdedor (SC-003); compra y retiro simultáneos → exactamente una operación (US1-10); un comprador con saldo para una carta y dos compras simultáneas → una sola completa (SC-004); A le compra a B mientras B le compra a A → ambas completan sin interbloqueo (research #5); la suma de saldos es igual a lo emitido menos lo cobrado por aperturas y ventas de la plataforma (SC-007); cada jugador sigue sumando 100 tokens en los cuatro estados (SC-008); `update` o `delete` sobre `token_purchase` → falla por trigger.
- [X] T033 [US2] En `back/test/market.e2e-spec.ts`, agregar casos de `GET /market/players/:playerId/listings`: orden de la más antigua a la más nueva, `price` = `marketValue`, `mine` según la sesión, sin datos del vendedor, paginado con `total`, lista vacía sin publicaciones y 404 `PLAYER_NOT_FOUND` para un id inexistente.
- [X] T034 [P] [US2] En `front/src/services/__tests__/market.service.test.ts`, agregar los casos de `fetchPlayerListings` y `purchaseListing` (ruta, body con `listingId` y `acceptedPrice`) y de `marketErrorMessage` para cada código de la compra.
- [X] T035 [P] [US2] Crear `front/src/components/__tests__/market-listings.test.tsx`: lista las cartas con su número de serie; las propias dicen «Tuya» y no tienen «Comprar»; sin publicaciones muestra que no hay cartas a la venta; con saldo menor que el precio el botón queda deshabilitado con el motivo; `onBuy` recibe la publicación.
- [X] T036 [P] [US2] Actualizar `front/src/pages/__tests__/home-market.test.tsx`: al abrir un jugador se piden sus publicaciones; «Comprar» confirma con la carta, el precio y el saldo que quedaría; cancelar no compra; confirmar llama a `purchaseListing` con el precio mostrado, refresca el saldo, la lista y el Market, y ofrece ir al inventario; un rechazo muestra su mensaje y vuelve a pedir el saldo y la lista (FR-039 a FR-042).
- [X] T063 [P] [US2] Actualizar `front/src/components/__tests__/player-detail-panel.test.tsx`: quitar las aserciones de la maqueta («Buy token», «No disponible», «todavía no está habilitada», hoy en las líneas 119 a 148) y verificar que el panel renderiza `MarketListings` con las props recibidas y que no hay selector de cantidad (FR-038).

### Implementation for User Story 2

- [X] T037 [P] [US2] Crear `back/src/modules/market/dto/purchase.dto.ts` (`listingId` con `@IsUUID()`, `acceptedPrice` con `@IsInt()` y `@Min(1)`) y `dto/purchase-response.dto.ts` según el esquema `Purchase` del contrato.
- [X] T038 [P] [US2] Crear `back/src/modules/market/dto/player-listings-query.dto.ts` (paginación como `back/src/modules/tokens/dto/inventory-query.dto.ts`) y `dto/player-listings-response.dto.ts` según `PlayerListingsPage`.
- [X] T039 [US2] En `back/src/modules/market/market.repository.ts`, implementar `purchase({ buyerId, listingId, acceptedPrice, correlationId })` según research #4 y #5, en este orden: bloquea la publicación (no existe → no encontrada; no `activa` → no activa; vendedor = comprador → propia); lee el precio y la rareza del jugador (precio 0 → sin cotización; precio > `acceptedPrice` → precio cambiado); bloquea las filas de `user` de comprador y vendedor con `where "id" in (…) order by "id" for update`; débito condicional del comprador (sin fila → saldo insuficiente); crédito al vendedor si no es la plataforma; `update "token"` condicionado al dueño o al estado `en_venta_plataforma`, que debe afectar exactamente una fila; cierre de la publicación como `vendida`; inserción de `compra_token`, `venta_token` (si hay vendedor), `token_purchase` y el evento `venta`, referenciados entre sí (data-model.md).
- [X] T040 [US2] En `back/src/modules/market/market.repository.ts`, implementar `findActiveListingsPage(playerId, viewerId, page, limit)`: verifica que el jugador exista (si no, error de jugador no encontrado) y devuelve el precio vigente (nulo si `base_value = 0`), el total y la página de publicaciones activas ordenadas por `created_at, id`, con `mine = (seller_id = viewerId)` y sin exponer `seller_id`.
- [X] T041 [US2] En `back/src/modules/market/market.service.ts`, implementar `purchase` y `listPlayerListings`: traducción de errores, log estructurado de la compra (FR-034: contexto `MarketService`, con `purchaseId`, `tokenId`, `listingId`, los dos ids de movimiento y el precio), e `invalidateListCache()` después de cada compra.
- [X] T042 [US2] En `back/src/modules/market/market.controller.ts`, agregar `POST /market/purchases` (201, con `@UseGuards(JwtAuthGuard, ThrottlerGuard)` y `@Throttle` como T024) y `GET /market/players/:playerId/listings` (con `ParseUUIDPipe` y solo `JwtAuthGuard`, sin límite de frecuencia), con los `@ApiResponse` del contrato.
- [X] T043 [P] [US2] En `front/src/services/market.service.ts`, agregar `fetchPlayerListings(playerId, page, limit)` y `purchaseListing(listingId, acceptedPrice)` con sus tipos, y los mensajes de los códigos de la compra en `marketErrorMessage`.
- [X] T044 [P] [US2] Crear `front/src/components/MarketListings.tsx`: componente presentacional que recibe `price`, `listings`, `balance`, `busy`, `onBuy` y la paginación; muestra cada carta con su número de serie, «Tuya» en las propias, «Comprar» en las ajenas, el motivo cuando el saldo no alcanza y un mensaje cuando no hay cartas a la venta. Solo Tailwind.
- [X] T045 [US2] En `front/src/components/PlayerDetailPanel.tsx`, reemplazar el bloque de maqueta (desde el comentario «Desde acá es maqueta») por `MarketListings`, que recibe por props; quitar el selector de cantidad y el texto «La compra de tokens todavía no está habilitada» (FR-038).
- [X] T046 [US2] En `front/src/pages/HomePage.tsx`, orquestar la compra: al abrir el detalle pedir `fetchPlayerListings`; «Comprar» abre `ConfirmModal` con la carta, el precio y el saldo que quedaría (`useCredits`); al confirmar llamar a `purchaseListing(listingId, price)`; tras el éxito refrescar el saldo, las publicaciones y el listado del Market y ofrecer un acceso a `/inventory`; ante un rechazo mostrar `marketErrorMessage(code)` y volver a pedir el saldo y las publicaciones. Impedir una segunda compra mientras hay una en curso.

**Checkpoint**: `npm run test:e2e -- market` (US1 y US2) en verde; desde la home se compra una carta publicada por otro usuario y el saldo, la lista y el Market se actualizan sin recargar.

---

## Phase 5: User Story 3 - Ver qué hay a la venta (Priority: P2)

**Goal**: el Market muestra cuántas cartas a la venta tiene cada jugador, y el precio de todas sus cartas sigue a la cotización.

**Independent Test**: publicar cartas de dos jugadores y verificar que el Market muestra exactamente esos dos con su precio y su `forSaleCount`; tras un recálculo de cotización, el precio del detalle es el nuevo.

### Tests for User Story 3

- [X] T047 [P] [US3] En `back/test/players.e2e-spec.ts`, agregar casos de `forSaleCount`: coincide con las publicaciones activas del jugador (de usuarios y de la plataforma), baja al vender o retirar, y los filtros existentes (posición, liga, valor, OVR, rareza, búsqueda) siguen funcionando sobre los jugadores con cartas a la venta (US3-1, US3-5, US3-7, SC-011).
- [X] T048 [P] [US3] En `back/test/market.e2e-spec.ts`, agregar `describe('US3 — el precio sigue a la cotización')`: con una publicación activa, actualizar la cotización del jugador (`base_value` en la base de test o una corrida de `POST /quotes/recalculate`) y verificar que el `price` del detalle cambia sin tocar la publicación, y que una compra con el `acceptedPrice` viejo se rechaza con `PRICE_CHANGED` si el precio subió (US1-9, US3-6).
- [X] T049 [P] [US3] Actualizar `front/src/components/__tests__/player-grid.test.tsx`: cada carta muestra «N a la venta» con su `forSaleCount`.

### Implementation for User Story 3

- [X] T050 [US3] En `back/src/modules/player/player.repository.ts`, contar las publicaciones activas de los jugadores de la página en una consulta aparte (como `findPriceSeries`) y adjuntar el conteo a `PlayerWithStats`; en `back/src/modules/player/dto/player-response.dto.ts`, exponer `forSaleCount` con `@ApiProperty` (FR-026). Verificar que `GET /players/{id}` lo informe igual.
- [X] T051 [P] [US3] En `front/src/services/players.service.ts`, sumar `forSaleCount: number` a `ApiPlayerCard`.
- [X] T052 [US3] En `front/src/components/PlayerGrid.tsx`, mostrar «N a la venta» debajo de cada `PlayerCard`, sin modificar `PlayerCard` (06 FR-020).

**Checkpoint**: `npm run test:e2e -- players market` en verde; el Market muestra la cantidad a la venta de cada jugador y el precio cambia con la cotización.

---

## Phase 6: User Story 4 - Consultar mis compras y ventas (Priority: P3)

**Goal**: un usuario consulta su historial de compras y ventas, y el historial de un token muestra sus ventas.

**Independent Test**: con compras y ventas entre dos usuarios, el historial de cada uno muestra exactamente sus operaciones, cada registro reproduce su saldo y ninguno se puede alterar.

### Tests for User Story 4

- [X] T053 [P] [US4] En `back/test/market.e2e-spec.ts`, agregar `describe('US4 — historial de operaciones')` con US4-1 a US4-8: orden de la más reciente a la más antigua; `compra` con saldo antes − precio = saldo después; `venta` con saldo antes + precio = saldo después; la contraparte como `otro_usuario` o `plataforma`; paginación; un usuario solo ve las suyas; y sumando en orden todos los movimientos de un usuario se reconstruye su saldo (SC-009).
- [X] T054 [P] [US4] En `back/test/tokens.e2e-spec.ts`, agregar casos: tras una venta, el comprador puede ver el historial completo del token, y el vendedor también; aparecen `puesta_en_venta`, `retiro_de_venta` y `venta` con su precio, y los dueños que no son el usuario aparecen como `otro_usuario`; el último evento coincide con el dueño actual (FR-024, SC-010).

### Implementation for User Story 4

- [X] T055 [P] [US4] Crear `back/src/modules/market/dto/operations-query.dto.ts` (paginación) y `dto/operations-response.dto.ts` según el esquema `Operation` del contrato.
- [X] T056 [US4] En `back/src/modules/market/market.repository.ts`, implementar `findOperationsPage(userId, page, limit)`: filas de `token_purchase` donde el usuario es comprador o vendedor, ordenadas por `created_at desc, id desc`, con `kind`, los saldos de su lado y la contraparte (`plataforma` si `seller_id` es nulo y el usuario compró; si no, `otro_usuario`), más el total.
- [X] T057 [US4] En `back/src/modules/market/market.service.ts` y `market.controller.ts`, exponer `GET /market/operations` con solo `JwtAuthGuard` (sin límite de frecuencia), paginado y documentado según el contrato.
- [X] T058 [P] [US4] En `back/src/modules/tokens/dto/token-history-response.dto.ts`, sumar `retiro_de_venta` y `venta` al enum de tipos y `listing` y `token_purchase` al de `referenceType`, y verificar que `TokenHistoryResponseDto.from` los mapee sin ocultarlos.

**Checkpoint**: `npm run test:e2e -- market tokens` en verde; `GET /market/operations` reproduce los saldos de cada operación.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: verificación integral, contrato y documentación.

- [X] T059 [P] Recorrer el Swagger (`/api`) y verificar que los 5 endpoints de `/market` y los campos nuevos (`forSaleCount`, `listingId`) coincidan con `.specify/specs/09-mercado/contracts/market.openapi.yaml`, incluidos los códigos de error por ruta.
- [X] T060 [P] Verificar que `RATE_LIMITED` (429) figure igual en la tabla de errores de `.specify/specs/09-mercado/spec.md` (revisión 5), en `contracts/market.openapi.yaml` y en el Swagger, y que solo lo devuelvan los tres `POST` de `/market`.
- [X] T064 Agregar a `back/test/market.e2e-spec.ts` un caso de rendimiento: 50 compras secuenciales de publicaciones distintas, midiendo cada una. Preparación: 50 publicaciones activas creadas con `insertPlatformListing` (T013) sobre 50 tokens `reservado` de jugadores cotizados, y `setCredits` del comprador a 50 veces el precio más alto de esos jugadores; el percentil 95 debe quedar por debajo de 2 s (SC-001). Es una cota sobre la base de test local, no una prueba de carga.
- [X] T061 Correr `cd back && npm test && npm run test:e2e && npm run lint` y `cd front && npm test && npm run build && npm run lint`; todo en verde.
- [ ] T062 Ejecutar los escenarios manuales M1 a M11 y W1 a W3 de `.specify/specs/09-mercado/quickstart.md` y anotar cualquier desvío.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup. **Bloquea todas las historias**. T007 depende de T002 a T006; T011 y T012 dependen de T002 y T003.
- **US1 (Phase 3)**: depende de Foundational.
- **US2 (Phase 4)**: depende de Foundational. Sus tests necesitan publicaciones: usan `createListing` de US1 o `insertPlatformListing` (T013); en la práctica va después de US1.
- **US3 (Phase 5)**: depende de US1 (necesita publicaciones y el filtro del Market de T025). Sus tests de precio usan la compra de US2 (T048).
- **US4 (Phase 6)**: depende de US2 (lee `token_purchase`).
- **Polish (Phase 7)**: depende de las historias que se quieran entregar.

### Within Each User Story

- Los tests se escriben primero y deben fallar antes de implementar.
- DTOs → repositorio → service → controller → cliente.
- En el cliente: servicio → componente presentacional → página.

### Parallel Opportunities

- Foundational: T002 a T005 (entidades distintas), T009 y T010 (filtro de errores) y T013 (fixtures) en paralelo.
- En cada historia, los tests marcados [P] en paralelo: tocan archivos distintos. Los que suman `describe` a `back/test/market.e2e-spec.ts` dentro de una misma historia (T031 a T033) van en secuencia.
- En cada historia, el cliente (servicio y componente) en paralelo con el backend, una vez fijado el contrato.
- T058 (DTO del historial) en paralelo con el resto de US4.

---

## Parallel Example: User Story 1

```bash
# Tests de US1, todos juntos:
Task: "T014 describe US1 en back/test/market.e2e-spec.ts"
Task: "T015 listingId en back/test/tokens.e2e-spec.ts"
Task: "T016 criterio del Market en back/test/players.e2e-spec.ts"
Task: "T017 front/src/services/__tests__/market.service.test.ts"
Task: "T018 front/src/components/__tests__/listing-controls.test.tsx"

# Cliente de US1 en paralelo con el backend:
Task: "T027 front/src/services/market.service.ts"
Task: "T028 front/src/services/inventory.service.ts"
Task: "T029 front/src/components/ListingControls.tsx"
```

## Parallel Example: User Story 2

```bash
# DTOs y cliente en paralelo, mientras se escribe la transacción de compra (T039):
Task: "T037 dto/purchase.dto.ts y dto/purchase-response.dto.ts"
Task: "T038 dto/player-listings-query.dto.ts y dto/player-listings-response.dto.ts"
Task: "T043 front/src/services/market.service.ts (compra y publicaciones)"
Task: "T044 front/src/components/MarketListings.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 + User Story 2)

US1 sola llena el Market pero no permite comprar; el mercado completo son las dos historias P1.

1. Completar Setup y Foundational.
2. Completar US1 → validar con su Independent Test (el Market muestra lo publicado).
3. Completar US2 → validar con su Independent Test (compra entre dos usuarios).
4. **Parar y validar**: escenarios M1 a M6 y M10, y W1 y W2 del quickstart.

### Incremental Delivery

1. Setup + Foundational → esquema y módulo listos.
2. US1 → publicar y retirar (demo: el Market deja de estar vacío).
3. US2 → comprar (demo: mercado completo, MVP).
4. US3 → cantidad a la venta en el Market y precio que sigue a la cotización.
5. US4 → historial de compras y ventas.

---

## Notes

- [P] = archivos distintos y sin dependencias incompletas.
- Las tareas sobre `market.repository.ts`, `market.service.ts` y `market.controller.ts` no llevan [P] entre sí: tocan el mismo archivo.
- T063 y T064 se sumaron después de `/speckit-analyze`. Para no renumerar, quedaron en su fase con IDs al final de la secuencia: T063 va junto a T036 y T064 antes de T061.
- Cada historia se puede verificar sola en su checkpoint.
- Commit después de cada tarea o grupo lógico.
- Estado de T062 (2026-10-20): M1 a M10 quedan cubiertos por sus equivalentes automáticos en `back/test/market.e2e-spec.ts`, `tokens.e2e-spec.ts` y `players.e2e-spec.ts`; M11 se ejecutó contra la app compilada con `MARKET_RATE_LIMIT_MAX=3` (cuarto POST → 429 `RATE_LIMITED`, diez GET sin 429). W1 a W3 no se recorrieron en un navegador: los cubren los tests de Vitest de `InventoryPage`, `HomePage`, `MarketListings` y `PlayerDetailPanel`. Falta recorrerlos a mano.
