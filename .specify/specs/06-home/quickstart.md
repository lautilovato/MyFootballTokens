# Quickstart — Validación de 06-home

Guía para verificar la feature de punta a punta. Cada escenario apunta al requisito que prueba.
Las formas de request y response son las de
[`contracts/home.openapi.yaml`](./contracts/home.openapi.yaml); los valores derivados, los de
[`data-model.md`](./data-model.md).

---

## Prerrequisitos

```bash
# 1. Infraestructura (Docker Desktop debe estar corriendo)
cd back
docker compose up -d                 # PostgreSQL en 5433, Redis en 6379

# 2. Migraciones, incluida la que habilita unaccent (research #4)
npx mikro-orm migration:up

# 3. API
npm run start:dev                    # http://localhost:3000

# 4. Cliente
cd ../front
npm run dev                          # http://localhost:5173
```

**Datos**: la home necesita catálogo y estadísticas cargadas. Si la base está vacía, correr la
ingesta con la clave administrativa de `.env`:

```bash
curl -X POST http://localhost:3000/ingestion/players            -H "x-api-key: $ADMIN_API_KEY"
curl -X POST http://localhost:3000/team-whoscored-matching/refresh -H "x-api-key: $ADMIN_API_KEY"
curl -X POST http://localhost:3000/player-stats/refresh         -H "x-api-key: $ADMIN_API_KEY"
```

Sin el tercer paso no hay ratings, así que **todos los jugadores saldrían `common` y sin OVR**.
Eso es comportamiento correcto (FR-030), pero no permite validar E3 ni E4.

**Sesión**: los tres endpoints exigen JWT (FR-017).

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"...","password":"..."}' | jq -r .accessToken)
```

---

## Escenarios de API

### E1 — Listado base y forma de la carta *(FR-009, FR-010, US1)*

```bash
curl -s "http://localhost:3000/players?limit=5" -H "Authorization: Bearer $TOKEN" | jq
```

**Esperado**: `data` con 5 elementos y `meta.total` con el total del catálogo. Cada elemento trae
`ovr`, `rarity`, `club`, `nationality`, `goals`, `assists`, `marketValue`, `changePct`, `supply` y
`priceHistory` con 30 puntos. Al menos un jugador sin estadísticas aparece con `ovr: null`,
`goals: null` y `rarity: "common"` — presente, no omitido.

### E2 — Paginación sin repetir ni omitir *(FR-008, US1 §2)*

```bash
curl -s "http://localhost:3000/players?page=1&limit=10" -H "Authorization: Bearer $TOKEN" | jq -r '.data[].id' > /tmp/p1
curl -s "http://localhost:3000/players?page=2&limit=10" -H "Authorization: Bearer $TOKEN" | jq -r '.data[].id' > /tmp/p2
comm -12 <(sort /tmp/p1) <(sort /tmp/p2)
```

**Esperado**: salida vacía. Ningún identificador se repite entre páginas consecutivas. Es la
verificación de que el `LEFT JOIN` a las estadísticas no multiplicó filas (research #3).

### E3 — OVR derivado del rating *(FR-027, FR-028)*

```bash
curl -s "http://localhost:3000/players?limit=100" -H "Authorization: Bearer $TOKEN" \
  | jq '[.data[] | select(.ovr != null) | {name, ovr}] | .[0:5]'
```

Contrastar contra el detalle, que expone el `rating` de origen:

```bash
curl -s "http://localhost:3000/players/<id>" -H "Authorization: Bearer $TOKEN" | jq '{rating, ovr}'
```

**Esperado**: `ovr == min(99, trunc(rating × 10))`. Un `rating` de 8,63 da 86; uno de 7,49 da 74
(truncado, no redondeado); uno de 6,94 da 69.

### E4 — Cortes de rareza *(FR-029, US2 §8)*

```bash
curl -s "http://localhost:3000/players?rarity=legendary&limit=100" -H "Authorization: Bearer $TOKEN" \
  | jq '[.data[].ovr] | min'
```

**Esperado**: 85 o más. Repetir con `epic` (mínimo 77, máximo 84), `rare` (70–76) y `common`
(todos por debajo de 70 o `null`).

### E5 — Rango de OVR y exclusión de los jugadores sin estadísticas *(FR-004, FR-030, US2 §9)*

```bash
curl -s "http://localhost:3000/players?minOvr=70&maxOvr=99&limit=100" -H "Authorization: Bearer $TOKEN" \
  | jq '[.data[] | select(.ovr == null or .ovr < 70)] | length'
```

**Esperado**: `0`. Ni jugadores por debajo de 70 ni jugadores sin OVR.

### E6 — Filtros de valores múltiples y combinación *(FR-001, FR-002, FR-007, US2 §1 a §3)*

```bash
curl -s "http://localhost:3000/players?league=Premier%20League&league=La%20Liga&position=FW&position=MF&minOvr=75&limit=100" \
  -H "Authorization: Bearer $TOKEN" | jq '[.data[] | {position, ovr}] | unique_by(.position)'
```

**Esperado**: solo `FW` y `MF`, todos con `ovr >= 75`, y solo de esas dos ligas. `meta.total`
refleja el conjunto filtrado, no el catálogo completo.

### E7 — Búsqueda insensible a acentos *(FR-006, US2 §4)*

```bash
curl -s "http://localhost:3000/players?search=nicolas" -H "Authorization: Bearer $TOKEN" | jq -r '.data[].name'
curl -s "http://localhost:3000/players?search=NICOLÁS" -H "Authorization: Bearer $TOKEN" | jq -r '.data[].name'
```

**Esperado**: ambas devuelven el mismo conjunto, incluyendo nombres escritos con acento. Si la
segunda devuelve menos que la primera, la extensión `unaccent` no se aplicó.

### E8 — Entradas inválidas *(FR-016, US2 §6, SC-006)*

```bash
for q in "position=XX" "minOvr=80&maxOvr=70" "page=0" "limit=500" "minValue=-5" "nope=1"; do
  echo -n "$q -> "
  curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/players?$q" -H "Authorization: Bearer $TOKEN"
done
```

**Esperado**: `400` en los seis casos. El rango invertido debe rechazarse, no interpretarse al
revés; `nope=1` cae por `forbidNonWhitelisted` del `ValidationPipe` global.

### E9 — Detalle completo *(FR-012 a FR-015, US3 §2)*

```bash
curl -s "http://localhost:3000/players/<id>" -H "Authorization: Bearer $TOKEN" \
  | jq '{league, height, goals, assists, shotsPerGame, keyPasses, dribbles, tackles, rating, season}'
```

**Esperado**: las siete métricas de FR-012 más liga y temporada. En un jugador sin estadísticas,
las métricas son `null` y no `0` (FR-015), y `season` es `null`.

### E10 — Determinismo del mercado simulado *(research #5, SC-011)*

```bash
curl -s "http://localhost:3000/players?limit=100" -H "Authorization: Bearer $TOKEN" | jq '.data[0] | {id, changePct}'
curl -s "http://localhost:3000/players/<mismo id>" -H "Authorization: Bearer $TOKEN" | jq '{id, changePct}'
```

**Esperado**: el mismo `changePct` en la grilla y en el detalle, y el mismo valor al repetir la
petición. Si cambia entre llamadas, la simulación no está sembrada por identificador.

### E11 — Ligas del filtro *(FR-011)*

```bash
curl -s http://localhost:3000/leagues -H "Authorization: Bearer $TOKEN" | jq
```

**Esperado**: las ligas realmente presentes en el catálogo, ordenadas por nombre, con `country` y
`code`.

### E12 — Protección de los tres endpoints *(FR-017, US1 §5)*

```bash
for p in "/players" "/players/<id>" "/leagues"; do
  echo -n "$p -> "
  curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000$p"
done
```

**Esperado**: `401` en los tres, sin cuerpo de catálogo.

### E13 — Documentación en Swagger *(FR-018, SC-008)*

Abrir **http://localhost:3000/api** y verificar que `GET /players`, `GET /players/{id}` y
`GET /leagues` aparecen con todos sus parámetros nuevos, sus esquemas de respuesta y el candado
de `bearerAuth`. El botón **Authorize** debe permitir ejecutarlos desde la propia página.

### E14 — Invalidación de caché tras una ingesta *(research #8)*

```bash
curl -s "http://localhost:3000/players?limit=1" -H "Authorization: Bearer $TOKEN" | jq '.meta.total'
curl -X POST http://localhost:3000/player-stats/refresh -H "x-api-key: $ADMIN_API_KEY"
curl -s "http://localhost:3000/players?limit=1" -H "Authorization: Bearer $TOKEN" | jq '.meta.total'
```

**Esperado**: la segunda lectura refleja los datos nuevos sin esperar los 60 segundos del TTL. En
los logs, la petición posterior al refresh sale con `cacheHit: false`.

---

## Escenarios de interfaz

Con sesión iniciada en **http://localhost:5173**.

### E15 — Grilla con el componente existente *(FR-020, FR-024, US1)*

**Esperado**: la home muestra la grilla de cartas en lugar de la pantalla mínima actual. Mientras
carga hay un estado explícito, no una pantalla en blanco. Las cartas son las de
`front/src/components/player-card`, sin ninguna copia ni modificación del componente.

### E16 — Sin imágenes cargadas *(FR-026, SC-009)*

**Esperado**: como no hay fotos ni escudos, todas las cartas dibujan la silueta y el escudo con
iniciales del propio componente. Ninguna imagen rota. Las banderas sí se ven, porque el código ISO
llega desde el backend (research #7); un país no mapeado simplemente no muestra bandera.

### E17 — Filtros y su reflejo en la URL *(FR-021, research #10)*

**Esperado**: al aplicar filtros, la query string de la URL los refleja. Recargar la página
conserva la selección. El botón "atrás" deshace el último filtro. Cambiar un filtro devuelve el
listado a la primera página (US2 §7).

### E18 — Estado vacío *(FR-024, US2 §5, SC-005)*

Aplicar una combinación imposible, por ejemplo `GK` + rareza `legendary` + OVR 95–99.

**Esperado**: mensaje de estado vacío explicativo. No un error ni una grilla en blanco.

### E19 — Panel de detalle *(FR-022, US3)*

**Esperado**: al hacer clic en una carta se abre el panel lateral con las siete métricas. Elegir
otra carta sin cerrarlo lo actualiza. Cerrarlo devuelve la grilla con los mismos filtros y la
misma página (US3 §4).

### E20 — Maqueta de compra inerte *(FR-023, FR-032, FR-033, SC-007)*

**Esperado**: la gráfica de 30 días y el bloque de compra están identificados como maqueta. El
selector de cantidad y el botón de compra están deshabilitados. **Ninguna interacción dispara una
petición**: verificar en la pestaña de red del navegador que no sale nada al intentar comprar.

### E21 — Ruta protegida y sesión vencida *(FR-025, US1 §5)*

**Esperado**: sin sesión, la home redirige al login. Si la credencial vence durante la navegación,
el interceptor ya existente limpia la sesión y devuelve al login sin mostrar un error crudo.

---

## Suites automatizadas

```bash
cd back  && npm run lint && npm test && npm run test:e2e
cd front && npm run lint && npm test && npm run build
```

**Esperado**: todo en verde. `npm run build` del cliente compila bajo TypeScript en modo estricto,
que es parte del criterio de aceptación de la spec.
