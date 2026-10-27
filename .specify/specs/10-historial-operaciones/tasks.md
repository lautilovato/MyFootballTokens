# Tasks: Historial de Operaciones y Consulta de Cotizaciones por Fecha

**Input**: Design documents from `.specify/specs/10-historial-operaciones/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/history.openapi.yaml](./contracts/history.openapi.yaml), [quickstart.md](./quickstart.md)

**Tests**: SÍ se incluyen. Cada historia de la spec define un «Independent Test» con escenarios verificables, el plan fija los archivos de test (e2e en `/back`, Vitest en `/front`) y es la convención del proyecto (05 a 09).

**Organization**: las tareas se agrupan por historia de usuario para que cada una se implemente y verifique por separado. Las historias siguen el orden de la spec: US1 (P1), US2 (P2), US3 (P3) y US4 (P4).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo: toca archivos distintos y no depende de tareas incompletas.
- **[US#]**: historia de usuario a la que pertenece. Setup, Foundational y Polish no llevan etiqueta.

## Path Conventions

Backend en `back/` y cliente en `front/`, con la estructura de §7 de la constitución v4.1.0: entidades en `back/src/infrastructure/database/entities/`, módulos de dominio en `back/src/modules/<dominio>/`, e2e en `back/test/`, y en el cliente `pages/`, `components/`, `services/` y `app/`.

Convenciones que todas las tareas deben respetar (ver el código existente):

- Guards **por ruta**: `JwtAuthGuard` + `@ApiBearerAuth(SWAGGER_BEARER_SCHEME)` (`back/src/modules/market/market.controller.ts`). El usuario sale de `@CurrentUser()`, nunca del body ni de la query. `forbidNonWhitelisted` (ya activo en `main.ts` y en los e2e) rechaza un `userId` en la query.
- `HistoryController` lleva `@UseFilters(ApiErrorFilter)` a nivel de clase, como `MarketController`. Las excepciones de dominio se lanzan como `NotFoundException({ code: 'PLAYER_NOT_FOUND', message: '…' })`, con mensajes en español. Un `BadRequestException` del `ValidationPipe` sale como 422 `VALIDATION_ERROR`.
- El historial se arma con SQL explícito (`this.em.execute`), como `MarketRepository.findOperationsPage` (`back/src/modules/market/market.repository.ts`). `history` no define entidades.
- Las cartas del jugador salen de `PlayerService.findCardsByIds` (`PlayerModule` ya lo exporta). `HistoryModule` importa `AuthSharedModule` y `PlayerModule`, igual que `MarketModule`.
- Entidades con los decoradores de `@mikro-orm/decorators/legacy`. Las migraciones se generan con `migration:create` y se editan a mano, descartando las líneas que proponen borrar índices, CHECK o triggers que las entidades no declaran (`Migration20261020120000.ts`).
- En el cliente, toda la red pasa por `httpClient` (`front/src/services/http-client.ts`); los componentes no hacen HTTP; los tests de componentes usan `createRoot` + `act` (`front/src/components/__tests__/app-header.test.tsx`). jsdom no implementa `<dialog>.showModal()`: los tests del modal lo reemplazan por un doble o stubean `showModal` y `close` en `HTMLDialogElement.prototype`.
- Estilos solo con Tailwind (plan, Constitution Check). Sin librería de gráficos, sin GSAP y sin `.css` propio.
- `PlayerCard` no se modifica.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: confirmar el punto de partida. No hay dependencias que instalar (plan: Primary Dependencies) ni variables de entorno nuevas.

- [X] T001 Confirmar que el punto de partida está en verde antes de tocar nada: `cd back && npm run build && npm run test:e2e -- market quotes` y `cd front && npm test && npm run build`. Anotar cualquier test que ya falle para no atribuírselo a esta feature.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: el vínculo compra → cotización y el nombre de la estrategia, que usan US1, US2, US3 y US4.

**⚠️ CRITICAL**: ninguna historia puede empezar hasta terminar esta fase.

- [X] T002 En `back/src/infrastructure/database/entities/token-purchase.entity.ts`, sumar `quote?: PlayerQuote | null` (`@ManyToOne(() => PlayerQuote, { nullable: true })`) con un comentario: la cotización vigente cuando se fijó el precio (data-model.md, research #1). Importar `PlayerQuote` de `./player-quote.entity`.
- [X] T003 Generar la migración con `cd back && npx mikro-orm migration:create` (después de T002), para que se actualice `back/src/infrastructure/database/migrations/.snapshot.json`. Renombrarla a `Migration20261026120000.ts` y completarla a mano, quitando las líneas en que el generador propone borrar índices o triggers de migraciones anteriores. Con el estilo y el encabezado explicativo de `Migration20261020120000.ts`, en este orden dentro de `up()`:
  1. `alter table "token_purchase" add column "quote_id" uuid null`.
  2. `alter table "token_purchase" add constraint "token_purchase_quote_id_foreign" foreign key ("quote_id") references "player_quote" ("id")`.
  3. `alter table "token_purchase" disable trigger "token_purchase_immutable"`.
  4. Relleno: `update "token_purchase" tp set "quote_id" = (select q."id" from "player_quote" q where q."player_id" = tp."player_id" and q."calculated_at" <= tp."created_at" order by (q."price" = tp."price") desc, q."calculated_at" desc limit 1)`.
  5. `alter table "token_purchase" enable trigger "token_purchase_immutable"`.

  `down()` borra la FK y la columna. Verificar con `npx mikro-orm migration:up` sobre la base de desarrollo y con la consulta M0 de [quickstart.md](./quickstart.md): `precio_distinto = 0` y, tras el relleno, `update token_purchase set price = price` sigue fallando por el trigger.
- [X] T004 En `back/src/modules/market/market.repository.ts`, método `purchase()`: sumar a la primera consulta (la que bloquea `listing` con `for update of l` y lee el precio) la columna `(select q."id" from "player_quote" q where q."player_id" = l."player_id" order by q."calculated_at" desc limit 1) as "quote_id"`, y guardarla en el `insert into "token_purchase"` (nueva columna `"quote_id"` y su valor). Debe ir en la misma sentencia que `PRICE_SQL` para que precio y cotización vengan del mismo snapshot (research #1). No cambiar el orden de las validaciones ni el resultado de `purchase()`.
- [X] T005 [P] En `back/src/modules/quotes/dto/quote-run-response.dto.ts`, sumar `name: string` a `StrategyRefDto` (`@ApiProperty({ example: 'Performance' })`), y en `back/src/modules/quotes/dto/current-quote-response.dto.ts` completarlo al mapear la estrategia de la cotización (`quote.strategyVersion.strategy.name`, junto a `key` y `version`). Revisar `quote-run-response.dto.ts` y cualquier otro mapeo de `StrategyRefDto` (`grep -rn "StrategyRefDto" back/src`) para que todos lo completen; la entidad `ValuationStrategy` ya tiene `name`.
- [X] T006 [P] En `back/test/market.e2e-spec.ts`, agregar un caso: tras una compra, la fila de `token_purchase` tiene `quote_id` igual a la última cotización del jugador y `player_quote.price` de esa fila es igual a `token_purchase.price` (invariante 4 de data-model.md). Si los fixtures de `seedPlayers` (`back/test/support/packs-fixtures.ts`) no siembran filas de `player_quote`, insertar una cotización en el `beforeEach` del caso.
- [X] T007 [P] En `back/test/quotes.e2e-spec.ts`, ampliar los casos de cotización actual e historial: cada `strategy` incluye `key`, `name` y `version`. El resto de las aserciones de 07 (incluido el 400 de `from=ayer`) no cambia.

**Checkpoint**: `npm run test:e2e -- market quotes` en verde con la migración aplicada.

---

## Phase 3: User Story 1 - Ver mi historial de cartas adquiridas y vendidas en «Mi perfil» (Priority: P1) 🎯 MVP

**Goal**: el usuario entra a «Mi perfil» y ve, de la más reciente a la más antigua, una entrada por carta: recibida en un sobre («Primer propietario»), comprada o vendida; con filtro Todas / Adquiridas / Vendidas y paginación.

**Independent Test**: con un usuario que abrió un sobre de 3 cartas, compró una y vendió otra, `GET /history/operations` devuelve exactamente 5 entradas en orden descendente (las 3 del sobre sin precio, la compra y la venta con precio y saldos), el filtro cambia el total, y otro usuario nunca las ve. En el cliente, `/profile` muestra lo mismo.

### Tests for User Story 1

- [X] T008 [P] [US1] Agregar a `back/test/support/market-fixtures.ts` el helper `operationsHistory(app, jwt, query = '')` (`GET /history/operations`), con el estilo de `operations()`. *(Implementación: no hizo falta `insertPurchaseWithoutQuote`. Una compra de un jugador sin filas en `player_quote` ya queda con `quote_id` nulo, que es el caso «estrategia no disponible» de US4. También se agregó `back/test/support/quote-fixtures.ts` con `seedQuote`, que siembra cotizaciones, corridas y versiones de estrategia de prueba con clave `e2e-*`, y `cleanAll` las limpia.)*
- [X] T009 [US1] Crear `back/test/history.e2e-spec.ts` (usa T008 y los fixtures de `packs-fixtures.ts` y `market-fixtures.ts`; `cleanAll` y `resetCaches` en el `beforeEach`). Casos, con la misma configuración de app que `market.e2e-spec.ts` (mismo `ValidationPipe` que `main.ts`):
  - **Sobre**: abrir un sobre de varias cartas → una entrada `sobre` por carta, contiguas, con la misma `at`, `packType`, serial, rareza y jugador; `price`, `balanceBefore`, `balanceAfter`, `counterparty` y `quote` en `null`.
  - **Compra y venta**: `price` igual al cobrado; `balanceBefore - price = balanceAfter` en la compra y `balanceBefore + price = balanceAfter` en la venta; `counterparty` `otro_usuario` (y `plataforma` en una compra a una publicación de la plataforma, con `insertPlatformListing`); ningún campo identifica a la otra parte.
  - **Orden y desempate**: de la más reciente a la más antigua; un sobre con cartas con el mismo instante queda contiguo y estable.
  - **Filtros**: `type=all|acquired|sold` y sus `meta.total`; `acquired + sold = all`; `sold` solo trae `venta`.
  - **Paginación**: con `limit=2`, recorrer todas las páginas devuelve cada `id` exactamente una vez, incluso con las cartas de un sobre repartidas en dos páginas.
  - **Valores de origen**: cambiar la cotización del jugador (`player.base_value` o una cotización nueva) no cambia `price`, saldos ni rareza de entradas ya registradas (SC-002).
  - **Qué no aparece**: una compra rechazada (`INSUFFICIENT_CREDITS`), una publicación y un retiro no generan entradas (FR-010).
  - **Reventa**: comprar, vender y volver a comprar la misma carta produce tres entradas separadas.
  - **Cartas que ya no tiene**: una carta de sobre ya vendida sigue en su entrada original.
  - **Vacío**: un usuario sin operaciones recibe `data: []` y `meta.total: 0`.
  - **Aislamiento**: el historial de A no contiene entradas de B y viceversa; `?userId=…` responde 422.
  - **Errores**: sin sesión → 401 `UNAUTHENTICATED`; `type=todo`, `page=0` y `limit=500` → 422 `VALIDATION_ERROR`; todos con `{ code, message, correlationId }`.
  - **Solo lectura**: contar filas de `pack_opening`, `token_purchase`, `credit_movement`, `token_event` y `player_quote` antes y después de varias consultas; no cambian (FR-037).
- [X] T010 [P] [US1] Crear `back/src/modules/history/history-filter.spec.ts` (Jest): `kindsFor('all')` devuelve `['sobre', 'compra', 'venta']`, `'acquired'` devuelve `['sobre', 'compra']`, `'sold'` devuelve `['venta']`, y un valor desconocido lanza error.

### Implementation for User Story 1 (backend)

- [X] T011 [P] [US1] Crear `back/src/modules/history/history-filter.ts`: utilidad pura (sin decoradores de NestJS ni acceso a base, permitida por §7) con `export type HistoryKind = 'sobre' | 'compra' | 'venta'`, `export const HISTORY_TYPES = ['all', 'acquired', 'sold'] as const` y `kindsFor(type)` del T010.
- [X] T012 [P] [US1] Crear `back/src/modules/history/dto/operations-query.dto.ts`: `OperationsHistoryQueryDto` con `type?` (`@IsIn(HISTORY_TYPES)`, por defecto `all`), `page?` y `limit?` (mismas validaciones que `back/src/modules/market/dto/operations-query.dto.ts`: `DEFAULT_HISTORY_PAGE_SIZE = 20`, `MAX_HISTORY_PAGE_SIZE = 100`), con `@ApiPropertyOptional`.
- [X] T013 [P] [US1] Crear `back/src/modules/history/dto/operations-response.dto.ts` según el esquema `OperationEntry` de [history.openapi.yaml](./contracts/history.openapi.yaml): `OperationQuoteDto` (`id`, `calculatedAt`, `strategy: StrategyRefDto`), `OperationEntryDto` (`id`, `kind`, `at`, `tokenId`, `serial`, `rarity`, `player: PlayerCardDto`, `packType`, `price`, `balanceBefore`, `balanceAfter`, `counterparty`, `quote`, los cinco últimos `nullable`) y `OperationsHistoryPageDto` con `data` y `meta` (total, page, limit, totalPages). Reusar `StrategyRefDto` de `modules/quotes/dto/quote-run-response.dto.ts` y `PlayerCardDto` de `modules/player/dto/player-response.dto.ts`. Documentar con `@ApiProperty` que los campos de compra y venta son nulos en las entradas de sobre.
- [X] T014 [US1] Crear `back/src/modules/history/history.repository.ts` (depende de T011): método `findPage(userId, kinds, page, limit)` con `this.em.execute`. Una consulta de tres ramas `UNION ALL` (data-model.md, research #3), cada una incluida solo si su tipo está en `kinds`:
  - `sobre`: `pack_opening_card poc join pack_opening po on po.id = poc.opening_id where po.user_id = ?` → `id = poc.id`, `at = po.created_at`, `operation_id = po.id`, `token_id`, `serial = poc.serial`, `player_id`, `rarity = poc.rarity`, `pack_type = po.pack_type`, y los campos de compra y venta en `null`.
  - `compra`: `token_purchase tp join token t on t.id = tp.token_id where tp.buyer_id = ?` → `id = 'compra:' || tp.id`, `price`, saldos del comprador, `counterparty = case when tp.seller_id is null then 'plataforma' else 'otro_usuario' end`, `quote_id`.
  - `venta`: ídem con `tp.seller_id = ?`, `id = 'venta:' || tp.id`, saldos del vendedor y `counterparty = 'otro_usuario'`.

  Orden `at desc, operation_id desc, token_id`, `limit` y `offset`; el total con un `select count(*)` sobre las mismas ramas. Para las filas de la página, una segunda consulta resuelve `quote_id` → `player_quote` ⨝ `valuation_strategy_version` ⨝ `valuation_strategy` (`id`, `calculated_at`, `key`, `name`, `version`). Devolver filas tipadas (`HistoryRow`) sin armar DTOs: eso es del service. Todos los parámetros con `?`, sin interpolar valores.
- [X] T015 [US1] Crear `back/src/modules/history/history.service.ts` (depende de T014): `listOperations(userId, query)` aplica los valores por defecto de página y tamaño, llama al repositorio, resuelve `player` con `PlayerService.findCardsByIds` (los IDs únicos de la página) y arma `OperationsHistoryPageDto` con `meta`. Una entrada de sobre no lleva precio, saldos, contraparte ni cotización. Es solo lectura: no abre transacciones.
- [X] T016 [US1] Crear `back/src/modules/history/history.controller.ts` (depende de T015): `@ApiTags('History')`, `@Controller('history')`, `@UseFilters(ApiErrorFilter)`, y `GET operations` con `@UseGuards(JwtAuthGuard)`, `@ApiBearerAuth(SWAGGER_BEARER_SCHEME)`, `@ApiOperation` (resumen y descripción de [history.openapi.yaml](./contracts/history.openapi.yaml)) y `@ApiResponse` para 200, 401, 422 y 500. El usuario sale de `@CurrentUser()`. Sin `ThrottlerGuard`: son lecturas.
- [X] T017 [US1] Crear `back/src/modules/history/history.module.ts` (importa `AuthSharedModule` y `PlayerModule`; provee controller, service y repository) y registrar `HistoryModule` en `back/src/app.module.ts`. Correr `npm run test:e2e -- history` hasta dejar T009 en verde.

### Implementation for User Story 1 (frontend)

- [X] T018 [P] [US1] Crear `front/src/services/history.service.ts`: tipos `OperationKind`, `HistoryFilter` (`'all' | 'acquired' | 'sold'`), `OperationQuote`, `OperationEntry` y `OperationsPage` (con `player: ApiPlayerCard` de `players.service.ts`), y `getOperations(filter, page, limit)` con `httpClient.get('/history/operations', { params })`. Exportar `HISTORY_PAGE_SIZE = 20`. Si hace falta, `describeHistoryError(error)` con mensajes en español para 401, 422 y de red, como `market.service.ts`.
- [X] T019 [P] [US1] Crear `front/src/services/__tests__/history.service.test.ts` (mockear `httpClient`): arma la query con filtro y página, devuelve los datos tal cual y traduce los errores a mensajes.
- [X] T020 [P] [US1] Crear `front/src/components/OperationHistory.tsx` (presentacional, sin red): recibe `entries`, `meta`, `filter`, `loading`, `error`, `onFilterChange`, `onPageChange` y `onRetry`. Muestra: pestañas «Todas», «Adquiridas» y «Vendidas» con `role="tablist"`; por entrada, la fecha y hora (`toLocaleString('es-AR')`), una etiqueta del tipo («Adquirida por sobre» / «Adquirida por compra» / «Vendida»), la carta (jugador, club, rareza, «Serie #n»), y según el tipo:
  - `sobre`: «Primer propietario» y «Sobre {tipo}», sin precio ni saldos (FR-005).
  - `compra` / `venta`: precio en créditos, «Saldo: {antes} → {después}» y «Plataforma» u «Otro usuario».

  Las cartas de un mismo sobre se ven agrupadas (misma fecha contigua). Controles de página con el total, estado de carga, mensaje de error con «Reintentar» y, sin entradas, el vacío con enlaces a `/packs` y `/` (FR-013). Tailwind.
- [X] T021 [P] [US1] Crear `front/src/components/__tests__/operation-history.test.tsx`: etiquetas por tipo; «Primer propietario» sin precio ni saldos en `sobre`; precio y saldos en compra y venta; contraparte; cambio de pestaña llama `onFilterChange`; paginación; vacío con enlaces; error con «Reintentar».
- [X] T022 [US1] Crear `front/src/pages/ProfilePage.tsx` (depende de T018 y T020): `AppHeader` con `useAuth` y `useCredits` (patrón de `InventoryPage.tsx`), nombre del usuario y saldo (sin el correo, FR-002), y la sección «Historial de operaciones» que orquesta `getOperations` con estado de filtro y página (al cambiar de filtro vuelve a la página 1), carga, error y reintento.
- [X] T023 [US1] En `front/src/app/App.tsx`, sumar la ruta `/profile` con `ProtectedRoute` y `ProfilePage` (después de `/inventory`), con el comentario del FR-001.
- [X] T024 [P] [US1] En `front/src/components/AppHeader.tsx`, sumar `<NavLink to="/profile" className={navClass}>Mi perfil</NavLink>` después de «Mis cartas», y actualizar `front/src/components/__tests__/app-header.test.tsx` para verificar el enlace `['Mi perfil', '/profile']`.
- [X] T025 [P] [US1] Crear `front/src/pages/__tests__/profile-page.test.tsx` (patrón de `inventory-page.test.tsx`, con `getOperations` mockeado): muestra nombre y saldo y no el correo; carga la primera página; cambiar de filtro pide la página 1 con el filtro nuevo; pasar de página pide la siguiente; error y reintento; vacío.

**Checkpoint**: US1 completa. Mi perfil muestra el historial real; `npm run test:e2e -- history` y `npm test` en verde.

---

## Phase 4: User Story 2 - Ver el gráfico completo de cotizaciones de un jugador (Priority: P2)

**Goal**: «Ver más» en el bloque «Price History» abre un modal con todas las cotizaciones del jugador, ejes con fechas y precios, selección de un punto con su estrategia y versión, y leyenda de los cambios de estrategia. Debajo del gráfico del panel, la estrategia de la cotización vigente.

**Independent Test**: con un jugador con varias cotizaciones de dos estrategias o versiones, abrir el modal desde el detalle y verificar que el gráfico muestra todas, que cada punto dice su estrategia y versión, que el cambio se distingue por color y forma, y que la lista en texto contiene todas las cotizaciones.

### Tests for User Story 2

- [X] T026 [P] [US2] Crear `front/src/services/__tests__/quotes.service.test.ts` (mockear `httpClient`): `fetchAllQuotes` pide la página 1 con `limit=200`, y si `meta.total` supera 200 pide las páginas restantes y devuelve todas en orden cronológico; `fetchCurrentQuote` devuelve la estrategia y la fecha; un error de red se propaga.
- [X] T027 [P] [US2] Crear `front/src/services/__tests__/quote.mapper.test.ts`: `strategyLabel` («Performance v2»), series por estrategia+versión con color y forma de marcador asignados en ciclo, `changePoints` (índices donde cambia la estrategia o la versión), y la regla de marcadores (todos si hay hasta 60 puntos; con más, solo los cambios, el elegido y el resaltado).
- [X] T028 [P] [US2] Crear `front/src/components/__tests__/quote-chart.test.tsx`: el `<svg>` tiene `role="img"` y nombre accesible; dibuja ejes con marcas de fecha y de precio; una leyenda con una entrada por estrategia+versión; líneas verticales en los cambios de estrategia; clic en el gráfico selecciona la cotización más cercana (`onSelect`); con el gráfico enfocado, las flechas izquierda y derecha mueven la selección; con 500 puntos no dibuja 500 marcadores.
- [X] T029 [P] [US2] Crear `front/src/components/__tests__/price-history-modal.test.tsx` (stubear `showModal` y `close` de `HTMLDialogElement`): con `open` muestra el nombre del jugador y el gráfico; cargando y error con «Reintentar»; una sola cotización muestra el aviso «todavía no hay historial para comparar»; elegir un punto muestra precio, score, fecha y hora, origen y estrategia con versión; la lista en texto tiene una fila por cotización y cada fila es un botón que la selecciona; cierra con el botón, con Escape (`cancel`) y con clic en el fondo.

### Implementation for User Story 2

- [X] T030 [P] [US2] Crear `front/src/services/quotes.service.ts`: tipos `ApiStrategyRef` (`key`, `name`, `version`), `ApiQuote` (según el esquema `Quote` del contrato) y `CurrentQuote`; `fetchAllQuotes(playerId)` (primera página con `limit=200`; si `meta.total` lo exige, las demás en paralelo, y concatenar en orden) y `fetchCurrentQuote(playerId)` sobre `GET /quotes/players/{id}/current` (devuelve `null` si `quoted` es falso). Toda la red por `httpClient`.
- [X] T031 [P] [US2] Crear `front/src/services/quote.mapper.ts`: funciones puras `strategyLabel(ref)`, `buildSeries(quotes)` (agrupa por estrategia+versión y asigna color y forma de marcador en ciclo: círculo, cuadrado, triángulo, rombo), `changePoints(quotes)` y `markersToDraw(quotes, selectedIndex, highlightIndex)` con la regla de T027. Sin DOM ni red.
- [X] T032 [US2] Crear `front/src/components/QuoteChart.tsx` (depende de T031): SVG con eje horizontal de fechas y vertical de precios, línea de la serie completa, marcadores de forma y color por estrategia, líneas verticales punteadas en los cambios, y leyenda con el nombre de cada estrategia+versión. Recibe `quotes`, `selectedIndex`, `highlightIndex?` y `onSelect`. Clic o toque eligen la cotización más cercana en el eje horizontal; el `<svg>` tiene `tabIndex={0}` y `onKeyDown` con flechas izquierda y derecha; `role="img"` y `aria-label` con el rango y la cantidad de cotizaciones. Un solo tab stop. Tailwind y `currentColor`/clases de color de la paleta existente; el significado no depende solo del color.
- [X] T033 [US2] Crear `front/src/components/PriceHistoryModal.tsx` (depende de T032): `<dialog>` nativo controlado por `open` (`showModal()` / `close()` en un efecto, como `ConfirmModal.tsx` pero sin GSAP ni `.css`). Recibe `open`, `playerName`, `quotes`, `loading`, `error`, `selectedIndex`, `highlightIndex?`, `onSelect`, `onRetry` y `onClose`. Contenido: título con el jugador, `QuoteChart`, el detalle de la cotización elegida (precio, score, fecha y hora, origen «Automática»/«Manual», estrategia con versión), el aviso de una sola cotización, el estado de carga, el error con «Reintentar» y la alternativa en texto: tabla desplazable con fecha, precio y estrategia donde cada fila es un `<button>` que selecciona esa cotización. Cierra con botón «Cerrar», Escape y clic en el fondo (`onClose`); el `<dialog>` deja el foco dentro y el resto inerte.
- [X] T034 [US2] Crear `front/src/pages/usePriceHistory.ts` (depende de T030): hook que expone `state` (`open`, `playerId`, `playerName`, `quotes`, `loading`, `error`, `selectedIndex`) y las acciones `openFor(playerId, playerName)`, `close()`, `select(index)` y `retry()`. Al abrir llama `fetchAllQuotes`, deja seleccionada la última cotización, ignora respuestas de un jugador anterior (patrón de cancelación de `HomePage.tsx`) y no dispara pedidos si está cerrado.
- [X] T035 [US2] En `front/src/components/PlayerDetailPanel.tsx`, bloque «Price History»: sumar la prop opcional `priceHistoryView?: { quoteLabel: string | null; onOpen: () => void }`. Mostrar el botón «Ver más» (`type="button"`) solo si `player.priceHistory.length >= 1` y `priceHistoryView` está presente (FR-019), y bajo el gráfico la línea «Cotizado con {quoteLabel}» solo si `quoteLabel` no es nulo (FR-020). Con cero cotizaciones se conserva el texto actual y no hay botón. El mini-gráfico de 30 puntos no cambia.
- [X] T036 [US2] En `front/src/pages/HomePage.tsx` (depende de T034 y T035): al elegir un jugador, pedir `fetchCurrentQuote(selectedId)` (cancelando la respuesta si cambia la selección; si falla, `quoteLabel` queda nulo y el panel sigue funcionando), pasar a `PlayerDetailPanel` el `priceHistoryView` con `strategyLabel(...)` y `onOpen = () => priceHistory.openFor(selectedId, detail.name)`, y renderizar `PriceHistoryModal` conectado al hook.
- [X] T037 [P] [US2] Actualizar `front/src/components/__tests__/player-detail-panel.test.tsx`: aparece «Ver más» con una o más cotizaciones y llama a `onOpen`; no aparece sin cotizaciones ni sin `priceHistoryView`; la línea «Cotizado con Performance v2» aparece cuando hay `quoteLabel` y se omite cuando es nulo.
- [X] T038 [P] [US2] Actualizar `front/src/pages/__tests__/home-market.test.tsx` (con `quotes.service` mockeado): al abrir un jugador se pide la cotización actual y se muestra la estrategia; «Ver más» abre el modal con las cotizaciones cargadas; si `fetchCurrentQuote` falla, el panel funciona sin la línea; cerrar el modal deja el panel igual.

**Checkpoint**: US2 completa. El modal funciona desde el detalle del Market.

---

## Phase 5: User Story 3 - Buscar la cotización de un jugador en una fecha dada (Priority: P3)

**Goal**: dentro del modal, un filtro de fechas permite acotar el gráfico a un rango y buscar la cotización vigente de un día puntual, con su estrategia y versión.

**Independent Test**: con un jugador con cotizaciones semanales, `GET /quotes/players/{id}/at` devuelve la última calculada hasta el instante dado (inclusive), `quoted=false` con la fecha de la primera si no había, 422 para fechas futuras o inválidas y 404 para un jugador inexistente; en el modal, elegir un día intermedio resalta esa cotización y aclara cuándo se calculó.

### Tests for User Story 3

- [X] T039 [US3] En `back/test/quotes.e2e-spec.ts`, agregar un `describe('GET /quotes/players/:id/at')` (después de T007) con: un instante entre dos cotizaciones devuelve la anterior (nunca la siguiente ni una interpolada) con `strategy.name` y `version`; `at` exactamente igual a una `calculatedAt` devuelve esa misma (inclusivo); anterior a la primera → 200 con `quoted: false`, `quote: null` y `firstQuotedAt`; jugador nunca cotizado → `quoted: false` y `firstQuotedAt: null`; después de cambiar la estrategia activa y recalcular, `at` sobre una cotización vieja sigue devolviendo su estrategia y versión originales; `at` a más de 24 h en el futuro → 422 `VALIDATION_ERROR`; `at` ausente o mal formado → 422; `playerId` inexistente → 404 `PLAYER_NOT_FOUND`; `playerId` que no es UUID → 422; sin sesión → 401 `UNAUTHENTICATED`; todos con `{ code, message, correlationId }`; no cambia el conteo de `player_quote` (solo lectura). El e2e de 07 que espera 400 en `/history` no se toca.

### Implementation for User Story 3 (backend)

- [X] T040 [P] [US3] Crear `back/src/modules/quotes/dto/quote-at-query.dto.ts` (`QuoteAtQueryDto` con `at` obligatorio, `@IsISO8601()`, `@ApiProperty`) y `back/src/modules/quotes/dto/quote-at-response.dto.ts` (`QuoteAtResponseDto`: `playerId`, `at`, `quoted`, `quote: QuoteDto | null`, `firstQuotedAt: Date | null`, con `@ApiProperty` según el esquema `QuoteAtResponse` del contrato). Reusar `QuoteDto` de `current-quote-response.dto.ts`.
- [X] T041 [US3] En `back/src/modules/quotes/quotes.repository.ts`, sumar `findAt(playerId, at)` (la última `PlayerQuote` con `calculatedAt <= at`, `orderBy calculatedAt desc`, `limit 1`, `populate ['strategyVersion.strategy']`; usa el índice `player_quote(player_id, calculated_at desc)`) y `findFirstCalculatedAt(playerId)` (la `calculatedAt` mínima o `null`).
- [X] T042 [US3] En `back/src/modules/quotes/quotes.service.ts`, sumar `getAt(playerId, query)` (depende de T040 y T041): rechazar con `BadRequestException` un `at` más de 24 h adelante de `new Date()` (el `ApiErrorFilter` lo traduce a 422 `VALIDATION_ERROR`; comentar la tolerancia, research #4), comprobar que el jugador existe con la misma consulta que usa `getCurrent` y lanzar `NotFoundException({ code: 'PLAYER_NOT_FOUND', message: … })` si no, llamar a `findAt` y, solo si no hay cotización, a `findFirstCalculatedAt`. Mapear con el mismo `QuoteDto` que el historial.
- [X] T043 [US3] En `back/src/modules/quotes/quotes.controller.ts`, sumar `GET players/:playerId/at` (depende de T042) con `@UseGuards(JwtAuthGuard)`, `@ApiBearerAuth`, `@UseFilters(ApiErrorFilter)` **solo en este método**, `ParseUUIDPipe` en `playerId` y `@ApiResponse` para 200, 401, 404, 422 y 500, con un comentario que explique por qué el filtro va en el método (los otros endpoints conservan el formato de 07, plan, Complexity Tracking). Correr `npm run test:e2e -- quotes` hasta dejar T039 en verde.

### Implementation for User Story 3 (frontend)

- [X] T044 [P] [US3] Crear `front/src/pages/date-filter.ts`: funciones puras `todayLocal(now?)` (`YYYY-MM-DD` en la zona del navegador, para el `max` del selector), `startOfLocalDay(day)` y `endOfLocalDay(day)` (devuelven el instante ISO en UTC del comienzo y el final de ese día local), `isValidDay(value)` y `validateRange(from, to, today)` (devuelve un mensaje en español si `from > to`, si alguna fecha está mal formada o es futura, o `null` si es válida).
- [X] T045 [P] [US3] Crear `front/src/pages/__tests__/date-filter.test.ts`: con `TZ` fijada (por ejemplo `America/Argentina/Buenos_Aires` y `Pacific/Kiritimati`) el final de un día local es 23:59:59.999 de ese día; una cotización calculada a las 02:00 del lunes en la zona del usuario cae en el lunes; `validateRange` rechaza el rango invertido, la fecha futura y la mal formada, y acepta hoy.
- [X] T046 [US3] En `front/src/services/quotes.service.ts` (después de T030), sumar `QuoteAt` (`quoted`, `quote`, `firstQuotedAt`) y `fetchQuoteAt(playerId, at)` sobre `GET /quotes/players/{id}/at?at=…`, con `describeQuoteError` que traduce 422 («La fecha no es válida») y 404 («El jugador no existe») a mensajes en español. Ampliar `quotes.service.test.ts` con estos casos.
- [X] T047 [US3] En `front/src/pages/usePriceHistory.ts` (después de T034, depende de T044 y T046), sumar al estado y a las acciones: `range` (`from`, `to`) con `applyRange`/`clearRange` (valida con `validateRange`; si es inválido guarda el mensaje y no cambia `quotes` visibles); las cotizaciones visibles son las de la serie cargada con `calculatedAt` dentro del rango (inclusivo, sin ir a la red); si el rango queda sin cotizaciones, pide `fetchQuoteAt(playerId, startOfLocalDay(from))` para informar la vigente al comienzo (FR-032); `searchDay(day)` valida el día (no futuro), pide `fetchQuoteAt(playerId, endOfLocalDay(day))`, guarda el resultado (`quoted`, `quote`, `firstQuotedAt`, y si la cotización se calculó otro día) y deja resaltada esa cotización en la serie cargada; `clearDay()`. Cambiar de día o de rango no cierra el modal.
- [X] T048 [US3] En `front/src/components/PriceHistoryModal.tsx` (después de T033), sumar el filtro de fechas: dos `<input type="date">` «Desde» y «Hasta» con `max={todayLocal()}` y botones «Aplicar» y «Limpiar»; un `<input type="date">` «Ver cotización del día» con `max={todayLocal()}` y botón «Buscar». Mostrar: el resultado del día (precio, score, fecha y hora de cálculo, origen y estrategia con versión; «Calculada el {fecha}» cuando no fue ese día); «No había cotización a esa fecha; la primera se calculó el {fecha}» cuando `quoted` es falso; «No hay cotizaciones en ese rango» con la vigente al comienzo si existe; y el mensaje de validación para un rango invertido o una fecha inválida. El gráfico recibe `highlightIndex` de la cotización encontrada.
- [X] T049 [P] [US3] Crear `front/src/components/__tests__/price-history-filters.test.tsx` (con el modal y el hook conectados a `quotes.service` mockeado): buscar un día entre dos cotizaciones muestra la anterior y «Calculada el …»; un día anterior a la primera muestra el aviso con la fecha de la primera y ningún precio; el selector tiene `max` igual a hoy; el rango acota la lista y el gráfico; un rango sin cotizaciones muestra el aviso y la vigente al comienzo; el rango invertido muestra el mensaje y no cambia la lista; «Limpiar» restaura el gráfico completo; cambiar de día actualiza el resultado sin cerrar el modal.

**Checkpoint**: US3 completa. La búsqueda por fecha funciona en el modal y `/at` está documentado.

---

## Phase 6: User Story 4 - Ver con qué cotización y estrategia compré o vendí cada carta (Priority: P4)

**Goal**: cada compra y venta del historial muestra que su precio es la cotización de ese instante y con qué estrategia y versión se calculó; desde cualquier entrada se abre el gráfico del jugador con la cotización de ese momento resaltada.

**Independent Test**: con una compra y una venta con estrategias distintas en cada instante, las entradas muestran su estrategia y versión (y no cambian al activar otra); una compra sin vínculo muestra «estrategia no disponible»; «Ver evolución» abre el modal con la cotización vigente en el instante de la operación resaltada.

### Tests for User Story 4

- [X] T050 [US4] En `back/test/history.e2e-spec.ts` (después de T009), agregar: una compra hecha con la estrategia A y otra con la B (crear una versión nueva, activarla y recalcular entre las dos) muestran `quote.strategy` distinto; activar otra estrategia y recalcular después no cambia la `quote.strategy` ni el `price` de entradas ya registradas (invariante de SC-002); `price` de cada compra o venta es igual al `price` de su `quote` (invariante 4), y `GET /quotes/players/{id}/at` con `at = entry.at` devuelve la misma cotización que `entry.quote.id`; una compra insertada con `insertPurchaseWithoutQuote` devuelve `quote: null`; las entradas de `sobre` siempre devuelven `quote: null`.
- [X] T051 [P] [US4] Crear `front/src/components/__tests__/operation-history-quote.test.tsx`: una compra y una venta muestran «Cotización de ese momento: {precio} · {estrategia} v{n}»; una entrada con `quote` nulo muestra «Estrategia no disponible» y sigue mostrando el precio; las entradas de sobre no muestran cotización ni estrategia; el botón «Ver evolución» aparece en las tres clases de entrada y llama a `onViewPlayer(playerId, at)`.

### Implementation for User Story 4

- [X] T052 [US4] En `front/src/components/OperationHistory.tsx` (después de T020): en compras y ventas, mostrar bajo el precio «Cotización de ese momento: {precio} · {strategyLabel} v{n}» (o «Estrategia no disponible» si `quote` es nulo); en todas las entradas, un botón «Ver evolución» que llama a la nueva prop `onViewPlayer(playerId, at)`. Las entradas de sobre siguen sin precio, saldos ni cotización.
- [X] T053 [US4] En `front/src/pages/usePriceHistory.ts` (después de T047), aceptar un `highlightAt?` en `openFor(playerId, playerName, highlightAt?)`: tras cargar la serie, pedir `fetchQuoteAt(playerId, highlightAt)`, dejar seleccionada y resaltada esa cotización dentro de la serie cargada (por `quote.id`) y exponer `highlightIndex`. Si no hay cotización vigente a ese instante, abrir sin resaltado.
- [X] T054 [US4] En `front/src/pages/ProfilePage.tsx` (después de T022 y T053), renderizar `PriceHistoryModal` conectado a `usePriceHistory` y pasar a `OperationHistory` `onViewPlayer = (playerId, at) => priceHistory.openFor(playerId, name, at)` con el nombre del jugador de la entrada.
- [X] T055 [P] [US4] Ampliar `front/src/pages/__tests__/profile-page.test.tsx`: «Ver evolución» abre el modal del jugador de esa entrada, pide el historial y la cotización vigente en `entry.at`, y deja resaltada la correcta; cerrar el modal deja el historial como estaba.

**Checkpoint**: las cuatro historias funcionan. El historial y el gráfico muestran la estrategia de cada cotización.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T056 Correr y dejar en verde, en `back/`: `npm run build`, `npm run lint` y `npm run test:e2e -- history quotes market players tokens packs` (08 y 09 deben seguir intactas), más `npm test` si hay unitarios (`history-filter.spec.ts`); y en `front/`: `npm test`, `npm run build` y `npm run lint`. Corregir cualquier regresión.
- [X] T057 [P] Revisar la cobertura de los archivos nuevos (`history/*`, `quotes` modificado y los componentes y servicios del cliente) contra lo que pide `sonar-project.properties`; agregar tests donde falte, sin excluir archivos nuevos de la cobertura.
- [X] T058 [P] Abrir Swagger (`/api`) y comprobar que `GET /history/operations` y `GET /quotes/players/{playerId}/at` aparecen con sus parámetros, esquemas y códigos 200, 401, 404 (solo `/at`), 422 y 500, y que `strategy.name` figura en los esquemas de cotización (FR-038).
- [ ] T059 Ejecutar los escenarios de [quickstart.md](./quickstart.md): M0 a M9 (backend) y F1 a F6 (frontend, incluida la prueba de teclado y lector de pantalla de F6). Anotar cualquier desvío y corregirlo antes de dar la feature por terminada.
- [ ] T060 Marcar como completadas las tareas en este archivo y actualizar el `Status` de [spec.md](./spec.md) cuando todo lo anterior esté en verde.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup y **bloquea todas las historias**. Dentro de la fase: T002 → T003 → T004; T005, T006 y T007 pueden ir en paralelo con T003 y T004 una vez hecho T002 (T006 necesita T004 para pasar).
- **US1 (Phase 3, P1)**: depende de Foundational (necesita `quote_id` y `strategy.name` para el campo `quote`).
- **US2 (Phase 4, P2)**: depende de Foundational (`strategy.name`). **No depende de US1**: el modal y la home son independientes del perfil.
- **US3 (Phase 5, P3)**: depende de US2 (el filtro vive en el modal y en el hook). El backend de `/at` (T039 a T043) no depende de nada del frontend y puede avanzar en paralelo con US1 y US2.
- **US4 (Phase 6, P4)**: depende de US1 (la lista), US2 (el modal) y US3 (`/at` para resaltar).
- **Polish (Phase 7)**: depende de las historias que se vayan a entregar.

### Within Each User Story

- Los tests se escriben antes que la implementación y deben fallar primero.
- Backend: DTOs y utilidades puras → repositorio → service → controller → módulo.
- Frontend: servicios y mapeos puros → componentes presentacionales → hook → páginas.

### Parallel Opportunities

- Foundational: T005, T006 y T007 en paralelo (archivos distintos).
- US1: T008 y T010 a la par; T011, T012 y T013 (archivos distintos); en el cliente T018, T019, T020, T021, T024 y T025 a la par.
- US2: T026, T027, T028 y T029 (tests); T030 y T031 (servicios); T037 y T038 (tests de panel y home).
- US3: T040 y T044/T045 en paralelo; el backend (T039 a T043) y el frontend (T044 a T049) avanzan por separado hasta que el hook consume `fetchQuoteAt` (T047).
- Con dos personas: una toma US1 completa y la otra US2 (más el backend de US3).

### Parallel Example: User Story 1

```text
# Lanzar a la vez (archivos distintos):
Task T011: back/src/modules/history/history-filter.ts
Task T012: back/src/modules/history/dto/operations-query.dto.ts
Task T013: back/src/modules/history/dto/operations-response.dto.ts
Task T018: front/src/services/history.service.ts
Task T020: front/src/components/OperationHistory.tsx
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Completar Setup y Foundational (T001 a T007).
2. Completar US1 (T008 a T025).
3. **Validar**: `npm run test:e2e -- history`, `npm test` y los escenarios M1 a M4 y F1 y F2 del quickstart.
4. El usuario ya ve su historial de cartas adquiridas y vendidas en «Mi perfil». Se puede mostrar o desplegar.

### Incremental Delivery

1. Foundational → base lista.
2. **US1** → historial en «Mi perfil» (MVP).
3. **US2** → gráfico completo con estrategia por cotización.
4. **US3** → búsqueda por fecha en el modal.
5. **US4** → cotización y estrategia en cada compra y venta, y acceso al gráfico desde el historial.
6. Cada historia suma valor sin romper las anteriores.

---

## Notes

- **Desvíos de la implementación** (ninguno cambia lo que ve el usuario ni la spec):
  - T008: no hizo falta `insertPurchaseWithoutQuote`; una compra de un jugador sin filas en `player_quote` queda con `quote_id` nulo. Se agregó `back/test/support/quote-fixtures.ts` (`seedQuote`) para sembrar cotizaciones, corridas y versiones de prueba con clave `e2e-*`, que `cleanAll` limpia.
  - T028 y T032: el gráfico usa `role="slider"` (no `role="img"`) porque es el único tab stop y las flechas mueven la selección; `aria-valuetext` describe la cotización elegida.
  - T048 y T053: la cotización resaltada se identifica por `calculatedAt`, no por id, porque las cotizaciones del historial de 07 no exponen `id`. El filtro de fechas llega al modal como un grupo `filters` opcional.
  - T036: el modal se renderiza en `HomePage` y en `ProfilePage` con el mismo hook (`usePriceHistory`), que expone `state`, `filters` y las acciones.
  - Los e2e de 07 que comparaban `strategy` con `toEqual` pasaron a incluir `name` (`quotes` y `valuation-strategies`).
- **T059 queda abierta**: M1 a M8 están cubiertos por los e2e, y el relleno de M0 por un test que verifica la regla de la migración contra `purchase()`. F1 a F5 se miraron en el navegador contra una API falsa (escritorio y 375 px). Falta, sobre una base real: M0 con datos reales, M9 (tiempos con 1.000 entradas y 500 cotizaciones) y F6 (lector de pantalla). T060 depende de eso.
- **Spec 09 intacta**: `GET /market/operations` no se toca ni se deja de testear; el cliente nuevo usa `GET /history/operations`.
- **Spec 07 intacta**: el historial de cotizaciones solo gana `strategy.name`; su 400 sigue siendo el de 07.
- **Sin cambios de comportamiento financiero**: la única modificación a una ruta de escritura es la de T004, que agrega una columna al insert de la compra sin cambiar validaciones ni resultado.
- Las tareas que tocan un mismo archivo (`usePriceHistory.ts`, `PriceHistoryModal.tsx`, `OperationHistory.tsx`, `quotes.service.ts`, `profile-page.test.tsx`, `history.e2e-spec.ts`, `quotes.e2e-spec.ts`) se hacen en el orden indicado.
- Confirmar que cada test falla antes de implementar, y hacer commit por tarea o por grupo lógico.
