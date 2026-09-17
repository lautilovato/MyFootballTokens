# Phase 0 — Research: 05-auth

Decisiones tomadas antes de diseñar, con su alternativa descartada. Todo lo que acá queda
resuelto no debe volver a decidirse durante la implementación.

---

## #1 — Algoritmo y factor de trabajo del hasheo

**Decision**: `bcrypt` con factor de trabajo (cost) **10**, fijado como constante del módulo de
auth, no configurable por entorno.

**Rationale**: la spec manda bcrypt explícitamente (FR-003), así que el algoritmo no está en
discusión; lo que sí había que decidir es el costo. 10 rondas es el valor por defecto de la
librería y mantiene el login en el orden de las decenas de milisegundos, que es lo que se
necesita para que el endpoint sea usable de forma interactiva sin regalar el costo que hace
valioso al hasheo lento. Se deja como constante y no como variable de entorno porque un valor
mal configurado en producción degrada la seguridad en silencio, sin que ningún test lo note.

**Alternatives considered**:
- *Costo configurable por env*: rechazado por lo anterior — es una palanca que solo puede
  apuntar hacia abajo sin que nadie se entere.
- *argon2*: mejor primitiva en abstracto, pero contradice a FR-003, que dice bcrypt.
- `bcryptjs` *(implementación pura en JS)*: no requiere binarios nativos, pero es varias veces
  más lento para el mismo costo; `bcrypt` con bindings nativos es la opción estándar.

---

## #2 — Emisión y verificación del JWT: `@nestjs/jwt` solo, sin Passport

**Decision**: usar `@nestjs/jwt` para firmar y verificar, y escribir `JwtAuthGuard` a mano
implementando `CanActivate`. No se incorpora `@nestjs/passport` ni `passport-jwt`.

**Rationale**: FR-012 exige que la protección viva en el sistema de Guards y esté aislada de los
controladores — eso se cumple igual con un guard propio. Passport aporta valor cuando hay varias
estrategias de autenticación (OAuth, SSO, local, sesiones); acá hay exactamente una, y la spec
pone SSO explícitamente fuera de alcance. Traerlo significaría dos paquetes más y una capa de
indirección para leer un header y verificar una firma, que es todo lo que hace falta.

**Alternatives considered**:
- *`@nestjs/passport` + `passport-jwt`*: es el camino más documentado y sería la elección
  correcta si SSO estuviera previsto a corto plazo. Queda como la migración natural el día que
  se incorpore; nada de este diseño la impide.

---

## #3 — Los guards se aplican por ruta, no por controller

**Decision**: decorar **rutas individuales**, no clases enteras. Reparto concreto:

| Ruta existente | Guard |
|---|---|
| `GET /players` | `JwtAuthGuard` |
| `GET /players/:id` | `JwtAuthGuard` |
| `GET /player-stats/:playerId/matches` | `JwtAuthGuard` |
| `POST /player-stats/refresh` | `ApiKeyGuard` |
| `POST /ingestion/players` | `ApiKeyGuard` |
| `POST /team-whoscored-matching/refresh` | `ApiKeyGuard` |
| `GET /` (`app.controller`) | sin guard — health check público |

**Rationale**: es un hallazgo de la inspección del código, no una preferencia de estilo.
`player-stats.controller.ts` expone en la misma clase `POST refresh` (administrativo) y
`GET :playerId/matches` (lectura de catálogo, de usuario). Un `@UseGuards` a nivel de clase
aplicaría un único criterio a ambos y rompería FR-009 o FR-010 según cuál se eligiera. Aplicar
por ruta es la única forma de respetar el reparto que pide la spec.

El health check queda público a propósito: un chequeo de vida que exige credenciales no sirve
para lo que existe, y la constitución §4 lo pide como pieza de observabilidad.

**Alternatives considered**:
- *Guard global + decorador `@Public()` para excepciones*: menos repetición y más difícil de
  olvidar al agregar endpoints. Se descartó porque invertiría el default de todos los endpoints
  del proyecto de una sola vez, que es un cambio de alcance mayor al de esta spec; queda
  anotado como mejora posterior.
- *Partir `player-stats` en dos controllers*: reordenaría código de `03-ingesta-stats` sin que
  esta feature lo necesite.

---

## #4 — Los guards viven en `/back/src/shared/auth/`, no en `modules/auth/`

**Decision**: `jwt-auth.guard.ts`, `api-key.guard.ts`, `current-user.decorator.ts` y
`auth.constants.ts` van en `/back/src/shared/auth/`. `modules/auth/` conserva exactamente los
5 elementos que fija la constitución §7.

**Rationale**: §7 enumera 5 elementos "exactos" para las carpetas bajo `/modules/`, con una única
excepción para utilidades puras sin framework. Un guard **no** califica para esa excepción: usa
decoradores de NestJS e inyección de dependencias. Pero tampoco necesita forzarla, porque los
guards no pertenecen al dominio `auth`: los consumen `player`, `player-stats`, `ingestion` y
`team-whoscored-matching`. Son código transversal, y `/back/src/shared/` es el lugar que el
proyecto ya estableció para eso (`shared/logging/`, `shared/matching/` — esta última movida ahí
en la feature 04 exactamente cuando dos dominios necesitaron compartirla).

**Alternatives considered**:
- *Guards dentro de `modules/auth/`*: obligaría a los otros cuatro módulos a importar del
  interior de un módulo de dominio ajeno, que es precisamente el acoplamiento que §7 evita, y
  además tensionaría la palabra "exactamente".

---

## #5 — Qué entra en el payload del JWT

**Decision**: solo `sub` (id del usuario) y `username`, más los `iat`/`exp` estándar. El email
**no** entra.

**Rationale**: FR-007 limita el payload a información no sensible. Un JWT va en claro —está
firmado, no cifrado— y queda en `localStorage`, así que todo lo que se meta es legible por
cualquiera que acceda al token. El email es un dato personal y es además el identificador de
login: no hay ninguna pantalla de esta spec que lo necesite del token, y el día que haga falta
se pide al backend con la sesión ya establecida.

**Alternatives considered**:
- *Incluir el email para ahorrarse una llamada*: se descartó por lo anterior; el ahorro es
  marginal y el costo es exponer un dato personal en un valor que viaja en cada request.

---

## #6 — Redis no participa de esta feature

**Decision**: no se usa Redis. El rate limit de `@nestjs/throttler` usa su almacenamiento en
memoria por defecto.

**Rationale**: la constitución §2 exige Redis "para optimizar consultas frecuentes", y esta
feature no agrega ninguna lectura cacheable: `/auth/login` y `/auth/register` son escrituras o
verificaciones que deben golpear la base siempre. Cachear una verificación de credenciales sería
directamente un defecto de seguridad. Para el rate limit, el almacenamiento en memoria es
correcto mientras haya una sola instancia, que es el caso del proyecto.

**Alternatives considered**:
- *Throttler respaldado por Redis*: necesario el día que haya más de una instancia, porque si no
  cada una lleva su propia cuenta y el límite efectivo se multiplica. Queda anotado como la
  condición exacta que dispara ese cambio.

---

## #7 — Umbral y alcance del rate limit

**Decision**: 5 peticiones por minuto y por IP sobre `/auth/login` y `/auth/register`.
Configurable por `AUTH_RATE_LIMIT_TTL` y `AUTH_RATE_LIMIT_MAX`. El resto de la API no se limita.

**Rationale**: es el default que la spec dejó asentado en Assumptions. 5 por minuto deja pasar
holgadamente a una persona que se equivoca de contraseña dos o tres veces, y le corta el paso a
un ataque por diccionario. Se limita por IP porque limitar por email permitiría a un atacante
bloquear la cuenta de otro a voluntad, convirtiendo la defensa en una denegación de servicio.

**Alternatives considered**:
- *Bloqueo progresivo de la cuenta tras N fallos*: más fuerte contra fuerza bruta dirigida, pero
  introduce estado de bloqueo, desbloqueo y notificación — alcance muy superior al de la spec.

---

## #8 — Comparación en tiempo constante y no filtrar la existencia de la cuenta

**Decision**: cuando el email no existe, igual se ejecuta una comparación bcrypt contra un hash
ficticio fijo antes de responder. La respuesta es idéntica en ambos casos: `401` con el mensaje
`"Credenciales inválidas"`.

**Rationale**: FR-008 y SC-006 piden que email inexistente y contraseña incorrecta sean
indistinguibles. Igualar el cuerpo de la respuesta no alcanza: si el camino "no existe" retorna
sin hashear, responde perceptiblemente más rápido que el camino "existe pero la contraseña está
mal", y esa diferencia de tiempos es en sí misma el oráculo que la regla intenta cerrar. La
comparación contra un hash ficticio empareja los dos caminos.

**Alternatives considered**:
- *Solo igualar el mensaje*: es lo que la spec pide literalmente, pero deja el canal temporal
  abierto y por lo tanto no cumple SC-006 de verdad.

---

## #9 — CORS entre el cliente y la API

**Decision**: habilitar CORS en `main.ts` con una lista de orígenes permitidos leída de
`CORS_ALLOWED_ORIGINS`, y `credentials: false`.

**Rationale**: es un requisito que la spec no menciona pero sin el cual US3 y US4 no funcionan:
el cliente de Vite corre en un puerto distinto al de la API, así que todo request del navegador
es cross-origin y el navegador lo bloquea sin estos headers. `credentials: false` es correcto
porque la credencial viaja en el header `Authorization` y no en cookies (FR-019); el día que se
migre a cookie `HttpOnly` habría que invertir esto y fijar orígenes exactos.

**Alternatives considered**:
- *Proxy de desarrollo de Vite*: resuelve el problema en desarrollo sin tocar el backend, pero
  no en un despliegue real, donde el problema vuelve a aparecer.
- *`origin: '*'`*: más simple y aceptable mientras la API sea pública, pero incompatible con el
  día que se usen cookies y mala costumbre para una API que ahora exige autenticación.

---

## #10 — Andamiaje de `/front` y convivencia con `/back`

**Decision**: `/front` es un proyecto npm independiente, con su propio `package.json`, hermano de
`/back`. No se introduce workspace ni monorepo. Vitest se configura dentro de `vite.config.ts`.

**Rationale**: `/back` ya es un proyecto npm autónomo con sus propios scripts; un segundo árbol
hermano es la lectura directa de la constitución §7, que habla de dos árboles y no de paquetes
de un workspace. Un workspace agregaría herramienta y configuración nuevas —y la constitución §2
no autoriza gestor de monorepo alguno— para resolver un problema que dos carpetas no tienen.

**Alternatives considered**:
- *npm workspaces en la raíz*: permitiría un `npm install` único y compartir tipos entre árboles.
  Se descartó porque §7 prohíbe justamente compartir tipos de entidad, que es el caso de uso que
  lo justificaría, y porque cambiaría la forma de instalar y correr `/back`, que hoy funciona.

---

## #11 — Traducción de la estética de tarjeta a Tailwind

**Decision**: las esquinas biseladas se resuelven con `clip-path` vía una utilidad propia
declarada en `tailwind.config.js`; el resplandor neón con `box-shadow` de color; la paleta
(deep navy, azul neón, dorado, verde neón, rojo) se declara como tokens en `theme.extend.colors`
y se consume solo por nombre semántico.

**Rationale**: FR-023 a FR-026 describen un tratamiento visual concreto y Tailwind es el único
sistema de estilos autorizado (§2). `clip-path` es la forma de conseguir un bisel real —
`border-radius` redondea, no achaflana. Declarar la paleta como tokens evita que los valores
hexadecimales queden dispersos por los componentes, que es lo que vuelve imposible cambiar un
color después.

**Alternatives considered**:
- *Valores arbitrarios de Tailwind (`bg-[#0a1628]`) en cada componente*: sin configuración
  previa, pero repite el hexadecimal en cada uso y rompe la consistencia al primer descuido.
- *Un archivo CSS aparte para el bisel*: mezclaría dos sistemas de estilos sin necesidad.

---

## #12 — Alcance de los tests

**Decision**:
- `/back`: tests de integración (supertest, base de test real vía `.env.test`) cubriendo el
  hasheo efectivo en base, el rechazo sin JWT, el rechazo sin API Key, y la indistinguibilidad
  de los dos fallos de login. Unitarios para `AuthService`.
- `/front`: unitarios de Vitest sobre validación de formularios, el interceptor y la
  rehidratación de sesión.
- No se automatiza un end-to-end de navegador: `playwright` está en `/back` como herramienta de
  scraping, no como runner de tests de UI, y §2 no autoriza ninguno para `/front`.

**Rationale**: los criterios de aceptación de la spec que más importan —que la contraseña quede
hasheada de verdad, que un request sin credencial no pase— solo se verifican de punta a punta
contra una base real; ahí van los de integración. Lo que es lógica pura del cliente se cubre con
unitarios, que es lo que Vitest hace bien sin librerías extra.

**Alternatives considered**:
- *E2E de navegador con Playwright sobre `/front`*: cubriría US3/US4 de forma completa, pero
  requiere autorizarlo en §2 para uso de testing de UI y monta infraestructura de test nueva.
  Los escenarios manuales de `quickstart.md` cubren ese hueco por ahora.
