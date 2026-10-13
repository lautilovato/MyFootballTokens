# Quickstart: Sistema de Score y Cotización de Jugadores

**Feature**: `07-cotizacion` | **Plan**: [plan.md](./plan.md) | **Contrato**:
[contracts/quotes.openapi.yaml](./contracts/quotes.openapi.yaml) | **Modelo**:
[data-model.md](./data-model.md)

Guía de validación de punta a punta. No contiene implementación: cada escenario indica qué
ejecutar y qué resultado esperar.

## Prerrequisitos

- PostgreSQL y Redis levantados, como en las features anteriores (`back/.env`).
- Catálogo y estadísticas de temporada cargados (features 02 y 03):
  `POST /ingestion/players` y `POST /player-stats/refresh` con `x-api-key`.
- Migraciones al día: `cd back && npx mikro-orm migration:up`. Debe crear las tablas
  `valuation_strategy`, `valuation_strategy_version`, `quote_run`, `player_quote`, la columna
  `player.world_reputation` y sembrar `performance` (activa) y `prestige` en versión 1.
- Variables nuevas en `back/.env` (todas opcionales):

  | Variable | Por defecto | Uso |
  |---|---|---|
  | `QUOTES_SCHEDULER_ENABLED` | `true` | `false` en `.env.test` |
  | `QUOTES_RECALC_CRON` | `0 3 * * 1` | Lunes 03:00 |
  | `QUOTES_RECALC_TIMEZONE` | zona del servidor | Ej. `America/Argentina/Buenos_Aires` |

- Variables de shell para los ejemplos: `API=http://localhost:3000`, `KEY=<ADMIN_API_KEY>`,
  `TOKEN=<JWT de POST /auth/login>`, `PID=<uuid de un jugador con estadísticas>`.

## Tests automatizados

```bash
cd back
npm test -- score-calculator strategy-config      # utilidades puras, sin base ni Nest
npm run test:e2e -- quotes valuation-strategies
npm run lint
```

Esperado: todo verde. Los e2e corren contra la base de test de `.env.test` con el scheduler
desactivado.

## Escenarios manuales

### Q1 — Antes del primer recálculo no hay precio (US1-4, FR-018)

```bash
curl -s -H "Authorization: Bearer $TOKEN" $API/quotes/players/$PID/current
```

Esperado: `200` con `{"quoted": false, "quote": null}`. Ningún precio por defecto.

### Q2 — Primer recálculo (US1-1, FR-001, FR-002, FR-016)

```bash
curl -s -X POST -H "x-api-key: $KEY" $API/quotes/recalculate
```

Esperado: `200` con `status: "COMPLETED"`, `trigger: "MANUAL"`,
`strategy: {key: "performance", version: 1}`, `quotedCount` igual a la cantidad de jugadores
con estadísticas de la temporada vigente y `skippedCount` igual al resto del catálogo.

### Q3 — Cotización explicable (US2-1, US2-2, SC-002a)

```bash
curl -s -H "Authorization: Bearer $TOKEN" $API/quotes/players/$PID/current
```

Esperado: `quoted: true`; `price` entero mayor o igual a 10, sin máximo; `score` ≥ 0 (puede superar 1) con 4
decimales; `breakdown` con 9 métricas; la suma de `breakdown[].contribution` es igual a
`rawScore` (±0,0001); `price = max(10, round(100 + score × 900))`; `previousPrice` y
`changePct` en `null`.

### Q4 — La home ve el precio real (research #10)

```bash
curl -s -H "Authorization: Bearer $TOKEN" "$API/players/$PID"
```

Esperado: `marketValue` igual al `price` de Q3, sin esperar a que expire la caché.

### Q5 — Historial e inmutabilidad (US2-3, SC-006)

Repetir Q2 dos veces más y consultar:

```bash
curl -s -H "Authorization: Bearer $TOKEN" "$API/quotes/players/$PID/history?limit=10"
```

Esperado: `meta.total = 3`, tres registros en orden cronológico ascendente, el último igual a
la cotización actual. Q3 ahora informa `previousPrice` y `changePct`.

Validación de entrada (US2-6): `?from=2026-10-10&to=2026-10-01` → `400`; `?limit=500` → `400`.

### Q6 — Corrida concurrente (US5-2, FR-031)

Lanzar dos `POST /quotes/recalculate` en paralelo.

Esperado: uno `200`, el otro `409` con `code: "RUN_IN_PROGRESS"`. `GET /quotes/runs` muestra
una corrida `SKIPPED` y nunca dos `RUNNING`.

### Q7 — Reputación y estrategia de prestigio (US3, SC-004)

```bash
curl -s -X PUT -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{"items":[{"playerId":"<estrella>","worldReputation":95},{"playerId":"<otro>","worldReputation":40}]}' \
  $API/quotes/reputation
curl -s -X POST -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{"strategyKey":"prestige"}' $API/quotes/recalculate
```

Elegir como `<otro>` un jugador con mejor rating que `<estrella>`.

Esperado: con `prestige`, la estrella cotiza por encima; repitiendo Q2 (performance), el orden
se invierte. Un jugador sin reputación cargada muestra `usedDefaultReputation: true`.
`worldReputation: 150` → `400` y no se actualiza nadie.

### Q8 — Versionado de estrategias (US4, FR-011, SC-007)

1. `GET /valuation-strategies` (JWT): dos estrategias, `performance` activa, versión 1.
2. `POST /valuation-strategies/performance/versions` (x-api-key) con la configuración de la v1
   cambiando `goals` a `0.30`: `201` con `version: 2`.
3. El mismo POST con `scaleFactor: 0`, o con una métrica `cards`: `400`, sin versión nueva.
4. `POST /valuation-strategies/prestige/activate`: `200`; `performance` queda `active: false`.
5. Las cotizaciones de Q2–Q5 siguen mostrando `performance` v1 (SC-007).

### Q9 — Fallo atómico (US1-5, SC-008)

Con la base de test, forzar un error dentro de la transacción (el e2e lo hace con un spy
sobre el repositorio).

Esperado: la corrida queda `FAILED` con `failureReason`, `player_quote` no gana filas y la
cotización actual no cambia.

### Q10 — Scheduler (US5)

En un entorno de prueba: `QUOTES_RECALC_CRON="*/1 * * * *"`, reiniciar y esperar un minuto.

Esperado: `GET /quotes/runs` muestra una corrida `AUTOMATIC` `COMPLETED` y las cotizaciones
nuevas tienen `origin: "AUTOMATIC"`. En los logs, todas las líneas de la corrida comparten
el mismo `correlationId` (FR-035). Matar el proceso a mitad de corrida y reiniciar: la
corrida colgada pasa a `FAILED` con `interrupted` y no se ejecutan corridas atrasadas.

### Q11 — Accesos (FR-032, FR-033, SC-010)

- `POST /quotes/recalculate`, `POST .../versions`, `POST .../activate` y `PUT /quotes/reputation`
  con un JWT y sin `x-api-key` → `401`.
- `GET /quotes/...` y `GET /valuation-strategies` sin JWT → `401`.
- `GET /quotes/players/<uuid inexistente>/current` → `404`.

## Mediciones registradas

| Fecha | Escenario | Resultado |
|---|---|---|
| 2026-10-03 | SC-001: 5.000 jugadores sintéticos con estadísticas (base de test) | 5.000 cotizados en **4,0 s** (objetivo < 2 min) |
| 2026-10-03 | Q2 contra la base de desarrollo (temporada 2026-2027) | 1.848 cotizados y 790 omitidos en 1,8 s; precios de 100 a 964 créditos; `base_value` igual al precio en el 100 % de los jugadores |
| 2026-10-03 | Q1, Q3, Q5–Q11 | Cubiertos por `test/quotes.e2e-spec.ts` y `test/valuation-strategies.e2e-spec.ts` contra la base de test (50 escenarios). No se corrieron a mano contra desarrollo para no crear usuarios, versiones de estrategia ni reputaciones en esa base |
| 2026-10-03 | Swagger contra `contracts/quotes.openapi.yaml` | Las 10 operaciones coinciden en ruta, método, códigos de respuesta y esquema de seguridad |

