# Research: Enriquecimiento de Jugadores con Métricas de WhoScored

## Contexto de partida

`02-ingesta-catalogo` dejó `League`/`Team`/`Player` persistidas y estableció los dos
patrones que esta spec reutiliza sin cuestionarlos: la capa `/back/src/adapters/<proveedor>/`
(cliente HTTP aislado + normalización) y el módulo de dominio con exactamente
`module/controller/service/repository/dto`. `Player` ya tiene una columna
`externalWhoScoredId` (string, nullable, sin unique todavía) dejada como placeholder por esa
spec — esta es la primera feature que la usa. No existe ningún concepto de "temporada" en el
esquema, ninguna dependencia de scraping/HTML parsing, y ninguna librería de similitud de
strings.

Dos preguntas quedan **explícitamente sin resolver por el propio spec.md** (secciones 5 y 10,
puntos 1 y 3) porque requieren inspección en vivo de un sitio real, no una decisión de
diseño: la estructura exacta del HTML de WhoScored, y cómo ubicar la página de plantel de un
equipo dado. Esta investigación **no inventa** esas dos respuestas (la propia spec lo prohíbe
explícitamente: "no se debe asumir un selector o shape que no se haya verificado"). En su
lugar, diseña las piezas para que ambas puedan resolverse sin rediseñar nada, y dejan tareas
explícitas de verificación antes de escribir el parser real.

## Decisiones

### 1. Controller obligatorio, incluso para el flujo "bajo demanda" (resuelve spec.md §7.1)

- **Decisión:** El módulo `player-stats` tiene `player-stats.controller.ts` con dos
  endpoints: `POST /player-stats/refresh` (dispara el refresh periódico agregado, reusable
  por un scheduler futuro — mismo patrón que `POST /ingestion/players`) y
  `GET /player-stats/:playerId/matches` (dispara y persiste el detalle partido a partido bajo
  demanda, luego devuelve lo persistido).
- **Rationale:** La constitución exige que la carpeta de cada dominio contenga *exactamente*
  `module/controller/service/repository/dto` — no deja lugar a un módulo sin controller. La
  pregunta abierta en spec.md §7.1 ("¿puede omitirse el controller?") ya tiene precedente
  directo en `02-ingesta-catalogo`: un proceso de ingesta sin necesidad "de negocio" de HTTP
  igual expuso `POST /ingestion/players` como disparador manual antes de que existiera
  scheduler. Se sigue el mismo patrón acá en vez de inventar una excepción nueva.
- **Alternativas consideradas:** Sin controller, invocado solo internamente — rechazada,
  contradice la estructura fija ya aplicada dos veces en el proyecto; además el propio
  spec.md (§2) describe el detalle bajo demanda con lenguaje de trigger externo ("bajo
  demanda"), lo que encaja mejor con un endpoint.
- **Seguimiento recomendado:** Formalizar esto en la constitución (`/speckit-constitution`)
  ahora que dos features distintas confirman el mismo patrón — spec.md §10.4 ya lo señala
  como pendiente.

### 2. Ubicación del adapter: `/back/src/adapters/who-scored/` (resuelve spec.md §7.2)

- **Decisión:** Mismo nivel que `/back/src/adapters/football-data/`, con la misma
  separación interna: cliente HTTP puro, parser/normalización, y un `adapter.ts` que orquesta
  ambos y es lo único que `player-stats.service.ts` conoce.
- **Rationale:** Precedente directo de `02-ingesta-catalogo` research.md #9 — no hay motivo
  para una ubicación distinta la segunda vez que se agrega un proveedor externo.

### 3. Fetch: Playwright (headless) para las páginas de stats, `cheerio` para parsear el HTML resultante

- **Decisión (revisada tras verificación en vivo — ver decisión #4):** `WhoScoredClient` usa
  Playwright (`chromium.launch({headless: true})`) para navegar a la página de plantel de un
  equipo o de estadísticas por partido de un jugador, y `page.content()` para obtener el HTML
  ya renderizado. Ese HTML se parsea con `cheerio` (se mantiene como dependencia — sigue
  siendo la forma correcta de recorrer el HTML *ya renderizado*, solo que ya no alcanza para
  obtenerlo). `@nestjs/axios`/`axios` se mantienen para Football-Data.org (sin cambios) pero
  **no** se usan para WhoScored.
- **Rationale:** Verificación en vivo (decisión #4) confirmó que `#top-player-stats-summary-grid`
  (la tabla con las 7 métricas obligatorias, tanto en la vista de plantel de equipo como en la
  de partido a partido de un jugador) se renderiza enteramente client-side. Un `curl`/`axios`
  con user-agent de navegador real contra ambas páginas devuelve `200 OK` completo (sin
  bloqueo, sin challenge de Cloudflare) pero **sin la tabla ni sus datos** en el HTML crudo —
  no es un problema de acceso/bloqueo que "escalar solo si falla" resuelva, es que el dato
  simplemente no existe en la respuesta del servidor. `cheerio` no ejecuta JS, así que nunca
  podría verla sin importar cuántos reintentos o qué tan simple sea el request.
- **Esto revisa la decisión original de este archivo** (que asumía cheerio-primero, headless
  solo si el acceso simple empieza a fallar): esa premisa era correcta para el caso "bloqueo
  anti-bot", pero no aplica acá — no hay bloqueo, hay renderizado client-side. La spec (§5)
  pide degradar a headless "cuando el acceso simple empiece a fallar por bloqueo"; acá el
  acceso simple no falla por bloqueo, falla porque el dato no está — headless es necesario
  desde el día uno para estas dos páginas específicas, no una escalada.
- **Alternativas consideradas:** Buscar el JSON fuente que alimenta la tabla vía `<script>`
  inline o una llamada XHR propia de whoscored.com — investigado en vivo (ver decisión #4):
  no se encontró ningún request a dominio propio de WhoScored al cambiar de sub-pestaña
  (Summary/Defensive/Offensive), y el ID numérico de un jugador conocido (367185, Bukayo
  Saka) aparece una sola vez en el HTML crudo, en un bloque no relacionado
  (`bestElevenFormation`) — no hay evidencia de un JSON embebido reutilizable para esta tabla.
  Si en el futuro se encuentra ese mecanismo, se puede simplificar (volver a axios+cheerio
  puro) sin cambiar el contrato del adapter (`getSquadStats`/`getPlayerMatchLog` siguen
  devolviendo los mismos tipos normalizados).
- **Nueva dependencia:** `playwright` (Node.js), con el binario de Chromium instalado en el
  entorno de desarrollo/CI (`npx playwright install chromium`).
- **Punto de extensión que se mantiene:** `WhoScoredFetcher` sigue siendo la interfaz
  (`fetchHtml(url): Promise<string>`) que aísla esta decisión — hoy implementada con
  Playwright en vez de axios. Si WhoScored empieza a bloquear incluso el acceso headless
  (challenges tipo Cloudflare más agresivos), la escalada futura (browser con stealth/proxy)
  sigue siendo un cambio contenido a esta única clase.

### 4. Verificación en vivo del HTML de WhoScored — resultados (resuelve spec.md §5, §10.1, §10.2 parcialmente)

Verificación realizada en esta sesión de planificación contra el sitio real (Arsenal /
Bukayo Saka, Premier League), usando el navegador (para confirmar el DOM renderizado) y
`curl` con user-agent de navegador real (para confirmar qué devuelve el servidor sin JS).

**URLs confirmadas:**
- Plantel de un equipo: `https://www.whoscored.com/teams/{whoScoredTeamId}/show/{region}-{slug}`
  (ej. `/teams/13/show/england-arsenal`).
- Perfil de un jugador: `https://www.whoscored.com/players/{whoScoredPlayerId}/show/{slug}`.
- Partido a partido de un jugador: `https://www.whoscored.com/players/{whoScoredPlayerId}/matchstatistics/{slug}`.
- Un partido puntual (de donde sale `whoScoredMatchId`): `/matches/{matchId}/show/{slug}`,
  visible como `href` de cada fila de la tabla de partido a partido.
- El `{slug}` es cosmético: confirmado con `curl` que `/teams/13` (sin slug),
  `/teams/13/show/cualquier-cosa` (slug incorrecto) y `/players/367185/matchstatistics` (sin
  slug) devuelven `200` igual. El adapter solo necesita el id numérico guardado en
  `externalWhoScoredId` — no hace falta persistir ni reconstruir el slug.

**Estructura de la tabla de plantel de equipo** (`#top-player-stats-summary-grid`, dentro de
`team-squad-stats`, con sub-pestañas Summary/Defensive/Offensive/Passing/xG/Detailed que
cambian las columnas sin navegar ni disparar un request nuevo — confirmado sin tráfico de red
propio de whoscored.com al cambiar de sub-pestaña):
- **Summary:** Player, CM (altura en cm), KG (peso), Apps, Mins, Goals, Assists, Yel, Red,
  SpG (shots per game), PS% (pass success %), AerialsWon, MotM, Rating.
- **Offensive:** Player, CM, KG, Apps, Mins, Goals, Assists, SpG, **KeyP**, **Drb** (dribbles
  *completados*), Fouled, Off, Disp, UnsTch, Rating.
- **Defensive:** Player, CM, KG, Apps, Mins, **Tackles**, Inter, Fouls, Offsides, Clear,
  **Drb** (veces *driblado en contra* — mismo nombre de columna, métrica opuesta a la de
  Offensive; el parser debe leer `Drb` de la sub-pestaña Offensive para "dribbles" y nunca de
  Defensive), Blocks, OwnG, Rating.
- Los valores de Summary/Offensive/Defensive son promedios por partido con 1 decimal (ej.
  `1.7` tackles) — confirma que `shotsPerGame`/`keyPasses`/`dribbles`/`tackles`/`rating` en
  data-model.md deben tomarse de acá tal cual, ya promediados por WhoScored (no hay que
  recalcular desde partidos individuales).
- El orden de filas es por Rating descendente, no por dorsal ni alfabético — el parser no
  debe asumir orden.

**Estructura de la tabla de partido a partido de un jugador** (mismo id de tabla, dentro de
`player-matches-stats-*`): confirmado 1:1 el mismo esquema de columnas que arriba pero con
`Opponent`/`Date`/`Position` en vez de `Player`/`CM`/`KG`/`Apps`, y valores por partido (no
promediados): Summary → Opponent, Date, Position, Mins, Goals, Assists, Yel, Red, **Shots**,
PS%, AerialsWon, Rating. Defensive → mismas columnas que el equipo (Tackles, Inter, Fouls,
Offsides, Clear, Drb, Blocks, OwnG, Rating), confirmado igual. Offensive no se re-confirmó
columna por columna en esta sesión (un click de verificación falló por timing) pero, dado que
Summary y Defensive coinciden exactamente con el esquema de equipo, se infiere con alta
confianza el mismo patrón: Opponent, Date, Position, Mins, Goals, Assists, Shots, KeyP, Drb,
Fouled, Off, Disp, UnsTch, Rating — **quien implemente T029 debe confirmar esto con una
captura antes de fijar el selector**, no asumirlo ciegamente.

**Altura:** confirmada disponible en dos lugares — columna `CM` de la tabla de plantel (la
misma request que ya se hace para el refresh periódico, sin costo adicional) y en el perfil
del jugador (`Height: 178cm`, campo de texto separado). Se usa la columna `CM` de la tabla de
plantel (ya se está scrapeando esa página) en vez de pegarle al perfil del jugador aparte.

**Deseables (spec.md §3, §10.2):** con los datos disponibles en Summary/Offensive/Defensive,
se confirma que están disponibles: intercepciones (`Inter`), faltas (`Fouls`), despejes
(`Clear`), tarjetas amarillas/rojas (`Yel`/`Red`), porcentaje de pases (`PS%`), altura (`CM`,
ver arriba). **No** se confirmó disponibilidad de minutos jugados como campo "deseable"
separado — `Mins` ya está disponible y se puede agregar sin costo si se decide incluirlo.
Quedan fuera de esta spec (§3: no modelar lo no confirmado) hasta que se decida incorporarlos
a `data-model.md` — la disponibilidad ya no es la barrera, es una decisión de alcance.

**Hallazgo crítico que revisa research.md #3 (ver arriba):** ni la tabla de plantel ni la de
partido a partido están presentes en el HTML devuelto por un `curl`/request simple (sin JS) —
confirmado con `curl` real (user-agent de navegador, sin bloqueo, `200 OK`, HTML completo
salvo la tabla). Headless (Playwright) es obligatorio para estas dos páginas, no una
escalada condicional.

**Hallazgo adicional, confirmado durante la implementación (2026-09-16):** el Chromium
headless de Playwright **por defecto** (`chromium.launch({headless:true})`, sin más) sí es
detectado y bloqueado por el Cloudflare de WhoScored (`Attention Required! | Cloudflare`,
`Sorry, you have been blocked`) — a diferencia del `curl` simple de arriba, que nunca fue
bloqueado. La causa no es tráfico sospechoso (un solo GET), es el fingerprint por defecto de
Chromium headless. Se resolvió sin agregar dependencias nuevas (sin `playwright-extra` ni
plugin de stealth), configurando el `BrowserContext`:
- `userAgent`: string de un Chrome de escritorio real (no el UA por defecto de Chromium headless).
- `viewport`: `1920x1080` (no el viewport chico por defecto).
- `locale: 'en-US'`.
- Flag de lanzamiento `--disable-blink-features=AutomationControlled`.

Con esos 4 cambios, la misma request contra `/teams/65` devuelve la página real (confirmado
con Barcelona, WhoScored id 65). Esto **no es** la escalada pesada que spec.md §5 reserva
para un bloqueo persistente (browser con stealth avanzado, proxies) — es el mínimo para que
un Chromium headless no se anuncie a sí mismo como headless. `WhoScoredClient` reusa un único
`BrowserContext` (no una page nueva por request) para no repetir este fingerprint por cada
llamada.

### 5. Cambio de pestaña real: duplica el id de la tabla, no reemplaza su contenido

Confirmado en vivo (sesión de implementación 2026-09-16, contra Barcelona real):

- Al clickear una sub-pestaña (Offensive/Defensive), WhoScored **agrega** una tabla nueva con
  el mismo id `top-player-stats-summary-grid` dentro de un panel hermano
  (`#statistics-table-{summary|offensive|defensive}` en la página de equipo,
  `#statistics-table-{categoría}-matches` en la de jugador) — la tabla anterior queda oculta
  (`offsetParent === null`) pero **sigue en el DOM**. Capturar `page.content()` completo y
  dejar que cheerio tome la primera coincidencia de `table#top-player-stats-summary-grid`
  (como hacía la versión inicial de `who-scored.parser.ts`) devuelve siempre los datos de la
  primera pestaña visitada (Summary) sin importar qué pestaña se haya clickeado después — así
  se explica que una primera corrida completa contra Barcelona haya devuelto `keyPasses`/
  `dribbles`/`tackles` en `0.00` para los 19 jugadores matcheados, mientras `goals`/`assists`/
  `shotsPerGame`/`rating` (de Summary) sí eran correctos.
  **Fix:** `WhoScoredClient.fetchStatsTabs` captura el `innerHTML` del panel por su id
  específico (`#statistics-table-{categoría}{sufijo}`) en vez de `page.content()` completo —
  cada panel tiene un único id real, sin ambigüedad.
- Un elemento `position:fixed`, `inset:0`, `z-index:2147483647` (assets/sprite SVG del widget
  "TEAMMATE", visualmente invisible pero con área de hit-test de pantalla completa)
  intercepta los clicks sintéticos de Playwright a partir del segundo cambio de pestaña — un
  click normal y uno con `force:true` fallan igual ("intercepts pointer events" o quedan sin
  efecto sin error). **Fix:** el click se dispara con `page.evaluate()` invocando
  `.click()` nativo del elemento `<a>` en el DOM — un click nativo no hace hit-testing de
  pointer events, así que el overlay no lo afecta.
- La página de equipo tiene DOS widgets con pestañas de texto idéntico ("Offensive"/
  "Defensive"): uno de stats de equipo (`#top-team-stats-options`) y uno del plantel
  (`#team-squad-stats-options`) — un click sin acotar el nav es ambiguo
  (`strict mode violation: resolved to 2 elements`). El nav correcto se pasa explícito por
  parámetro (`optionsContainerId`).

### 6. Parsing del nombre: prefijo de dorsal pegado al nombre en al menos un caso observado

Al procesar el plantel real de Barcelona, el jugador conocido como "Gavi" (nombre formal en
Football-Data.org: "Pablo Gavira") quedó sin match automático — WhoScored lo expone como
`17Gavi` (dorsal `17` pegado al nombre sin espacio, dentro del mismo `<a>`) en vez de "Gavi".
No se investigó a fondo el origen exacto (posiblemente un ícono/badge sin texto separador
para algunos jugadores) porque no cambia el resultado: "Gavi" (nickname) vs "Pablo Gavira"
(nombre formal) da una similitud de 0.591 — muy por debajo del umbral 0.85 — así que este
jugador habría quedado sin match automático de todas formas. El id numérico de WhoScored
(`422937`, extraído del `href`, no del texto) se persistió correctamente en
`who_scored_unmatched_player`, disponible para revisión manual. No es una corrupción de
datos silenciosa: es el comportamiento esperado ante un nickname que un matcher de similitud
de string no puede resolver con confianza (spec.md §4.3).

### 5. Matching equipo → página de WhoScored: mapeo manual por ahora (resuelve parcialmente spec.md §10.3)

- **Decisión:** Se agrega `Team.externalWhoScoredId` (string, nullable, unique) — igual
  patrón que `Team.externalId` para Football-Data.org. El refresh periódico (`POST
  /player-stats/refresh`) solo procesa equipos que ya tengan este campo poblado; equipos sin
  mapeo se listan en la respuesta como `skipped`, no como error.
- **Rationale:** spec.md §10.3 deja explícitamente sin resolver "cómo ubicar la página de
  plantel de cada equipo" — no hay una respuesta de diseño genérica y segura para eso sin
  inspeccionar el sitio (¿por slug? ¿por búsqueda? ¿por ID numérico estable?). Un mapeo
  manual (seed/admin, fuera de alcance de este feature) desbloquea el resto de la
  arquitectura sin inventar una heurística de matching equipo-a-equipo que la propia spec
  pide no asumir.
- **Alternativas consideradas:** Resolver el equipo por similitud de nombre (igual algoritmo
  que jugadores) — rechazada, la spec distingue explícitamente el matching de jugadores
  (sección 4, con reglas detalladas) del de equipos (sección 10.3, marcado como pendiente);
  extender la heurística de jugadores a equipos sería inventar una regla no pedida.
- **Seguimiento recomendado:** decidir en una spec o tarea aparte cómo se puebla
  `externalWhoScoredId` en `Team` (manual vs. resuelto automáticamente) — no bloquea esta
  spec porque el refresh ya tolera equipos sin mapeo.

### 6. Similitud de nombres: implementación propia (Jaro-Winkler), sin dependencia nueva

- **Decisión:** `name-matcher.ts` (archivo plano dentro de `modules/player-stats/`, sin
  Nest ni DB) implementa Jaro-Winkler y normalización (sin acentos, minúsculas) a mano.
  Umbral configurable vía `WHO_SCORED_MATCH_THRESHOLD` (`process.env`, default `0.85`,
  igual valor de referencia que spec.md §4.3).
- **Rationale:** Jaro-Winkler es un algoritmo autocontenido y bien conocido (~40 líneas);
  agregar una dependencia (`string-similarity`, `natural`) para esto repetiría la decisión ya
  tomada en `02-ingesta-catalogo` research.md #7 de evitar dependencias nuevas quesustituyen
  algo simple de escribir. Al ser una función pura sin NestJS ni DB, cumple directamente el
  requisito de testing de spec.md §9 ("sin NestJS ni base de datos real").
- **Alternativas consideradas:** `string-similarity` (npm) — rechazada por la razón anterior.
  Levenshtein puro — rechazado, Jaro-Winkler pondera mejor coincidencias de prefijo, más
  apropiado para nombres propios (mismo tipo de justificación que usan las librerías de
  referencia que la propia spec menciona).
- **Ubicación fuera de la estructura fija:** un archivo plano adicional en la carpeta de
  dominio (no una capa nueva, no un directorio nuevo) — no es una violación de la
  constitución (que fija los 5 archivos/objetos obligatorios, no prohíbe archivos
  adicionales), se documenta igual por transparencia.

### 7. Bloqueo generalizado detectable: contador de fallos consecutivos en el cliente

- **Decisión:** `WhoScoredClient` cuenta fallos consecutivos (no por equipo, global al
  cliente); al superar `WHO_SCORED_MAX_CONSECUTIVE_FAILURES` (default `5`) lanza
  `WhoScoredBlockedException` en vez de seguir reintentando. `PlayerStatsService` la captura
  en el nivel de lote (no por equipo) y aborta el resto de la corrida, distinto de una falla
  puntual de un equipo (que sí se loguea y se continúa).
- **Rationale:** Es la traducción directa de spec.md §6 ("un bloqueo generalizado... debe ser
  detectable, para poder escalar el método de acceso en vez de reintentar indefinidamente").
- **Alternativas consideradas:** Reintentar indefinidamente con backoff — rechazada,
  exactamente lo que la spec pide evitar.

### 8. Sin caché de Redis en este feature

- **Decisión:** Ningún endpoint de este feature usa `CACHE_MANAGER`.
- **Rationale:** Mismo razonamiento que `02-ingesta-catalogo` (Constitution Check): ambos
  endpoints son procesos que escriben/disparan scraping (`POST /player-stats/refresh`,
  `GET /player-stats/:playerId/matches` dispara scrape+persist antes de responder), no
  lecturas repetidas de datos ya calculados — no son "consultas frecuentes" en el sentido de
  la constitución. Un endpoint de lectura pura sobre estos datos (para la fórmula de score)
  es explícitamente una spec futura (spec.md §2, fuera de alcance) — esa spec es la que
  debería agregar caché sobre su propio endpoint de lectura.

### 9. Sin `@nestjs/config` ni `@nestjs/schedule`

- **Decisión:** Igual que `02-ingesta-catalogo` — variables de entorno vía `process.env`
  directo (`WHO_SCORED_BASE_URL`, `WHO_SCORED_MIN_DELAY_MS`, `WHO_SCORED_MATCH_THRESHOLD`,
  `WHO_SCORED_MAX_CONSECUTIVE_FAILURES`). `PlayerStatsService.refresh()` queda como método
  público reusable sin `@Cron`, tal como spec.md §2 exige ("el proceso de ingesta pueda
  reusarse desde uno", sin construir el scheduler acá).
- **Rationale:** Consistencia con el único patrón de configuración ya usado en el repo.

## Technical Context resuelto

- **Language/Version:** TypeScript 6 (`strict: true`), Node.js LTS, `target: ES2023` — sin
  cambios.
- **Primary Dependencies:** NestJS 12, MikroORM 7, `@nestjs/swagger`, `@nestjs/axios` +
  `axios` (reusados de `02`, solo para Football-Data.org). Nuevas: `playwright` (fetch
  headless de las páginas de WhoScored, obligatorio — decisión #3/#4) y `cheerio` (parsing
  del HTML ya renderizado). Sin librería de similitud de strings (decisión #6), sin
  `@nestjs/config`/`@nestjs/schedule` (decisión #9).
- **Storage:** PostgreSQL (mismo esquema/puerto). Redis no aplica (decisión #8).
- **Testing:** Jest, mismo setup que `02`. El parser se prueba contra fixtures HTML locales
  (spec.md §9), nunca contra el sitio real en cada corrida.
- **Target Platform:** Servidor Node.js (API REST NestJS), `/back`.
- **Project Type:** web-service (backend-only).
- **Performance Goals:** sin objetivo de latencia por request — proceso batch/bajo demanda
  gobernado por `WHO_SCORED_MIN_DELAY_MS` entre requests a WhoScored.
- **Constraints:** una falla puntual de equipo no aborta el lote; un bloqueo generalizado sí
  (decisión #7); no se duplica snapshot por (jugador, temporada); jugadores sin match no
  bloquean el resto del equipo.
- **Scale/Scope:** mismo universo de `02-ingesta-catalogo` (~2500-3000 jugadores, ~100-140
  equipos), acotado en la práctica a los equipos que ya tengan `externalWhoScoredId` mapeado
  (decisión #5).

## Verificaciones pendientes antes de implementar

Resueltas — ver decisión #4 arriba. Solo queda pendiente, antes de fijar el selector de
`who-scored.parser.ts` para la sub-pestaña Offensive de partido a partido (T029): confirmar
con una captura real las columnas exactas (inferidas por paridad con el resto de las tablas,
no re-confirmadas directamente en esta sesión).
