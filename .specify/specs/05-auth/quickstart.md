# Quickstart — Validación de 05-auth

Guía para comprobar que la feature funciona de punta a punta. No es documentación de
implementación: los detalles de diseño están en [plan.md](./plan.md), [research.md](./research.md),
[data-model.md](./data-model.md) y [contracts/auth.openapi.yaml](./contracts/auth.openapi.yaml).

---

## Prerrequisitos

- PostgreSQL y Redis levantados (mismo entorno que las features anteriores).
- `/back/.env` con las variables de [data-model.md](./data-model.md#configuración-por-entorno).
  Sin `JWT_SECRET` ni `ADMIN_API_KEY` la aplicación **debe negarse a arrancar** — eso ya es el
  primer escenario a validar.
- Catálogo con al menos un jugador cargado (`POST /ingestion/players` de la feature 02), para
  poder comprobar que las lecturas quedaron protegidas.

## Puesta en marcha

```bash
# Backend
cd back
npm install
npx mikro-orm migration:up     # crea la tabla user
npm run start:dev              # http://localhost:3000, Swagger en /api

# Frontend (otra terminal)
cd front
npm install
npm run dev                    # http://localhost:5173
```

## Suites automatizadas

```bash
cd back && npm run test && npm run test:e2e
cd front && npm run test
```

---

## Escenarios de validación

### E1 — Arranque sin configuración crítica (edge case)

1. Quitar `ADMIN_API_KEY` de `/back/.env` y arrancar.

**Esperado**: la aplicación no levanta y falla con un mensaje claro sobre la variable faltante.
Si levanta, los endpoints administrativos quedaron comparando contra un valor indefinido.
Restaurar la variable antes de seguir.

### E2 — Registro e inicio de sesión (US1)

1. `POST /auth/register` con email, username y contraseña de 8+ caracteres.
2. `POST /auth/login` con esas credenciales.

**Esperado**: `201` y `200` respectivamente, ambos con `accessToken` y un `user` sin ningún campo
de contraseña. Inspeccionar la tabla `user` en la base: la columna `passwordHash` contiene un
hash bcrypt (prefijo `$2b$`), en ningún caso la contraseña tal como se envió.

### E3 — El login no revela si la cuenta existe (SC-006)

1. `POST /auth/login` con un email **inexistente**.
2. `POST /auth/login` con el email de E2 y una contraseña **incorrecta**.

**Esperado**: las dos respuestas son idénticas — `401` y el mismo cuerpo, `"Credenciales
inválidas"`. Comparar además los tiempos de respuesta: deben ser del mismo orden. Si el caso del
email inexistente responde notoriamente más rápido, la comparación contra hash ficticio de
research #8 no está implementada y el oráculo sigue abierto.

### E4 — Email duplicado y concurrencia

1. `POST /auth/register` repitiendo el email de E2.
2. Lanzar dos registros simultáneos con un email nuevo e idéntico.

**Esperado**: el primero da `409`. En el segundo caso, exactamente una cuenta queda creada y la
otra petición recibe `409` — nunca un `500` ni dos cuentas con el mismo email.

### E5 — El catálogo quedó privado (US1 / FR-009)

1. `GET /players` **sin** header `Authorization`.
2. `GET /players` con `Authorization: Bearer <token de E2>`.
3. `GET /players` con un token manipulado (cambiar un carácter del payload).

**Esperado**: `401`, `200`, `401`. El caso 3 se rechaza igual que el 1, sin pistas sobre por qué.

### E6 — Los procesos internos exigen la clave administrativa (US2 / FR-010)

1. `POST /ingestion/players` sin ningún header.
2. Con `x-api-key` incorrecta.
3. Con `x-api-key` correcta.

**Esperado**: `401`, `401`, y en el tercer caso el proceso se ejecuta.

### E7 — La sesión de usuario no abre la puerta administrativa (FR-011)

1. `POST /ingestion/players` con `Authorization: Bearer <token válido de E2>` y **sin** `x-api-key`.

**Esperado**: `401`. Es el escenario que distingue los dos controles: si esto devuelve `200`, los
guards se están aplicando como si fueran uno solo.

### E8 — Lectura y disparo conviven en el mismo controller (research #3)

1. `GET /player-stats/<playerId>/matches` con JWT y sin `x-api-key`.
2. `POST /player-stats/refresh` con `x-api-key` y sin JWT.

**Esperado**: ambos `200`. Es la comprobación de que los guards se aplicaron por ruta: si alguno
da `401`, se decoró la clase entera en vez de cada ruta.

### E9 — Formularios y validación en cliente (US3 / FR-017)

1. Abrir `/register` y enviar el formulario vacío.
2. Cargar un email con formato inválido y enviar.
3. Registrarse correctamente.

**Esperado**: en 1 y 2 no sale ninguna petición de red (verificable en la pestaña Network) y los
campos en error se muestran con el rojo de alto contraste. En 3, la persona queda autenticada.
Visualmente: contenedor con esquinas biseladas, fondo oscuro, resplandor azul, botón primario
dorado.

### E10 — El interceptor adjunta la credencial (FR-018)

1. Ya autenticado, navegar a una pantalla que consuma el catálogo.

**Esperado**: en Network, el request a `/players` lleva `Authorization: Bearer …` sin que ninguna
pantalla lo haya puesto a mano.

### E11 — Ruta protegida sin sesión (FR-020)

1. Cerrar sesión (o abrir una ventana privada) y entrar directo a una URL protegida.

**Esperado**: redirección a `/login`, sin que llegue a verse el contenido protegido.

### E12 — Rehidratación y expiración (US4)

1. Autenticado, recargar la página.
2. Borrar la credencial de `localStorage` desde DevTools y provocar una petición protegida.
3. Alterar el valor guardado para simular un token vencido y provocar otra petición.

**Esperado**: en 1 la sesión sobrevive sin volver a pedir credenciales. En 2 y 3, la aplicación
descarta el estado, redirige a `/login` y no queda ninguna pantalla mostrando datos de la sesión
anterior.

### E13 — Límite de intentos (FR-013)

1. Repetir `POST /auth/login` con contraseña incorrecta más de 5 veces en un minuto.

**Esperado**: a partir del sexto intento, `429`. Esperar la ventana y comprobar que vuelve a
aceptar peticiones.

### E14 — Caída de la base (FR-015)

1. Detener PostgreSQL y hacer `POST /auth/login`.

**Esperado**: `500` con un cuerpo genérico. **No** debe aparecer el nombre del ORM, la consulta,
ni la traza. Volver a levantar la base.

---

## Definición de terminado

- Los 14 escenarios pasan.
- `npm run test` y `npm run test:e2e` en `/back`, y `npm run test` en `/front`, en verde.
- `npm run lint` y `npm run build` en ambos árboles, sin errores.
- Swagger en `/api` muestra los dos endpoints de auth, los dos esquemas de seguridad, y el
  candado en los endpoints protegidos.
- Colección de Postman actualizada con `/auth/register`, `/auth/login` y los headers de
  autorización en las peticiones ya existentes.
