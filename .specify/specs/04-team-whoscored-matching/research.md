# Research: Matching Automático de Equipos con WhoScored

## Contexto de partida

`03-ingesta-stats` ya construyó todo lo que esta feature reusa: `WhoScoredClient`
(Playwright headless, con el fingerprint de navegador real que evita el bloqueo de
Cloudflare — ver su research.md #3/#4), `WhoScoredParser` (cheerio sobre HTML ya
renderizado), `WhoScoredAdapter`, `name-matcher.ts` (Jaro-Winkler + `WHO_SCORED_MATCH_THRESHOLD`)
y el criterio de "cola de revisión manual" (`WhoScoredUnmatchedPlayer`). `Team` ya tiene la
columna `externalWhoScoredId` (nullable, unique) desde esa misma spec — hoy solo la completa
un humano a mano. Esta feature no reabre nada de eso: agrega la pieza que falta (completar
ese campo en lote, por liga) y solo toca archivos nuevos + una relocación de un archivo
compartido (ver decisión #5).

## Decisiones

### 1. Verificación en vivo de la tabla de posiciones — resultados (resuelve FR-009)

Verificado en esta sesión de planificación contra el sitio real (LaLiga y Premier League).

**URL de la página de liga** (`Summary`, la que carga por defecto):
`https://www.whoscored.com/regions/{regionId}/tournaments/{tournamentId}/{slug}` — sin
season/stage en el path, WhoScored resuelve la temporada activa automáticamente.

**Las 5 ligas ya soportadas por el catálogo** (mismos códigos que `LEAGUE_CODES` en
`ingestion.service.ts` de `02-ingesta-catalogo`), confirmadas en vivo una por una:

| Código (Football-Data) | Liga | Región/torneo WhoScored |
|---|---|---|
| PL | Premier League | `/regions/252/tournaments/2/england-premier-league` |
| BL1 | Bundesliga | `/regions/81/tournaments/3/germany-bundesliga` |
| PD | LaLiga | `/regions/206/tournaments/4/spain-laliga` |
| SA | Serie A | `/regions/108/tournaments/5/italy-serie-a` |
| FL1 | Ligue 1 | `/regions/74/tournaments/22/france-ligue-1` |

**Hallazgo crítico (igual patrón que `03-ingesta-stats` research.md #4):** la tabla de
posiciones **también** se renderiza client-side. Confirmado con `curl` (user-agent real,
`200 OK`, HTML completo) contra LaLiga: el `<table id="standings-25662-grid">` está presente
en el HTML crudo pero **sin filas de datos** (`tbody`/`tr` de equipos vacíos) — los enlaces
`/teams/{id}/...` que sí aparecen en el HTML crudo pertenecen a otras secciones de la misma
página (resultados recientes, "mejor XI"), no a la tabla de posiciones. Con Playwright
(mismo `WhoScoredClient` ya construido, mismo user-agent/viewport/flag anti-automatización)
la tabla aparece completa. **Headless es obligatorio acá también**, no una excepción.

**Buena noticia — más simple que las páginas de plantel/partido:** la tabla de posiciones
**no tiene sub-pestañas** que haya que clickear — está completa apenas carga la página
(`Summary`, la vista por defecto). No aplica ninguno de los problemas de `03-ingesta-stats`
research.md #4 (id duplicado al cambiar de pestaña, overlay que intercepta clicks) porque
acá no se hace ningún click. Solo `goto` + esperar el selector + capturar.

**Estructura confirmada de la tabla** (`table[id^="standings-"]` — el id numérico intermedio
cambia por temporada/torneo, no se debe fijar; usar el prefijo):
- 3 filas iniciales son de encabezado (agrupan columnas bajo "Overall/Home/Away" y repiten
  nombres de columna) — se identifican porque no tienen ningún `<a href="/teams/...">`
  adentro, igual criterio que ya usa `who-scored.parser.ts` para descartar filas sin link.
- Cada fila de datos: primera celda con texto tipo `"1Barcelona"` (posición pegada al nombre,
  mismo patrón de "número pegado sin espacio" que el dorsal en `17Gavi` de `03-ingesta-stats`)
  — pero el `<a>` dentro de esa celda tiene el nombre limpio (`"Barcelona"`) y
  `href="/teams/65/show/spain-barcelona"`, igual que en las tablas de jugadores. Mismo
  criterio de extracción: nombre y id salen del `<a>`, nunca del texto completo de la celda.
- Columnas: Team, P, W, D, L, GF, GA, GD, Pts, Form — no se necesita ninguna para esta
  feature (solo nombre + id de cada equipo).
- Confirmado igual en Premier League (`standings-25544-grid`, Arsenal id 13 — coincide con el
  id ya usado en `03-ingesta-stats`) — la estructura generaliza entre ligas.

### 2. Cliente: nuevo método simple en `WhoScoredClient`, sin reusar `fetchStatsTabs`

- **Decisión:** Agregar `WhoScoredClient.fetchRenderedPage(url: string): Promise<string>` —
  navega, espera `table[id^="standings-"]`, devuelve `page.content()`. Reusa el mismo
  `BrowserContext` (fingerprint anti-Cloudflare) y la misma cola de rate-limit/contador de
  fallos consecutivos que `fetchStatsTabs`.
- **Rationale:** `fetchStatsTabs` está diseñado específicamente para el problema de
  pestañas-que-duplican-id de las páginas de plantel/partido (decisión #1 arriba: acá no
  aplica, no hay pestañas). Forzar esta página por esa API existente sería más compleja de lo
  necesario (pediría una lista de "tabLabels" ficticia). Un método nuevo y más simple es más
  claro que reusar una abstracción pensada para un problema distinto.
- **Alternativas consideradas:** Extender `fetchStatsTabs` con una pestaña única — rechazado,
  agregaría lógica de "options container" y "panel suffix" irrelevante para esta página.

### 3. Parser: nuevo método en `WhoScoredParser`, mismo estilo que `parseStatsGrid`

- **Decisión:** `WhoScoredParser.parseStandingsGrid(html: string): StandingRow[]` —
  selecciona `table[id^="standings-"]`, descarta filas sin `<a href="/teams/...">`, devuelve
  `{ whoScoredTeamId, whoScoredName }` por fila (extraídos del `href`/texto del `<a>`, igual
  criterio que `parseStatsGrid`).
- **Rationale:** Mismo archivo, mismo estilo de extracción ya usado y probado — no hay
  categorías (Summary/Offensive/Defensive) que combinar acá, así que no hace falta el
  `columnIndexByHeader` genérico de `parseStatsGrid`; un método dedicado y más simple es más
  claro que forzar la reutilización de esa función para un caso con menos columnas relevantes.

### 4. Mapeo liga → URL de WhoScored: constante hardcodeada, mismo patrón que `LEAGUE_CODES`

- **Decisión:** `LEAGUE_WHOSCORED_PATHS: Record<string, string>` (clave = `League.code` de
  Football-Data.org, valor = el path de WhoScored de la tabla de arriba), en el módulo nuevo
  de esta feature.
- **Rationale:** Son exactamente las mismas 5 ligas que `LEAGUE_CODES` ya hardcodea en
  `ingestion.service.ts` (`02-ingesta-catalogo`) — mismo precedente, ya verificadas en vivo
  (decisión #1). No hay necesidad de resolver esto dinámicamente (buscar la liga en
  WhoScored en runtime) para un conjunto fijo y pequeño de 5 ligas conocidas.
- **Alternativas consideradas:** Agregar una columna `externalWhoScoredPath` a `League` —
  rechazada, es un dato de configuración fijo del proceso (igual que `LEAGUE_CODES`), no un
  dato de negocio que deba persistirse ni that el usuario vaya a cambiar.

### 5. `name-matcher.ts` se mueve a `/back/src/shared/matching/` (no se reimplementa)

- **Decisión:** Mover `name-matcher.ts` (y su test) de
  `/back/src/modules/player-stats/name-matcher.ts` a
  `/back/src/shared/matching/name-matcher.ts`. `player-stats.service.ts` actualiza su import
  al nuevo path; el algoritmo, la firma de las funciones y los tests **no cambian una sola
  línea**.
- **Rationale:** Esta feature necesita la misma función desde un módulo de dominio distinto
  (`team-whoscored-matching`, no `player-stats`). Importar un archivo desde adentro de otro
  módulo de dominio (`../player-stats/name-matcher`) rompe el aislamiento entre módulos que
  la constitución exige — la excepción de "utilidad pura sin framework" (constitución
  v1.1.0, sección 7) permite que un archivo así viva en la carpeta de un dominio, pero no
  contempla que otro dominio lo importe directo. `/back/src/shared/` ya es el lugar
  establecido para código sin dueño de un solo dominio (`shared/logging/`).
- **Esto no es reabrir `03-ingesta-stats`:** ninguna regla de esa spec cambia, ningún test de
  matching de jugadores cambia de comportamiento — es una relocación de archivo, verificada
  con la misma suite de tests ya existente (`name-matcher.spec.ts`) corriendo sin
  modificaciones desde la nueva ubicación.

### 6. Nuevo módulo de dominio propio: `team-whoscored-matching`

- **Decisión:** `/back/src/modules/team-whoscored-matching/` — `module/controller/service/
  repository/dto`, importa `WhoScoredModule` (igual que `player-stats`) y el `name-matcher`
  compartido. Expone `POST /team-whoscored-matching/refresh`.
- **Rationale:** El usuario pidió explícitamente "una spec chica y separada, no una
  reapertura" — un módulo de dominio propio, separado de `player-stats`, es el equivalente
  arquitectónico de esa separación. Sigue el mismo patrón ya establecido dos veces
  (`ingestion`, `player-stats`): controller con endpoint de disparo manual, service con la
  orquestación, repository con los upserts.

### 7. Resolución del edge case "dos filas de WhoScored matchean el mismo Team candidato en la misma corrida"

- **Decisión:** Por liga, se trae la lista de `Team` sin `externalWhoScoredId` **una sola
  vez** (mismo principio de "una consulta, reusada" que ya rige el matching de jugadores).
  Se procesan las filas de la tabla de posiciones en orden; cuando un `Team` matchea, se
  saca de la lista de candidatos en memoria para las filas siguientes de esa misma corrida.
  Si una fila no tiene candidatos disponibles (todos los de la liga ya matchearon antes en
  esta misma corrida), va a la cola de revisión igual que cualquier fila sin match.
- **Rationale:** Es la traducción directa de spec.md (Edge Cases: "gana el primero
  procesado"). No agrega una consulta extra — el filtrado es en memoria sobre la misma lista
  ya traída.

### 8. Dos bugs reales encontrados corriendo contra el sitio real y el catálogo completo

Confirmados durante `/speckit-implement` (sesión 2026-09-16), corriendo el endpoint contra
las 96 equipos reales de `02-ingesta-catalogo` y el WhoScored real — ninguno de los dos
apareció en la verificación en vivo de la fase de planificación (que probó páginas
individuales aisladas, no una corrida completa contra las 5 ligas):

**a) `waitForSelector` sobre el `<table>` no alcanza — hay que esperar una fila de datos.**
De forma intermitente (~1 de cada 3 corridas reales, reproducido con el mismo código),
`WhoScoredClient.fetchRenderedPage` capturaba `page.content()` con la tabla de posiciones
presente pero **vacía** (0 filas), sin ningún error — `getLeagueStandings` devolvía `[]`
silenciosamente y esa liga quedaba sin ningún equipo nuevo mapeado en esa corrida (no
contaba como falla, `leaguesProcessed` se incrementaba igual). Confirmado que el `<table>`
existe en el DOM antes de que WhoScored termine de agregarle las filas de equipos — esperar
solo el elemento (`table[id^="standings-"]`) es insuficiente. **Fix:** esperar una fila real
(`table[id^="standings-"] tbody tr`) antes de capturar. Se aplicó el mismo fix por
prevención al `fetchStatsTabs` de `03-ingesta-stats` (mismo riesgo estructural: esperaba
`table#top-player-stats-summary-grid` sin filas, y `panel.locator('table').waitFor({state:
'visible'})` sin filas al cambiar de pestaña) — no confirmado que ese código haya fallado
así en producción, pero es la misma clase de bug y el fix es gratis.

**b) Sin `findLinkedWhoScoredIds`, una liga parcialmente mapeada ensucia su propia cola de revisión.**
Al re-correr sobre una liga con algunos equipos ya mapeados (ej. Bundesliga tras la primera
corrida exitosa: Borussia Dortmund, RB Leipzig, etc. ya vinculados), la fila de WhoScored
"Borussia Dortmund" se seguía comparando contra los candidatos **restantes** (los equipos
todavía sin mapear, ej. "Bayern Munich", "Schalke 04") — ninguno de esos se parece a
"Borussia Dortmund", así que la fila terminaba con baja similitud en la cola de revisión,
**aunque su equipo real ya estaba correctamente mapeado**. No es una corrupción de dato (el
`Team` ya mapeado nunca se toca — FR-002 se cumple), pero ensucia la cola de revisión con
"casos sin resolver" que en realidad ya están resueltos. **Fix:** `findLinkedWhoScoredIds()`
trae una sola vez por corrida (no por liga) el set de todos los ids de WhoScored ya
vinculados a cualquier `Team`; cada fila se descarta antes de intentar matchear si su id ya
está en ese set.

Ambos fixes están cubiertos por tests (`who-scored.parser.spec.ts` sin cambios necesarios —
el bug era de timing del cliente, no del parser; nuevo test e2e en
`team-whoscored-matching.e2e-spec.ts` para (b)) y verificados corriendo el endpoint contra
las 5 ligas reales dos veces seguidas: la segunda corrida da `teamsMatched: 0` (nada quedaba
por matchear) y la cola de revisión mantiene exactamente sus 25 casos genuinamente difíciles
(variantes de nombre tipo "Inter" vs "Internazionale", "Atletico Madrid" vs "Atlético de
Madrid") sin ningún equipo ya resuelto reapareciendo.

## Technical Context resuelto

- **Language/Version:** TypeScript 6 (`strict: true`), Node.js LTS — sin cambios.
- **Primary Dependencies:** Ninguna dependencia nueva — reusa `playwright` y `cheerio` ya
  agregados en `03-ingesta-stats`.
- **Storage:** PostgreSQL. Nueva entidad `WhoScoredUnmatchedTeam` (mismo patrón que
  `WhoScoredUnmatchedPlayer`, ver data-model.md). `Team`/`League` no cambian de forma.
- **Testing:** Jest, mismo setup. `parseStandingsGrid` se testea contra un fixture HTML local
  (spec.md no lo pide explícitamente para esta spec, pero se mantiene el mismo estándar ya
  aplicado en `03-ingesta-stats` para no romper la definición de terminado del proyecto).
- **Target Platform:** Servidor Node.js (API REST NestJS), `/back`.
- **Project Type:** web-service (backend-only).
- **Performance Goals:** sin objetivo de latencia por request — 5 requests totales como
  máximo por corrida (una por liga con equipos pendientes), gobernadas por
  `WHO_SCORED_MIN_DELAY_MS` ya existente.
- **Constraints:** nunca sobrescribir un `Team.externalWhoScoredId` ya seteado; una falla al
  obtener la tabla de una liga no aborta las demás; idempotente entre corridas.
- **Scale/Scope:** hasta 5 requests a WhoScored por corrida completa (una por liga), hasta
  ~100 equipos totales a matchear la primera vez que se corre.
