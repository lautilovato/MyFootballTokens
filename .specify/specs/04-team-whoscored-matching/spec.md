# Feature Specification: Matching Automático de Equipos con WhoScored

**Feature Branch**: `04-team-whoscored-matching`

**Created**: 2026-09-16

**Status**: Draft

**Input**: User description: "Automatizar la carga de Team.externalWhoScoredId matcheando equipos de Football-Data.org contra WhoScored, para no tener que cargarlo a mano equipo por equipo."

**Depende de**: `03-ingesta-stats` (reusa `name-matcher.ts`, `WHO_SCORED_MATCH_THRESHOLD`, el cliente headless de WhoScored, y el criterio de "cola de revisión manual" ya establecido para jugadores). No modifica nada de esa spec — solo la reusa de solo lectura.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Completar automáticamente el mapeo de una liga (Priority: P1)

Hoy, `Team.externalWhoScoredId` se carga a mano equipo por equipo (buscando cada club en WhoScored y copiando su id). Para una liga con varios equipos sin mapear, alguien dispara el proceso una vez y, al terminar, los equipos cuyo nombre en la tabla de posiciones de WhoScored coincide razonablemente con el nombre ya cargado quedan mapeados automáticamente, sin haber tenido que buscar cada uno a mano.

**Why this priority**: Es el objetivo completo de la feature — sin esto, cargar el mapeo sigue siendo 100% manual, que es exactamente lo que se quiere dejar de hacer.

**Independent Test**: Tomar una liga ya cargada (desde `02-ingesta-catalogo`) con equipos sin `externalWhoScoredId`, correr el proceso, y verificar que los equipos con nombre suficientemente similar en la tabla de posiciones de esa liga en WhoScored quedan con `externalWhoScoredId` seteado — sin tocar nada de jugadores ni de stats.

**Acceptance Scenarios**:

1. **Given** una liga con equipos cargados desde Football-Data.org sin `externalWhoScoredId`, **When** se corre el proceso para esa liga, **Then** los equipos cuyo nombre en la tabla de posiciones de WhoScored supera el umbral de similitud quedan con `externalWhoScoredId` seteado al id real de WhoScored.
2. **Given** una fila de la tabla de posiciones de WhoScored cuyo nombre no tiene ninguna coincidencia por encima del umbral entre los `Team` candidatos de esa liga, **When** se corre el proceso, **Then** esa fila de WhoScored (nombre + id) queda registrada en una cola de revisión manual — ningún `Team` cambia de valor, no se fuerza un vínculo dudoso.

---

### User Story 2 - No pisar mapeos ya cargados (Priority: P2)

Algunos equipos (como Barcelona) ya se mapearon a mano. Al correr el proceso automático sobre una liga que tiene una mezcla de equipos ya mapeados y sin mapear, los que ya tienen `externalWhoScoredId` no se tocan ni se vuelven a evaluar.

**Why this priority**: Sin esta garantía, una corrida automática podría pisar trabajo manual ya validado — es la protección mínima para poder confiar en el proceso.

**Independent Test**: Sobre una liga con al menos un equipo ya mapeado a mano y otros sin mapear, correr el proceso y verificar que el `externalWhoScoredId` del equipo ya mapeado no cambia, mientras los demás se procesan normalmente.

**Acceptance Scenarios**:

1. **Given** un equipo con `externalWhoScoredId` ya cargado (a mano o por una corrida anterior), **When** se corre el proceso, **Then** ese equipo se excluye por completo del matching — no se le busca un candidato nuevo ni se recalcula nada sobre él.

---

### User Story 3 - Re-ejecutable sin romper ni duplicar nada (Priority: P3)

Después de revisar manualmente algunos de los equipos que quedaron sin match, o después de cargar una liga nueva, alguien vuelve a correr el mismo proceso. El resultado es consistente: no aparecen entradas duplicadas en la cola de revisión, y los equipos ya mapeados (a mano o automáticamente) siguen exactamente igual.

**Why this priority**: El proceso se va a correr manualmente varias veces a medida que se cargan más ligas — tiene que ser seguro repetirlo sin tener que limpiar nada a mano antes.

**Independent Test**: Correr el proceso dos veces seguidas sobre el mismo estado de datos (sin cambios entre medio) y verificar que el segundo resultado no agrega registros duplicados a la cola de revisión ni modifica ningún equipo ya matcheado.

**Acceptance Scenarios**:

1. **Given** una corrida ya ejecutada sobre una liga, **When** se vuelve a correr el proceso sin cambios en los datos de por medio, **Then** no se crean entradas duplicadas en la cola de revisión para los mismos equipos, y ningún equipo ya matcheado cambia de valor.

---

### Edge Cases

- **Liga sin equipos pendientes**: si todos los equipos de una liga ya tienen `externalWhoScoredId` (a mano o de una corrida anterior) o ya están en la cola de revisión, esa liga se omite sin generar ningún request a WhoScored.
- **Falla al obtener la tabla de posiciones de una liga puntual**: se registra el error y se continúa con el resto de las ligas — una liga que falla no aborta las demás (mismo criterio de resiliencia que `03-ingesta-stats`).
- **Dos filas de la tabla de posiciones de WhoScored matchean con el mismo `Team` candidato en la misma corrida**: gana la primera fila procesada (ese `Team` queda mapeado a su id); la segunda fila se re-evalúa contra los candidatos restantes de esa liga y, si no encuentra otro por encima del umbral, esa fila (no ningún `Team`) queda en la cola de revisión manual en vez de forzar un segundo vínculo al mismo `Team` (ver Assumptions).
- **Un equipo aparece más de una vez en la tabla de posiciones** (por ejemplo, si WhoScored separa filas de local/visitante): se procesa una sola vez por equipo por liga, no se duplica el intento de match.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST permitir disparar manualmente, bajo demanda, un proceso que complete `Team.externalWhoScoredId` para los equipos de las ligas ya cargadas.
- **FR-002**: El sistema MUST excluir de este proceso a todo `Team` que ya tenga `externalWhoScoredId` cargado — sea manual o de una corrida automática anterior — sin sobrescribirlo nunca.
- **FR-003**: Para cada `League` con al menos un `Team` sin `externalWhoScoredId`, el sistema MUST obtener la tabla de posiciones de esa liga en WhoScored (una consulta por liga, no una por equipo) y comparar los equipos ahí listados contra los `Team` de esa liga en la base de datos.
- **FR-004**: El matching de nombres MUST reusar sin modificarlo el mismo algoritmo de similitud y el mismo umbral (`WHO_SCORED_MATCH_THRESHOLD`) ya implementados para el matching de jugadores en `03-ingesta-stats`.
- **FR-005**: Cuando un `Team` matchea con un equipo de la tabla de posiciones por encima del umbral, el sistema MUST persistir el id real de WhoScored en `Team.externalWhoScoredId`.
- **FR-006**: Cuando una fila de la tabla de posiciones de WhoScored no matchea con ningún `Team` candidato de esa liga por encima del umbral, el sistema MUST registrar esa fila (nombre + id de WhoScored) en una cola de revisión manual (mismo criterio que la ya existente para jugadores sin match) en vez de asignarle un id dudoso a algún `Team`.
- **FR-007**: El sistema MUST poder correrse repetidamente sobre el mismo estado de datos sin duplicar entradas en la cola de revisión ni alterar ningún `Team` ya matcheado (idempotencia).
- **FR-008**: Una falla al obtener la tabla de posiciones de una liga puntual MUST no abortar el procesamiento de las demás ligas en la misma corrida.
- **FR-009**: Antes de implementar el parser de la tabla de posiciones, se MUST verificar en vivo la estructura real de esa página de WhoScored (HTML server-renderizado vs. contenido armado client-side) — no se asume un selector sin haberlo confirmado contra el sitio real, mismo criterio ya aplicado en `03-ingesta-stats`.

### Key Entities *(include if feature involves data)*

- **Team** *(existente, no se modifica su forma)*: esta feature solo completa el campo `externalWhoScoredId` de los registros que todavía no lo tienen; los ya cargados quedan intactos.
- **League** *(existente)*: agrupa los `Team` que se comparan contra la tabla de posiciones de WhoScored de esa liga puntual — el matching es siempre dentro de una misma liga, nunca cruzado entre ligas.
- **Cola de revisión de equipos** *(nueva)*: análoga a la ya existente para jugadores sin match — registra qué equipo de WhoScored no encontró un `Team` correspondiente por encima del umbral, para que alguien lo revise y complete a mano si corresponde.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Para una liga con equipos sin mapear, correr el proceso una vez deja mapeados automáticamente, sin intervención manual, a los equipos cuyo nombre en WhoScored coincide de forma clara con el nombre ya cargado.
- **SC-002**: Ningún `Team` que ya tenía `externalWhoScoredId` antes de correr el proceso cambia de valor después de correrlo, en ninguna corrida.
- **SC-003**: Correr el proceso dos veces seguidas sobre el mismo estado de datos produce el mismo resultado la segunda vez — mismos equipos mapeados, mismas entradas en la cola de revisión, sin duplicados nuevos.
- **SC-004**: Una liga cuya tabla de posiciones no pudo obtenerse en una corrida no impide que las demás ligas de esa misma corrida se procesen y completen normalmente.

## Assumptions

- El algoritmo de similitud de nombres y el umbral (`name-matcher.ts`, `WHO_SCORED_MATCH_THRESHOLD`) construidos en `03-ingesta-stats` no cambian — esta feature los reusa tal cual, no los reimplementa ni los ajusta.
- Cada liga ya soportada por el catálogo (las 5 ligas de Football-Data.org) tiene una página de tabla de posiciones ubicable en WhoScored.
- Si dos filas de la tabla de posiciones de WhoScored matchean con el mismo `Team` candidato en la misma corrida, gana la primera fila procesada (ese `Team` queda mapeado) y la segunda fila se re-evalúa contra los candidatos restantes; si no hay otro por encima del umbral, esa fila queda en la cola de revisión — no se fuerza un segundo vínculo al mismo `Team` (mismo espíritu que "mejor no tener el dato que vincularlo mal", ya aplicado a jugadores).
- Esta feature no agrega scheduler ni se integra a ningún proceso periódico todavía — queda como un disparo manual bajo demanda, igual que el resto de los procesos de ingesta/matching existentes hasta ahora.
- No se modifica el matching de jugadores ni la ingesta de stats de `03-ingesta-stats` — esta feature solo lee `League`/`Team` ya cargados y escribe `Team.externalWhoScoredId` y la nueva cola de revisión de equipos.
