# Quickstart: Historial de Operaciones y Consulta de Cotizaciones por Fecha

**Feature**: `10-historial-operaciones` | **Plan**: [plan.md](./plan.md) | **Contrato**:
[contracts/history.openapi.yaml](./contracts/history.openapi.yaml) | **Modelo**:
[data-model.md](./data-model.md)

Guía de validación de punta a punta. No contiene implementación: cada escenario indica qué
ejecutar y qué resultado esperar.

## Prerrequisitos

- Todo lo de [09-mercado/quickstart.md](../09-mercado/quickstart.md): PostgreSQL y Redis
  levantados, catálogo cotizado, stock de sobres generado y dos usuarios con cartas.
- Migraciones al día (`cd back && npx mikro-orm migration:up`). `Migration20261026120000` debe
  agregar `token_purchase.quote_id` y rellenarla (ver M0).
- Un jugador con **al menos tres cotizaciones** y, para M5, con **dos estrategias o versiones
  distintas** entre ellas: recalcular con la estrategia activa, crear una versión nueva de una
  estrategia (`POST /valuation-strategies/{key}/versions`), activarla y volver a recalcular
  (`POST /quotes/recalculate`).
- Variables de shell: `API=http://localhost:3000`, `ANA=<JWT de Ana>` (vende),
  `BETO=<JWT de Beto>` (compra), `PLAYER_ID=<un jugador cotizado>`.
- Para tener los tres tipos de entrada en Beto: que abra un sobre, que compre una carta a Ana y
  que venda otra suya.

## Tests automatizados

```bash
cd back
npm run test:e2e -- history quotes market
npm run lint

cd ../front
npm test
npm run build
npm run lint
```

Esperado: todo verde. `history.e2e-spec.ts` cubre las User Stories 1 y 4 (los tres tipos de
entrada, los filtros, el orden, la paginación, el aislamiento entre usuarios y la solo-lectura).
`quotes` cubre `/at` y `strategy.name`. `market` confirma que cada compra guarda `quote_id` y que
el precio coincide con el de esa cotización.

## Escenarios manuales — backend

### M0 — Migración y relleno (research #1)

```sql
select count(*) filter (where quote_id is null) as sin_cotizacion,
       count(*) filter (where quote_id is not null) as con_cotizacion
  from token_purchase;

select count(*) as precio_distinto
  from token_purchase tp join player_quote q on q.id = tp.quote_id
 where q.price <> tp.price;
```

Esperado: `sin_cotizacion` es 0 (o solo compras sin ninguna cotización previa) y `precio_distinto`
es 0. Después, `update token_purchase set price = price` debe seguir fallando por el trigger de
inmutabilidad.

### M1 — Historial con los tres tipos (US1-2 a US1-5)

```bash
curl -s "$API/history/operations" -H "Authorization: Bearer $BETO" | jq '.data[] | {kind, at, serial, price, balanceBefore, balanceAfter, counterparty, packType, quote}'
```

Esperado:
- Entradas de la más reciente a la más antigua.
- Una entrada `sobre` por cada carta del sobre abierto, contiguas, con `packType` y con `price`,
  `balanceBefore`, `balanceAfter`, `counterparty` y `quote` en `null`.
- La `compra` con `price`, saldos antes y después (`balanceBefore - price = balanceAfter`),
  `counterparty: "otro_usuario"` y `quote.strategy` con `key`, `name` y `version`.
- La `venta` con `balanceBefore + price = balanceAfter`.

### M2 — Filtros y total (US1-6, FR-009)

```bash
for t in all acquired sold; do
  echo "$t: $(curl -s "$API/history/operations?type=$t" -H "Authorization: Bearer $BETO" | jq '.meta.total')"
done
```

Esperado: `acquired + sold = all`; `sold` solo trae `venta`; `acquired`, `sobre` y `compra`.

### M3 — Paginación sin repetidos ni saltos (US1-9, FR-008)

```bash
for p in 1 2 3; do
  curl -s "$API/history/operations?limit=2&page=$p" -H "Authorization: Bearer $BETO" | jq -r '.data[].id'
done
```

Esperado: ningún `id` repetido entre páginas y el orden descendente se mantiene, incluso cuando
las cartas de un sobre quedan repartidas en dos páginas.

### M4 — Aislamiento y entrada inválida (US1-12, FR-012, FR-035)

```bash
curl -s "$API/history/operations?userId=<id de Ana>" -H "Authorization: Bearer $BETO"   # 422 VALIDATION_ERROR
curl -s "$API/history/operations?type=todo"        -H "Authorization: Bearer $BETO"   # 422 VALIDATION_ERROR
curl -s "$API/history/operations?limit=500"        -H "Authorization: Bearer $BETO"   # 422 VALIDATION_ERROR
curl -s "$API/history/operations"                                                      # 401 UNAUTHENTICATED
```

Esperado: cada respuesta con `{ code, message, correlationId }`. El historial de Ana no incluye
la compra que Beto le hizo a otro usuario, y el de Beto no incluye las de Ana.

### M5 — Cotización en una fecha (US3-1 a US3-4, FR-028 a FR-031)

```bash
# Entre dos recálculos: debe devolver el anterior
curl -s "$API/quotes/players/$PLAYER_ID/at?at=<instante entre la 2.ª y la 3.ª cotización>" \
  -H "Authorization: Bearer $BETO" | jq '{quoted, price: .quote.price, calculatedAt: .quote.calculatedAt, strategy: .quote.strategy}'

# Anterior a la primera cotización
curl -s "$API/quotes/players/$PLAYER_ID/at?at=2020-01-01T00:00:00Z" -H "Authorization: Bearer $BETO" | jq

# Futuro
curl -s "$API/quotes/players/$PLAYER_ID/at?at=2999-01-01T00:00:00Z" -H "Authorization: Bearer $BETO"   # 422

# Jugador inexistente
curl -s "$API/quotes/players/00000000-0000-0000-0000-000000000000/at?at=2026-10-14T00:00:00Z" -H "Authorization: Bearer $BETO"   # 404 PLAYER_NOT_FOUND
```

Esperado:
- La primera devuelve `quoted: true` y la **cotización anterior** al instante (nunca la siguiente,
  nunca una interpolada), con `strategy.name` y `strategy.version`.
- La segunda devuelve `quoted: false`, `quote: null` y `firstQuotedAt` con la fecha de la primera.
- La tercera y la cuarta responden con el formato `ApiError`.
- Con `at` exactamente igual a la `calculatedAt` de una cotización, devuelve esa misma (inclusivo).

### M6 — La estrategia de una compra no cambia (US4-1, US4-3, FR-017)

1. Anotar la `quote.strategy` de una compra de Beto con M1.
2. Activar otra estrategia y recalcular.
3. Repetir M1.

Esperado: la entrada de esa compra mantiene la misma estrategia y versión, y el mismo precio.

### M7 — Coherencia con la compra (invariante 4)

Comprar una carta a Ana con Beto y consultar su historial.

Esperado: `price` de la entrada es igual a `quote.price` de la cotización de `quote.id`, y esa
cotización es la última del jugador al momento de comprar (`GET /quotes/players/$PLAYER_ID/at`
con `at` = la fecha de la compra devuelve la misma cotización).

### M8 — Solo lectura (FR-037)

Contar las filas de `pack_opening`, `token_purchase`, `credit_movement`, `token_event` y
`player_quote` antes y después de varias consultas a los endpoints de este contrato.

Esperado: los conteos no cambian.

### M9 — Rendimiento (SC-005, SC-009)

Con un usuario de prueba con unas 1.000 entradas, medir la primera página del historial. Con un
jugador de unas 500 cotizaciones, medir el historial completo en 3 pedidos de 200.

Esperado: la primera página, en menos de 2 s en p95. Revisar con `EXPLAIN` que la rama de cada
tipo entra por los índices por usuario existentes.

## Escenarios manuales — frontend

Con `npm run dev` en `front/` y `back/` levantado, entrando como Beto.

### F1 — «Mi perfil» (US1-1, FR-001, FR-002)

1. En el encabezado aparece «Mi perfil» junto a «Sobres» y «Mis cartas».
2. Entrar lleva a `/profile`, que muestra el nombre, el saldo y «Historial de operaciones», y
   ningún otro dato (ni el correo).
3. Cerrar sesión, escribir `/profile` en la barra: lleva a iniciar sesión.

### F2 — Historial (US1-2 a US1-8, FR-004 a FR-006, FR-013)

1. Las entradas de sobre dicen «Primer propietario» y el tipo de sobre, sin precio ni saldo.
   Las cartas del mismo sobre aparecen juntas.
2. La compra y la venta muestran el precio, el saldo antes y después, «Plataforma» u «Otro
   usuario» y «cotizada con {estrategia} v{n}».
3. Los filtros «Todas», «Adquiridas» y «Vendidas» cambian la lista y el total.
4. Un usuario sin operaciones ve el mensaje de vacío con los accesos a Sobres y al Market.
5. Avanzar de página no repite ni saltea entradas.

### F3 — «Ver más» y gráfico completo (US2-1 a US2-10, FR-019 a FR-026)

1. En el Market, abrir el detalle de un jugador con cotizaciones: aparece «Ver más» y, bajo el
   gráfico, «Cotizado con {estrategia} v{n}».
2. Abrir un jugador sin cotizaciones: no hay «Ver más».
3. «Ver más» abre el modal con todas las cotizaciones, ejes con fechas y precios, y leyenda de
   estrategias. Los cambios de estrategia o versión se ven con otro color **y otra forma** de
   marcador, y con una línea vertical.
4. Elegir un punto (clic, toque o flechas con el gráfico enfocado) muestra precio, score, fecha y
   hora, origen y estrategia con versión.
5. Cerrar con el botón, con Escape y con un clic fuera; el panel queda como estaba.
6. Con el teclado, el foco queda dentro del modal y la lista en texto permite elegir cualquier
   cotización.
7. Cortar el backend y abrir el modal: error con «Reintentar» sin cerrar el panel.

### F4 — Búsqueda por fecha (US3-1 a US3-10, FR-027 a FR-033)

1. Elegir un día entre dos recálculos: muestra la cotización vigente, la resalta en el gráfico y
   aclara «calculada el {fecha}».
2. Elegir un día anterior a la primera: «sin cotización a esa fecha» y cuándo se calculó la
   primera.
3. El selector no permite días futuros.
4. Un rango «desde–hasta» deja solo las cotizaciones de ese tramo; un rango sin cotizaciones lo
   dice y muestra la vigente al comienzo.
5. Un rango invertido muestra el mensaje y no cambia lo que se veía.
6. «Limpiar» vuelve al gráfico completo.
7. Cambiar de zona horaria del sistema y repetir el punto 1 con una cotización calculada cerca
   de la medianoche: el día se toma completo en la zona del navegador.

### F5 — Desde una entrada del historial (US4-4, FR-018)

1. En «Mi perfil», elegir «Ver evolución» en una compra: abre el modal del jugador con la
   cotización vigente en esa operación resaltada y su estrategia.
2. Lo mismo desde una carta de sobre: resalta la cotización vigente en el instante de la
   apertura.

### F6 — Accesibilidad (SC-011)

Recorrer el modal solo con el teclado y con un lector de pantalla: el gráfico tiene nombre
accesible, la alternativa en texto contiene todas las cotizaciones y el significado de los
marcadores no depende solo del color.

## Criterios de salida

- Los tests de `/back` y `/front`, el build y el lint pasan.
- M0 a M9 y F1 a F6 dan el resultado esperado.
- Los endpoints nuevos aparecen en Swagger con sus códigos de error (FR-038).
