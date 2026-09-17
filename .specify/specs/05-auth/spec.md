# Feature Specification: Autenticación, Control de Acceso (JWT & API Key) e Interfaz de Usuario

**Feature Branch**: `05-auth`

**Created**: 2026-09-17

**Status**: Draft

**Input**: User description: "Sistema de autenticación dual para la plataforma y su integración en la interfaz de cliente: acceso de usuarios con JWT para el catálogo, acceso administrativo con API Key estática para ingesta/stats, y una interfaz de Login/Registro alineada a la estética gamificada de los tokens coleccionables."

**Depende de**: `01-catalogo-jugadores` (los endpoints del catálogo que esta spec pasa a proteger), `02-ingesta-catalogo` y `03-ingesta-stats` (los procesos internos que esta spec pasa a proteger con API Key). No modifica la lógica de ninguno de ellos — solo antepone control de acceso.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registro e inicio de sesión de un usuario (Priority: P1)

Una persona que todavía no tiene cuenta se registra con su email, un nombre de usuario y una contraseña. A partir de ese momento puede iniciar sesión con esas credenciales y, ya autenticada, consultar el catálogo de jugadores. Sin haber iniciado sesión, el catálogo no le responde.

**Why this priority**: Es la base de todo el resto — sin identidad de usuario no hay sesión que proteger, ni portfolio ni operaciones de mercado a futuro. Entregada sola, ya convierte al catálogo de abierto a privado, que es el objetivo mínimo de la feature.

**Independent Test**: Registrar un usuario nuevo, iniciar sesión con esas credenciales, y verificar que con la sesión obtenida se puede consultar el catálogo mientras que sin ella no. No requiere que exista aún ninguna pantalla ni la protección administrativa.

**Acceptance Scenarios**:

1. **Given** un email que no está registrado, **When** la persona se registra con email, username y contraseña válidos, **Then** la cuenta queda creada y la contraseña queda almacenada de forma irreversible, nunca en texto plano.
2. **Given** una cuenta ya registrada, **When** la persona inicia sesión con las credenciales correctas, **Then** recibe una credencial de sesión con vigencia limitada que le habilita el acceso al catálogo.
3. **Given** una cuenta ya registrada, **When** la persona intenta iniciar sesión con la contraseña incorrecta, **Then** el sistema responde con un mensaje genérico de credenciales inválidas, sin revelar si lo que falló fue el email o la contraseña.
4. **Given** un email ya registrado, **When** alguien intenta registrarse nuevamente con ese mismo email, **Then** el registro es rechazado y no se crea una segunda cuenta.
5. **Given** una petición al catálogo sin credencial de sesión o con una inválida, **When** se procesa la petición, **Then** el sistema la rechaza por no autenticada y no devuelve datos del catálogo.

---

### User Story 2 - Proteger los procesos internos con una clave administrativa (Priority: P2)

Los procesos de ingesta de catálogo y de estadísticas hoy se disparan sin ninguna restricción. Con esta feature, solo quien posee la clave administrativa configurada puede dispararlos; cualquier intento sin esa clave —incluso el de un usuario con sesión válida— es rechazado.

**Why this priority**: Son operaciones caras y con efectos de escritura masiva sobre los datos. Protegerlas es independiente del login de usuarios y puede entregarse y verificarse por separado.

**Independent Test**: Disparar un endpoint de ingesta con la clave correcta, sin clave, y con una clave incorrecta, verificando que solo el primer caso ejecuta el proceso. No depende de que exista ningún usuario registrado.

**Acceptance Scenarios**:

1. **Given** la clave administrativa configurada en el entorno, **When** se dispara un proceso de ingesta o de stats presentando esa clave, **Then** el proceso se ejecuta normalmente.
2. **Given** una petición a un endpoint de ingesta o de stats sin la clave administrativa, **When** se procesa la petición, **Then** es rechazada y el proceso no se ejecuta.
3. **Given** un usuario con sesión de usuario válida pero sin la clave administrativa, **When** intenta disparar un proceso de ingesta, **Then** la petición es rechazada — la sesión de usuario no habilita accesos administrativos.

---

### User Story 3 - Interfaz de Login y Registro alineada a la estética de la plataforma (Priority: P3)

Una persona llega a la aplicación y encuentra pantallas de registro e inicio de sesión que respetan la identidad visual de los tokens coleccionables: contenedor con esquinas biseladas como una carta, fondo oscuro, resplandor neón en los bordes y acentos metálicos en los botones principales. Los errores de validación se le muestran antes de enviar el formulario.

**Why this priority**: Es la cara visible de la feature, pero el control de acceso ya funciona sin ella (las historias 1 y 2 son verificables por API). Entregarla después no bloquea nada.

**Independent Test**: Abrir las pantallas de login y registro y verificar validación de campos vacíos y formato de email antes del envío, el tratamiento visual requerido, y que un inicio de sesión exitoso deja a la persona dentro de la aplicación.

**Acceptance Scenarios**:

1. **Given** el formulario de registro vacío, **When** la persona intenta enviarlo, **Then** se señalan los campos obligatorios faltantes con el tratamiento visual de error y no se envía la petición.
2. **Given** un email con formato inválido, **When** la persona intenta enviar el formulario, **Then** se señala el error de formato antes de enviar la petición.
3. **Given** credenciales correctas, **When** la persona inicia sesión desde el formulario, **Then** queda autenticada en la aplicación y sus peticiones posteriores a zonas protegidas viajan ya identificadas, sin que tenga que hacer nada adicional.
4. **Given** una persona sin sesión, **When** intenta abrir directamente una ruta protegida de la aplicación, **Then** es redirigida a la pantalla de inicio de sesión.

---

### User Story 4 - Recuperación limpia ante una sesión vencida (Priority: P4)

Una persona que dejó la aplicación abierta vuelve después de que su sesión expiró. En vez de encontrarse con pantallas rotas o errores crudos, la aplicación detecta que la sesión ya no es válida, la descarta y la lleva de vuelta al inicio de sesión.

**Why this priority**: Es manejo de borde sobre una sesión que ya existe; sin esto la feature funciona, pero la experiencia se degrada al vencer el plazo.

**Independent Test**: Con una sesión vencida o manipulada, provocar una petición a una zona protegida y verificar que la aplicación limpia el estado de sesión y redirige al inicio de sesión sin quedar en un estado inconsistente.

**Acceptance Scenarios**:

1. **Given** una sesión vencida o inválida, **When** la aplicación realiza una petición a una zona protegida, **Then** detecta el rechazo por falta de autenticación, descarta el estado de sesión almacenado y redirige a la pantalla de inicio de sesión.
2. **Given** que la persona recarga la aplicación teniendo una sesión todavía vigente, **When** la aplicación arranca, **Then** recupera ese estado de sesión y la persona sigue autenticada sin volver a ingresar credenciales.

---

### Edge Cases

- **Enumeración de usuarios**: un intento de inicio de sesión fallido nunca debe permitir distinguir si el email no existe o si la contraseña era incorrecta — el mensaje y el comportamiento son idénticos en ambos casos.
- **Fuerza bruta sobre el inicio de sesión**: intentos repetidos de inicio de sesión desde un mismo origen deben ser limitados en frecuencia, en vez de aceptarse indefinidamente.
- **Base de datos caída durante registro o inicio de sesión**: la petición falla con un error interno estandarizado, sin exponer al cliente el detalle técnico ni la traza del error.
- **Credencial de sesión manipulada o firmada con otra clave**: se trata igual que una credencial ausente — acceso rechazado, sin pistas sobre el motivo.
- **Sesión vencida en medio de la navegación**: la aplicación no queda en un estado intermedio con datos de usuario obsoletos en pantalla; descarta el estado y redirige.
- **Clave administrativa no configurada en el entorno**: los endpoints administrativos no deben quedar accidentalmente abiertos por ausencia de configuración.
- **Registro concurrente con el mismo email**: dos registros simultáneos con el mismo email no deben producir dos cuentas.

## Requirements *(mandatory)*

### Functional Requirements

#### Identidad y credenciales

- **FR-001**: El sistema MUST persistir una entidad de usuario con, como mínimo, email (único), nombre de usuario y contraseña almacenada de forma irreversible.
- **FR-002**: El sistema MUST permitir el registro de una cuenta nueva a partir de email, nombre de usuario y contraseña.
- **FR-003**: El sistema MUST aplicar `bcrypt` a la contraseña antes de persistirla; la contraseña MUST NOT almacenarse nunca en texto plano.
- **FR-004**: Ninguna respuesta del sistema MUST incluir la contraseña ni su hash, en ningún endpoint.
- **FR-005**: El sistema MUST rechazar un registro cuyo email ya corresponda a una cuenta existente, sin crear una segunda cuenta.
- **FR-006**: El sistema MUST permitir iniciar sesión con email y contraseña, devolviendo una credencial de sesión (JWT) con vigencia limitada.
- **FR-007**: El contenido de la credencial de sesión MUST limitarse a información no sensible (identificador de usuario y nombre de usuario); MUST NOT incluir contraseñas ni datos personales sensibles.
- **FR-008**: Ante un inicio de sesión fallido, el sistema MUST responder con un mensaje genérico de credenciales inválidas, sin distinguir si falló el email o la contraseña.

#### Control de acceso

- **FR-009**: El sistema MUST rechazar como no autenticada toda petición a los endpoints del catálogo que no presente una credencial de sesión válida y vigente.
- **FR-010**: El sistema MUST rechazar toda petición a los endpoints de ingesta y de estadísticas que no presente la clave administrativa configurada.
- **FR-011**: Una credencial de sesión de usuario válida MUST NOT habilitar por sí sola el acceso a endpoints administrativos — ambos controles son independientes.
- **FR-012**: La lógica de protección de rutas MUST implementarse mediante el sistema de Guards del framework, aislada de los controladores, y no repetida dentro de cada controlador.
- **FR-013**: Los endpoints de autenticación MUST estar sujetos a un límite de frecuencia de peticiones por origen, para mitigar ataques de fuerza bruta.

#### Configuración y resiliencia

- **FR-014**: El sistema MUST ser configurable por variables de entorno, sin modificar código fuente, para: clave de firma de la credencial (`JWT_SECRET`), vigencia de la credencial (`JWT_EXPIRATION`) y clave administrativa (`ADMIN_API_KEY`).
- **FR-015**: Una falla de la base de datos durante registro o inicio de sesión MUST producir un error interno estandarizado, sin filtrar al cliente la traza ni el detalle técnico del ORM.

#### Interfaz de cliente

- **FR-016**: La aplicación cliente MUST proveer pantallas de registro e inicio de sesión.
- **FR-017**: Los formularios MUST validar campos obligatorios vacíos y formato de email antes de enviar la petición al backend.
- **FR-018**: La aplicación cliente MUST adjuntar automáticamente la credencial de sesión a cada petición a zonas protegidas, sin intervención de quien la usa.
- **FR-019**: La aplicación cliente MUST almacenar la credencial de sesión en `localStorage`, de modo que sobreviva tanto a una recarga de página como al cierre y reapertura de la pestaña. La credencial MUST descartarse de ese almacenamiento al cerrar sesión y ante cualquier rechazo por falta de autenticación (FR-022).
- **FR-020**: La aplicación cliente MUST impedir el acceso a rutas protegidas sin sesión, redirigiendo a la pantalla de inicio de sesión.
- **FR-021**: El estado de sesión en el cliente MUST ser la única fuente de verdad sobre si hay usuario autenticado, y MUST rehidratarse al arrancar la aplicación si existe una credencial almacenada vigente.
- **FR-022**: Ante un rechazo por falta de autenticación en cualquier petición, la aplicación cliente MUST descartar el estado de sesión almacenado y redirigir a la pantalla de inicio de sesión.

#### Identidad visual

- **FR-023**: El contenedor de los formularios MUST emular la estructura de las tarjetas coleccionables, con esquinas angulares o biseladas.
- **FR-024**: La paleta MUST usar fondos oscuros (deep navy o negro), bordes con resplandor neón azul que simule el aura de la carta, y acentos dorados o metálicos en los botones de acción primarios.
- **FR-025**: La tipografía de títulos MUST ser sans-serif condensada y en negrita, con texto de alto contraste en las etiquetas de los campos.
- **FR-026**: El feedback de estado MUST usar verde neón para mensajes de éxito y rojo de alto contraste para errores de validación.

#### Documentación

- **FR-027**: Todos los endpoints nuevos MUST quedar documentados en Swagger, y la colección de Postman MUST actualizarse en consecuencia.

### Key Entities *(include if feature involves data)*

- **User** *(nueva)*: representa a una persona con acceso a la plataforma. Atributos mínimos: email (único, identifica la cuenta al iniciar sesión), nombre de usuario (identidad visible) y contraseña almacenada de forma irreversible. Es la entidad sobre la que se apoyarán a futuro el portfolio y las operaciones de mercado.
- **Sesión de usuario** *(credencial, no persistida)*: credencial de vigencia limitada emitida al iniciar sesión, que acredita la identidad del usuario en cada petición posterior. Transporta únicamente identificador y nombre de usuario.
- **Clave administrativa** *(configuración, no persistida)*: cadena estática definida por entorno que habilita los procesos internos de ingesta y estadísticas. No pertenece a ningún usuario ni se almacena en la base de datos.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Una persona sin cuenta puede registrarse e iniciar sesión por primera vez en menos de 2 minutos, sin asistencia ni documentación.
- **SC-002**: El 100% de las peticiones al catálogo sin sesión válida son rechazadas sin devolver datos del catálogo.
- **SC-003**: El 100% de los intentos de disparar procesos de ingesta o estadísticas sin la clave administrativa son rechazados sin ejecutar el proceso.
- **SC-004**: Las contraseñas no son legibles ni recuperables desde el almacenamiento: una inspección directa de los datos persistidos no permite obtener la contraseña original de ninguna cuenta.
- **SC-005**: Ninguna respuesta del sistema expone contraseñas, hashes ni trazas técnicas internas, verificado sobre la totalidad de los endpoints de autenticación, incluidos sus casos de error.
- **SC-006**: Un intento fallido de inicio de sesión no permite determinar si el email existe en el sistema: las respuestas para email inexistente y para contraseña incorrecta son indistinguibles.
- **SC-007**: Tras iniciar sesión, la persona puede navegar por las zonas protegidas sin volver a ingresar credenciales hasta que la sesión vence, incluso después de recargar la página.
- **SC-008**: Al vencer la sesión, la persona es llevada de vuelta al inicio de sesión sin quedar nunca frente a una pantalla en estado inconsistente o con un error crudo.
- **SC-009**: Toda la configuración sensible (clave de firma, vigencia de sesión, clave administrativa) puede cambiarse entre entornos sin modificar ni recompilar el código fuente.

## Assumptions

- **Stack de frontend autorizado (constitución v2.0.0)**: el alcance de interfaz de esta spec era inicialmente inejecutable porque la §2 de la constitución declaraba un stack exclusivamente de backend. Esa enmienda ya se tramitó: la §2 autoriza hoy Vite, React, React Router, Tailwind CSS, Axios, Context API nativa y Vitest bajo `/front`, y la §7 fija la estructura de `/front/src/` (`pages/`, `components/`, `services/`, `app/`). Las cuatro historias de esta spec son ejecutables sin enmiendas adicionales.
- **Almacenamiento de la credencial en el cliente — `localStorage`**: era la decisión pendiente n.º 1 de la spec original y quedó resuelta por `localStorage`. Es consistente con la §7 de la constitución, que obliga a que `/front/src/services/` contenga la instancia única de Axios y sus interceptores: un interceptor que adjunta la credencial (FR-018) requiere que el código cliente pueda leerla, cosa que una cookie `HttpOnly` impediría. **Contrapartida asumida**: la credencial queda legible por JavaScript, de modo que un XSS la expone; se acepta ese riesgo para esta feature. Migrar a cookie `HttpOnly` más adelante obligaría a reescribir FR-018, FR-019 y FR-021, a que el backend emita y lea la cookie, y a tratar CSRF.
- **Límite de frecuencia por defecto**: ante la falta de un umbral definido, se asume un máximo del orden de 5 intentos fallidos de inicio de sesión por minuto y por origen, valor configurable. Se eligió un default explícito en vez de bloquear la spec porque el criterio es ajustable sin cambiar el alcance ni el comportamiento observable de la feature.
- **Vigencia de sesión**: se asume un plazo del orden de horas (configurable vía `JWT_EXPIRATION`), suficiente para una sesión de uso continuo sin exigir reingreso permanente.
- **Sin refresco de sesión**: al vencer la credencial, la persona vuelve a iniciar sesión. No hay renovación silenciosa en esta feature.
- **Un único rol de usuario**: todas las cuentas registradas tienen las mismas capacidades sobre el catálogo. El acceso administrativo no es un rol de usuario sino una clave de entorno independiente. El superusuario que concentra los tokens iniciales (constitución §5) no se modela en esta spec.
- **El catálogo pasa a ser privado**: los endpoints de `01-catalogo-jugadores`, hoy abiertos, quedan detrás de la sesión de usuario. Se asume que esto es deseado y que no hay consumidores externos anónimos que se rompan.
- **Los procesos de ingesta existentes no cambian su lógica**: `02-ingesta-catalogo` y `03-ingesta-stats` solo pasan a exigir la clave administrativa; su comportamiento interno queda intacto.
- **Fuera de alcance, para specs posteriores**: recuperación de contraseña, verificación de correo electrónico, SSO (Google/Apple), refresco de credenciales (refresh tokens) y efectos 3D en el formulario. La estética de tarjeta biselada (FR-023 a FR-026) se resuelve íntegramente con Tailwind CSS, único sistema de estilos autorizado por la §2. WebGL/Three.js sigue fuera de alcance y además no está hoy autorizado por la §2: incorporarlo para las cartas requerirá una enmienda previa.
- **Definición de terminado general del proyecto**: aplica sin excepciones — tests unitarios y de integración, comprobación de que la aplicación compila y levanta, y actualización de Swagger y Postman.
