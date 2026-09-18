# Implementation Plan: Autenticación, Control de Acceso (JWT & API Key) e Interfaz de Usuario

**Branch**: `05-auth` | **Date**: 2026-09-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `.specify/specs/05-auth/spec.md`

## Summary

Cerrar el acceso al sistema con dos controles independientes y levantar el cliente web del
proyecto. El trabajo se parte en tres bloques de tamaño muy distinto:

1. **Identidad y sesión (backend)**: entidad `User`, módulo de dominio `auth` con
   `/auth/register` y `/auth/login`, hasheo con bcrypt y emisión de JWT.
2. **Control de acceso (backend)**: dos guards en `/back/src/shared/auth/` —  JWT para las
   lecturas de catálogo, API Key para los disparos de ingesta/matching— aplicados **por ruta**,
   porque `player-stats` mezcla en un mismo controller un endpoint de usuario y uno
   administrativo (research #3). Cuatro controllers existentes se modifican solo para
   decorarse; ninguna lógica de negocio previa cambia.
3. **Cliente web (`/front`, desde cero)**: es el bloque más grande y el único sin ninguna base
   previa — el repositorio hoy no tiene frontend. Incluye el andamiaje completo de Vite +
   React + Tailwind + React Router + Vitest, la capa `services/` con la instancia única de Axios y
   su interceptor, el `AuthProvider` sobre Context API, y las pantallas de login/registro con
   la estética de tarjeta biselada.

El orden de entrega sigue las prioridades de la spec: US1 y US2 son backend puro y verificables
por API sin que exista una sola línea de frontend; US3 y US4 dependen de que `/front` exista.

## Technical Context

**Language/Version**: TypeScript 6 (`strict: true`) en ambos árboles — Node.js LTS en `/back`,
navegador (ES2022, bundle de Vite) en `/front`.

**Primary Dependencies**:
- `/back`: NestJS 12, MikroORM 7, `@nestjs/swagger`, `class-validator` — ya presentes.
  **Nuevas**: `@nestjs/jwt` (emisión/verificación), `bcrypt` (+ `@types/bcrypt`) y
  `@nestjs/throttler` (rate limit). No se incorpora Passport: los guards se escriben a mano
  sobre `@nestjs/jwt`, que es menos superficie para el mismo resultado (research #2).
- `/front`: **todo nuevo** — Vite, React, React Router, Tailwind CSS, Axios, Vitest. Es
  exactamente la lista autorizada por la constitución §2, sin agregados.

**Storage**: PostgreSQL, misma instancia y esquema. Una tabla nueva: `user`. Redis no participa
de esta feature (research #6): no hay lectura cacheable nueva, y el rate limit usa el
almacenamiento en memoria por defecto de `@nestjs/throttler`, suficiente para un despliegue de
una sola instancia.

**Testing**: Jest + supertest en `/back` (mismo setup y scripts existentes); Vitest en `/front`,
con el renderizado apoyado en las utilidades propias de React —  la constitución §2 no autoriza
ninguna librería adicional de testing. Los dos runners conviven sin unificarse (constitución §2).

**Target Platform**: servidor Node.js (API REST NestJS) + SPA servida por Vite en el navegador.

**Project Type**: web application (backend + frontend). Es la primera feature del proyecto con
los dos árboles.

**Performance Goals**: sin objetivos de throughput. El único punto sensible es el costo
deliberado de bcrypt: el factor de trabajo se fija en 10 rondas (research #1), que mantiene
`/auth/login` por debajo del rango en que se volvería molesto en uso interactivo.

**Constraints**: la contraseña nunca viaja ni se persiste en claro, y ninguna respuesta la
expone ni expone su hash; el login falla siempre con el mismo mensaje y el mismo código, exista
o no la cuenta; una sesión de usuario válida jamás habilita un endpoint administrativo; una
caída de la base durante login/registro devuelve un 500 estandarizado sin traza.

**Scale/Scope**: proyecto académico, decenas de usuarios. El alcance real está en la superficie
tocada, no en el volumen: 1 entidad nueva, 1 módulo de dominio nuevo, 2 guards, 4 controllers
existentes modificados, y un árbol `/front` completo creado desde cero.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Regla de la constitución | Cumplimiento planeado |
|---|---|
| Stack backend estricto (§2) | ✅ Los pilares arquitectónicos no cambian. Las 3 librerías utilitarias nuevas (`@nestjs/jwt`, `bcrypt`, `@nestjs/throttler`) entran por la cláusula de librerías utilitarias de §2 (v2.1.0), que exige justificarlas en Complexity Tracking — ver #1. |
| Stack frontend estricto (§2) | ✅ Vite, React, React Router, Tailwind CSS, Axios, Context API nativa y Vitest — la lista autorizada, sin un solo agregado. |
| Lenguaje TypeScript estricto en todo el repo (§2) | ✅ Ambos árboles con `strict: true`. |
| Capas Controller/Service/Repository/Adapter (§3, backend) | ✅ `auth` es el quinto módulo de dominio, con las cuatro capas. No hay proveedor externo involucrado, así que no interviene la capa Adapter. |
| Entidades solo en `/infrastructure/database/entities/` (§7) | ✅ `user.entity.ts` ahí y en ningún otro lado. No se replica el tipo dentro de `/front` (§7). |
| Módulo de dominio con estructura fija de 5 elementos (§7) | ✅ `/back/src/modules/auth/` con `.module/.controller/.service/.repository/dto/` exactos. Los guards **no** van ahí: son transversales y viven en `/back/src/shared/auth/` (research #4). |
| `controller.ts` obligatorio (§7) | ✅ `auth.controller.ts` tiene necesidad de HTTP genuina — no hace falta invocar la regla del endpoint de disparo manual. |
| Estructura de `/front/src/` (§7) | ✅ `pages/`, `components/`, `services/`, `app/` exactamente como fija §7 desde la v2.0.0. |
| Instancia única de Axios + interceptor en `/front/src/services/` (§7) | ✅ Es la pieza central de FR-018/FR-022. Ninguna página ni componente instancia Axios ni lo invoca directo. |
| Documentación Swagger obligatoria (§2, §6) | ✅ `/auth/register` y `/auth/login` documentados; además se declaran los dos esquemas de seguridad y se marcan los endpoints ya existentes que pasan a estar protegidos. |
| Validación estricta de inputs vía DTOs (§4) | ✅ `RegisterDto` y `LoginDto` con `class-validator`, bajo el `ValidationPipe` global que ya corre con `whitelist` y `forbidNonWhitelisted`. |
| Manejo seguro de tokens de autenticación (§4) | ✅ Secreto por entorno, payload sin datos sensibles, vigencia acotada, hasheo bcrypt, mensaje de error genérico, rate limit. |
| Logs estructurados + Correlation IDs (§4) | ✅ Reusa `PinoLoggerService` y el middleware existente. Los intentos fallidos de login se loguean **sin** la contraseña ni el email en claro. |
| Registro inmutable de transacciones financieras (§4) | N/A — esta feature no toca tokens ni operaciones de mercado. Sienta la entidad `User` sobre la que esa auditoría se apoyará después. |
| Scheduler (§4) | N/A — no hay proceso periódico en esta feature. |
| Redis obligatorio para consultas frecuentes (§2) | N/A — no se introduce ninguna lectura cacheable (research #6). |
| Resiliencia a fallas externas (§3) | ✅ Caída de la base en login/registro → 500 estandarizado sin traza (FR-015). No hay proveedor externo en juego. |
| No generar mocks si corresponde Adapter/MikroORM (§6) | ✅ `AuthRepository` usa MikroORM real; los tests de integración corren contra la base de test ya configurada (`.env.test`). |
| Validar saldos/disponibilidad antes de transaccionar (§6) | N/A — sin transacciones de negocio en esta feature. |

**Resultado del gate:** PASA sin desviaciones. Las 3 librerías utilitarias que en la versión
anterior de este plan constaban como desviación quedaron regularizadas por la cláusula de
librerías utilitarias que la constitución v2.1.0 agregó a §2; Complexity Tracking #1 se
conserva porque esa misma cláusula exige la justificación por escrito. Tampoco hay
violaciones estructurales: la ubicación de los guards y la estructura de ambos árboles
respetan §7 tal como está escrita.

**Re-evaluación post-Phase 1 (diseño cerrado):** el gate sigue en PASA. El diseño no
introdujo violaciones nuevas y cerró dos puntos que en el gate previo eran intención y ahora
son decisión registrada: los guards quedan fuera de `/modules/` (research #4), con lo cual la
regla de los 5 elementos exactos de §7 se cumple sin invocar ninguna excepción; y la única
anotación de dependencias (Complexity Tracking #1) dejó de ser una desviación al entrar la
cláusula de §2 (v2.1.0) y pasó a ser la justificación que esa cláusula exige, sin que
Phase 1 haya agregado ningún paquete más a los tres ya justificados.

## Project Structure

### Documentation (this feature)

```text
.specify/specs/05-auth/
├── plan.md                     # Este archivo
├── research.md                 # Phase 0 output
├── data-model.md               # Phase 1 output
├── quickstart.md               # Phase 1 output
├── contracts/
│   └── auth.openapi.yaml       # Phase 1 output
├── checklists/
│   └── requirements.md         # de /speckit-specify
└── tasks.md                    # Phase 2 output (/speckit-tasks, NO generado por /speckit-plan)
```

### Source Code (repository root)

```text
back/
├── src/
│   ├── infrastructure/database/
│   │   ├── entities/
│   │   │   └── user.entity.ts                    # NUEVA
│   │   └── migrations/
│   │       └── <nueva>.ts                        # NUEVA: create table "user" (email unique)
│   ├── shared/
│   │   └── auth/                                 # NUEVO — transversal, consumido por 4 módulos
│   │       ├── jwt-auth.guard.ts                 # protege lecturas de catálogo
│   │       ├── api-key.guard.ts                  # protege disparos administrativos
│   │       ├── current-user.decorator.ts         # expone el usuario autenticado al handler
│   │       └── auth.constants.ts                 # nombres de header y claves de config
│   ├── modules/
│   │   ├── auth/                                 # NUEVO módulo de dominio (5º)
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts                # POST /auth/register, POST /auth/login
│   │   │   ├── auth.service.ts                   # hasheo, verificación, emisión de JWT
│   │   │   ├── auth.repository.ts                # persistencia de User vía MikroORM
│   │   │   └── dto/
│   │   │       ├── register.dto.ts
│   │   │       ├── login.dto.ts
│   │   │       └── auth-response.dto.ts
│   │   ├── player/player.controller.ts           # MODIFICAR: + @UseGuards(JwtAuthGuard)
│   │   ├── player-stats/player-stats.controller.ts # MODIFICAR: guard POR RUTA (research #3)
│   │   ├── ingestion/ingestion.controller.ts     # MODIFICAR: + @UseGuards(ApiKeyGuard)
│   │   └── team-whoscored-matching/…controller.ts # MODIFICAR: + @UseGuards(ApiKeyGuard)
│   ├── app.module.ts                             # MODIFICAR: + AuthModule, + ThrottlerModule
│   └── main.ts                                   # MODIFICAR: + CORS, + esquemas de seguridad Swagger
└── test/
    └── auth.e2e-spec.ts                          # NUEVO: escenarios de US1 y US2

front/                                            # NUEVO ÁRBOL COMPLETO
├── package.json
├── vite.config.ts                                # incluye la config de Vitest
├── tailwind.config.js
├── tsconfig.json
├── index.html
└── src/
    ├── main.tsx
    ├── app/
    │   └── App.tsx                               # arranque, Router + AuthProvider, y rutas públicas vs protegidas
    ├── pages/                                    # §7: una vista por ruta
    │   ├── LoginPage.tsx
    │   └── RegisterPage.tsx
    ├── components/                               # §7: UI reutilizable, sin acceso a HTTP
    │   ├── AuthLayout.tsx                        # contenedor con esquinas biseladas
    │   ├── ProtectedRoute.tsx
    │   ├── Input.tsx
    │   ├── Button.tsx
    │   └── FieldError.tsx
    └── services/                                 # §7: HTTP + estado de sesión
        ├── api.ts                        # la única instancia de Axios del proyecto
        ├── auth.service.ts                       # register / login
        ├── AuthProvider.tsx                      # Context API: única fuente de verdad
        ├── useAuth.ts
        ├── session-storage.ts                    # lectura/escritura de la credencial
        └── __tests__/                            # Vitest
```

**Structure Decision**: web application con los dos árboles hermanos que fija la constitución
§7 — `/back` conserva intacto su patrón vertical-slice y suma su quinto módulo de dominio;
`/front` se crea desde cero siguiendo `pages/ · components/ · services/ · app/`, el layout plano que fija §7 desde la constitución v2.0.0 — los dos árboles se organizan con criterios distintos a propósito. La decisión no
trivial es colocar los guards en `/back/src/shared/auth/` y no dentro de `modules/auth/`:
los consumen cuatro módulos distintos, y §7 reserva la lista de 5 archivos "exactos" para las
carpetas bajo `/modules/`, mientras que `/back/src/shared/` ya es el lugar establecido del
proyecto para código transversal (`shared/logging/`, `shared/matching/`). Ver research #4.

## Complexity Tracking

> Requerido por la cláusula de librerías utilitarias de §2 (v2.1.0), que exige justificar acá toda librería utilitaria nueva del backend.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 3 librerías utilitarias de backend fuera de los pilares de §2 (`@nestjs/jwt`, `bcrypt`, `@nestjs/throttler`) | No hay forma de cumplir FR-003 (bcrypt, que la spec nombra explícitamente), FR-006 (emisión de JWT) ni FR-013 (rate limit) sin ellas. Ninguna reemplaza ni compite con un pilar, y cada una resuelve un problema acotado que ningún pilar cubre —las tres condiciones que §2 (v2.1.0) exige para una librería utilitaria. | Implementar hasheo o firma de JWT a mano sería criptografía propia: más superficie de error y peor que la alternativa en el punto exacto donde el proyecto menos puede permitírselo. Passport se descartó aparte por agregar dos paquetes más para el mismo resultado (research #2). |
