# Phase 0 — Research: 06-home

Decisiones tomadas antes de diseñar, con su alternativa descartada. Todo lo que acá queda
resuelto no debe volver a decidirse durante la implementación.

---

## #1 — Filtrar por OVR y por rareza sin persistir ninguno de los dos

**Decision**: traducir los filtros de rango de OVR y de rareza a predicados de rango sobre la
columna `player_season_stats.rating`, que ya existe. El OVR y la rareza se calculan al mapear la
respuesta, nunca en el `WHERE`.

La equivalencia es exacta porque `OVR = trunc(rating × 10)` es monótona no decreciente y los
cortes son enteros:

| Filtro de la interfaz | Predicado real sobre `rating` |
|---|---|
| `ovrMin = n` | `rating >= n / 10` |
| `ovrMax = n` | `rating < (n + 1) / 10` |
| rareza `legendary` | `rating >= 8.5` |
| rareza `epic` | `rating >= 7.7 AND rating < 8.5` |
| rareza `rare` | `rating >= 7.0 AND rating < 7.7` |
| rareza `common` | `rating < 7.0` **o** sin fila de stats |

**Rationale**: es lo que hace viable a FR-004 y FR-005 sin migración, sin columna calculada y sin
traer el catálogo entero a memoria. Postgres resuelve el filtro con un índice sobre `rating` y el
`LIMIT/OFFSET` sigue siendo correcto, cosa que no ocurriría si el OVR se calculara después de
paginar. El corte de `common` es el único que necesita un `OR` con la ausencia de stats, porque
un jugador sin rating no tiene valoración que comparar (FR-030).

**Alternatives considered**:

- *Columna `ovr` persistida en `player`*: obligaría a una migración, a un backfill y a recalcularla
  en cada ingesta de stats. Introduce un dato que puede quedar desincronizado del rating del que
  deriva, que es precisamente el defecto que el cálculo en lectura no tiene.
- *Calcular el OVR en memoria y filtrar en la aplicación*: rompe la paginación. Habría que leer
  todos los jugadores que cumplen el resto de los filtros para poder descartar por OVR, y recién
  después paginar.
- *Vista materializada*: resuelve el filtrado pero agrega un objeto de base de datos que hay que
  refrescar tras cada ingesta. Desproporcionado para una derivación de una sola columna.

---

## #2 — Qué temporada se muestra

**Decision**: la temporada vigente es el valor máximo de `player_season_stats.season` presente en
la tabla, resuelto con una consulta `SELECT MAX(season)` y cacheado en Redis con el mismo TTL que
el listado. Todas las lecturas de esta feature se restringen a esa temporada.

**Rationale**: el formato `"2025-2026"` ordena lexicográficamente igual que cronológicamente, así
que el máximo es la temporada más reciente sin necesidad de parsear nada. Derivarlo de los datos
evita el modo de falla de una variable de entorno mal configurada, que dejaría la home mostrando
una temporada vieja sin que ningún test lo note. Fijar la temporada antes de hacer el join es lo
que garantiza que la relación `player → stats` sea 1 a 0..1 y que el `LIMIT` cuente jugadores y no
filas (ver #3).

**Alternatives considered**:

- *Variable de entorno `CURRENT_SEASON`*: más explícita, pero es exactamente el tipo de
  configuración que se olvida de actualizar y degrada en silencio.
- *Máximo por jugador mediante subconsulta correlacionada*: soporta que distintos jugadores tengan
  distinta última temporada, pero cuesta una subconsulta por fila para resolver un caso que la
  ingesta actual no produce: corre sobre una temporada por vez para todo el catálogo.

---

## #3 — Forma de la consulta del listado

**Decision**: `QueryBuilder` de MikroORM sobre `Player`, con los joins existentes a `team` y
`team.league`, y los filtros de rating expresados como **subconsultas `EXISTS` / `NOT EXISTS`**
sobre `player_season_stats` en lugar de un `LEFT JOIN`. Las estadísticas de los jugadores de la
página se traen en una segunda consulta y se adjuntan en memoria. Paginación con `LIMIT/OFFSET`.

> **Revisado durante la implementación.** El diseño original de esta decisión era un `LEFT JOIN`
> restringido a la temporada vigente. Se cambió al llegar al código, por el motivo de abajo. El
> resto de las decisiones no se vio afectado.

**Rationale**: con un `LEFT JOIN`, que la paginación sea correcta depende de que la restricción de
temporada esté bien puesta en la condición del join: si se cae o se escribe en el `WHERE` en lugar
del `ON`, un jugador con dos temporadas cargadas aparece dos veces y el `COUNT` y el `LIMIT` pasan
a contar filas en vez de jugadores. Con `EXISTS` esa clase de error no existe: la cardinalidad del
resultado es estructuralmente un jugador por fila, sin importar cuántas temporadas tenga. Es una
propiedad de la forma de la consulta, no algo que haya que recordar sostener.

El costo es una segunda consulta para traer las estadísticas de los jugadores de la página —a lo
sumo 100 filas por un índice único— a cambio de que la corrección de la paginación no dependa de
un detalle fácil de romper. El filtrado sigue resolviéndose entero en la base, que era lo que
importaba de #1, y sigue apoyándose en el índice `(season, rating)`.

FR-010 se cumple igual: los jugadores sin estadísticas no se excluyen de la consulta principal,
porque la condición de rating solo se agrega cuando hay un filtro que la pida.

**Alternatives considered**:

- *`LEFT JOIN` restringido a la temporada vigente*: era el diseño original y funciona, pero su
  corrección descansa en que la condición de temporada viva en el `ON`. Es el tipo de detalle que
  un cambio posterior rompe en silencio y que ningún test nota hasta que existan dos temporadas
  cargadas — situación que hoy no se da y que por eso no fallaría en CI.
- *Seguir con `findAndCount` y `FilterQuery`*: el filtro de rareza `common` —que es
  `rating < 7.0 OR sin fila de stats`— y la combinación de rangos terminan en un objeto de filtro
  difícil de leer y de testear.
- *SQL crudo entero*: innecesario. Solo los fragmentos `EXISTS` y la llamada a `unaccent` van como
  SQL parametrizado dentro del `QueryBuilder`; el resto es API de MikroORM, como pide §3.

---

## #4 — Búsqueda por nombre insensible a mayúsculas y acentos

**Decision**: habilitar la extensión `unaccent` de PostgreSQL mediante migración y resolver FR-006
con `unaccent(full_name) ILIKE unaccent(:q)`, acompañada de un índice funcional
`GIN`/`btree` sobre `unaccent(full_name)`.

**Rationale**: los nombres del catálogo vienen de Football-Data.org con sus acentos reales
("Nicolás", "Özil", "Müller"), así que sin normalizar acentos la búsqueda falla en los casos más
obvios. `unaccent` viene en el `contrib` estándar de la imagen `postgres:15-alpine` que usa el
`docker-compose` del proyecto, y el usuario configurado (`postgres`) tiene privilegio para
crearla. Resolverlo en la base mantiene el filtro, el conteo y la paginación en una sola consulta.

**Alternatives considered**:

- *Columna `searchName` normalizada y persistida*: evita la extensión, pero agrega una columna
  redundante, su backfill y la obligación de mantenerla en cada ingesta.
- *`ILIKE` a secas*: cubre mayúsculas pero no acentos, así que incumple FR-006.
- *Normalizar en la aplicación*: obligaría a traer los candidatos a memoria y rompería la
  paginación, igual que en #1.

---

## #5 — Valor de mercado, variación y serie de 30 días

**Decision**: el valor actual es `player.baseValue`, que ya existe. La variación porcentual y la
serie de 30 días son **simuladas de forma determinista** a partir del identificador del jugador,
en un módulo puro y aislado del backend, marcado como maqueta.

**Rationale**: no existe motor de cotizaciones y la spec lo pone explícitamente fuera de alcance,
pero la carta y el panel necesitan esos datos para renderizarse. El requisito crítico es que sean
**deterministas**: si se generaran al azar en cada petición, el mismo jugador mostraría una
variación distinta en la grilla y en el detalle (violando SC-011), cambiaría en cada refresco y
ningún test podría afirmar nada sobre él. Sembrar el generador con el UUID del jugador da un valor
estable, distinto por jugador y reproducible.

Queda en un archivo propio para que reemplazarlo por el motor real sea sustituir una función y no
buscar constantes repartidas por el código.

**Alternatives considered**:

- *Valores al azar por petición*: descartado por lo anterior — rompe SC-011 y la testeabilidad.
- *Constantes fijas iguales para todos*: deterministas, pero una grilla donde todas las cartas
  varían `+0,0%` no demuestra nada de la pantalla que se quiere mostrar.
- *Generar la simulación en el frontend*: la grilla y el detalle son dos respuestas distintas; si
  cada una simulara por su cuenta habría que duplicar la fórmula en ambos árboles para que
  coincidieran.

---

## #6 — Oferta de tokens (supply)

**Decision**: constantes de presentación — 100 tokens totales por jugador, los 100 emitidos.
No se crea ninguna entidad `Token` ni tabla asociada.

**Rationale**: la constitución §5 ya fija la regla de dominio: "100 tokens iniciales por jugador,
con un valor de 1 crédito en el momento cero, concentrados inicialmente en un único superusuario".
Como todos están en el superusuario, la cantidad emitida es la total. La spec deja el supply como
dato de presentación y la compra fuera de alcance (FR-032), así que modelar la tenencia ahora
sería construir el esquema de una feature que todavía no se especificó.

**Alternatives considered**:

- *Crear la entidad `Token` ahora*: fuera de alcance y prematuro. El diseño correcto de la
  tenencia depende de la feature de mercado, que aún no existe.
- *Dejar el supply en el frontend*: contradice FR-014, que lo pone en la respuesta del detalle, y
  dispersaría una regla de dominio de la constitución dentro del cliente.

---

## #7 — Código ISO de nacionalidad para la bandera de la carta

**Decision**: el backend devuelve la nacionalidad como nombre **y** como código ISO 3166-1
alpha-2, resolviendo el código con una tabla de mapeo pura en el backend. Cuando un país no está
en la tabla, el código va nulo y la carta omite la bandera.

**Rationale**: es una incompatibilidad real detectada al revisar el código. El componente de carta
espera `nationality.code` en alpha-2 para construir la URL de `flagcdn`, pero la entidad `Player`
guarda `nationality` como el **nombre** del país tal como lo entrega Football-Data.org
("England", "Argentina"). Sin traducción, la carta pediría `flagcdn.com/w160/england.png` y toda
bandera quedaría rota. Se resuelve en el backend y no en el cliente porque es normalización de un
dato de un proveedor externo, y porque así grilla y detalle comparten una sola fuente.

Las selecciones británicas son el caso especial que justifica la tabla explícita: `flagcdn` las
sirve como subdivisiones (`gb-eng`, `gb-sct`, `gb-wls`, `gb-nir`), que ningún estándar alpha-2
contiene. El componente ya documenta ese formato en sus tipos.

**Alternatives considered**:

- *Librería de códigos de país*: agregaría una dependencia para una tabla de ~60 países que son los
  de las 5 ligas, y aun así habría que parchear las selecciones británicas a mano.
- *Mapear en el frontend*: pondría lógica de normalización de un proveedor externo en el cliente,
  contra el criterio de aislamiento de la capa de adapters (constitución §3).
- *Guardar el código en la entidad*: migración y backfill para un dato derivable de forma estable.

---

## #8 — Invalidación de la caché de Redis

**Decision**: versionado de clave. Las claves del listado incorporan un número de versión leído de
`players:list:version`; los procesos de ingesta y de refresh de stats incrementan ese contador al
terminar. Las entradas viejas quedan inalcanzables al instante y expiran solas por TTL.

**Rationale**: resuelve la decisión que la spec difirió a esta fase. Hoy la caché solo expira por
TTL de 60 segundos y nadie la invalida; con los seis ejes de filtrado nuevos el espacio de claves
crece mucho, y tras una ingesta la home puede mostrar datos viejos. Borrar por patrón exigiría
recorrer las claves de Redis, que es justo lo que no conviene hacer en el camino de una petición.
Incrementar un contador es una operación O(1) que invalida el espacio entero de forma lógica.

**Alternatives considered**:

- *Solo TTL, como hoy*: deja una ventana de datos viejos después de cada ingesta y no cumple con
  que el catálogo refleje lo recién ingerido.
- *Borrado por patrón (`SCAN` + `DEL`)*: bloquea o recorre el keyspace y se degrada a medida que
  crece el número de combinaciones de filtros cacheadas.
- *Invalidación selectiva por filtro afectado*: habría que saber qué combinaciones de filtros toca
  cada jugador modificado. Desproporcionado.

---

## #9 — Dónde vive el endpoint de ligas

**Decision**: un módulo de dominio nuevo `/back/src/modules/league/` con los cinco elementos
exactos que fija la constitución §7, exponiendo `GET /leagues`.

**Rationale**: FR-011 pide que la lista de ligas del panel de filtros venga del catálogo y no esté
fija en el cliente. `League` es una entidad de dominio propia y ya es una Key Entity de la spec,
así que le corresponde su propio corte vertical. Colgar un `/players/filter-options` del módulo de
jugadores crearía exactamente el endpoint-cajón que §7 busca evitar.

**Alternatives considered**:

- *`GET /players/filter-options`*: menos archivos, pero mezcla dos dominios en un módulo y el
  endpoint crece sin criterio a medida que aparecen más filtros.
- *Lista fija en el frontend*: incumple FR-011 y se desincroniza del catálogo real.

---

## #10 — Estado de los filtros en el frontend

**Decision**: los filtros, la página y el jugador seleccionado viven en la query string de la URL,
manejados con `useSearchParams` de React Router. No se crea ningún contexto nuevo ni estado global.

**Rationale**: la constitución §2 cierra el stack de frontend y prohíbe librerías de estado, así
que la elección real es entre estado local y la URL. La URL gana por tres motivos concretos de
esta pantalla: una búsqueda filtrada se puede compartir y recargar, el botón "atrás" del navegador
se comporta como la persona espera, y FR-022 exige que cerrar el panel de detalle devuelva la
grilla con sus filtros y su página intactos — cosa que sale gratis si el estado nunca estuvo en un
componente que se desmonta. React Router ya es una dependencia autorizada y en uso.

**Alternatives considered**:

- *`useState` en la página*: más simple de escribir, pero pierde el enlace profundo, rompe el botón
  "atrás" y obliga a preservar el estado a mano al abrir y cerrar el panel.
- *Context API dedicado*: la constitución lo autoriza, pero un contexto para el estado de una sola
  pantalla es indirección sin beneficio.

---

## #11 — Alimentar el componente de carta sin modificarlo

**Decision**: un mapeador puro en `/front/src/services/` que traduce la respuesta de la API al tipo
`PlayerCardData` que el componente ya define. El componente no se toca.

**Rationale**: la spec lo congela explícitamente y FR-020 exige reutilizarlo tal cual. El
componente pide campos que la API no tiene en la misma forma —`token.rarity`, `token.minted`,
`price.history`, `nationality.code`— y el lugar de esa traducción es la capa `services/`, que la
constitución §7 define como la única que conoce la forma de las respuestas del backend.

Dos detalles que el mapeador debe respetar, leídos del código del componente:

- `price.history` solo dibuja el sparkline si tiene **más de un punto**; con menos, el componente
  lo omite sin fallar.
- `photoUrl` y `club.crestUrl` son opcionales: ausentes, el componente dibuja su silueta y su
  escudo con iniciales. Es exactamente lo que FR-026 necesita, así que el mapeador los deja sin
  definir en lugar de inventar una URL.

**Alternatives considered**:

- *Que la API devuelva ya la forma de `PlayerCardData`*: acoplaría el contrato HTTP a la estructura
  interna de un componente de React. Si la carta cambia, cambia la API.
- *Adaptar el componente a la respuesta*: contradice FR-020 y la asunción de componente congelado.

---

## #12 — Testing

**Decision**: en `/back`, specs unitarias para las funciones puras (OVR, rareza, traducción de
filtros a rangos de rating, mapeo de nacionalidad, simulación determinista de precio) y un
`players.e2e-spec.ts` para los endpoints, siguiendo el setup de e2e ya existente. En `/front`,
Vitest sobre el mapeador y sobre la sincronización de filtros con la URL, y el renderizado de
componentes apoyado en `react-dom/client` y el `act` de React.

**Rationale**: el grueso de la lógica nueva es determinista y sin framework —los cortes de rareza,
el truncado del OVR, la traducción de rangos—, que es justo lo que conviene cubrir con tests
unitarios baratos. Lo que no se puede verificar sin base de datos es que el `LEFT JOIN` y la
paginación devuelvan el conjunto correcto, y eso va a e2e contra la base de test que `.env.test` ya
configura. En el frontend, la constitución §2 no autoriza ninguna librería de testing además de
Vitest, así que el renderizado usa las utilidades propias de React.

**Alternatives considered**:

- *Solo e2e*: más lento y peor señal — un corte de rareza mal puesto se diagnostica en un test
  unitario de dos líneas, no en una petición HTTP completa.
- *Testing Library*: prohibida por la constitución §2 hasta que haya enmienda explícita.
