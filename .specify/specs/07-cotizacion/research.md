# Research: Sistema de Score y Cotización de Jugadores

**Feature**: `07-cotizacion` | **Date**: 2026-10-03 | **Plan**: [plan.md](./plan.md)

Cada sección resuelve una incógnita del Technical Context con el formato Decisión / Por qué /
Alternativas descartadas.

---

### 1. Scheduler: `@nestjs/schedule` con el cron registrado en tiempo de arranque

- **Decisión**: incorporar `@nestjs/schedule`. El job semanal no se declara con `@Cron(...)`
  estático sino que `QuotesService` lo registra en `onModuleInit` a través de
  `SchedulerRegistry`, leyendo la expresión de `QUOTES_RECALC_CRON` (por defecto
  `0 3 * * 1`, lunes 03:00) y la zona de `QUOTES_RECALC_TIMEZONE` (por defecto, la del
  servidor). `QUOTES_SCHEDULER_ENABLED=false` lo desactiva (lo usa `.env.test`).
- **Por qué**: la constitución §4 exige un job scheduler y nombra este recálculo como su
  primer uso. Las specs 02 y 03 dejaron el scheduler explícitamente para "una spec futura"
  (02 research #7, 03 research #9): es esta. El decorador estático no admite una expresión
  leída del entorno de forma limpia, y FR-027 pide día y hora configurables sin tocar código.
  El cron de la librería **no recupera disparos perdidos** mientras el proceso estuvo caído,
  que es exactamente lo que pide US5-3 (no correr duplicados por el período perdido).
- **Alternativas descartadas**: `setInterval` a mano (reimplementar parsing de cron y zonas
  horarias); BullMQ sobre Redis (agrega colas, workers y otro paquete para un único job
  semanal en una sola instancia); cron del sistema operativo invocando el endpoint (saca el
  scheduler del código evaluado y depende del despliegue).
- **Encuadre constitucional**: librería utilitaria bajo la cláusula de §2 — no compite con
  ningún pilar, resuelve un problema acotado. Justificada en Complexity Tracking del plan.

### 2. Exclusión mutua de corridas: índice único parcial sobre `quote_run`

- **Decisión**: al empezar, cada corrida inserta su fila en `quote_run` con
  `status = 'RUNNING'`. Un índice único parcial
  `CREATE UNIQUE INDEX ... ON quote_run ((true)) WHERE status = 'RUNNING'` hace que la base
  rechace una segunda corrida en curso. Si la inserción choca con el índice, se inserta en su
  lugar una fila `SKIPPED` (queda constancia, US5-2) y el disparo manual responde **409**.
  Al arrancar la aplicación, toda fila que haya quedado en `RUNNING` (proceso muerto a mitad
  de corrida) se cierra como `FAILED` con motivo `interrupted`.
- **Por qué**: FR-031 exige que nunca haya dos corridas a la vez, sea cual sea el disparador.
  El índice parcial es atómico, sobrevive a reinicios, funciona igual con una o varias
  instancias y no necesita ningún componente nuevo.
- **Alternativas descartadas**: flag en memoria (no sobrevive a reinicios ni a dos
  instancias); `pg_advisory_lock` (se libera solo al cortar la conexión, pero no deja
  registro y con el pool de MikroORM es fácil tomarlo en una conexión y soltarlo en otra);
  lock en Redis (Redis es caché, no fuente de verdad, §3).

### 3. Atomicidad del lote: cálculo en memoria, persistencia en una sola transacción

- **Decisión**: la corrida tiene tres fases. (a) Fuera de transacción se inserta la fila
  `RUNNING`. (b) Se leen en **una** consulta las estadísticas de la temporada vigente con
  jugador, posición, liga y reputación, y se calcula todo en memoria con la utilidad pura
  `score-calculator.ts`. (c) En **una** transacción se hace `insertMany` de todas las
  `player_quote`, un `UPDATE player SET base_value = q.price FROM player_quote q WHERE
  q.run_id = ?` y el cierre de la corrida en `COMPLETED`. Si (b) o (c) fallan, la
  transacción se revierte y la fila de la corrida se cierra como `FAILED` con el motivo, en
  una escritura aparte.
- **Por qué**: FR-030/SC-008 (0 cotizaciones parciales). La fila `RUNNING` queda fuera de la
  transacción para que el fallo pueda registrarse (FR-029). Con 5.000 jugadores el lote
  entra holgado en memoria y una sola consulta + un `insertMany` cumple SC-001 (< 2 min) por
  varios órdenes de magnitud.
- **Alternativas descartadas**: persistir jugador por jugador (lento, y la atomicidad exigiría
  una transacción larga igual); tabla de staging (complejidad sin beneficio a este volumen).

### 4. Normalización robusta: percentiles 5 y 95 del universo de la temporada

- **Decisión**: para cada métrica de rendimiento (goals, assists, shots, keyPasses, dribbles,
  tackles, rating) se calculan el percentil 5 (`p5`) y el 95 (`p95`) sobre **todos** los
  jugadores con estadísticas de la temporada vigente (interpolación lineal). El valor
  normalizado es `clamp((x − p5) / (p95 − p5), 0, 1)`. Si `p95 = p5` la métrica vale 0 para
  todos (edge case «sin variación»). Los `p5`/`p95` de cada métrica se guardan en la corrida
  (`quote_run.normalization_bounds`) para auditoría.
- **Por qué**: FR-005 pide un rango robusto frente a extremos. Min-max puro deja que un
  jugador con 30 goles aplaste a todos los demás contra 0; z-score no produce un rango
  [0,1]. Con dos jugadores (escenarios de test) los percentiles por interpolación siguen
  mandando el menor a 0 y el mayor ligeramente por encima de 1, así que el orden queda
  preservado. **Actualización 2026-10-13: sin recorte superior** (ver «Sin tope superior»).
- **Universo global, no por posición**: los pesos por posición ya corrigen que un arquero no
  haga goles; normalizar por posición achicaría el universo y volvería inestables los
  percentiles en posiciones con pocos jugadores.
- **Alternativas descartadas**: min-max puro; z-score con sigmoide (menos explicable en el
  desglose); rangos fijos por métrica (habría que recalibrarlos cada temporada).

### 5. Ausencia y datos incompletos

- **Decisión**: `absence = 1 − matchesPlayed / maxMatchesPlayedDeSuLiga`, donde el máximo es
  el de los jugadores de la misma liga (vía equipo) en la temporada vigente. Ya cae en [0,1],
  así que **no** pasa por percentiles. Si `matchesPlayed` es nulo: `absence = 0` (no se
  penaliza) y, como pide la spec, las métricas por partido (shots, keyPasses, dribbles,
  tackles) valen 0; la cotización lleva `missingMatchesPlayed = true`.
- **Por qué**: la spec define ausencia como «cuánto jugó respecto de lo que se jugó en su
  liga» y hoy no hay minutos ingeridos (Assumptions). Medir contra el máximo de la liga evita
  castigar a jugadores de ligas con menos fechas disputadas.
- **Alternativa descartada**: máximo global (las ligas no van sincronizadas en fechas).

### 6. Fórmula del score, re-escalado por pesos positivos y redondeo

- **Decisión**:
  1. `contribución_m = w_m · n_m / S⁺`, con `S⁺` = suma de los pesos positivos del perfil
     aplicado (FR-007).
  2. `rawScore = Σ contribución_m` (negativo solo si las penalizaciones dominan).
  3. `score = round4(max(0, rawScore))` (piso en 0, sin tope superior).
  4. `price = max(minPrice, round(baseValue + score · scaleFactor))`.
  El desglose guarda las contribuciones ya divididas por `S⁺`, de modo que su suma es
  exactamente `rawScore` (FR-002b, SC-002a).
- **Por qué**: dividir dentro de cada contribución —y no al final— es lo que hace que el
  desglose sume el score sin un término de ajuste escondido. Redondear el score antes del
  precio garantiza FR-002a (mismo score ⇒ mismo precio).
- **Comparación con la spec**: los pesos por defecto de ambas estrategias ya suman 1 en sus
  positivos, así que `S⁺ = 1` y el ejemplo de la spec (score 0,693 → 724 créditos) se
  reproduce sin cambios.

### 7. Perfiles por posición iniciales

- **Decisión**: los pesos **generales** de cada estrategia son los de FR-009, y ya están
  orientados al delantero (goles es el peso mayor). Por eso `FW` **no** tiene perfil propio y
  usa los generales; eso mantiene literal el ejemplo de la spec («delantero» con los pesos
  generales). `GK`, `DF` y `MF` tienen perfiles propios. `UNKNOWN` usa los generales
  (edge case «sin posición»). Todos los perfiles tienen positivos que suman 1. Los valores
  exactos están en [data-model.md](./data-model.md#valores-sembrados).
- **Por qué**: cumple FR-006/FR-009 con el mínimo de perfiles y sin contradecir el ejemplo
  trabajado de la spec.

### 8. Dónde vive la reputación por defecto

- **Decisión**: `defaultReputation` (20 por defecto) es un parámetro de la **versión** de la
  estrategia, junto a `baseValue`, `scaleFactor` y `minPrice`.
- **Por qué**: FR-025 lo pide configurable, y como afecta el score, cambiarlo tiene que dejar
  traza: al vivir en la versión, toda cotización sabe qué valor por defecto se usó y cambiarlo
  crea una versión nueva (FR-011). Una variable de entorno cambiaría precios sin dejar rastro.

### 9. Persistencia del desglose: `jsonb` en la cotización

- **Decisión**: `player_quote.breakdown` es `jsonb`, un arreglo de
  `{ metric, raw, normalized, weight, contribution }`. Los pesos de la versión también son
  `jsonb` (`{ general: {...}, byPosition: { DF: {...}, ... } }`).
- **Por qué**: el desglose es una foto inmutable que siempre se lee entera junto con su
  cotización y nunca se filtra por dentro. Una tabla hija multiplicaría por 9 las filas
  (~45.000 por corrida) sin ninguna consulta que la aproveche.
- **Alternativa descartada**: tabla `player_quote_metric` (JOINs y volumen sin beneficio).

### 10. `player.base_value` pasa a ser espejo de la cotización vigente

- **Decisión**: la corrida actualiza `player.base_value` con el precio nuevo dentro de la
  misma transacción (research #3) e invalida la caché del listado de jugadores con
  `PlayerService.invalidateListCache()`, como ya hacen ingesta, stats e imágenes. Un jugador
  nunca cotizado conserva `base_value = 0`.
- **Por qué**: la home ya lee `baseValue` (como `marketValue`) y filtra por él
  (`minValue`/`maxValue`). Mantenerlo como espejo hace que la carta muestre el precio real sin
  tocar `/front` (fuera de alcance en la spec) y sin cambiar el contrato de `/players`. La
  fuente de verdad sigue siendo `player_quote`; el espejo es derivable y se reescribe en cada
  corrida. La variación y la serie de 30 días siguen siendo la maqueta de
  `market-value.mock.ts`.
- **Alternativa descartada**: dejar `base_value` en 0 hasta una feature de front (la home
  mostraría 0 para todos aunque existan cotizaciones; contradice el «Why» de US1).

### 11. Caché de la cotización actual: claves versionadas en Redis

- **Decisión**: `GET /quotes/players/:id/current` se cachea en
  `quotes:current:v{N}:{playerId}`; `N` sale de `quotes:version`, que la corrida incrementa
  **después** de confirmar la transacción. El historial no se cachea.
- **Por qué**: §2 pide Redis para consultas frecuentes y SC-003 pide < 1 s. Versionar las
  claves es el mismo patrón O(1) que ya usa `PlayerService` (06-home research #8): al
  terminar la corrida todas las entradas viejas quedan inalcanzables en el acto, que es lo que
  exige FR-021 / US2-8. Si Redis está caído, se consulta la base (resiliencia §3).

### 12. Partición en módulos de dominio

- **Decisión**: dos módulos nuevos bajo `/back/src/modules/`, cada uno con los 5 elementos de
  §7:
  - `quotes` — recálculo (manual y programado), corridas, cotización actual e historial, y
    la carga individual y en lote de la reputación mundial (`PUT /quotes/reputation/:playerId`
    y `PUT /quotes/reputation`).
  - `valuation-strategy` — listado, versiones y activación de estrategias.
- **Por qué**: §7 fija un único controller/service/repository por módulo. Las estrategias
  tienen su propio ciclo de vida (versiones, activación) y se justifican como módulo aparte.
  La reputación no: son dos rutas administrativas que escriben `player.world_reputation`, una
  columna que solo consume el cálculo del score. Van como métodos de `quotes.controller.ts` y
  las escribe `QuotesRepository`. `quotes` importa `ValuationStrategyModule` (para resolver
  la versión activa) y `PlayerModule` (para invalidar la caché del listado).
- **Alternativa descartada**: un módulo `player-reputation` propio, al estilo de
  `player-images`. Para dos endpoints sin lógica propia sumaba cinco archivos sin beneficio.
- **Utilidades puras** (excepción de §7): `quotes/score-calculator.ts` (percentiles,
  ausencia, score, precio) y `valuation-strategy/strategy-config.rules.ts` (validación
  semántica de una configuración: al menos un positivo por perfil, métricas conocidas). Las
  dos se testean sin levantar Nest ni la base.

### 13. Códigos de respuesta para «sin cotización» y errores de recálculo

- **Decisión**:
  - Jugador existente sin cotización → **200** con `{ quoted: false, quote: null }`.
    Jugador inexistente → **404**. Así US1-4 y US2-5 se distinguen sin ambigüedad.
  - Recálculo con corrida en curso → **409** `RUN_IN_PROGRESS`; sin estrategia activa o con
    una `strategyKey` inexistente → **409** `NO_ACTIVE_STRATEGY` / **404**; sin temporada con
    datos → **409** `NO_SEASON_DATA`.
- **Por qué**: «sin cotización» es un estado válido del jugador, no un error. Un 404 se
  confundiría con «el jugador no existe».

### 14. Recálculo síncrono

- **Decisión**: `POST /quotes/recalculate` ejecuta la corrida dentro de la petición y devuelve
  su resumen, como `POST /player-stats/refresh` y `POST /ingestion/players`.
- **Por qué**: SC-001 la acota a < 2 min con 5.000 jugadores (en la práctica, segundos) y
  devolver el resultado simplifica US1 y su test. Si el volumen creciera, la corrida ya está
  encapsulada en `QuotesService.runRecalculation()` y pasar a 202 + consulta de estado no
  cambia el cálculo.

## Sin tope superior (decisión 2026-10-13)

- **Decisión**: la normalización conserva el piso en 0 y el p95 como referencia de «1», pero ya
  no recorta por arriba (`normalized = max(0, (x − p5) / (p95 − p5))`), y el score solo tiene
  piso en 0. El precio queda sin máximo. Cambia `score` de `numeric(5,4)` a `numeric(9,4)`.
- **Por qué**: con el recorte a 1 y el percentil 95 de goles y asistencias en 2 al inicio de la
  temporada, los mejores jugadores empataban en el tope (dos de ellos en 1.000 exactos) y no se
  distinguía a Raphinha (12 goles) de quien tenía 2. Sin recorte, el mismo lote da 2.891 para
  Raphinha, 2.461 para Yamal y 2.159 para Mbappé.
- **Alternativas descartadas**: normalizar por posición o subir el percentil superior (mantienen
  un techo teórico); solo subir `scaleFactor` (mantiene el techo y los empates).
- **Riesgo conocido**: con pocos partidos jugados, las métricas por partido se disparan (un
  defensor con 2 partidos y 5,5 entradas por partido llegó a 1.350). Mitigaciones posibles, no
  implementadas: peso menor en métricas por partido, mínimo de partidos para cotizar o un
  tope configurable por estrategia.
