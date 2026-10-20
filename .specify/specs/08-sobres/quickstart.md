# Quickstart: Créditos, Sobres e Inventario

**Feature**: `08-sobres` | **Plan**: [plan.md](./plan.md) | **Contrato**:
[contracts/packs.openapi.yaml](./contracts/packs.openapi.yaml) | **Modelo**:
[data-model.md](./data-model.md)

Guía de validación de punta a punta. No contiene implementación: cada escenario indica qué
ejecutar y qué resultado esperar.

## Prerrequisitos

- PostgreSQL y Redis levantados (`cd back && docker compose up -d`).
- Catálogo, estadísticas, reputación y al menos una corrida de cotización (features 02, 03 y
  07). La reputación ya viene cargada por `Migration20261013180000` (EA FC 27).
- Migraciones al día: `cd back && npx mikro-orm migration:up`. Debe crear `credit_movement`,
  `token`, `token_event`, `pack_batch`, `pack`, `pack_opening`, `pack_opening_card`, la
  columna `user.credits` y los triggers de inmutabilidad.
- Dependencias del cliente: `cd front && npm install` (incluye `gsap` y `@gsap/react`).
- Variables nuevas en `back/.env` (todas opcionales):

  | Variable | Por defecto | Uso |
  |---|---|---|
  | `INITIAL_CREDITS` | `2000` | Créditos de cada cuenta nueva |
  | `PACK_TYPES_CONFIG` | valores de la spec | JSON con precio, cartas, probabilidades y participación por tipo |
  | `PACKS_SCHEDULER_ENABLED` | `true` | `false` en `.env.test` |
  | `PACKS_STOCK_CRON` | `*/15 * * * *` | Sincronización periódica del stock |

- Variables de shell: `API=http://localhost:3000`, `KEY=<ADMIN_API_KEY>`,
  `TOKEN=<JWT de POST /auth/login>`.

## Tests automatizados

```bash
cd back
npm test -- pack-stock-planner pack-config ovr rarity    # utilidades puras, sin base ni Nest
npm run test:e2e -- credits packs tokens players
npm run lint

cd ../front
npm test
npm run build
npm run lint
```

Esperado: todo verde. Los e2e corren contra la base de `.env.test` con los schedulers
desactivados. El build del cliente confirma que `gsap` quedó declarado.

## Escenarios manuales — backend

### S1 — Saldo inicial al registrarse (US1-1, US1-2, FR-001)

```bash
curl -s -X POST $API/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"nuevo@test.com","username":"nuevo","password":"Secreta123"}'
curl -s -H "Authorization: Bearer $TOKEN" $API/credits
```

Esperado: `{"credits": 2000}` y una fila `entrega_inicial` en `credit_movement` con
`balance_before = 0` y `balance_after = 2000`.

### S2 — Regularización idempotente (US1-3, US1-4, FR-002)

```bash
curl -s -X POST -H "x-api-key: $KEY" $API/credits/initial-grants
curl -s -X POST -H "x-api-key: $KEY" $API/credits/initial-grants
```

Esperado: la primera llamada informa `granted` igual a la cantidad de usuarios anteriores a la
feature; la segunda, `granted: 0`. Ningún saldo cambia entre ambas.

### S3 — Emisión y primer lote (FR-011 a FR-013, FR-029, SC-005)

```bash
curl -s -X POST -H "x-api-key: $KEY" $API/packs/stock/sync
curl -s -X POST -H "x-api-key: $KEY" $API/packs/stock/sync
```

Esperado: la primera llamada informa `emittedTokens = 100 × jugadores` y un `batch` con
`tokenCount` igual a 100 × jugadores elegibles (con cotización y reputación). La segunda,
`emittedTokens: 0` y `batch: null`. En la base, para cada lote,
`Σ pack.card_count = pack_batch.token_count` y cada token elegible está en exactamente un
sobre.

### S4 — Catálogo con probabilidades en vivo (US2-1, FR-010, SC-007)

```bash
curl -s -H "Authorization: Bearer $TOKEN" $API/packs/types
```

Esperado: `stockGenerated: true` y los cuatro tipos con precio, cartas, `remaining` y
probabilidades que suman 1. Al generarse el lote, `epic + legendary` no decrece de `common` a
`legendary`.

### S5 — Abrir un sobre (US2-2, US2-3, FR-018 a FR-027)

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"type":"rare"}' $API/packs/openings
```

Esperado: `201` con 4 cartas, cada una con `tokenId`, `serial`, `rarity`, `quotePrice` y la
carta del jugador; `balanceAfter = balanceBefore − 200`. Repetir S4: `remaining` de `rare`
bajó en 1 y sus probabilidades cambiaron según las cartas que salieron.

### S6 — Rechazos sin efectos (US2-4, US2-6 a US2-8, FR-019)

| Pedido | Esperado |
|---|---|
| `{"type":"mega"}` | `404 PACK_TYPE_NOT_FOUND` |
| `{}` o `{"type": 5}` | `422 VALIDATION_ERROR` |
| tipo válido con saldo menor al precio | `409 INSUFFICIENT_CREDITS` |
| tipo sin sobres sin abrir | `409 PACK_SOLD_OUT` |
| antes de S3 (base sin sobres) | `409 PACKS_NOT_AVAILABLE` |
| sin `Authorization` | `401 UNAUTHENTICATED` |

En todos los casos el saldo, el inventario y el stock quedan iguales, y la respuesta trae
`code`, `message` y `correlationId`.

### S7 — Concurrencia (US2-10 a US2-12, SC-003)

Con un usuario que tiene saldo para exactamente 2 sobres `common`, lanzar 5 aperturas en
paralelo:

```bash
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' -d '{"type":"common"}' $API/packs/openings &
done; wait
```

Esperado: dos `201` y tres `409 INSUFFICIENT_CREDITS`; saldo final ≥ 0; ningún token aparece
en dos aperturas.

### S8 — Inventario (US3, FR-033 a FR-035)

```bash
curl -s -H "Authorization: Bearer $TOKEN" "$API/inventory?page=1&limit=20"
```

Esperado: un ítem por jugador con `count`, sus tokens (`id`, `serial`) y la carta del jugador
con su cotización vigente en `marketValue`, ordenados por reputación descendente. La suma de
`count` es igual a los tokens recibidos.

### S9 — Historial de un token y de aperturas (US4, US7)

```bash
curl -s -H "Authorization: Bearer $TOKEN" $API/tokens/<tokenId>/history
curl -s -H "Authorization: Bearer $TOKEN" $API/packs/openings
```

Esperado: el token muestra `emision` y `entrega_en_sobre` (sin `asignacion_a_sobre`), con
`to: "yo"` en la entrega. Un token ajeno o inventado responde `404 TOKEN_NOT_FOUND`. Las
aperturas vienen de la más reciente a la más antigua y cada una cumple
`balanceBefore − price = balanceAfter`.

### S10 — Inmutabilidad (FR-040)

```sql
update credit_movement set amount = 1;
delete from pack_opening;
```

Esperado: ambas sentencias fallan por el trigger y no cambian ninguna fila.

### S11 — OVR y rareza desde la reputación (FR-067 a FR-069, SC-020)

```bash
curl -s -H "Authorization: Bearer $TOKEN" "$API/players?search=Mbapp"
curl -s -H "Authorization: Bearer $TOKEN" "$API/players?rarity=legendary&limit=50"
```

Esperado: Mbappé con `ovr: 91` y `rarity: "legendary"`. El filtro `legendary` devuelve solo
jugadores con reputación de 88 o más. Cargar otra reputación a un jugador con
`PUT /quotes/reputation/{id}` cambia su OVR y su rareza en la home de inmediato.

### S12 — Tiempo de apertura (SC-001)

En una base local de prueba con el catálogo real, darle a un usuario saldo para 100 sobres
(`update "user" set credits = 10000 where …`; esto rompe a propósito la conservación de SC-013
en esa base) y medir 100 aperturas secuenciales:

```bash
for i in $(seq 1 100); do
  curl -s -o /dev/null -w "%{time_total}\n" -X POST -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' -d '{"type":"common"}' $API/packs/openings
done | sort -n | sed -n '95p'
```

Esperado: el valor impreso (p95, en segundos) es menor a 2.

### S13 — El Market muestra solo cartas a la venta (FR-070, SC-021)

```bash
curl -s -H "Authorization: Bearer $TOKEN" "$API/players?limit=5"
```

Esperado: `{"data": [], "meta": {"total": 0, ...}}` mientras ningún token esté en
`en_venta_plataforma`. En la home se ve «Todavía no hay cartas a la venta» con el botón «Ir a
sobres», y el panel de filtros sigue visible. `GET /players/{id}` responde por cualquier
jugador.

## Resultados de la validación (2026-10-13)

Corrida de S1 a S12 contra una copia de la base local con el catálogo real (2.644 jugadores,
reputación de EA FC 27): **25/25 verificaciones OK**. Ajustes a los resultados esperados:

- **Elegibles**: la primera corrida de cotización cotizó a los **1.919** jugadores con
  estadísticas de temporada; los otros 725 quedan `reservado` (sin cotización, FR-027). El
  lote se arma solo al terminar la corrida (FR-012): **191.900 tokens**, en 31.983 sobres
  `common`, 13.433 `rare`, 5.373 `epic` y 2.559 `legendary`. La corrida completa (cotización,
  emisión de 264.400 tokens y lote) tardó 48 s.
- **Probabilidades publicadas al generarse el lote** (S4): `legendary` 0,3 % / 1,2 % / 2,0 % /
  6,7 % y `epic + legendary` 8,3 % / 16,9 % / 32,6 % / 45,0 % de `common` a `legendary`. Están
  muy por debajo de los objetivos de `legendary` porque solo 25 jugadores son legendarios
  (Assumptions), pero la monotonía se cumple.
- **Tiempos** (S12): apertura con mediana de 55 ms y p95 de 78 ms (SC-001: < 2 s). El catálogo
  responde en 5 ms desde Redis y en unos 110 ms al recalcularse después de una apertura.
- **Cliente web**: W1, W2, W3, W4 y W8 se verificaron a mano en el navegador; W5 a W7, W9 y W10
  los cubren los tests de `front/`. Con la pestaña del navegador oculta, el navegador no corre
  `requestAnimationFrame` y la animación del sobre queda en pausa hasta que la pestaña vuelve a
  verse; la apertura ya está confirmada y sus cartas ya están en el inventario.

## Escenarios manuales — cliente web

Con `cd front && npm run dev` y una sesión iniciada:

| # | Acción | Esperado |
|---|---|---|
| W1 | Mirar el encabezado | Accesos a Sobres e Inventario y el saldo (FR-052, FR-053) |
| W2 | Entrar a Sobres | Saldo y los cuatro tipos con precio, cartas, probabilidades y restantes (FR-054) |
| W3 | Elegir un tipo y cancelar en el modal | No se hace ninguna apertura (FR-056) |
| W4 | Confirmar | El sobre se abre grande y centrado sobre la pantalla; después, revelación de las cartas devueltas (cada una con su número de serie), saldo y restantes actualizados sin recargar; opciones «Abrir otro» e «Ir a mis cartas» (FR-058, FR-059) |
| W5 | Tipo más caro que el saldo, o agotado | Aparece como no disponible con el motivo (FR-055) |
| W6 | Forzar un rechazo (por ejemplo, agotar el tipo desde otra sesión) | Sin animación, mensaje propio del código y datos actualizados (FR-060, SC-018) |
| W7 | Sistema con «reducir movimiento» activado | Mismo resultado sin la animación completa (FR-062) |
| W8 | Entrar a Inventario | Una carta por token, ordenadas por reputación, con el número de serie en la carta («Rare 17/100») y paginación (FR-063, FR-064) |
| W9 | Inventario sin cartas | Mensaje con acceso a Sobres (FR-065) |
| W10 | Abrir `/packs` o `/inventory` sin sesión | Redirige al login (FR-052) |
