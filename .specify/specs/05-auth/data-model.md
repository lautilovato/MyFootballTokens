# Phase 1 — Data Model: 05-auth

Una sola entidad nueva. Ninguna entidad existente cambia de forma.

---

## Entidad nueva: `User`

**Ubicación**: `/back/src/infrastructure/database/entities/user.entity.ts` (constitución §7).
**Tabla**: `user`.

| Campo | Tipo | Restricciones | Notas |
|---|---|---|---|
| `id` | `uuid` | PK, `randomUUID()` por defecto | Mismo patrón que `Player`, `Team`, `League`. |
| `email` | `string` | **único**, obligatorio | Identificador de login. Se persiste normalizado (ver Reglas #1). |
| `username` | `string` | obligatorio | Identidad visible. **No** es único — ver Reglas #2. |
| `passwordHash` | `string` | obligatorio | Hash bcrypt. El nombre del campo dice qué contiene: nunca una contraseña. |
| `createdAt` | `Date` | `onCreate` | Mismo patrón que el resto de las entidades. |
| `updatedAt` | `Date` | `onUpdate`, nullable | Ídem. |

**Relaciones**: ninguna todavía. `User` es el ancla sobre la que se montarán después el
portfolio y las órdenes de compra/venta (constitución §5); esta feature no modela nada de eso.

### Por qué `passwordHash` y no `password`

El nombre del campo es la defensa más barata contra el error que FR-004 intenta evitar. Un campo
llamado `password` invita a que alguien lo serialice en una respuesta; uno llamado
`passwordHash` hace visible en el punto de uso que ahí no hay una contraseña.

---

## Reglas de validación

Derivadas de los requisitos funcionales; cada una indica dónde se aplica.

### #1 — Email: formato y normalización

- Validación de formato en `RegisterDto`/`LoginDto` con `class-validator` (`@IsEmail()`).
- Se normaliza a minúsculas y sin espacios al borde **antes** de persistir y antes de buscar.

**Por qué**: sin normalizar, `Ana@x.com` y `ana@x.com` conviven como dos cuentas distintas y el
índice único no lo impide, porque para PostgreSQL son valores diferentes. Eso rompe FR-005 de
una forma que no aparece en los tests obvios. Normalizar en los dos caminos —escritura y
lectura— es lo que hace que la restricción única signifique lo que se espera.

### #2 — `username` no es único

FR-001 pide `email` único y no dice nada de `username`. Se lo deja deliberadamente no único:
imponerlo agregaría un segundo modo de fallo al registro ("ese nombre ya está tomado") que la
spec no pide y que no tiene pantalla asociada en US3.

### #3 — Contraseña: largo mínimo 8

Validado en `RegisterDto`. La spec no fija un mínimo; 8 es el piso convencional y se documenta
acá para que no lo decida cada quien en el momento. **No** se valida largo mínimo en `LoginDto`:
al iniciar sesión, una contraseña corta debe fallar como credencial inválida y no como error de
validación, porque la diferencia entre ambas respuestas le informa al atacante qué contraseñas
ni siquiera vale la pena probar.

### #4 — La respuesta nunca incluye `passwordHash`

`AuthResponseDto` se construye por campo explícito; no se serializa la entidad `User` directo.

**Por qué**: es la garantía de FR-004 y SC-005. Devolver la entidad y confiar en excluir un campo
funciona hasta que alguien agrega un campo sensible nuevo; construir la respuesta por
enumeración falla del lado seguro.

### #5 — Registro concurrente con el mismo email

La restricción única de la base es la autoridad, no un chequeo previo en el servicio. El servicio
consulta primero para dar un mensaje claro, pero **además** captura la violación de unicidad y la
traduce al mismo error de conflicto.

**Por qué**: el chequeo previo y el insert no son atómicos. Dos registros simultáneos con el mismo
email pasan ambos el chequeo y uno falla en el insert; sin capturar esa violación, ese fallo sale
como un 500. Es el edge case "registro concurrente" de la spec.

---

## Índices

| Índice | Campos | Motivo |
|---|---|---|
| `user_email_unique` | `email` | Impone FR-005 y sirve la búsqueda de login, que es el acceso más frecuente a esta tabla. |

No hace falta ningún otro: la tabla se consulta por email al iniciar sesión y por `id` (PK) al
resolver el usuario de un JWT.

---

## Migración

Una migración nueva en `/back/src/infrastructure/database/migrations/`, generada con la CLI de
MikroORM como el resto del proyecto. Crea la tabla `user` con su índice único.

**No** incluye datos semilla. El superusuario que concentra los tokens iniciales (constitución
§5) queda explícitamente fuera de alcance de esta spec y no se crea acá.

---

## Modelo de sesión (no persistido)

El JWT no se guarda en la base. Es un portador firmado, con el payload que fija research #5:

| Claim | Contenido |
|---|---|
| `sub` | `User.id` |
| `username` | `User.username` |
| `iat` / `exp` | Estándar; `exp` derivado de `JWT_EXPIRATION`. |

**Consecuencia asumida**: sin almacenar las sesiones no hay forma de revocar un token antes de su
vencimiento. Una sesión comprometida sigue siendo válida hasta que expira, y por eso `JWT_EXPIRATION`
no debería ser largo. Revocación y refresh tokens están fuera de alcance por decisión de la spec;
implementarlos implicaría persistir sesiones y es lo que obligaría a revisar esta decisión.

---

## Configuración por entorno

| Variable | Uso | Origen |
|---|---|---|
| `JWT_SECRET` | Firma y verificación | FR-014 |
| `JWT_EXPIRATION` | Vigencia (ej. `2h`) | FR-014 |
| `ADMIN_API_KEY` | Clave administrativa | FR-014 |
| `AUTH_RATE_LIMIT_TTL` | Ventana del rate limit, en segundos | research #7 |
| `AUTH_RATE_LIMIT_MAX` | Peticiones permitidas por ventana | research #7 |
| `CORS_ALLOWED_ORIGINS` | Orígenes permitidos, separados por coma | research #9 |
| `VITE_API_BASE_URL` | Base de la API para el cliente | `/front` |

**Arranque**: la aplicación debe negarse a levantar si `JWT_SECRET` o `ADMIN_API_KEY` faltan o
están vacíos. Es el edge case "clave administrativa no configurada" de la spec: sin esa
verificación, un despliegue sin `ADMIN_API_KEY` deja los endpoints administrativos comparando
contra `undefined`, que es exactamente el escenario que hay que impedir. Fallar al arrancar es
preferible a levantar con la puerta abierta.
