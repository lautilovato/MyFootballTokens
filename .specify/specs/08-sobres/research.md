# Research: Créditos, Sobres e Inventario

**Feature**: `08-sobres` | **Date**: 2026-10-13 | **Plan**: [plan.md](./plan.md)

Cada sección resuelve una incógnita del Technical Context con el formato Decisión / Por qué /
Alternativas descartadas.

---

### 1. Tres módulos de dominio nuevos: `credits`, `tokens` y `packs`

- **Decisión**: el backend suma tres módulos con los 5 elementos de §7:
  - `credits`: saldo del usuario, entrega inicial (en el registro y en el proceso de
    regularización) y consulta de saldo.
  - `tokens`: emisión de los 100 tokens por jugador, inventario e historial de un token.
  - `packs`: tipos de sobre, generación del stock, apertura e historial de aperturas.

  Cambian además `auth` (la entrega inicial en el registro), `player` (OVR = reputación) y
  `quotes` (disparar la sincronización del stock tras una corrida o una carga de reputación).
- **Por qué**: son tres ciclos de vida distintos. El saldo existe sin sobres (US1), el
  inventario y el historial de un token van a crecer con el mercado (venta y transferencia) sin
  tocar los sobres, y los sobres orquestan a los otros dos. La dependencia es en un solo
  sentido: `packs` → `tokens`, `packs` → `player`, `auth` → `credits`, `quotes` → `packs`.
  Ninguno importa a `quotes`, así que no hay ciclos.
- **Alternativas descartadas**: un único módulo `packs` con todo (mezcla el inventario, que
  consume el mercado, con la mecánica de los sobres); un módulo `inventory` separado de
  `tokens` (el inventario es una vista de `token` filtrada por dueño: partirlo duplica el
  repositorio).

### 2. Saldo como columna de `user` más movimientos inmutables

- **Decisión**: `user.credits integer not null default 0` con `check (credits >= 0)`. Cada
  cambio inserta una fila en `credit_movement` con monto, saldo antes y después, tipo,
  referencia y Correlation ID. El débito de una apertura es un único
  `update "user" set credits = credits - :price where id = :id and credits >= :price returning credits`:
  si no devuelve fila, el saldo no alcanza.
- **Por qué**: la spec define la cuenta como atributo del usuario. El `UPDATE` condicional es
  atómico, así que dos aperturas simultáneas no pueden dejar el saldo negativo (FR-004,
  SC-003) sin necesidad de un `SELECT … FOR UPDATE` aparte. El `CHECK` es una segunda barrera
  en la base. El saldo antes se deduce del devuelto (`después + precio`) dentro de la misma
  transacción.
- **Alternativas descartadas**: calcular el saldo sumando movimientos en cada lectura (correcto
  pero caro, y obliga a bloquear para validar el saldo); una tabla `wallet` aparte (agrega un
  JOIN sin ganar nada: hay una sola cuenta por usuario).

### 3. Entrega inicial atómica con el registro, idempotente y regularizable

- **Decisión**:
  - **Registro**: `AuthService.register` crea el usuario y llama a
    `CreditsService.grantInitial(userId)` dentro de una misma transacción de MikroORM
    (`em.transactional`). Los repositorios que usan el `EntityManager` inyectado se unen a ella
    por el `TransactionContext` de MikroORM; si la entrega falla, el usuario no se crea.
  - **Idempotencia** (FR-002): índice único parcial
    `credit_movement (user_id) where type = 'entrega_inicial'`. Una segunda entrega choca con
    el índice y se descarta sin error.
  - **Regularización** de los usuarios anteriores a la feature y de cualquier rezagado:
    `CreditsService.backfillInitialGrants()`, que corre en `onApplicationBootstrap` y por un
    endpoint administrativo (`POST /credits/initial-grants`, `ApiKeyGuard`). Inserta la entrega
    solo a los usuarios que no la tienen; repetirlo no cambia ningún saldo.
- **Por qué**: US1 pide que la cuenta nueva tenga el saldo y el movimiento desde el primer
  instante (escenario 1, SC-004). El índice parcial hace la idempotencia a prueba de dos
  procesos simultáneos (escenario 7). El endpoint cumple la regla de §7 de exponer el disparo
  manual de un proceso batch.
- **Alternativas descartadas**: acreditar en un paso posterior al registro (deja ventanas con
  cuentas sin saldo); una migración de datos para los usuarios existentes (no cubre los que se
  registren mientras la feature se despliega, que es el caso borde «usuario sin saldo
  inicial»).

### 4. Inmutabilidad en la base: triggers que rechazan `UPDATE` y `DELETE`

- **Decisión**: `credit_movement`, `pack_opening`, `pack_opening_card` y `token_event` tienen
  un trigger `before update or delete` que lanza una excepción (función compartida
  `forbid_mutation()`). Los repositorios solo insertan en esas tablas.
- **Por qué**: FR-040 dice que esos registros MUST NOT poder modificarse ni borrarse, y §4 pide
  un registro inmutable de las transacciones financieras. Si la regla vive solo en el código,
  cualquier `nativeUpdate` futuro la rompe sin aviso. El trigger la hace verificable con un
  test (US7-5, US4-6).
- **Alternativas descartadas**: confiar en que el código no expone updates (no es verificable);
  revocar permisos a un rol de base (el proyecto usa un solo usuario de base en todos los
  entornos).

### 5. Tokens: estado y dueño desnormalizados, más un log de eventos

- **Decisión**: tabla `token` con `id`, `player_id`, `serial` (1–100, único por jugador),
  `status`, `owner_id` (nulo = plataforma) y `pack_id`. Cada cambio inserta además una fila en
  `token_event`. La emisión es un único SQL idempotente:
  `insert into token … select p.id, gs from player p cross join generate_series(1, 100) gs on conflict (player_id, serial) do nothing returning id`,
  y con los ids devueltos se insertan los eventos `emision`.
- **Por qué**: el inventario, el stock y las probabilidades consultan el estado actual
  constantemente; reconstruirlo desde los eventos en cada lectura sería caro. Los eventos
  quedan como fuente de auditoría y FR-032 se verifica con un test que compara el último evento
  con el estado (SC-014). `on conflict do nothing` hace la emisión idempotente y segura ante
  dos ejecuciones simultáneas (FR-029).
- **Alternativas descartadas**: event sourcing puro (lecturas caras, y el proyecto no tiene
  infraestructura de proyecciones); guardar solo un contador de tokens por jugador (FR-028
  exige un ID por token y su historial).

### 6. Generación del stock: planificador puro, persistencia por lote y exclusión mutua

- **Decisión**:
  - **Planificador** (`packs/pack-stock-planner.ts`, utilidad pura de §7). Recibe los tokens
    elegibles con su rareza y la configuración, y devuelve los sobres:
    1. **Cantidad de sobres por tipo**: `n_t ≈ participación_t × N / cartas_t`. El resto se
       completa con una búsqueda acotada (programación dinámica sobre el residuo) para que
       `Σ n_t × cartas_t = N` exactamente (FR-013). Como `N` es múltiplo de 100 y FR-045 exige
       que las cantidades de cartas puedan sumar 100, siempre hay solución.
    2. **Cartas de cada rareza por tipo**: ajuste proporcional iterativo (IPF) sobre la matriz
       de objetivos `cupos_t × prob_t[r]`, para que respete a la vez los cupos de cada tipo y
       los tokens disponibles de cada rareza; después, redondeo por mayor resto. Una celda con
       probabilidad objetivo 0 queda en 0, y una positiva queda positiva cuando hay tokens
       (FR-014).
    3. **Armado**: dentro de cada tipo se mezclan los tokens asignados (Fisher–Yates con
       `crypto.randomInt`) y se cortan en sobres de `cartas_t`.
  - **Persistencia**: una transacción por lote. Inserta `pack_batch` (con los parámetros
    aplicados), los `pack` con `insertMany` por tandas y actualiza los tokens con un único
    `update … from unnest(:tokenIds::uuid[], :packIds::uuid[])`, más los eventos
    `asignacion_a_sobre`. Con el catálogo actual (2.644 jugadores, 264.400 tokens, unos 70.000
    sobres) se espera que tarde segundos.
  - **Exclusión**: `pg_advisory_xact_lock` con una clave fija del módulo, para que dos
    sincronizaciones no armen dos lotes con los mismos tokens. Los tokens se leen además con
    `for update`.
  - **Disparo** (FR-012, «sin intervención manual»): `PacksService.syncStock()` primero emite
    los tokens que falten y después genera un lote si hay tokens `reservado` de jugadores
    elegibles. Se llama: (a) tras cada corrida de cotización confirmada y tras cada carga de
    reputación (best effort: un fallo se registra en el log y no rompe la operación de origen);
    (b) desde un job programado (`PACKS_STOCK_CRON`, por defecto cada 15 minutos) como red de
    seguridad, por ejemplo para los jugadores que trae una nueva ingesta; (c) desde
    `POST /packs/stock/sync` (`ApiKeyGuard`).
- **Por qué**: la lógica de partición es la parte con más riesgo de errores sutiles (sobres
  incompletos, tokens repetidos). Como función pura se prueba con miles de casos aleatorios
  sin base (SC-005, SC-006). IPF es la forma estándar de ajustar una matriz a dos márgenes
  manteniendo las proporciones relativas de los objetivos.
- **Alternativas descartadas**: asignar cada token a un tipo sorteando con las probabilidades
  objetivo (no garantiza la partición exacta y deja sobres incompletos); armar los sobres en
  el momento de abrirlos (contradice «los sobres son finitos» y la partición exacta por
  construcción); un índice único parcial como en `quote_run` (acá no hace falta dejar
  constancia de la corrida salteada: alcanza con esperar el lock).

### 7. Elegibilidad de un jugador para el stock

- **Decisión**: un jugador es elegible cuando tiene sus 100 tokens emitidos,
  `player.base_value > 0` y `player.world_reputation is not null` (FR-011, FR-068).
- **Por qué**: `base_value` es el espejo del precio de la última cotización que la corrida
  reescribe en la misma transacción que inserta `player_quote` (07 research #10); `0` significa
  nunca cotizado. Usarlo evita un JOIN contra el historial completo de cotizaciones. La
  reputación es el OVR del que sale la rareza (Clarifications): sin ella no hay rareza que
  asignar.
- **Alternativas descartadas**: buscar la última fila de `player_quote` por jugador (mismo
  resultado, más caro); considerar elegible a un jugador sin reputación como `common` (la home
  lo mostraría como `common` sin dato, pero en un sobre quedaría con una rareza que no
  representa nada).

### 8. Apertura: validación ordenada, sorteo uniforme y una sola transacción

- **Decisión**:
  1. **Antes de la transacción**, en el orden que fija la spec: sesión (guard), entrada
     (DTO: `type` es un texto no vacío, sin `@IsEnum`), tipo existente en la configuración
     (`PACK_TYPE_NOT_FOUND`), stock alguna vez generado
     (`PACKS_NOT_AVAILABLE`) y sobres sin abrir del tipo (`PACK_SOLD_OUT`).
  2. **En una transacción**:
     - Sortear el sobre: contar los sobres sin abrir del tipo, elegir un desplazamiento con
       `crypto.randomInt(n)`, leer **sin bloquear** el id en esa posición
       (`order by id offset :k limit 1`) y recién después bloquear solo esa fila
       (`where id = :id and status = 'sin_abrir' for update skip locked`). Si no devuelve fila
       (otro lo tomó), se reintenta con un nuevo conteo; si el conteo da 0, es `PACK_SOLD_OUT`.
       No se hace en una sola consulta porque Postgres también bloquea las filas que saltea un
       `OFFSET` con `FOR UPDATE`: cada apertura tomaba cientos de sobres y las simultáneas
       terminaban en `PACK_SOLD_OUT` (lo detectó el e2e de concurrencia).
     - Débito condicional (research #2); si no devuelve fila, rollback y
       `INSUFFICIENT_CREDITS`.
     - Marcar el sobre abierto y pasar sus tokens a `de_usuario`.
     - Leer la cotización (`base_value`) y la reputación de cada jugador en la misma
       transacción, que son el valor y la rareza del momento cero.
     - Insertar el movimiento `compra_sobre`, la apertura con sus parámetros, sus cartas y los
       eventos `entrega_en_sobre`, todos referenciados entre sí y con el Correlation ID
       (FR-041).
- **Por qué**: el chequeo de stock antes del saldo responde primero «no quedan sobres» aunque
  no alcance el saldo (orden de la spec). Contar y elegir un desplazamiento al azar da igual
  probabilidad a todos los sobres sin abrir (FR-020). `skip locked` evita que dos aperturas
  simultáneas tomen el mismo sobre sin serializarlas (FR-022). La transacción única da la
  atomicidad de FR-021 y SC-002. Sobre los sobres sin abrir hay un índice parcial
  `(type, id) where status = 'sin_abrir'`.
- **Desvío aceptado** (FR-020): con aperturas simultáneas, `skip locked` saltea los sobres que
  otra transacción tiene tomados y el desplazamiento cae en el siguiente disponible. Solo hay
  sesgo bajo contención y no favorece a ningún sobre en particular: sin contención, el sorteo
  es exactamente uniforme.
- **Alternativas descartadas**: `order by random()` (recorre todos los sobres del tipo en cada
  apertura); asignar a cada sobre un orden aleatorio fijo al generarlo (el sorteo quedaría
  decidido de antemano y el rearme de FR-017 lo complicaría); bloquear el usuario con
  `for update` antes del débito (el `UPDATE` condicional ya serializa lo necesario).

### 9. Probabilidades en vivo con caché versionada

- **Decisión**: `GET /packs/types` calcula, por tipo, cuántas cartas de cada rareza hay en los
  sobres sin abrir: `token` en estado `en_sobre` unido a su `pack` sin abrir y a `player`, con la
  rareza derivada de la reputación actual. El resultado se cachea en Redis bajo
  `packs:types:v{n}`. El contador `packs:stock-version` se incrementa al confirmar cada
  apertura, cada lote y cada carga de reputación. Si Redis falla, se calcula desde la base.
- **Por qué**: FR-010 pide que las probabilidades reflejen la última apertura confirmada
  (Clarifications). La versión hace que una entrada vieja quede inalcanzable en el mismo
  instante del cambio, con el mismo patrón que la cotización actual (07 research #11). Se usa
  la rareza **actual** porque es la que el usuario va a recibir: la carta registra la rareza
  vigente al abrirse (FR-016).
- **Alternativas descartadas**: contadores por tipo y rareza actualizados en cada apertura
  (quedan desfasados cuando una carga de reputación cambia rarezas); TTL corto sin versión
  (publicaría probabilidades viejas durante el TTL).

### 10. Formato de error estándar en los controladores nuevos

- **Decisión**: un filtro de excepciones en `shared/http/api-error.filter.ts`, aplicado con
  `@UseFilters` solo a los controladores de `credits`, `tokens` y `packs`. Responde
  `{ code, message, correlationId }` y traduce:
  - `UnauthorizedException` → 401 `UNAUTHENTICATED`;
  - el `BadRequestException` del `ValidationPipe` → 422 `VALIDATION_ERROR`;
  - las excepciones de dominio, que llevan su `code` (`PACK_SOLD_OUT`, …), con su status;
  - cualquier otra → 500 `INTERNAL_ERROR`, sin detalle interno.
- **Por qué**: FR-049 fija el formato y los códigos, y FR-047 pide `UNAUTHENTICATED`. Las
  specs 05 a 07 ya publicaron contratos con el formato por defecto de Nest (`statusCode`,
  `message`): un filtro global los rompería. El Correlation ID sale de `CorrelationIdStore`.
- **Alternativas descartadas**: filtro global (cambia contratos ya publicados); armar el error
  a mano en cada handler (se olvida el caso 500).

### 11. Configuración por entorno, validada al arrancar y congelada en cada operación

- **Decisión**: dos variables, cada una leída y validada por el módulo que la usa:
  - `INITIAL_CREDITS` (por defecto 2000): la valida `CreditsService` al arrancar (entero
    positivo). Así `credits` no depende de `packs`.
  - `PACK_TYPES_CONFIG`: un JSON opcional con, por tipo, precio, cartas, probabilidades
    objetivo por rareza y participación; sin la variable rigen los valores por defecto de la
    spec. La utilidad pura `packs/pack-config.rules.ts` valida FR-045 y FR-009 al arrancar
    `PacksModule`.

  Con una configuración inválida la aplicación no arranca y el log dice qué regla falla. Cada
  lote guarda los parámetros con que se armó y cada apertura los que aplicó (FR-046).
- **Por qué**: la spec descarta una pantalla de administración y pide configurar sin tocar
  código (FR-044). Fallar al arrancar sigue el criterio de la configuración de auth
  (`assertRequiredAuthConfig`): es preferible no levantar a vender sobres con probabilidades
  imposibles.
- **Alternativas descartadas**: una tabla de configuración editable (no hay quién la edite: no
  hay pantalla de administración); loguear y seguir como con el cron de cotizaciones (acá el
  error afecta el dinero de los usuarios).

### 12. OVR = reputación en todo el sistema (FR-067 a FR-069)

- **Decisión**:
  - `player/ovr.ts`: `ovrFromReputation(reputation)` devuelve `null` sin reputación y
    `min(99, reputation)` con ella. `ovrFromRating` y las traducciones a rangos de rating se
    eliminan.
  - `player/rarity.ts`: cortes 88 / 80 / 70 (FR-016) y `rarityFromOvr` sin cambios de firma.
    Las condiciones de filtro pasan a ser rangos sobre `player.world_reputation`; `common`
    incluye a los jugadores sin reputación (FR-068).
  - `PlayerRepository`: los filtros por OVR y rareza dejan de usar subconsultas sobre
    `player_season_stats` y comparan contra `p.world_reputation`. Con un filtro de OVR activo,
    los jugadores sin reputación quedan afuera (FR-068).
  - `PlayerResponseDto`: `ovr` y `rarity` salen de `player.worldReputation`.
  - `QuotesService.setReputation*` invalida la caché del listado de jugadores e incrementa
    `packs:stock-version`, porque ahora una carga de reputación cambia OVR, rareza y
    probabilidades.
- **Por qué**: Clarifications 2026-10-13. El OVR deja de ser derivado: la reputación ya está
  persistida, así que filtrar es comparar una columna (sin el truco de los rangos de rating de
  06 research #1). Mantener `rarityFromOvr` como única función de rareza asegura FR-069: la
  usan la home, el detalle, el planificador del stock, la apertura y el inventario.
- **Alternativas descartadas**: guardar la rareza en el jugador (se desincroniza con cada
  carga de reputación); seguir derivando el OVR del rating para la home (rompe FR-069).

### 13. Cartas del inventario y de la apertura: el mismo DTO que la home

- **Decisión**: `PlayerService.findCardsByIds(ids)` devuelve el `PlayerCardDto` que ya usa el
  listado (con OVR, rareza, club, imagen, cotización vigente `marketValue` y su variación).
  El inventario lo devuelve por jugador junto con sus tokens. La apertura devuelve, por
  carta, el mismo DTO más la rareza y la cotización **registradas** en el momento cero.
- **Por qué**: FR-069 exige la misma rareza en la home, el detalle y el inventario; reusar el
  DTO lo garantiza por construcción. La pantalla reutiliza `PlayerCard` y el mapper que ya
  existen (`toPlayerCardData`) sin una traducción nueva, y la cotización vigente del
  inventario (Clarifications) ya viene en `marketValue`.
- **Alternativas descartadas**: un DTO propio del inventario con los campos de FR-034 (la carta
  no tendría estadísticas ni cotización y habría que adaptar el componente, que está congelado
  por 06 FR-020).

### 14. Rearme de sobres sin abrir (FR-017): no se implementa

- **Decisión**: el sistema no rearma lotes en esta feature.
- **Por qué**: FR-017 es un MAY. Cada carta ya registra la rareza vigente al abrirse y las
  probabilidades publicadas usan la rareza actual (research #9), así que un cambio de
  reputación nunca muestra datos falsos: solo puede alejar la composición de los objetivos.
- **Alternativas descartadas**: rearmar tras cada carga de reputación (mueve decenas de miles
  de tokens por un cambio que puede ser de un solo jugador).

### 15. Cuentas eliminadas (FR-043): solo el modelo

- **Decisión**: existen el estado `en_venta_plataforma` y los tipos de evento
  `devolucion_a_plataforma` y `puesta_en_venta` en los `CHECK` de la base y en los enums,
  pero ningún flujo los produce (Clarifications).
- **Por qué**: así la invariante de FR-023 (los cuatro estados suman 100) ya contempla el
  estado, y la spec de eliminación de cuentas no tiene que migrar datos.

### 16. Cliente web: rutas, saldo compartido y flujo de apertura

- **Decisión**:
  - **Rutas** `/packs` y `/inventory`, envueltas en `ProtectedRoute` (FR-052).
  - **Encabezado**: un componente `AppHeader` reemplaza al encabezado inline de la home y lo
    usan las tres páginas: accesos a sobres e inventario, saldo, usuario y cierre de sesión.
  - **Saldo compartido**: un `CreditsProvider` (Context API, permitido por §2) en
    `app/`, porque §7 ubica ahí los providers globales; carga el saldo al iniciar sesión y expone `setBalance` para que la
    apertura lo actualice con el valor que devuelve el backend (FR-053, FR-059).
  - **Servicios**: `credits.service.ts`, `packs.service.ts`, `inventory.service.ts` sobre la
    única instancia de Axios, y un mapeo de códigos de error a mensajes en
    `packs.service.ts` (FR-060).
  - **Flujo de apertura**: `Pack.onOpenRequest` abre `ConfirmModal`; al confirmar se llama a
    `POST /packs/openings`. Con la respuesta exitosa, la promesa del sobre de la grilla
    resuelve `false` (ese sobre no se abre en su lugar) y se monta un escenario fijo, a
    pantalla completa, con una copia grande del sobre y `autoOpen`: ahí corre la animación, y
    `onOpened` cierra el escenario y monta la revelación con `PlayerCard`. Ante un rechazo no
    hay escenario ni animación y se muestra el mensaje (FR-058, SC-018).
  - **Por qué el escenario**: dentro de la grilla el sobre mide unos 190 px y queda fuera del
    foco (la mirada está donde estaba el modal, en el centro), y el fondo del modal tapa el
    primer medio segundo; en la práctica la animación no se veía. `Pack` suma la prop
    `autoOpen` para arrancar sin click.
  - **Dependencias**: `gsap` y `@gsap/react` se declaran en `front/package.json`. Ya las
    importan `Pack` y `ConfirmModal`, y la constitución v3.3.0 (§2) las autoriza.
- **Por qué**: §7 deja la red y la sesión en `services/`, los providers globales en `app/` y la
  composición en `pages/`. `Pack` ya expone la
  promesa de `onOpenRequest` pensada para esperar una confirmación antes de animar. Hoy el
  build de la rama falla porque esos paquetes no están declarados.
- **Alternativas descartadas**: recargar el saldo con otro GET después de cada apertura (la
  respuesta ya trae el saldo final); una librería de estado global (§2 la prohíbe).
