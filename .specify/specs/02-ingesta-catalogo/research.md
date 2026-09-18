# Research: Ingesta de Catálogo de Jugadores

## Contexto de partida

`01-catalogo-jugadores` ya dejó `League`, `Team` y `Player` persistidas en PostgreSQL vía
MikroORM, y un módulo `/back/src/modules/player/` de solo lectura con Swagger, DTOs
validados y logging estructurado (`PinoLoggerService`, en `back/src/shared/logging/`). Nada
de eso se toca en su forma de lectura. Lo que no existe todavía: ningún cliente HTTP hacia
un proveedor externo, ninguna capa `/adapters/`, y las 3 entidades no tienen los campos que
Football-Data.org requiere para idempotencia (`externalId`/`code` en `League`, `externalId`
en `Team`, unique en `externalFootballDataId` de `Player`). Esta investigación resuelve el
Technical Context y las decisiones de diseño necesarias para no duplicar lo ya construido.

## Decisiones

### 1. Cliente HTTP: `@nestjs/axios` + `axios` (no `fetch` nativo)
- **Decisión:** Usar `HttpService` de `@nestjs/axios` dentro de `FootballDataClient`.
- **Rationale:** Es el cliente HTTP idiomático de NestJS (inyectable, se integra con el
  módulo/DI existente), y el proyecto ya depende de `rxjs` (vía `@nestjs/common`), así que
  no agrega una dependencia transitiva nueva de peso.
- **Alternativas consideradas:** `fetch` nativo de Node 18+ — rechazado porque no se integra
  como provider inyectable y obligaría a un wrapper manual sin beneficio real sobre
  `@nestjs/axios`.

### 2. Rate limiting: cola secuencial en memoria (no Bull/Redis)
- **Decisión:** `FootballDataClient` encola cada request con una promesa en memoria
  (`intervalMs = 60000 / requestsPerMinute`), igual que el diseño original del borrador.
- **Rationale:** Es un endpoint disparado manualmente por un solo proceso; introducir una
  cola persistente (Bull/BullMQ + Redis) para esto sería complejidad prematura. Redis ya
  está en el proyecto (por el caché de `01`), pero se reserva para su propósito actual.
- **Alternativas consideradas:** Bull/BullMQ con Redis — rechazada por ahora; queda anotada
  como migración necesaria si el scheduler semanal (spec futura) corre en múltiples
  instancias (ver spec.md, Assumptions).

### 3. Reuso del enum `PlayerPosition` existente (+ `UNKNOWN`)
- **Decisión:** Agregar el valor `UNKNOWN` al enum `PlayerPosition` (`GK`/`DF`/`MF`/`FW`) ya
  usado por `Player` y por `GetPlayersFilterDto` del módulo de lectura, en vez de crear un
  enum paralelo con los nombres largos de la API (`Goalkeeper`/`Defence`/...).
- **Rationale:** El módulo de lectura ya filtra por este enum; duplicarlo rompería el
  contrato existente de `GET /players?position=`.
- **Alternativas consideradas:** Enum nuevo con los nombres de la API — rechazado, obliga a
  mantener dos representaciones de la misma posición.
- **Mapeo:** `Goalkeeper`→`GK`, `Defence`→`DF`, `Midfield`→`MF`, `Offence`→`FW`, cualquier
  otro valor o `null`→`UNKNOWN`.

### 4. `externalFootballDataId` como clave de idempotencia (no un campo nuevo)
- **Decisión:** Reusar la columna ya existente `Player.externalFootballDataId` (string,
  nullable) como clave de upsert, agregándole un índice único vía migración. El id numérico
  de la API se persiste con `String(id)`.
- **Rationale:** El campo ya existe con ese propósito declarado por su nombre; agregar
  `footballDataId: number` sería una columna redundante que obligaría a elegir cuál es la
  canónica.
- **Nota:** un índice único en PostgreSQL permite múltiples `NULL` (cada `NULL` se considera
  distinto), así que no bloquea futuros jugadores cargados por otra vía sin este campo.

### 5. El adapter aísla los DTOs externos
- **Decisión:** `FootballDataAdapter` traduce `FootballDataCompetitionDto`/`TeamDto`/
  `SquadMemberDto` a tipos normalizados internos (`NormalizedLeague`/`NormalizedTeam`/
  `NormalizedPlayer`) definidos en la propia capa `adapters/football-data/`.
  `IngestionService` solo conoce estos tipos normalizados, nunca los DTOs externos.
- **Rationale:** Es el requisito explícito de la constitución ("Capa de aislamiento
  estricta" para APIs externas) — si Football-Data.org cambia su forma de respuesta, el
  cambio queda contenido en el adapter.

### 6. `baseValue`: default solo en creación, nunca se reescribe en updates
- **Decisión:** Al crear un `Player` nuevo por primera vez, `baseValue` se persiste como
  `'0.00'`. En un upsert sobre un jugador ya existente, `baseValue` **no** se incluye en los
  campos actualizados.
- **Rationale:** Football-Data.org no provee valor monetario (es responsabilidad de una spec
  futura de cotización). Si el upsert reescribiera `baseValue` en cada corrida, una corrida
  semanal del scheduler futuro pisaría cualquier cotización ya calculada — se evita ese
  acoplamiento no intencional entre features.
- **Alternativas consideradas:** Recalcular/reescribir `baseValue` en cada ingesta —
  rechazada, mezclaría la responsabilidad de esta feature con la de cotización.

### 7. Sin `@nestjs/config` ni `@nestjs/schedule`
- **Decisión:** `FOOTBALL_DATA_BASE_URL`/`FOOTBALL_DATA_API_KEY`/
  `FOOTBALL_DATA_RATE_LIMIT_PER_MINUTE` se leen con `process.env` directo, igual que
  `database.config.ts` ya hace hoy. No se agrega scheduler — `IngestionService.run()` queda
  como un método público reutilizable, sin decorador `@Cron`.
- **Rationale:** Mantener consistencia con el único patrón de configuración ya usado en el
  repo; el scheduler semanal es explícitamente una spec futura (fuera de alcance) que
  reutilizará este mismo método.

### 8. Capa `Repository` propia para la ingesta (`ingestion.repository.ts`)
- **Decisión:** Los 3 upserts (`upsertLeague`/`upsertTeam`/`upsertPlayer`) viven en
  `ingestion.repository.ts`, inyectado en `IngestionService`, en vez de llamar al
  `EntityManager` directo desde el service (como hacía el borrador original).
- **Rationale:** La constitución exige la capa `Repository` para persistencia en cada módulo
  de dominio (igual que `player.repository.ts` ya existente); mezclar orquestación y
  persistencia en el service rompería ese patrón ya establecido.

### 9. Ubicación de la capa Adapters: `/back/src/adapters/`
- **Decisión:** Nuevo directorio de primer nivel `/back/src/adapters/football-data/`,
  hermano de `/infrastructure/` y `/modules/`.
- **Rationale:** La constitución nombra "Adapters (APIs externas)" como una de las 4 capas
  obligatorias, distinta de Controllers/Services/Repositories — hasta este feature ningún
  adapter externo existía en el proyecto, así que no hay convención previa que seguir más
  que el propio texto de la constitución.
- **Alternativas consideradas:** Meter cliente + adapter dentro de `modules/ingestion/` —
  rechazada, acoplaría un componente reutilizable (por ejemplo por un futuro scheduler o por
  el adapter de WhoScored) a un módulo de dominio específico.

## Technical Context resuelto

- **Language/Version:** TypeScript 6 (modo estricto), Node.js LTS, `target: ES2023` — sin
  cambios respecto a `01-catalogo-jugadores`.
- **Primary Dependencies:** NestJS 12, MikroORM 7 (`@mikro-orm/postgresql`), `@nestjs/
  swagger`, `class-validator`/`class-transformer` (reusados). Nuevas: `@nestjs/axios`,
  `axios`.
- **Storage:** PostgreSQL (mismo `docker-compose.yml`, puerto 5433). Redis no aplica a este
  feature.
- **Testing:** Jest (`back/jest.config.ts`, `back/test/jest-e2e.json`), mismo setup.
- **Target Platform:** Servidor Node.js (API REST), directorio `/back`.
- **Project Type:** web-service (backend-only para este feature).
- **Performance Goals:** completar el bootstrap de las 5 ligas sin exceder el rate limit
  configurado (default 10 req/min); no hay objetivo de latencia por request individual.
- **Constraints:** persistencia idempotente obligatoria; falla puntual de liga/equipo no
  aborta el resto del proceso.
- **Scale/Scope:** 5 ligas, ~100-140 equipos, ~2500-3000 jugadores totales.
