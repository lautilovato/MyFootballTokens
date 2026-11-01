# Research: Historial de Operaciones y Consulta de Cotizaciones por Fecha

**Feature**: `10-historial-operaciones` | **Plan**: [plan.md](./plan.md)

No quedaron `NEEDS CLARIFICATION` en el Technical Context. Esta investigación fija las decisiones
de diseño que la spec dejó al plan, cada una con lo que se descartó.

## 1. Cómo saber con qué estrategia se cobró cada compra

**Decision**: agregar `token_purchase.quote_id` (FK nullable a `player_quote`) y completarla en
`purchase()` en la **misma sentencia** que lee el precio. Una migración la rellena para las
compras existentes.

- En `purchase()`, la primera consulta (la que bloquea la publicación y lee `player.base_value`)
  suma una subconsulta: la última cotización del jugador, `order by calculated_at desc limit 1`.
  Una sola sentencia ve un único snapshot. Como el recálculo actualiza `base_value` y agrega las
  cotizaciones en la misma transacción, el precio leído y la cotización leída son siempre las
  del mismo recálculo.
- La migración rellena las compras existentes eligiendo, entre las cotizaciones del jugador con
  `calculated_at <= created_at`, la más reciente cuyo precio coincide con el cobrado; si ninguna
  coincide, la más reciente. Para desactivar `token_purchase_immutable` solo durante el relleno
  usa `ALTER TABLE ... DISABLE TRIGGER`, que exige ser dueño de la tabla (la migración lo es), y
  lo reactiva antes de terminar.
- Compras sin cotización encontrada quedan con `quote_id` nulo y la interfaz dice «estrategia no
  disponible» (FR-016).

**Rationale**:
- Derivar por fecha en cada lectura tiene dos fallas. La primera es una ventana: `calculated_at`
  es la hora de la aplicación al **empezar** el recálculo, y el precio nuevo recién rige cuando
  **commitea**. Una compra que lee el precio viejo en ese intervalo (segundos, una vez por
  semana) tiene `created_at` posterior al `calculated_at` nuevo y se atribuiría a la estrategia
  equivocada. La segunda es que `created_at` sale del reloj de la base y `calculated_at` del de
  la aplicación.
- Con el vínculo guardado, la estrategia es parte del registro inmutable de la compra, lo que
  completa la auditoría de §4 («estado anterior y posterior») sin recalcular nada.
- El relleno elige por precio coincidente para corregir justo esa ventana en los datos viejos.

**Alternatives considered**:
- *Derivar siempre por fecha en lectura*: sin cambios de esquema, pero con la ventana de arriba.
  Sigue siendo el criterio de **respaldo** para `/quotes/players/{id}/at`, que por definición es
  una consulta por instante.
- *Copiar `strategy_key` y `strategy_version` en la compra*: duplica datos que ya viven en la
  cotización y no permite abrir el desglose.
- *Dejar las compras viejas sin estrategia*: la mayoría del historial inicial quedaría con
  «estrategia no disponible».

## 2. De dónde sale el historial

**Decision**: un módulo nuevo `history` con `GET /history/operations`, que lee con SQL propio las
tablas `pack_opening_card`/`pack_opening` y `token_purchase`. No se toca `GET /market/operations`.

**Rationale**:
- El historial cruza dos dominios (sobres y mercado). Ninguno de los dos módulos puede ser dueño
  de una lectura que une al otro sin acoplarse; un módulo propio la aísla.
- Unir en el cliente no sirve: la paginación y el filtro por tipo tienen que resolverse en la
  base para que el total y las páginas sean exactos (FR-008, FR-009).
- `/market/operations` (09 FR-029) está publicado y testeado; cambiar su forma rompe su contrato.
  Queda como está y sin uso en el cliente nuevo.

**Alternatives considered**:
- *Ampliar `/market/operations` con sobres*: mezcla responsabilidades y cambia un contrato
  publicado.
- *Dos pedidos y fusión en el cliente*: no pagina bien y duplica la lógica de orden.
- *Vista materializada o tabla de historial*: duplica datos inmutables que ya existen; no hace
  falta con el volumen esperado.

## 3. Consulta, orden y paginación

**Decision**: una consulta con tres ramas `UNION ALL`, filtro por tipo antes de ordenar:

- `sobre`: `pack_opening_card` ⨝ `pack_opening` donde `user_id` es el usuario.
- `compra`: `token_purchase` donde `buyer_id` es el usuario.
- `venta`: `token_purchase` donde `seller_id` es el usuario.

Orden: `at desc, operation_id desc, token_id`. Para sobres, `operation_id` es la apertura; para
compras y ventas, la compra. Así las cartas de un sobre quedan contiguas y el desempate es
estable (spec, casos borde). El total sale de un `count(*)` con el mismo filtro. Después de
recortar la página, se resuelven las cotizaciones y estrategias solo de esas filas.

**Rationale**:
- No hace falta un índice nuevo: `pack_opening(user_id, created_at desc)`,
  `token_purchase(buyer_id, created_at desc)` y `token_purchase(seller_id, created_at desc)` ya
  existen (08 y 09), y la unión se ordena sobre un conjunto acotado por usuario (decenas a
  cientos de filas; tope de diseño 1.000, SC-005). `pack_opening_card` tiene `unique(opening,
  token)`, así que la rama de sobres entra por `opening_id`.
- Los valores se leen tal como se registraron (FR-011): el precio, los saldos y la rareza salen
  de la fila de la compra, no se recalculan.
- Las cartas del jugador (nombre, club, imagen) salen de `PlayerService.findCardsByIds`, como en
  sobres y mercado.

**Alternatives considered**:
- *Paginar por cursor*: más estable ante operaciones nuevas, pero 08 y 09 paginan por número de
  página y la interfaz ya tiene ese patrón. Se acepta que una operación nueva desplace páginas
  (spec, casos borde).
- *Una entrada por apertura con las cartas anidadas*: descartado por el usuario en la
  clarificación.

## 4. Cotización en una fecha: `GET /quotes/players/{playerId}/at`

**Decision**: el parámetro es un **instante** `at` (ISO 8601). La respuesta es la última cotización
con `calculated_at <= at`, o `quoted=false` y la fecha de la primera cotización si no hay ninguna.
El cliente convierte «un día» al instante del **final de ese día en su zona horaria**.

- Respuesta: `{ playerId, at, quoted, quote, firstQuotedAt }`, con `quote` en el mismo formato
  de las cotizaciones del historial de 07 (precio, score, fecha, origen, estrategia y versión).
- Sin cotización antes de `at`: `quoted=false`, `quote=null` y `firstQuotedAt` con la fecha de la
  primera (o `null` si el jugador nunca fue cotizado). No es un error (07 FR-018).
- Un `at` más de 24 horas adelante del reloj del servidor se rechaza con `VALIDATION_ERROR`.
- Un jugador inexistente responde 404 `PLAYER_NOT_FOUND`.

**Rationale**:
- El servidor no conoce la zona horaria del usuario, así que el día se resuelve en el cliente y
  llega como instante. Es el mismo mecanismo que usa el historial de 07 (`from`, `to` en ISO).
- Un solo parámetro sirve para las dos pantallas: el filtro por día (final del día elegido) y el
  resaltado desde una entrada del historial (el instante de la operación, US4-4).
- La tolerancia de 24 horas existe porque el final de «hoy» en la zona de un usuario puede estar
  hasta 24 horas por delante de la hora del servidor, y ese pedido es legítimo. El selector
  impide elegir días futuros; el servidor rechaza todo lo que supere esa tolerancia (FR-031).
- El instante exacto de una compra es un caso del mismo cálculo: `calculated_at <= at` es
  inclusivo (spec, casos borde).

**Alternatives considered**:
- *`date` + zona horaria IANA*: exacto para la regla de «fecha futura», pero obliga a validar
  zonas en el servidor y a mantener dos modos de consulta. Se descarta por costo; la tolerancia
  alcanza.
- *Reusar `/history?to=` con `limit=1` en orden descendente*: el historial de 07 solo ordena de
  más viejo a más nuevo. Habría que bajar toda la serie para quedarse con el último punto.

## 5. Historial completo del gráfico

**Decision**: el modal usa el `GET /quotes/players/{id}/history` de 07 sin cambios de
comportamiento, pidiendo páginas de 200 (su máximo) hasta cubrir `meta.total`. Se suma
`strategy.name` a la referencia de estrategia (`StrategyRefDto`), aditivo.

**Rationale**:
- Ya devuelve de la cotización más vieja a la más nueva, con `from` y `to` inclusivos, `origin`,
  `score`, `strategy.key` y `strategy.version`: todo lo que el gráfico necesita menos el nombre
  legible.
- Con 500 cotizaciones son 3 pedidos de 200; el segundo y el tercero se pueden pedir en paralelo
  una vez que el primero informa el total.
- El filtro de rango del modal se aplica sobre la serie ya cargada (sin ir a la red por cada
  cambio), salvo para resolver «cotización vigente al comienzo del rango» (FR-032), que usa `/at`.

**Alternatives considered**:
- *Endpoint nuevo con toda la serie en una respuesta*: duplica el de 07 y rompe el tope de página
  que ya protege a la base.
- *Pedir al servidor cada rango*: más pedidos para un dato que ya está en memoria.

## 6. Línea de estrategia en el panel del detalle (FR-020)

**Decision**: la home pide `GET /quotes/players/{id}/current` cuando se abre el panel y muestra
«Cotizado con {estrategia} v{n}» bajo el gráfico. No se modifica `GET /players/{id}`.

**Rationale**: `current` ya devuelve la estrategia, la versión y la fecha de cálculo. Agregarlas al
detalle del jugador toca el módulo `player`, su caché y los tests de 06 por un dato que se pide
una vez por apertura del panel. Si el pedido falla, el panel omite la línea; el gráfico no
depende de ella.

**Alternatives considered**:
- *Sumar `lastQuote` a `PlayerDetailDto`*: un campo más en un DTO compartido con la grilla.

## 7. Gráfico en SVG propio

**Decision**: `QuoteChart` dibuja la serie con SVG y React, sin librería.

- Ejes: fechas abajo, precios a la izquierda, con marcas redondeadas.
- La línea muestra siempre la serie completa. Los marcadores se dibujan en los **cambios de
  estrategia o de versión**, en la cotización elegida y en la resaltada; con pocos puntos
  (hasta 60) se dibujan todos. Así 500 puntos no producen 500 marcas ilegibles (spec, casos
  borde).
- Cada combinación estrategia+versión tiene un color **y una forma de marcador** (círculo,
  cuadrado, triángulo, rombo, en ciclo) y aparece en una leyenda con su nombre. El significado
  no depende solo del color (FR-024, SC-011).
- Una línea vertical punteada marca cada cambio de estrategia o versión.
- Selección: clic o toque elige la cotización más cercana en el eje horizontal; con el gráfico
  enfocado, las flechas izquierda y derecha mueven la selección. Un solo tab stop, no 500.
- Alternativa en texto: una tabla desplazable con fecha, precio y estrategia, donde cada fila es
  un botón que selecciona esa cotización.

**Rationale**: la lista de frontend de §2 está cerrada y agregar una librería de gráficos exige
una enmienda MINOR. El panel actual ya dibuja su línea con SVG propio (`PriceChart`), y un eje
y una leyenda son una extensión de la misma técnica. La accesibilidad por teclado y la
alternativa textual son más simples de garantizar con un SVG propio que con el DOM interno de
una librería.

**Alternatives considered**:
- *recharts / chart.js / d3*: prohibidas por §2 sin enmienda.
- *Un botón enfocable por punto*: 500 tab stops.

## 8. Formato de errores

**Decision**:
- `GET /history/operations`: `@UseFilters(ApiErrorFilter)` en el controlador, como `market`,
  `packs` y `tokens`: 401 `UNAUTHENTICATED`, 422 `VALIDATION_ERROR`, 500 `INTERNAL_ERROR`.
- `GET /quotes/players/{id}/at`: `@UseFilters(ApiErrorFilter)` solo en ese método, con
  `PLAYER_NOT_FOUND` como excepción de dominio con código.
- `GET /quotes/players/{id}/history` (07): **sin cambios**. Conserva el 400 con el formato por
  defecto de Nest. Su único cambio es el campo aditivo `strategy.name`.

**Rationale**: el e2e de 07 verifica `400` para `from=ayer`, y 08 research #10 dejó asentado que
los contratos de 05 a 07 no se rompen. El cliente nuevo valida el rango antes de pedir, así que
ese 400 solo se vería ante un bug; si ocurre, el cliente lo trata como error genérico.

**Alternatives considered**:
- *Filtro en todo `QuotesController`*: cambia códigos publicados de 07.

## 9. Caché

**Decision**: sin caché de Redis.

**Rationale**: el historial es por usuario y cambia con cada operación; cachearlo exige invalidar
en tres lugares (sobres, compras, ventas) para ahorrar una consulta indexada. Las cotizaciones
deben reflejar un recálculo apenas termina (07 FR-021). El volumen no lo justifica.

## 10. «Mi perfil» y navegación

**Decision**: ruta protegida `/profile` con `ProfilePage`; el encabezado suma un `NavLink` «Mi
perfil» junto a «Sobres» y «Mis cartas». El nombre de usuario se queda como texto. La página
muestra el nombre y el saldo (`useCredits`) y el historial.

**Rationale**: sigue el patrón de `InventoryPage` y `PacksPage` (08 FR-052). No se muestra el
correo (FR-002) y no se agrega ninguna otra sección.

## 11. Zona horaria y día local

**Decision**: `pages/date-filter.ts` concentra las conversiones del navegador: de un día
`YYYY-MM-DD` al instante del final de ese día local, al del comienzo, y el día de hoy local para
el `max` del selector. El cliente envía instantes ISO en UTC.

**Rationale**: separar las conversiones en funciones puras las vuelve testeables en Vitest sin
depender de la zona de la máquina (se fija con `TZ` en el test). Es el único lugar donde «día»
significa algo; el resto de la aplicación habla de instantes.

## 12. Límite de frecuencia

**Decision**: ninguno. Las dos rutas son lecturas, como las consultas de 09 («Demasiados pedidos»).
El tope de página (100 en el historial, 200 en el de cotizaciones) acota el costo de cada pedido.
