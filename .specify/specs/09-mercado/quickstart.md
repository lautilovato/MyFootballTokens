# Quickstart: Mercado de Tokens (Compra y Venta)

**Feature**: `09-mercado` | **Plan**: [plan.md](./plan.md) | **Contrato**:
[contracts/market.openapi.yaml](./contracts/market.openapi.yaml) | **Modelo**:
[data-model.md](./data-model.md)

Guía de validación de punta a punta. No contiene implementación: cada escenario indica qué
ejecutar y qué resultado esperar.

## Prerrequisitos

- Todo lo de [08-sobres/quickstart.md](../08-sobres/quickstart.md): PostgreSQL y Redis
  levantados, catálogo cotizado y stock de sobres generado.
- Migraciones al día (`cd back && npx mikro-orm migration:up`). `Migration20261020120000` debe
  crear `listing` y `token_purchase`, sus índices y triggers, y ampliar los CHECK de
  `credit_movement.type` y `token_event.type`.
- Variable nueva en `back/.env`, opcional:

  | Variable | Por defecto | Uso |
  |---|---|---|
  | `MARKET_RATE_LIMIT_MAX` | `30` | Pedidos `POST` al mercado por minuto y por IP (research #11) |

- Dos usuarios con cartas (`ANA` vende, `BETO` compra). Variables de shell: `API=http://localhost:3000`,
  `KEY=<ADMIN_API_KEY>` (solo para el recálculo de M7), `ANA=<JWT de Ana>`, `BETO=<JWT de Beto>`,
  `TOKEN_ID=<un token del inventario de Ana>` y `PLAYER_ID=<su jugador>`.

## Tests automatizados

```bash
cd back
npm run test:e2e -- market players tokens packs
npm run lint

cd ../front
npm test
npm run build
npm run lint
```

Esperado: todo verde. `market.e2e-spec.ts` cubre las User Stories 1, 2 y 4, la concurrencia,
la atomicidad, la inmutabilidad y las invariantes. `players` cubre el nuevo criterio del Market y
`forSaleCount`. `packs` y `tokens` confirman que 08 sigue intacta.

## Escenarios manuales — backend

### M1 — Publicar una carta (US1-1, FR-003 a FR-005)

```bash
curl -s -X POST $API/market/listings -H "Authorization: Bearer $ANA" \
  -H 'Content-Type: application/json' -d "{\"tokenId\":\"$TOKEN_ID\"}"
```

Esperado: 201 con `status: "activa"` y `price` igual a `marketValue` de `GET /players/$PLAYER_ID`.
`GET /inventory` muestra ese token con `listingId`, y el historial del token suma `puesta_en_venta`.

### M2 — Publicar con precio, dos veces o un token ajeno (US1-3, US1-4, US1-5)

- Con `"price": 10` en el body → 422 `VALIDATION_ERROR`.
- El mismo `tokenId` otra vez → 409 `TOKEN_ALREADY_LISTED`.
- Con el JWT de Beto → 404 `TOKEN_NOT_FOUND`.

### M3 — El Market y el detalle (US3-1, US3-2, US3-4)

```bash
curl -s -H "Authorization: Bearer $BETO" "$API/players"
curl -s -H "Authorization: Bearer $BETO" "$API/market/players/$PLAYER_ID/listings"
curl -s -H "Authorization: Bearer $ANA"  "$API/market/players/$PLAYER_ID/listings"
```

Esperado: el jugador aparece en el Market con `forSaleCount: 1`. El detalle lista la
publicación con `mine: false` para Beto y `mine: true` para Ana, sin datos del vendedor.

### M4 — Comprar (US2-2, US2-3, FR-018)

```bash
PRICE=<price del paso M3>
curl -s -X POST $API/market/purchases -H "Authorization: Bearer $BETO" \
  -H 'Content-Type: application/json' -d "{\"listingId\":\"<id>\",\"acceptedPrice\":$PRICE}"
```

Esperado: 201. El saldo de Beto bajó exactamente `price` y el de Ana subió lo mismo, así que la
suma de saldos no cambió. El token aparece en el inventario de Beto y no en el de Ana. Hay un
`compra_token` y un `venta_token` en `credit_movement`, una fila en `token_purchase` y un evento
`venta` en el historial del token, que ven los dos. En el log del backend aparece un evento de
contexto `MarketService` con el mismo `correlationId` que la fila de `token_purchase`, el
`purchaseId`, el `tokenId` y los dos ids de movimiento (FR-034).

### M5 — Rechazos de la compra (US2-5 a US2-9)

- Ana compra su propia publicación → 409 `OWN_LISTING`.
- Beto repite la compra del paso M4 → 409 `LISTING_NOT_ACTIVE`.
- `acceptedPrice` = precio − 1 → 409 `PRICE_CHANGED`.
- Beto con saldo menor que el precio (bajarlo en la base de test) → 409 `INSUFFICIENT_CREDITS`.

En todos los casos, saldos, inventarios y publicaciones quedan como estaban.

### M6 — Retirar (US1-6 a US1-8)

- Ana publica otra carta y la retira con `POST $API/market/listings/<id>/withdraw` → 200,
  `status: "retirada"`. El token sigue en su inventario con `listingId: null`.
- Retirarla otra vez → 409 `LISTING_NOT_ACTIVE`; Beto intentando retirarla → 404 `LISTING_NOT_FOUND`.

### M7 — El precio sigue a la cotización (US1-9, US3-6)

Con una carta publicada, correr un recálculo que cambie la cotización del jugador (spec 07; usa la
clave administrativa, no la sesión):

```bash
curl -s -X POST $API/quotes/recalculate -H "x-api-key: $KEY"
```

 Esperado: el `price` del detalle es el nuevo `marketValue`, y una compra
con el `acceptedPrice` viejo se rechaza con `PRICE_CHANGED` si el precio subió, o se cobra al
precio nuevo si bajó.

### M8 — Historial de operaciones (US4-1 a US4-4)

```bash
curl -s -H "Authorization: Bearer $BETO" "$API/market/operations"
curl -s -H "Authorization: Bearer $ANA"  "$API/market/operations"
```

Esperado: Beto ve una `compra` y Ana una `venta` de la misma carta, cada uno con sus saldos antes
y después y `counterparty: "otro_usuario"`.

### M9 — Inmutabilidad (US4-5, FR-030)

En `psql`: `update "token_purchase" set "price" = 1;` y `delete from "listing";` fallan por
trigger. `update "listing" set "status" = 'activa' where "status" = 'vendida';` también falla.

### M10 — Compras simultáneas de la misma carta (US2-10, SC-003)

Lanzar en paralelo dos `POST /market/purchases` de usuarios distintos sobre la misma
publicación. Esperado: un 201 y un 409 `LISTING_NOT_ACTIVE`; solo al ganador se le cobra.

### M11 — Límite de frecuencia (research #11)

Con `MARKET_RATE_LIMIT_MAX=3`, el cuarto `POST /market/listings` del mismo origen en un minuto
responde 429 `RATE_LIMITED` sin publicar nada. Diez `GET /market/players/$PLAYER_ID/listings`
seguidos responden todos 200.

## Escenarios manuales — cliente web

### W1 — Publicar y retirar desde el inventario (FR-036, FR-037)

En `/inventory`, «Poner a la venta» abre una confirmación con el precio actual y el aviso de que
sigue a la cotización. Al confirmar, la carta muestra «A la venta» y el botón pasa a «Retirar».

### W2 — Comprar desde el detalle (FR-038 a FR-041)

En la home, abrir un jugador con cartas a la venta. El bloque de compra lista las cartas con su
número de serie, sin selector de cantidad. Las propias dicen «Tuya» y no se pueden comprar.
«Comprar» confirma con el precio y el saldo que quedaría. Al terminar, el saldo del encabezado,
la lista y el Market se actualizan sin recargar, y aparece un acceso al inventario.

### W3 — Mensajes de error (FR-040, FR-042)

Sin saldo suficiente, el botón queda deshabilitado con el motivo. Si otra sesión compra la
carta antes de confirmar, aparece el mensaje de `LISTING_NOT_ACTIVE` y la lista se recarga.
