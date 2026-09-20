# Tasks: Homepage de Mercado (Striker Market)

**Input**: Design documents from `.specify/specs/06-home/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/home.openapi.yaml](./contracts/home.openapi.yaml), [quickstart.md](./quickstart.md)

**Tests**: SÍ se incluyen. La spec los exige en sus criterios de aceptación y el plan fija la estrategia en research #12: specs unitarias para las funciones puras, e2e para los endpoints, Vitest en el cliente.

**Organization**: Las tareas se agrupan por historia de usuario para que cada una pueda implementarse y verificarse por separado.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo — toca archivos distintos y no depende de tareas incompletas.
- **[US#]**: historia de usuario a la que pertenece. Setup, Foundational y Polish no llevan etiqueta.

## Path Conventions

Dos árboles hermanos, según la constitución §7: `back/src/` (NestJS) y `front/src/` (Vite + React).
Ambos ya existen. Esta feature **no crea entidades ni instala dependencias**: el único cambio de
base de datos es la migración de la fase 1.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: preparar la base de datos para la búsqueda por nombre y para el filtrado por rating.

- [X] T001 Crear la migración en `back/src/infrastructure/database/migrations/` que ejecute `CREATE EXTENSION IF NOT EXISTS unaccent`, declare una función auxiliar propia marcada `IMMUTABLE` que envuelva a `unaccent` —PostgreSQL la declara `STABLE` y sin ese envoltorio el índice funcional no se puede crear— y cree los índices `player(<fn>(full_name))` y `player_season_stats(season, rating)` (data-model.md §3, research #4)
- [X] T002 Implementar el `down()` de la migración de T001, en `back/src/infrastructure/database/migrations/`, revirtiendo los dos índices y la función auxiliar **sin** eliminar la extensión `unaccent`, que pudo ser creada por otro motivo en el mismo esquema (data-model.md §3)
- [X] T003 Aplicar la migración con `npx mikro-orm migration:up` desde `back/` y verificar que el índice funcional quedó creado (quickstart.md, Prerrequisitos)

**Checkpoint**: la base soporta búsqueda sin acentos y filtrado por rating con índice.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: las derivaciones puras que las tres historias necesitan. Son funciones sin decoradores, sin inyección y sin acceso a base, amparadas por la excepción de la constitución §7 (plan.md, Complexity Tracking #2).

**⚠️ CRITICAL**: ninguna historia puede comenzar hasta terminar esta fase.

### Tests (se escriben primero y deben fallar)

- [X] T004 [P] Crear `back/src/modules/player/ovr.spec.ts` cubriendo la tabla de data-model.md §2.1: 8,63→86, 8,07→80, 7,49→74 y 7,41→74 (trunca, no redondea), 7,08→70, 6,94→69, 10,00→99 por el recorte de FR-028, y rating ausente→`null`
- [X] T005 [P] Crear `back/src/modules/player/rarity.spec.ts` cubriendo los cuatro cortes de data-model.md §2.2 y sus bordes exactos (85, 84, 77, 76, 70, 69), más el caso sin estadísticas → `common` (FR-030)
- [X] T006 [P] Crear `back/src/modules/player/nationality-code.spec.ts` verificando el mapeo de países a ISO alpha-2 en minúscula, las cuatro selecciones británicas (`gb-eng`, `gb-sct`, `gb-wls`, `gb-nir`) y el país no mapeado → `null` (research #7)
- [X] T007 [P] Crear `back/src/modules/player/market-value.mock.spec.ts` verificando que dos llamadas con el mismo id devuelven exactamente lo mismo, que ids distintos dan resultados distintos, que `history` tiene 30 puntos y que su último punto coincide con el valor de mercado recibido (research #5)

### Implementación

- [X] T008 [P] Crear `back/src/modules/player/ovr.ts` con `ovrFromRating(rating: string | number | null): number | null` = `min(99, trunc(rating × 10))`, devolviendo `null` cuando no hay rating (FR-027, FR-028)
- [X] T009 [P] Crear `back/src/modules/player/rarity.ts` con `rarityFromOvr(ovr: number | null): Rarity` aplicando los cortes 85 / 77 / 70 y devolviendo `common` ante `null` (FR-029, FR-030)
- [X] T010 [P] Crear `back/src/modules/player/nationality-code.ts` con la tabla de nombre de país → código ISO para los países presentes en las 5 ligas, más las cuatro subdivisiones británicas, devolviendo `null` para los no mapeados (research #7)
- [X] T011 [P] Crear `back/src/modules/player/market-value.mock.ts` con la simulación determinista sembrada por el UUID del jugador: `changePct` y `history` de 30 puntos que termina en el valor de mercado recibido. Encabezar el archivo con un comentario que lo identifique como maqueta a reemplazar por el motor de cotizaciones (research #5, plan.md Complexity Tracking #1)
- [X] T012 Agregar a `back/src/modules/player/player.repository.ts` un método que resuelva la temporada vigente con `SELECT MAX(season)` sobre `player_season_stats` (research #2)
- [X] T013 Cachear en `back/src/modules/player/player.service.ts` el resultado de T012 en Redis con el TTL vigente, para no repetir la consulta en cada petición (research #2)

**Checkpoint**: las cuatro derivaciones están cubiertas por tests y la temporada vigente se resuelve. Las historias pueden comenzar.

---

## Phase 3: User Story 1 - Explorar el mercado de jugadores (Priority: P1) 🎯 MVP

**Goal**: que la home deje de ser el placeholder de la feature 05 y muestre la grilla de cartas con datos reales del catálogo, paginable de punta a punta.

**Independent Test**: iniciar sesión, abrir la home y verificar que se listan cartas con nombre, OVR, rareza, club, nacionalidad, goles, asistencias y variación; que la paginación recorre el catálogo sin repetir ni omitir; y que un jugador sin estadísticas aparece igual. No requiere que exista ningún filtro ni el panel lateral.

### Tests for User Story 1 ⚠️

- [X] T014 [P] [US1] Crear `back/test/players.e2e-spec.ts` con los escenarios E1, E2 y E12 del quickstart: forma completa del elemento de listado, ausencia de identificadores repetidos entre páginas consecutivas, y `401` sin credencial de sesión
- [X] T015 [P] [US1] Agregar a `back/test/players.e2e-spec.ts` el escenario E3: contrastar el `ovr` del listado contra el `rating` que expone el detalle, confirmando la derivación de FR-027
- [X] T016 [P] [US1] Crear `front/src/services/__tests__/player-card.mapper.test.ts` verificando que la respuesta de la API se traduce a `PlayerCardData`, que `photoUrl` y `club.crestUrl` quedan sin definir cuando no hay imagen, y que `price.history` conserva sus 30 puntos (research #11)

### Implementación — backend

- [X] T017 [US1] Reemplazar `PlayerResponseDto` por `PlayerCardDto` en `back/src/modules/player/dto/player-response.dto.ts` con los campos del contrato: `ovr`, `rarity`, `club {name, crestUrl}`, `nationality {name, code}`, `goals`, `assists`, `marketValue`, `changePct`, `supply {minted, total}` y `priceHistory` (FR-009, contracts/home.openapi.yaml)
- [X] T018 [US1] Definir en `back/src/modules/player/dto/player-response.dto.ts` las constantes de supply —100 emitidos sobre 100 totales— citando la regla de dominio de la constitución §5 (research #6)
- [X] T019 [US1] Migrar `findAndCount` de `back/src/modules/player/player.repository.ts` de `FilterQuery` a `QueryBuilder`, con los joins existentes a `team` y `team.league`. *(Implementado con subconsultas `EXISTS` sobre `player_season_stats` en lugar del `LEFT JOIN` que decía el plan; ver la revisión de research #3.)*
- [X] T020 [US1] Verificar en `back/src/modules/player/player.repository.ts` que la consulta no multiplica filas: el conteo y el `LIMIT/OFFSET` cuentan jugadores, no filas. Con `EXISTS` la cardinalidad es un jugador por fila por construcción, y los jugadores sin estadísticas no quedan excluidos, como exige FR-010 (cubierto por E2 del e2e)
- [X] T021 [US1] Ensamblar el `PlayerCardDto` en `back/src/modules/player/player.service.ts` combinando la entidad con las utilidades de T008 a T011, devolviendo `null` —no `0`— en las métricas ausentes (FR-015)
- [X] T022 [US1] Extender el evento de `PinoLoggerService` en `back/src/modules/player/player.service.ts` para que registre los campos del listado sin romper el formato estructurado vigente (constitución §4)
- [X] T023 [US1] Actualizar los decoradores de `@nestjs/swagger` en `back/src/modules/player/player.controller.ts` para que `GET /players` documente el nuevo esquema de respuesta (FR-018)

### Implementación — frontend

- [X] T024 [P] [US1] Crear `front/src/services/players.service.ts` con `fetchPlayers`, usando el `httpClient` existente. Ningún componente debe invocar Axios directamente (constitución §7)
- [X] T025 [US1] Crear `front/src/services/player-card.mapper.ts` que traduzca la respuesta de la API a `PlayerCardData`, dejando `photoUrl` y `club.crestUrl` sin definir cuando no hay imagen para que el componente dibuje su silueta y su escudo con iniciales (FR-026, research #11)
- [X] T026 [US1] Crear `front/src/components/PlayerGrid.tsx` que reciba jugadores ya mapeados y los renderice con el `PlayerCard` existente, **sin modificar ni copiar** `front/src/components/player-card/` (FR-020)
- [X] T027 [US1] Reescribir `front/src/pages/HomePage.tsx` para orquestar la carga del listado y la paginación, con estados explícitos de carga, vacío y error (FR-024). La página no habla con la red por su cuenta: usa `players.service.ts` (constitución §7)
- [X] T028 [US1] Confirmar en `front/src/app/App.tsx` que la ruta `/` sigue envuelta en `ProtectedRoute`, de modo que sin sesión la home redirija al login (FR-025)

**Checkpoint**: la home muestra la grilla real y es demostrable por sí sola. Verificar E15 y E16 del quickstart.

---

## Phase 4: User Story 2 - Filtrar y buscar dentro del mercado (Priority: P2)

**Goal**: acotar la grilla por ligas, posiciones, rareza, rango de valor, rango de OVR y nombre, con todos los filtros combinables y el resultado paginado.

**Independent Test**: aplicar cada filtro por separado y luego combinados, verificando contra el catálogo que el conjunto devuelto es exactamente el esperado y que `meta.total` permite paginar hasta el último resultado.

### Tests for User Story 2 ⚠️

- [X] T029 [P] [US2] Ampliar `back/src/modules/player/ovr.spec.ts` con la función inversa: `minOvr = n` → `rating >= n/10` y `maxOvr = n` → `rating < (n+1)/10` (data-model.md §2.3)
- [X] T030 [P] [US2] Ampliar `back/src/modules/player/rarity.spec.ts` con la función inversa: cada rareza a su rango de rating, y `common` como `rating < 7.0 OR rating IS NULL` (data-model.md §2.3)
- [X] T031 [P] [US2] Agregar a `back/test/players.e2e-spec.ts` los escenarios E4 a E8: cortes de rareza, rango de OVR excluyendo a los jugadores sin estadísticas, filtros de valores múltiples combinados, búsqueda insensible a acentos y los seis casos de entrada inválida que deben devolver `400`
- [X] T032 [P] [US2] Crear `back/test/leagues.e2e-spec.ts` con el escenario E11: ligas realmente presentes en el catálogo, ordenadas por nombre, y `401` sin sesión
- [X] T033 [P] [US2] Crear `front/src/pages/__tests__/home-filters.test.ts` verificando que los filtros se serializan a la query string y se leen de vuelta, y que cambiar un filtro devuelve la página a 1 (US2 §7, research #10)

### Implementación — backend

- [X] T034 [P] [US2] Agregar a `back/src/modules/player/ovr.ts` la función que traduce un extremo de OVR a su cota sobre `rating` (data-model.md §2.3)
- [X] T035 [P] [US2] Agregar a `back/src/modules/player/rarity.ts` la función que traduce una lista de rarezas a su predicado de `rating`, uniendo los rangos con `OR` (data-model.md §2.3)
- [X] T036 [US2] Ampliar `GetPlayersFilterDto` en `back/src/modules/player/dto/get-players-filter.dto.ts` con `league[]`, `team[]`, `position[]`, `rarity[]`, `minValue`, `maxValue`, `minOvr`, `maxOvr` y `search`, con los decoradores de `class-validator` y la transformación a arreglo de los parámetros repetibles (FR-001 a FR-006, FR-016)
- [X] T037 [US2] Agregar a `back/src/modules/player/dto/get-players-filter.dto.ts` la validación cruzada que rechaza los rangos invertidos —`minOvr > maxOvr` y `minValue > maxValue`— con `400`, sin interpretarlos al revés (FR-016, quickstart E8)
- [X] T038 [US2] Aplicar en `back/src/modules/player/player.repository.ts` los predicados de los filtros nuevos: `IN` para los de valores múltiples, rangos sobre `base_value`, rangos sobre `rating` para OVR y rareza, y `<fn>(full_name) ILIKE <fn>(:q)` para la búsqueda (research #1, research #4)
- [X] T039 [US2] Forzar en `back/src/modules/player/player.repository.ts` que cuando haya `minOvr` o `maxOvr` activos se excluyan los jugadores sin fila de estadísticas, porque no tienen OVR con el cual comparar (FR-030, quickstart E5)
- [X] T040 [US2] Extender la clave de caché de `back/src/modules/player/player.service.ts` para que incluya los nueve parámetros de filtro nuevos; dos combinaciones distintas no pueden compartir entrada
- [X] T041 [US2] Documentar con `@ApiQuery` cada parámetro nuevo en `back/src/modules/player/player.controller.ts`, con su tipo, su carácter repetible y su ejemplo (FR-018, contracts/home.openapi.yaml)
- [X] T042 [P] [US2] Crear `back/src/modules/league/league.repository.ts` y `back/src/modules/league/dto/league-response.dto.ts` con `id`, `name`, `country` y `code`, ordenando por nombre (FR-011)
- [X] T043 [US2] Crear `back/src/modules/league/league.service.ts`, `league.controller.ts` y `league.module.ts` exponiendo `GET /leagues` protegido con sesión y documentado en Swagger — los cinco elementos exactos que exige la constitución §7 (research #9)
- [X] T044 [US2] Registrar `LeagueModule` en `back/src/app.module.ts`

### Implementación — frontend

- [X] T045 [US2] Agregar `fetchLeagues` a `front/src/services/players.service.ts` y el armado de los parámetros repetibles del listado, serializando cada valor múltiple como clave repetida
- [X] T046 [US2] Crear `front/src/components/MarketFilters.tsx` con las secciones plegables de ligas, posiciones, rareza, rango de valor y rango de OVR, más la barra de búsqueda por nombre (FR-021). Las ligas se pueblan desde `GET /leagues`, nunca de una lista fija (FR-011)
- [X] T047 [US2] Conectar en `front/src/pages/HomePage.tsx` el estado de los filtros y la página a la query string con `useSearchParams`, volviendo a la página 1 cada vez que cambia un filtro (research #10, US2 §7)
- [X] T048 [US2] Agregar a `front/src/pages/HomePage.tsx` el estado vacío explicativo para las combinaciones de filtros sin resultados, distinto del estado de error (FR-024, quickstart E18)

**Checkpoint**: US1 y US2 funcionan de forma independiente. Verificar E17 y E18 del quickstart.

---

## Phase 5: User Story 3 - Consultar el detalle de un jugador (Priority: P3)

**Goal**: que al seleccionar una carta se despliegue el panel lateral con el perfil ampliado, las siete métricas, la gráfica de 30 días y el bloque de compra, ambos como maqueta identificada y no operativa.

**Independent Test**: seleccionar una carta y verificar que el panel muestra las siete métricas del jugador, que la gráfica y el bloque de compra están identificados como maqueta y el botón no ejecuta nada, y que al cerrarlo la grilla conserva filtros y página.

### Tests for User Story 3 ⚠️

- [X] T049 [P] [US3] Agregar a `back/test/players.e2e-spec.ts` el escenario E9: el detalle devuelve liga, temporada, altura y las seis métricas de temporada, con `null` —no `0`— cuando el jugador no tiene estadísticas (FR-012, FR-015)
- [X] T050 [P] [US3] Agregar a `back/test/players.e2e-spec.ts` el escenario E10: el mismo jugador devuelve idéntico `changePct` en el listado y en el detalle, y entre peticiones repetidas (SC-011, research #5)
- [X] T051 [P] [US3] Crear `front/src/components/__tests__/player-detail-panel.test.ts` verificando que el panel renderiza las siete métricas y que el botón de compra está deshabilitado (FR-033)

### Implementación — backend

- [X] T052 [US3] Crear `PlayerDetailDto` en `back/src/modules/player/dto/player-response.dto.ts` extendiendo `PlayerCardDto` con `league`, `season`, `height`, `shotsPerGame`, `keyPasses`, `dribbles`, `tackles` y `rating` (FR-012 a FR-014, contracts/home.openapi.yaml)
- [X] T053 [US3] Extender `findOneById` en `back/src/modules/player/player.repository.ts` con el `LEFT JOIN` a `player_season_stats` de la temporada vigente, igual que el listado
- [X] T054 [US3] Adaptar `findOne` en `back/src/modules/player/player.service.ts` para devolver `PlayerDetailDto`, reutilizando las mismas utilidades que el listado para que OVR y rareza coincidan entre grilla y detalle (FR-031, SC-011)
- [X] T055 [US3] Actualizar los decoradores de Swagger de `GET /players/{id}` en `back/src/modules/player/player.controller.ts` con el nuevo esquema de respuesta (FR-018)

### Implementación — frontend

- [X] T056 [US3] Agregar `fetchPlayerDetail` a `front/src/services/players.service.ts`
- [X] T057 [US3] Crear `front/src/components/PlayerDetailPanel.tsx` con el perfil ampliado, liga y club, y las siete métricas —goles, asistencias, altura, tiros por partido, pases clave, regates y entradas—, mostrando "sin dato" donde el valor sea nulo (FR-012, FR-015)
- [X] T058 [US3] Agregar a `front/src/components/PlayerDetailPanel.tsx` la gráfica de 30 días y el bloque de compra como maqueta visiblemente identificada, con el selector de cantidad y el botón deshabilitados y sin ningún manejador que emita una petición (FR-023, FR-032, FR-033)
- [X] T059 [US3] Conectar en `front/src/pages/HomePage.tsx` la apertura y el cierre del panel a la query string, de modo que cerrarlo devuelva la grilla con los mismos filtros y la misma página, y que elegir otra carta lo actualice sin cerrarlo (FR-022, US3 §4 y §6)

**Checkpoint**: las tres historias funcionan de forma independiente. Verificar E19 y E20 del quickstart.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: la invalidación de caché que la spec difirió a esta fase, el cierre de documentación y la validación completa.

- [X] T060 Implementar el versionado de clave en `back/src/modules/player/player.service.ts`: leer `players:list:version` e incorporarlo a la clave del listado (research #8)
- [X] T061 [P] Incrementar `players:list:version` al terminar la corrida en `back/src/modules/ingestion/ingestion.service.ts`, para que la home refleje el catálogo recién ingerido sin esperar el TTL (research #8)
- [X] T062 [P] Incrementar `players:list:version` al terminar el refresh en `back/src/modules/player-stats/player-stats.service.ts`, que es el proceso que cambia los ratings de los que dependen el OVR y la rareza (research #8)
- [X] T063 [P] Documentar `GET /` en `back/src/app.controller.ts` con `@ApiTags` y `@ApiOperation`, o excluirlo con `@ApiExcludeEndpoint()` si se lo considera un healthcheck. Hoy es el único endpoint del proyecto sin decoradores y aparece en Swagger bajo `default`, contra la constitución §6
- [X] T064 [P] Revisar en `http://localhost:3000/api` que los tres endpoints aparecen con todos sus parámetros, sus esquemas y su candado de `bearerAuth`, y que el botón **Authorize** permite ejecutarlos (quickstart E13, SC-008)
- [X] T065 Ejecutar `npm run lint`, `npm test` y `npm run test:e2e` en `back/`, y `npm run lint`, `npm test` y `npm run build` en `front/`, dejando todo en verde
- [X] T066 Recorrer los 21 escenarios de [quickstart.md](./quickstart.md) de punta a punta, prestando atención a E14 (invalidación de caché) y E20 (ninguna interacción de compra emite una petición)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias. La migración debe estar aplicada antes de que la búsqueda por nombre de US2 funcione.
- **Foundational (Phase 2)**: depende de Setup. **Bloquea las tres historias** — el OVR, la rareza, el código de país y la simulación de mercado los consume ya la carta de US1.
- **User Stories (Phase 3+)**: todas dependen de Foundational. En orden de prioridad P1 → P2 → P3.
- **Polish (Phase 6)**: depende de las historias que se quieran entregar.

### User Story Dependencies

- **US1 (P1)**: arranca apenas termina Foundational. No depende de ninguna otra historia.
- **US2 (P2)**: arranca apenas termina Foundational. Comparte archivos con US1 —`player.repository.ts`, `player.service.ts`, `player.controller.ts`, `HomePage.tsx`— así que **en la práctica conviene hacerla después de US1**, no en paralelo, aunque sea verificable por separado.
- **US3 (P3)**: arranca apenas termina Foundational. Comparte `player.service.ts`, `player.controller.ts` y `HomePage.tsx` con las anteriores; misma recomendación.

### Within Each User Story

- Los tests se escriben primero y deben fallar antes de implementar.
- Utilidades puras antes que repositorio; repositorio antes que servicio; servicio antes que controlador.
- En el cliente: servicio antes que mapeador, mapeador antes que componentes, componentes antes que la página que los orquesta.

### Parallel Opportunities

- **Phase 2**: T004 a T007 (los cuatro spec) en paralelo entre sí; después T008 a T011 (las cuatro implementaciones) también en paralelo. Son ocho archivos distintos y ninguno depende de otro.
- **Phase 3**: T014, T015 y T016 en paralelo. T024 en paralelo con las tareas de backend.
- **Phase 4**: T029 a T033 en paralelo. T034 y T035 en paralelo. T042 en paralelo con las tareas de `player`.
- **Phase 5**: T049, T050 y T051 en paralelo.
- **Phase 6**: T061, T062, T063 y T064 en paralelo.

**Advertencia sobre el trabajo en paralelo entre historias**: las tres tocan los mismos cuatro archivos centrales (`player.repository.ts`, `player.service.ts`, `player.controller.ts`, `HomePage.tsx`). Repartir las historias entre personas distintas garantiza conflictos en esos archivos. El paralelismo real de esta feature está **dentro** de cada fase, no entre historias.

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Primero los cuatro tests, que deben fallar:
Task: "Crear back/src/modules/player/ovr.spec.ts"
Task: "Crear back/src/modules/player/rarity.spec.ts"
Task: "Crear back/src/modules/player/nationality-code.spec.ts"
Task: "Crear back/src/modules/player/market-value.mock.spec.ts"

# Después las cuatro implementaciones, hasta ponerlos en verde:
Task: "Crear back/src/modules/player/ovr.ts"
Task: "Crear back/src/modules/player/rarity.ts"
Task: "Crear back/src/modules/player/nationality-code.ts"
Task: "Crear back/src/modules/player/market-value.mock.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1: Setup — la migración.
2. Phase 2: Foundational — **crítica, bloquea todo**.
3. Phase 3: User Story 1 — la grilla.
4. **DETENERSE Y VALIDAR**: quickstart E1, E2, E3, E12, E15 y E16.
5. En ese punto la home ya es una pantalla real y demostrable: grilla de cartas con datos del catálogo, paginable, con las cartas renderizando correctamente aunque no haya ninguna imagen cargada.

### Incremental Delivery

1. Setup + Foundational → base lista.
2. + US1 → grilla navegable → **MVP demostrable**.
3. + US2 → filtros y búsqueda → el catálogo se vuelve usable.
4. + US3 → panel de detalle → la pantalla queda completa.
5. + Polish → invalidación de caché, Swagger cerrado y quickstart completo.

Cada incremento agrega valor sin romper el anterior.

---

## Notes

- El componente `front/src/components/player-card/` **no se toca en ninguna tarea**. Si algún dato no se puede obtener, se resuelve en el mapeador (T025), nunca modificando el componente (FR-020).
- Las métricas ausentes viajan como `null`, nunca como `0`: es lo que permite al cliente distinguir "sin dato" de un cero real (FR-015).
- Esta feature no instala dependencias. Cualquier paquete nuevo exigiría justificarlo por la cláusula de librerías utilitarias de la constitución §2 en el backend, y una enmienda explícita en el frontend, cuya lista está cerrada.
- Ninguna tarea implementa compra de tokens. El bloque de compra es maqueta inerte (T058) y la compra está fuera de alcance por spec (FR-032).
- Commitear al terminar cada tarea o grupo lógico, y detenerse en cada checkpoint para validar la historia por separado.
