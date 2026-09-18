# Tasks: Autenticación, Control de Acceso (JWT & API Key) e Interfaz de Usuario

**Input**: Design documents from `.specify/specs/05-auth/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/auth.openapi.yaml](./contracts/auth.openapi.yaml), [quickstart.md](./quickstart.md)

**Tests**: SÍ se incluyen. La spec los pide explícitamente en "Criterios de aceptación / testing" y la definición de terminado del proyecto exige tests unitarios y de integración.

**Organization**: Las tareas se agrupan por historia de usuario para que cada una pueda implementarse y verificarse por separado.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo — toca archivos distintos y no depende de tareas incompletas.
- **[US#]**: historia de usuario a la que pertenece. Setup, Foundational y Polish no llevan etiqueta.

## Path Conventions

Dos árboles hermanos, según la constitución §7: `back/src/` (NestJS) y `front/src/` (Vite + React).
`front/` **no existe todavía** — se crea entero en la fase de Setup.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dependencias nuevas del backend y andamiaje completo del cliente, que hoy no existe.

- [X] T001 Instalar `@nestjs/jwt`, `bcrypt`, `@types/bcrypt` y `@nestjs/throttler` en `back/package.json`
- [X] T002 [P] Crear el proyecto `front/` con `package.json`, `tsconfig.json`, `index.html` y `front/src/main.tsx` (Vite + React + TypeScript strict)
- [X] T003 [P] Configurar Vite y Vitest en un único `front/vite.config.ts` (research #10)
- [X] T004 [P] Configurar Tailwind en `front/tailwind.config.js`: tokens de color (deep navy, azul neón, dorado, verde neón, rojo), utilidad de bisel por `clip-path`, y la familia tipográfica sans-serif condensada con su peso en negrita para títulos (research #11, FR-025)
- [X] T005 [P] Crear `front/src/index.css` con las directivas de Tailwind y registrarlo desde `front/src/main.tsx`
- [X] T006 [P] Agregar scripts `dev`, `build`, `lint`, `test` a `front/package.json`, reflejando los de `back/package.json`
- [X] T007 Documentar en `back/.env` y `back/.env.test` las variables nuevas: `JWT_SECRET`, `JWT_EXPIRATION`, `ADMIN_API_KEY`, `AUTH_RATE_LIMIT_TTL`, `AUTH_RATE_LIMIT_MAX`, `CORS_ALLOWED_ORIGINS`
- [X] T008 [P] Crear `front/.env` con `VITE_API_BASE_URL`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: piezas transversales que cualquiera de las historias necesita.

**⚠️ CRITICAL**: ninguna historia puede comenzar hasta terminar esta fase.

- [X] T009 Validar la configuración crítica al arrancar en `back/src/main.ts`: la aplicación debe negarse a levantar si `JWT_SECRET` o `ADMIN_API_KEY` faltan o están vacíos (data-model.md, quickstart E1)
- [X] T010 [P] Crear `back/src/shared/auth/auth.constants.ts` con el nombre del header administrativo (`x-api-key`) y las claves de configuración
- [X] T011 Habilitar CORS en `back/src/main.ts` leyendo `CORS_ALLOWED_ORIGINS`, con `credentials: false` (research #9)
- [X] T012 Declarar los esquemas de seguridad `bearerAuth` y `adminApiKey` en el `DocumentBuilder` de `back/src/main.ts` (contracts/auth.openapi.yaml)

**Checkpoint**: base lista — las historias pueden comenzar.

---

## Phase 3: User Story 1 - Registro e inicio de sesión de un usuario (Priority: P1) 🎯 MVP

**Goal**: que una persona pueda registrarse, iniciar sesión y consultar el catálogo, y que sin sesión el catálogo no responda.

**Independent Test**: registrar un usuario, iniciar sesión, y comprobar que con el token se accede a `GET /players` y sin él no. No requiere que exista `front/` ni la protección administrativa.

### Tests for User Story 1 ⚠️

- [ ] T013 [P] [US1] Test de integración de registro e inicio de sesión en `back/test/auth.e2e-spec.ts`: la contraseña queda persistida como hash bcrypt y nunca se devuelve (quickstart E2)
- [ ] T014 [P] [US1] Test de integración en `back/test/auth.e2e-spec.ts`: email inexistente y contraseña incorrecta devuelven respuestas idénticas (quickstart E3, SC-006)
- [ ] T015 [P] [US1] Test de integración en `back/test/auth.e2e-spec.ts`: registro con email duplicado devuelve 409, nunca 500 ni una segunda cuenta (quickstart E4)
- [ ] T016 [P] [US1] Test de integración en `back/test/auth.e2e-spec.ts`: `GET /players` sin token, con token válido y con token manipulado devuelve 401 / 200 / 401 (quickstart E5)
- [X] T017 [P] [US1] Tests unitarios de `AuthService` en `back/src/modules/auth/auth.service.spec.ts`: normalización de email, hasheo y comparación contra hash ficticio

### Implementation for User Story 1

- [X] T018 [US1] Crear la entidad `User` en `back/src/infrastructure/database/entities/user.entity.ts` con `id`, `email` (único), `username`, `passwordHash`, `createdAt`, `updatedAt` (data-model.md)
- [X] T019 [US1] Generar la migración de la tabla `user` con índice único de email en `back/src/infrastructure/database/migrations/` mediante la CLI de MikroORM (depende de T018)
- [X] T020 [P] [US1] Crear `back/src/modules/auth/dto/register.dto.ts` con validación de email, username y contraseña de 8 caracteres mínimo
- [X] T021 [P] [US1] Crear `back/src/modules/auth/dto/login.dto.ts` con validación de email, **sin** largo mínimo de contraseña (data-model.md #3)
- [X] T022 [P] [US1] Crear `back/src/modules/auth/dto/auth-response.dto.ts` con `accessToken` y un `user` armado campo por campo, sin `passwordHash` (FR-004)
- [X] T023 [US1] Implementar `back/src/modules/auth/auth.repository.ts`: buscar por email normalizado, crear usuario y traducir la violación de unicidad a un conflicto (data-model.md #5)
- [X] T024 [US1] Implementar `back/src/modules/auth/auth.service.ts`: hasheo bcrypt con costo 10, normalización de email, comparación contra hash ficticio cuando la cuenta no existe, y emisión del JWT con payload `sub` + `username` (research #1, #5, #8)
- [X] T025 [US1] Implementar `back/src/modules/auth/auth.controller.ts` con `POST /auth/register` y `POST /auth/login`, documentados con `@nestjs/swagger` según el contrato
- [X] T026 [US1] Crear `back/src/modules/auth/auth.module.ts` registrando `JwtModule` con `JWT_SECRET` y `JWT_EXPIRATION` (depende de T023, T024, T025)
- [X] T027 [US1] Registrar `AuthModule` y `ThrottlerModule` en `back/src/app.module.ts`, con ventana y máximo leídos de `AUTH_RATE_LIMIT_TTL` y `AUTH_RATE_LIMIT_MAX` (research #7)
- [X] T028 [US1] Aplicar el límite de intentos por IP solo a las rutas de `back/src/modules/auth/auth.controller.ts` (FR-013, quickstart E13)
- [X] T029 [US1] Implementar `back/src/shared/auth/jwt-auth.guard.ts` verificando el token del header `Authorization` y rechazando ausente, inválido y vencido con el mismo 401 (research #4)
- [X] T030 [P] [US1] Implementar `back/src/shared/auth/current-user.decorator.ts` para exponer el usuario autenticado al handler
- [X] T031 [US1] Aplicar `JwtAuthGuard` y `@ApiBearerAuth()` a las dos rutas de `back/src/modules/player/player.controller.ts` (depende de T029)
- [X] T032 [US1] Aplicar `JwtAuthGuard` y `@ApiBearerAuth()` **solo** a `GET :playerId/matches` en `back/src/modules/player-stats/player-stats.controller.ts` — nunca a la clase entera (research #3, quickstart E8)
- [X] T033 [US1] Verificar que un fallo de base durante login o registro produce un 500 estandarizado sin traza ni detalle del ORM en `back/src/modules/auth/auth.service.ts` (FR-015, quickstart E14)

**Checkpoint**: US1 funciona y se verifica sola — el catálogo quedó privado y hay registro e inicio de sesión.

---

## Phase 4: User Story 2 - Proteger los procesos internos con una clave administrativa (Priority: P2)

**Goal**: que solo quien posee la clave administrativa pueda disparar ingesta, estadísticas y matching.

**Independent Test**: disparar `POST /ingestion/players` sin clave, con clave incorrecta y con la correcta. No depende de que exista ningún usuario registrado ni de US1.

### Tests for User Story 2 ⚠️

- [ ] T034 [P] [US2] Test de integración en `back/test/auth.e2e-spec.ts`: `POST /ingestion/players` sin header, con clave incorrecta y con la correcta devuelve 401 / 401 / 200 (quickstart E6)
- [ ] T035 [P] [US2] Test de integración en `back/test/auth.e2e-spec.ts`: una sesión de usuario válida **sin** clave administrativa es rechazada con 401 (FR-011, quickstart E7)
- [ ] T036 [P] [US2] Test de integración en `back/test/auth.e2e-spec.ts`: `GET /player-stats/:playerId/matches` con JWT y `POST /player-stats/refresh` con API Key funcionan ambos, comprobando que los guards se aplicaron por ruta (quickstart E8)

### Implementation for User Story 2

- [X] T037 [US2] Implementar `back/src/shared/auth/api-key.guard.ts` comparando el header `x-api-key` contra `ADMIN_API_KEY`, sin aceptar nunca un valor vacío o indefinido
- [X] T038 [P] [US2] Aplicar `ApiKeyGuard` y `@ApiSecurity('adminApiKey')` a `back/src/modules/ingestion/ingestion.controller.ts` (depende de T037)
- [X] T039 [P] [US2] Aplicar `ApiKeyGuard` y `@ApiSecurity('adminApiKey')` **solo** a `POST refresh` en `back/src/modules/player-stats/player-stats.controller.ts` (research #3)
- [X] T040 [P] [US2] Aplicar `ApiKeyGuard` y `@ApiSecurity('adminApiKey')` a `back/src/modules/team-whoscored-matching/team-whoscored-matching.controller.ts`
- [X] T041 [US2] Confirmar que `GET /` de `back/src/app.controller.ts` permanece público, sin guard (research #3)

**Checkpoint**: US1 y US2 funcionan de forma independiente. El backend está completo.

---

## Phase 5: User Story 3 - Interfaz de Login y Registro (Priority: P3)

**Goal**: pantallas de registro e inicio de sesión con la estética de tarjeta coleccionable, validación previa al envío y sesión establecida en el cliente.

**Independent Test**: abrir las pantallas, comprobar la validación de campos vacíos y de formato de email antes de que salga ninguna petición, y que un inicio de sesión exitoso deja a la persona dentro de la aplicación.

### Tests for User Story 3 ⚠️

- [X] T042 [P] [US3] Test de Vitest en `front/src/pages/__tests__/validation.test.ts`: campos vacíos y email mal formado no disparan ninguna petición (FR-017, quickstart E9)
- [X] T043 [P] [US3] Test de Vitest en `front/src/services/__tests__/http-client.test.ts`: el interceptor adjunta `Authorization: Bearer` cuando hay sesión y no lo adjunta cuando no la hay (FR-018, quickstart E10)

### Implementation for User Story 3

- [X] T044 [US3] Implementar `front/src/services/http-client.ts` con la **única** instancia de Axios del proyecto y su interceptor de request (constitución §7)
- [X] T045 [P] [US3] Implementar `front/src/services/session-storage.ts` para leer, escribir y borrar la credencial en `localStorage` (FR-019)
- [X] T046 [P] [US3] Implementar `front/src/services/auth.service.ts` con las llamadas de registro e inicio de sesión según `contracts/auth.openapi.yaml`
- [X] T047 [US3] Implementar `front/src/services/AuthProvider.tsx` sobre Context API como única fuente de verdad de la sesión (FR-021, depende de T045)
- [X] T048 [US3] Implementar `front/src/services/useAuth.ts` exponiendo sesión, registro, inicio y cierre de sesión (depende de T047)
- [X] T049 [P] [US3] Crear los componentes de `front/src/components/`: `Input.tsx`, `Button.tsx` y `FieldError.tsx`, con la paleta, las etiquetas de alto contraste y el rojo de alto contraste para errores (FR-025, FR-026)
- [X] T050 [P] [US3] Implementar `front/src/components/AuthLayout.tsx`: contenedor con esquinas biseladas, fondo oscuro, resplandor neón azul, y títulos con la tipografía condensada en negrita (FR-023, FR-024, FR-025)
- [X] T051 [US3] Implementar `front/src/pages/LoginPage.tsx` con validación previa al envío (depende de T048, T049, T050)
- [X] T052 [US3] Implementar `front/src/pages/RegisterPage.tsx` con validación previa al envío (depende de T048, T049, T050)
- [X] T053 [P] [US3] Implementar `front/src/components/ProtectedRoute.tsx` redirigiendo a `/login` sin sesión (FR-020, quickstart E11)
- [X] T054 [US3] Definir las rutas públicas y protegidas en `front/src/app/App.tsx` con React Router, envolviendo las protegidas con `ProtectedRoute` (depende de T051, T052, T053)
- [X] T055 [US3] Completar `front/src/app/App.tsx` montando el `AuthProvider` **adentro** del Router — si queda afuera no puede redirigir y fallan FR-020 y FR-022 (depende de T047, T054; mismo archivo que T054, no paralelizar)

**Checkpoint**: las tres primeras historias funcionan. La aplicación es usable de punta a punta.

---

## Phase 6: User Story 4 - Recuperación limpia ante una sesión vencida (Priority: P4)

**Goal**: que una sesión vencida o inválida se descarte sola y lleve a la persona de vuelta al inicio de sesión, sin pantallas en estado inconsistente.

**Independent Test**: con una credencial vencida o alterada, provocar una petición protegida y comprobar que el estado se limpia y hay redirección, sin datos de la sesión anterior en pantalla.

### Tests for User Story 4 ⚠️

- [X] T056 [P] [US4] Test de Vitest en `front/src/services/__tests__/rehydration.test.ts`: al arrancar con una credencial vigente almacenada, la sesión se recupera sin pedir credenciales (FR-021, quickstart E12)
- [X] T057 [P] [US4] Test de Vitest en `front/src/services/__tests__/unauthorized.test.ts`: un rechazo por falta de autenticación limpia el estado y la credencial almacenada (FR-022)

### Implementation for User Story 4

- [X] T058 [US4] Agregar el interceptor de respuesta en `front/src/services/http-client.ts`: ante un rechazo por falta de autenticación, borrar la credencial, limpiar el estado y redirigir a `/login` (FR-022, depende de T044)
- [X] T059 [US4] Implementar la rehidratación de sesión al arrancar en `front/src/services/AuthProvider.tsx` (FR-021, depende de T047)

**Checkpoint**: las cuatro historias quedan funcionando de forma independiente.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T060 [P] Verificar en `/api` que Swagger muestra ambos endpoints de auth, los dos esquemas de seguridad y el candado en cada endpoint protegido (FR-027)
- [ ] T061 [P] Actualizar la colección de Postman con `/auth/register`, `/auth/login` y los headers de autorización en las peticiones ya existentes (FR-027)
- [X] T062 [P] Confirmar en `back/src/modules/auth/auth.service.ts` que los intentos fallidos de login se registran con `PinoLoggerService` sin la contraseña ni el email en claro (constitución §4)
- [X] T063 Correr `npm run lint` y `npm run build` en `back/` y en `front/`, sin errores
- [ ] T064 Correr `npm run test` y `npm run test:e2e` en `back/`, y `npm run test` en `front/`
- [ ] T065 Ejecutar los 14 escenarios de [quickstart.md](./quickstart.md), incluido E1 (arranque sin configuración crítica) y E3 (comparación de tiempos de respuesta)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup. Bloquea todas las historias.
- **US1 (Phase 3)** y **US2 (Phase 4)**: dependen solo de Foundational. Son independientes entre sí y pueden ir en paralelo.
- **US3 (Phase 5)**: depende de Foundational y del andamiaje de `front/` (T002–T006). Puede escribirse contra el contrato antes de que US1 esté terminada, pero recién se valida de verdad con US1 andando.
- **US4 (Phase 6)**: depende de US3 — extiende el `http-client` y el `AuthProvider` que US3 crea.
- **Polish (Phase 7)**: depende de todo lo anterior.

### Dentro de cada historia

- Los tests se escriben antes y deben fallar antes de implementar.
- Entidad → migración → DTOs → repository → service → controller → module → guards → aplicación de guards.
- En el cliente: `services/` (http-client, almacenamiento, provider, hook) → `components/` → `pages/` → rutas y composición en `App.tsx`.

### Conflictos de archivo a tener en cuenta

- **T032 y T039 tocan el mismo archivo** (`player-stats.controller.ts`) desde historias distintas: no marcar ninguna como `[P]` entre sí y no correrlas a la vez.
- **T027 modifica `app.module.ts`** y **T009, T011, T012 modifican `main.ts`**: agrupar esas ediciones o hacerlas en serie.
- **T044 (US3) y T058 (US4) tocan `http-client.ts`**: T058 extiende lo que T044 crea.
- **T054 y T055 tocan `App.tsx`**: son dos pasos ordenados sobre el mismo archivo (primero el mapa de rutas, después el envoltorio de sesión); no correrlas en paralelo.

### Parallel Opportunities

- Setup: T002 a T006 y T008 en paralelo (T001 aparte, es el otro árbol).
- Foundational: T010 en paralelo; T009, T011 y T012 en serie por compartir `main.ts`.
- US1: los cinco tests (T013–T017) en paralelo; los tres DTOs (T020–T022) en paralelo.
- US2: los tres tests (T034–T036) en paralelo; T038 y T040 en paralelo entre sí.
- US3: T042 y T043 en paralelo; T045, T046, T049, T050 y T053 en paralelo.
- US1 y US2 completas pueden repartirse entre dos personas apenas termina Foundational.

---

## Parallel Example: User Story 1

```bash
# Los cinco tests de US1, juntos:
Task: "Test de registro e inicio de sesión en back/test/auth.e2e-spec.ts"
Task: "Test de indistinguibilidad del login fallido en back/test/auth.e2e-spec.ts"
Task: "Test de email duplicado en back/test/auth.e2e-spec.ts"
Task: "Test de catálogo protegido en back/test/auth.e2e-spec.ts"
Task: "Tests unitarios de AuthService en back/src/modules/auth/auth.service.spec.ts"

# Los tres DTOs, juntos:
Task: "register.dto.ts en back/src/modules/auth/dto/"
Task: "login.dto.ts en back/src/modules/auth/dto/"
Task: "auth-response.dto.ts en back/src/modules/auth/dto/"
```

---

## Implementation Strategy

### MVP (solo User Story 1)

1. Phase 1 — Setup. Para el MVP alcanza con T001 y T007: el andamiaje de `front/` no hace falta.
2. Phase 2 — Foundational completa.
3. Phase 3 — User Story 1.
4. **PARAR Y VALIDAR**: escenarios E2 a E5 de quickstart.md.

Eso ya entrega el cambio de fondo: el catálogo deja de ser público y el sistema tiene identidad de usuario.

### Entrega incremental

1. **MVP** — US1: hay usuarios y el catálogo es privado.
2. **+ US2** — los procesos internos quedan cerrados. El backend está terminado y es el corte natural si hace falta entregar algo completo y coherente.
3. **+ US3** — aparece el cliente web. Es el tramo más largo de todos: 14 tareas y un árbol que hoy no existe.
4. **+ US4** — la sesión vencida se maneja con elegancia.

### Reparto del trabajo

- US1 y US2 son independientes: dos personas en paralelo apenas termina Foundational.
- US3 depende del andamiaje de `front/`, no de US1: quien lo tome puede arrancar con T002–T006 mientras otra persona hace US1, y trabajar contra `contracts/auth.openapi.yaml`.
- US4 es corto y conviene que lo tome quien haya hecho US3.
