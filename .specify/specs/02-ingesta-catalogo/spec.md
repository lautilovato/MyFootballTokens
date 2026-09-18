# Feature Specification: Ingesta de Catálogo de Jugadores desde Football-Data.org

**Feature Branch**: `02-ingesta-catalogo`

**Created**: 2026-09-07

**Status**: Draft

**Input**: User description: "Poblar la base de datos local con el catálogo de jugadores de las 5 ligas principales (Premier League, Bundesliga, La Liga, Serie A, Ligue 1) usando Football-Data.org como fuente, mediante un bootstrap manual disparado por endpoint. Cubre solo la ingesta del catálogo base (ligas, equipos, jugadores); scraping de WhoScored, matching entre fuentes, scheduler periódico y cálculo de cotización quedan para specs futuras."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bootstrap manual del catálogo completo (Priority: P1)

Como administrador del sistema, quiero disparar manualmente la carga inicial del catálogo (las 5 ligas, sus equipos y planteles) para poblar la base de datos local por primera vez sin intervención manual dato por dato.

**Why this priority**: Sin esto no hay catálogo — es el prerequisito de cualquier otra feature del proyecto (cotización, mercado de tokens, lectura de jugadores).

**Independent Test**: Invocar `POST /ingestion/players` contra una base vacía y verificar que `leagues`, `teams` y `players` queden pobladas con datos de las 5 ligas configuradas.

**Acceptance Scenarios**:

1. **Given** la base de datos sin ligas/equipos/jugadores, **When** se invoca `POST /ingestion/players`, **Then** el sistema crea las 5 ligas (PL, BL1, PD, SA, FL1), sus equipos y los jugadores de cada plantel, y responde con un resumen `{ leagues, teams, players }`.
2. **Given** una liga cuyo código no existe en Football-Data.org, **When** corre la ingesta, **Then** esa liga se omite (se loguea el error) y el resto del proceso continúa.

---

### User Story 2 - Re-ejecución idempotente (Priority: P2)

Como administrador, quiero volver a correr la ingesta sobre una base ya poblada sin que se dupliquen ligas, equipos o jugadores, para poder repetirla de forma segura mientras se prueba o cuando se refresque el catálogo.

**Why this priority**: El bootstrap se va a correr manualmente varias veces durante el desarrollo, y a futuro un scheduler semanal reutilizará el mismo servicio — sin idempotencia, cada corrida corrompería el catálogo.

**Independent Test**: Correr `POST /ingestion/players` dos veces seguidas sobre el mismo estado externo y verificar que la cantidad de filas en `leagues`, `teams` y `players` no cambia en la segunda corrida (solo se actualizan campos, si cambiaron).

**Acceptance Scenarios**:

1. **Given** una liga/equipo/jugador ya cargado en una corrida previa, **When** se vuelve a correr la ingesta, **Then** el registro existente se actualiza (upsert) en vez de crear uno duplicado.
2. **Given** un jugador que cambió de dorsal o de equipo en la fuente externa, **When** se vuelve a correr la ingesta, **Then** el registro local refleja el dato nuevo sin generar una segunda fila para ese jugador.

---

### User Story 3 - Resiliencia ante falla parcial de la fuente externa (Priority: P3)

Como sistema, ante la falla de un equipo o liga puntual (timeout, 404, 429 agotado) durante la ingesta, quiero seguir procesando el resto y dejar registro del error, para no perder el trabajo ya persistido en esa misma corrida ni dejar el catálogo inconsistente por una falla ajena.

**Why this priority**: Es un requisito no funcional explícito de la Constitución del proyecto (sección 3, "Resiliencia Externa"): si una API externa falla, el sistema debe seguir funcionando con los datos locales/caché ya almacenados.

**Independent Test**: Simular que un equipo puntual devuelve error (mock/caída de red) durante una corrida y verificar que los equipos y jugadores restantes de esa misma liga y del resto de las ligas igual quedan persistidos.

**Acceptance Scenarios**:

1. **Given** que un equipo devuelve 404 o timeout al pedir su plantel, **When** corre la ingesta, **Then** ese equipo se loguea como error y el resto de los equipos de la liga se sigue procesando.
2. **Given** que Football-Data.org devuelve 429 en una request, **When** el cliente HTTP lo recibe, **Then** reintenta con backoff hasta 3 veces antes de propagar el error para ese recurso puntual.

---

### Edge Cases

- ¿Qué pasa si `POST /ingestion/players` se invoca mientras una corrida anterior todavía está en curso? (No resuelto por el alcance original — se documenta como limitación conocida, ver Assumptions.)
- Campo `position` nulo o con un valor no reconocido en la API externa → se normaliza a `UNKNOWN`, el jugador no se descarta.
- Campos opcionales nulos (`dateOfBirth`, `nationality`, `shirtNumber`) → se persisten como `null`, no bloquean el upsert.
- Football-Data.org caído por completo (toda la corrida falla) → los datos ya persistidos en corridas anteriores siguen disponibles para el resto del sistema (no hay borrado ni rollback).
- Rate limit del plan free (10 req/min) alcanzado de forma sostenida → el cliente HTTP encola las requests; la corrida completa (5 ligas × ~20 equipos) puede tardar varios minutos, es un comportamiento esperado, no un error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST proveer un cliente HTTP hacia Football-Data.org (`baseURL` y `X-Auth-Token` configurables vía variables de entorno) que encole las requests para no superar un límite configurable de requests/minuto (default 10).
- **FR-002**: El cliente HTTP MUST reintentar automáticamente ante respuesta 429 con backoff incremental, hasta 3 intentos, antes de propagar el error al llamador.
- **FR-003**: El sistema MUST proveer un adapter que traduzca las respuestas externas (`Competition`, `Team` + `squad`) a un shape de dominio normalizado, sin exponer los tipos/DTOs externos fuera de la capa de adapters.
- **FR-004**: El adapter MUST normalizar el campo `position` de la API (`Goalkeeper`/`Defence`/`Midfield`/`Offence`) al enum `PlayerPosition` ya existente en `Player` (`GK`/`DF`/`MF`/`FW`), agregando el valor `UNKNOWN` para nulos o valores no reconocidos.
- **FR-005**: El sistema MUST extender la entidad `League` existente (`back/src/infrastructure/database/entities/league.entity.ts`) agregando `externalId` (number, unique) y `code` (string, unique — "PL"/"BL1"/"PD"/"SA"/"FL1").
- **FR-006**: El sistema MUST extender la entidad `Team` existente (`back/src/infrastructure/database/entities/team.entity.ts`) agregando `externalId` (number, unique), `shortName?`, `tla?` y `crestUrl?`.
- **FR-007**: El sistema MUST extender la entidad `Player` existente (`back/src/infrastructure/database/entities/player.entity.ts`) agregando un índice único sobre el campo ya existente `externalFootballDataId`, y los campos opcionales `dateOfBirth?`, `nationality?`, `shirtNumber?`.
- **FR-008**: El sistema MUST implementar un servicio de orquestación (`PlayersIngestionService.run()`) que, para cada una de las 5 ligas configuradas (PL, BL1, PD, SA, FL1), resuelva/cree la liga, liste sus equipos y, por cada equipo, obtenga el plantel completo y haga upsert de equipo y jugadores.
- **FR-009**: Toda persistencia de la ingesta MUST ser idempotente: upsert por `code` (League), `externalId` (Team) y `externalFootballDataId` (Player) — correr `run()` varias veces no debe duplicar registros (User Story 2).
- **FR-010**: Ante la falla de un equipo o liga puntual, el sistema MUST loguearlo con el logger estructurado ya usado en el módulo `players` (`PinoLoggerService.event(...)`) y continuar con el resto sin abortar todo el proceso (User Story 3).
- **FR-011**: El sistema MUST exponer `POST /ingestion/players`, documentado con decoradores de `@nestjs/swagger`, que dispare `PlayersIngestionService.run()` y devuelva `{ leagues, teams, players }` con los conteos procesados.
- **FR-012**: El código nuevo MUST ubicarse conforme a la Constitución del proyecto: cliente HTTP + adapter + DTOs externos en `/back/src/adapters/football-data/`; orquestación (`ingestion.module.ts`, `ingestion.controller.ts`, `ingestion.service.ts`, `ingestion.repository.ts`) en `/back/src/modules/ingestion/`; ninguna entidad se crea fuera de `/back/src/infrastructure/database/entities/`.
- **FR-013**: La configuración (`FOOTBALL_DATA_BASE_URL`, `FOOTBALL_DATA_API_KEY`, `FOOTBALL_DATA_RATE_LIMIT_PER_MINUTE`) MUST leerse vía `process.env`, siguiendo el mismo patrón ya usado en `database.config.ts` (no se introduce `@nestjs/config`).

### Key Entities *(include if feature involves data)*

- **League** *(extiende la entidad existente)*: agrega `externalId` (id de Competition en Football-Data.org) y `code` (código de liga usado para pedir datos: PL/BL1/PD/SA/FL1). Los campos `name` y `country` ya existen y se reutilizan.
- **Team** *(extiende la entidad existente)*: agrega `externalId` (id de Team en Football-Data.org), `shortName`, `tla` y `crestUrl`. El campo `name` y la relación con `League` ya existen.
- **Player** *(extiende la entidad existente)*: el campo `externalFootballDataId` ya existe pero pasa a ser único (clave de idempotencia); se agregan `dateOfBirth`, `nationality` y `shirtNumber` como datos opcionales del plantel. `fullName`, `position` (reutilizando el enum existente + `UNKNOWN`), `baseValue` y la relación con `Team` ya existen y se reutilizan sin cambios de forma.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Disparando `POST /ingestion/players` una sola vez sobre una base vacía, el catálogo queda poblado con jugadores de las 5 ligas configuradas, sin pasos manuales adicionales.
- **SC-002**: Ejecutar la ingesta dos veces seguidas sobre el mismo estado externo no incrementa la cantidad de filas en `leagues`, `teams` ni `players` en la segunda corrida.
- **SC-003**: Si al menos una liga o equipo falla durante una corrida, el resto de los datos de esa misma corrida igual queda persistido (no hay rollback total del proceso).
- **SC-004**: Durante una corrida completa no se registran errores 429 sin recuperar (el cliente respeta el límite de requests/minuto configurado y los reintentos absorben los picos puntuales).

## Assumptions

- Se agrega el valor `UNKNOWN` al enum `PlayerPosition` ya existente (`GK`/`DF`/`MF`/`FW`) en vez de crear un enum nuevo, para no duplicar el modelo de posición que ya usa el módulo de lectura de jugadores.
- No se agregan `firstName`/`lastName` como campos separados: se reutiliza el campo `fullName` ya existente con el valor `name` que devuelve la API.
- Los jugadores nuevos se persisten con `baseValue = '0.00'` por defecto, ya que Football-Data.org no provee valor monetario; el cálculo real de cotización es responsabilidad de una spec futura (fuera de alcance de esta).
- No se instalan `@nestjs/config` ni `@nestjs/schedule`: se mantiene el patrón actual de lectura de variables de entorno vía `process.env`, y el scheduler semanal queda para una spec futura que reutilice `PlayersIngestionService.run()` sin duplicar lógica.
- El campo `externalWhoScoredId` en `Player` (ya existente) queda reservado sin completar; se define y completa en la spec de scraping de WhoScored.
- La cola de rate limiting del cliente HTTP es en memoria y de un solo proceso: si en el futuro la ingesta corre en múltiples instancias o como job distribuido, deberá migrarse a una solución persistente (Redis/Bull) — fuera de alcance de esta spec.
- Scraping de WhoScored, matching de jugadores entre fuentes, scheduler periódico de refresh y cálculo de cotización/mercado de tokens quedan explícitamente fuera de alcance (specs futuras que consumen las entidades definidas/extendidas acá).
