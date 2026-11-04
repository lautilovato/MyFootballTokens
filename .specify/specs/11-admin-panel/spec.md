# Feature Specification: Rol de Administrador y Panel de Métricas de la Plataforma

**Feature Branch**: `11-admin-panel`

**Created**: 2026-10-31

**Status**: Draft

**Input**: User description: "Crear el rol admin dentro de los usuarios, que se pueda crear desde un seed. El admin tiene un panel estilo dashboard con: usuarios registrados, cartas en circulación, cartas en sobres, pool de sobres restantes, precio de venta promedio y algo más que resulte interesante."

**Depende de**: `05-auth` (cuentas, sesión y clave administrativa), `08-sobres` (estados de un token, stock de sobres, aperturas y cuenta de créditos), `09-mercado` (publicaciones y compras), `10-historial-operaciones` (cada compra conserva su cotización) y la constitución v4.2.0, §2 (librería de gráficos), §4 (registro inmutable y manejo seguro de la autorización) y §5 (tokens, créditos y plataforma).

**Reemplaza**: el supuesto «Un único rol de usuario» de la spec 05 (Assumptions). Desde esta feature hay dos roles. La parte de ese supuesto que dice que la clave administrativa no pertenece a ningún usuario sigue vigente (ver «Rol de administrador y clave administrativa»).

**Modifica**: el alcance de la spec 08, FR-002: la entrega de créditos pendientes deja de alcanzar a las cuentas administradoras (FR-009).

**Habilita (specs posteriores, fuera de alcance acá)**: gestión de usuarios, exportación de métricas, alertas y disparar procesos desde el panel.

## Contexto de negocio

Hasta la spec 10, todos los usuarios tienen las mismas capacidades y lo que pasa en la plataforma solo se puede saber consultando la base de datos. Nadie puede responder sin ayuda técnica cuántos usuarios hay, cuántas cartas quedan por salir, cuánto se vendió o si la economía de créditos cuadra.

Esta feature agrega dos cosas:

1. **El rol de administrador**: una cuenta marcada como tal, que solo se crea con un proceso de carga inicial (seed) ejecutado por quien administra el entorno. Nadie puede obtener el rol desde la aplicación.
2. **El panel de administración**: una pantalla estilo dashboard, de solo lectura, con las métricas de usuarios, cartas, sobres, mercado y créditos, y un selector de fechas.

Las cuentas comunes no cambian: se siguen creando desde el registro de la web.

**Esta feature no crea operaciones ni cambia precios**: el panel solo lee. El rol no da ningún poder sobre tokens, saldos ni cotizaciones.

### El administrador no es el superusuario

La constitución (v4.0.0) eliminó el superusuario: los tokens sin dueño pertenecen a la **plataforma**, que no es un usuario. El administrador **no** recupera esa figura: es una persona con acceso a un panel de lectura. No concentra tokens, no representa a la plataforma en ninguna operación y lo que la plataforma cobra no se le acredita.

### Rol de administrador y clave administrativa

Son dos accesos distintos y esta feature no los mezcla:

| | Rol de administrador | Clave administrativa (spec 05) |
|---|---|---|
| **Quién la usa** | Una persona, con su cuenta | Un proceso o quien opera el entorno |
| **Qué habilita** | Leer el panel | Disparar procesos internos (ingesta, recálculos, stock) |
| **Identifica a alguien** | Sí | No |

Una sesión de administrador **no** habilita los disparos protegidos por la clave (spec 05, FR-010), y la clave **no** habilita el panel.

### Qué significa cada métrica

Las métricas son de dos clases. Las **de estado** son una foto de ahora y no dependen del período elegido. Las **de período** cuentan lo que ocurrió dentro del período que eligió el administrador con el selector de fechas.

| Métrica | Clase | Definición |
|---|---|---|
| **Usuarios registrados** | Estado | Cuentas con rol de usuario. Las de administrador no cuentan. |
| **Usuarios nuevos** | Período | Usuarios registrados dentro del período. |
| **Usuarios activos** | Período | Usuarios que abrieron un sobre, compraron o vendieron dentro del período. |
| **Cartas emitidas** | Estado | Todos los tokens existentes, en cualquier estado. |
| **Cartas en circulación** | Estado | Tokens en estado `de_usuario`, estén o no publicados a la venta. |
| **Cartas en sobres** | Estado | Tokens en estado `en_sobre`. |
| **Cartas reservadas** | Estado | Tokens en estado `reservado`: su jugador todavía no es elegible. |
| **Cartas en venta de la plataforma** | Estado | Tokens en estado `en_venta_plataforma`. |
| **Cartas a la venta** | Estado | Publicaciones activas en el Market, de usuarios y de la plataforma. |
| **Pool de sobres restantes** | Estado | Sobres sin abrir, en total y por tipo. |
| **Sobres abiertos** | Período | Aperturas confirmadas dentro del período, en total y por tipo. |
| **Ventas concretadas** | Período | Compras confirmadas en el Market dentro del período. |
| **Precio de venta promedio** | Período | Suma de los precios cobrados dividida por las ventas concretadas, redondeada a créditos enteros. |
| **Volumen de ventas** | Período | Suma de los precios cobrados en las ventas concretadas. |
| **Venta más alta** | Período | El mayor precio cobrado en una venta, con su jugador. |
| **Créditos emitidos** | Período | Suma de las entregas iniciales dentro del período. |
| **Créditos cobrados por la plataforma** | Período | Lo cobrado por aperturas de sobres y por ventas de tokens en poder de la plataforma. Salen de circulación. |
| **Créditos en circulación** | Estado | Suma de los saldos de todas las cuentas. |

Los tres estados de plataforma más `de_usuario` forman una partición: cartas emitidas = en circulación + en sobres + reservadas + en venta de la plataforma. **Cartas a la venta no es un estado más**: se superpone con cartas en circulación, porque una carta publicada sigue siendo de su dueño.

Las **conciliaciones** se calculan siempre sobre toda la historia, sea cual sea el período elegido: comparar lo emitido en un mes con el saldo de hoy no diría nada.

## Clarifications

### Session 2026-10-31

- Q: ¿El administrador entra por una pantalla propia? → A: No. Usa el mismo inicio de sesión que el resto; si la cuenta tiene el rol, ve el acceso al panel en el encabezado.
- Q: ¿Cómo se definen sus credenciales? → A: Las toma el seed de la configuración del entorno; nunca quedan escritas en el repositorio. Si faltan o son débiles, el seed falla sin crear nada.
- Q: ¿Qué pasa si se corre el seed dos veces, o si el correo ya existe? → A: Es repetible. Si la cuenta ya es administradora no cambia nada; si es una cuenta común, le otorga el rol sin tocar su contraseña, su saldo ni sus cartas. Nunca crea duplicados.
- Q: ¿El administrador recibe créditos iniciales y puede operar? → A: Una cuenta creada por el seed arranca con saldo 0 y sin entrega inicial, para que no sea una emisión de créditos. No se le prohíbe navegar la aplicación, pero sin saldo no puede abrir sobres ni comprar.
- Q: ¿Las cuentas de administrador cuentan como usuarios? → A: No cuentan en «Usuarios registrados» ni en las métricas de usuarios. Sus saldos sí forman parte de la conciliación de créditos, porque una cuenta común promovida puede tener saldo.
- Q: ¿El panel muestra datos al instante? → A: Pueden tener hasta 1 minuto de antigüedad; el panel indica a qué hora se calcularon y ofrece actualizarlos.
- Q: ¿Cómo se crean las cuentas comunes? → A: Solo por el registro de la web, como hasta ahora. El seed crea únicamente la cuenta administradora: no carga usuarios de ejemplo.
- Q: ¿El panel tiene selector de fechas? → A: Sí. Acota las métricas de período; las de estado siguen mostrando la foto de ahora, porque no se guardan fotos históricas. Ofrece atajos (7, 30 y 90 días y «Todo») y un rango «desde–hasta». Al abrir el panel muestra los últimos 30 días.
- Q: ¿Se puede sumar una librería de gráficos? → A: Sí, lo autoriza el equipo. Como la lista del frontend es cerrada, requiere una enmienda de la constitución §2.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Crear la cuenta de administrador desde un seed (Priority: P1)

Quien administra el entorno define las credenciales del administrador en la configuración y ejecuta el seed. El proceso crea la cuenta con el rol y, a partir de ahí, esa persona inicia sesión como cualquier otra. Nadie puede conseguir el rol desde la aplicación.

**Why this priority**: Sin una cuenta administradora no hay quién pueda ver el panel, y es lo primero que se pidió. Entregada sola, ya permite distinguir administradores en todo el sistema.

**Independent Test**: En una base sin administradores, configurar las credenciales y ejecutar el seed; verificar que se puede iniciar sesión y que la sesión informa el rol. Ejecutarlo de nuevo y verificar que sigue habiendo una sola cuenta. Registrar una cuenta por la aplicación enviando un rol de administrador y verificar que queda como usuario común.

**Acceptance Scenarios**:

1. **Given** credenciales configuradas y una base sin esa cuenta, **When** se ejecuta el seed, **Then** se crea la cuenta con rol de administrador, con saldo 0 y sin entrega inicial de créditos, y sigue en 0 aunque la aplicación se reinicie o se disparen las entregas pendientes.
2. **Given** la cuenta ya creada como administradora, **When** se ejecuta el seed otra vez, **Then** no cambia nada y lo informa.
3. **Given** una cuenta común con ese correo, **When** se ejecuta el seed, **Then** la cuenta pasa a ser administradora y conserva su contraseña, su saldo y sus cartas.
4. **Given** credenciales ausentes, un correo mal formado o una contraseña que no cumple la política de la spec 05, **When** se ejecuta el seed, **Then** falla con un mensaje claro y no crea ni cambia ninguna cuenta.
5. **Given** la cuenta administradora, **When** inicia sesión con su correo y contraseña, **Then** entra por el flujo normal y la respuesta informa su rol.
6. **Given** el registro público, **When** alguien envía un rol en el pedido, **Then** el pedido se rechaza como entrada inválida y no se crea ninguna cuenta.
7. **Given** la salida del seed y los registros del sistema, **When** se revisan, **Then** la contraseña no aparece en ninguno.
8. **Given** un usuario común, **When** inicia sesión, **Then** su rol es el de usuario y sigue operando como hasta ahora.

---

### User Story 2 - Ver el panel con los números clave (Priority: P2)

El administrador inicia sesión, entra al panel desde el encabezado y ve de un vistazo los números pedidos: usuarios registrados, cartas en circulación, cartas en sobres, pool de sobres restantes y precio de venta promedio. Un usuario común no ve el acceso, y aunque intente entrar no recibe ningún dato.

**Why this priority**: Es el pedido central, pero necesita un administrador (US1). Entregada sola, ya responde las cinco preguntas originales.

**Independent Test**: Con datos conocidos (por ejemplo, 3 usuarios, 1 administrador, 200 tokens, 2 sobres abiertos y 2 ventas de 100 y 300 créditos), abrir el panel como administrador y verificar cada número contra esos datos: 3 usuarios y precio promedio 200. Intentar lo mismo con un usuario común y sin sesión, y verificar que no se obtiene ningún dato.

**Acceptance Scenarios**:

1. **Given** una sesión de administrador, **When** se muestra el encabezado, **Then** aparece un acceso al panel; **Given** una sesión de usuario común o sin sesión, **Then** ese acceso no aparece.
2. **Given** un administrador, **When** entra al panel, **Then** ve usuarios registrados, cartas en circulación, cartas en sobres, pool de sobres restantes y precio de venta promedio, según las definiciones de la tabla de métricas.
3. **Given** un usuario común, **When** intenta abrir la dirección del panel, **Then** es llevado a la home sin ver datos, y si pide los datos directamente al servidor es rechazado como prohibido.
4. **Given** una persona sin sesión, **When** intenta abrir el panel, **Then** es llevada a iniciar sesión, y si pide los datos directamente al servidor es rechazada como no autenticada.
5. **Given** una plataforma sin ventas, **When** se muestra el precio de venta promedio, **Then** se indica que todavía no hay ventas; no se muestra 0 como si fuera un promedio.
6. **Given** una plataforma recién instalada, sin usuarios, sobres ni ventas, **When** se abre el panel, **Then** muestra los ceros y estados vacíos sin error.
7. **Given** que los datos son de hace menos de 1 minuto, **When** se muestra el panel, **Then** indica la hora en que se calcularon y ofrece actualizarlos.
8. **Given** que falla la carga, **When** se abre el panel, **Then** muestra un mensaje de error con opción de reintentar y ningún número inventado.
9. **Given** una cuenta administradora de la que se quitó el rol en la base, **When** vuelve a pedir el panel, **Then** es rechazada aunque su sesión siga vigente.

---

### User Story 3 - Ver el estado completo de cartas, sobres y mercado (Priority: P3)

Además de los números clave, el administrador ve el desglose: cartas por estado, el pool de sobres por tipo con lo que queda frente a lo abierto, las cartas en circulación por rareza, el volumen vendido, la venta más alta y los jugadores más vendidos.

**Why this priority**: Es el «algo más» del pedido. Explica los números clave (por ejemplo, de qué tipo de sobre queda menos), pero no es imprescindible para responderlos.

**Independent Test**: Con datos conocidos de cada estado, tipo de sobre, rareza y venta, verificar que cada desglose suma el total que muestra y que la suma de los estados da las cartas emitidas.

**Acceptance Scenarios**:

1. **Given** el panel, **When** se muestra la sección de cartas, **Then** informa las cartas emitidas y su reparto entre en circulación, en sobres, reservadas y en venta de la plataforma, y aparte las cartas a la venta en el Market.
2. **Given** el pool de sobres, **When** se muestra, **Then** indica para cada tipo (`common`, `rare`, `epic`, `legendary`) los sobres sin abrir y los abiertos, y marca como agotado el tipo que no tiene sobres sin abrir.
3. **Given** cartas en circulación, **When** se muestra su distribución, **Then** indica cuántas hay de cada rareza vigente, y la suma coincide con las cartas en circulación.
4. **Given** ventas concretadas, **When** se muestra el mercado, **Then** informa la cantidad de ventas, el precio promedio, el volumen, la venta más alta con su jugador y los 5 jugadores con más ventas.
5. **Given** menos de 5 jugadores vendidos, **When** se muestra el ranking, **Then** aparecen solo los que tienen ventas, con un orden estable ante empates.
6. **Given** cualquier sección, **When** una lectora de pantalla la recorre, **Then** los datos están disponibles como texto, sin depender solo del color o de la forma de un gráfico.

---

### User Story 4 - Ver la actividad y comprobar que la economía cierra (Priority: P4)

El administrador ve cómo evoluciona la plataforma —usuarios nuevos y activos, aperturas y ventas por semana— y comprueba que las cuentas cierran: las cartas suman lo emitido y los créditos emitidos menos los cobrados son los que están en circulación. Si algo no cierra, el panel lo avisa.

**Why this priority**: Aporta valor de auditoría, en línea con la constitución §4 y §5, pero depende de todo lo anterior.

**Independent Test**: Con 8 semanas de operaciones de prueba, verificar los valores del gráfico de actividad. Después, con una base alterada a propósito (un saldo modificado a mano), verificar que el panel muestra el aviso de que la conciliación de créditos no cierra.

**Acceptance Scenarios**:

1. **Given** el panel, **When** se muestra la actividad, **Then** informa usuarios nuevos y activos del período, y un gráfico de aperturas y ventas a lo largo del período, incluidos los tramos sin actividad.
2. **Given** el panel, **When** se muestran los créditos, **Then** informa los emitidos y los cobrados por la plataforma en el período, y los que están en circulación hoy.
3. **Given** datos consistentes, **When** se evalúan las conciliaciones, **Then** el panel indica que cartas y créditos cierran.
4. **Given** que los créditos emitidos menos los cobrados no coinciden con los que están en circulación, **When** se muestra el panel, **Then** avisa que la conciliación no cierra y muestra la diferencia, sin corregir nada.
5. **Given** que los estados de las cartas no suman las emitidas, o que un jugador no tiene exactamente 100 tokens, **When** se muestra el panel, **Then** avisa que la conciliación de cartas no cierra, con la cantidad de jugadores afectados.

---

### User Story 5 - Acotar el panel a un período (Priority: P5)

El administrador elige un período con un atajo o con un rango de fechas, y las métricas de período, los rankings y el gráfico de actividad pasan a mostrar solo lo ocurrido en ese período. Las métricas de estado no cambian y se distinguen de las demás.

**Why this priority**: Permite comparar momentos y responder preguntas como «cuánto se vendió este mes», pero se apoya en que las métricas de las historias anteriores existan.

**Independent Test**: Con ventas en dos meses distintos (100 créditos en septiembre, 300 en octubre), elegir octubre y verificar que el precio promedio es 300 y las ventas son 1; elegir «Todo» y verificar 200 y 2. Verificar que las cartas en circulación son las mismas en ambos casos.

**Acceptance Scenarios**:

1. **Given** el panel recién abierto, **When** se muestra, **Then** tiene aplicado el período de los últimos 30 días, e indica cuál es.
2. **Given** los atajos 7, 30 y 90 días y «Todo», **When** el administrador elige uno, **Then** las métricas de período se actualizan sin cambiar de pantalla.
3. **Given** un rango «desde–hasta», **When** lo aplica, **Then** las métricas de período cuentan solo lo ocurrido en esos días, ambos inclusive.
4. **Given** un período cualquiera, **When** se muestra el panel, **Then** las métricas de estado y las conciliaciones son las mismas que con cualquier otro período, y el panel distingue cuáles dependen del período y cuáles no.
5. **Given** un rango invertido, **When** el administrador intenta aplicarlo, **Then** el panel muestra un mensaje claro, no consulta y sigue mostrando lo que tenía.
6. **Given** una fecha futura, **When** intenta elegirla, **Then** no es posible; si se envía igual al servidor, se rechaza como inválida.
7. **Given** un período sin ninguna operación, **When** se aplica, **Then** el panel indica que no hubo actividad, sin promedio y sin error.
8. **Given** un período de hasta 31 días, **When** se muestra el gráfico de actividad, **Then** va por día; de hasta 26 semanas, por semana; más largo, por mes.
9. **Given** el gráfico de actividad, **When** se suman sus tramos, **Then** coinciden con los sobres abiertos y las ventas concretadas del período.

---

### Edge Cases

- **Sin administrador**: si nunca se ejecutó el seed, la aplicación funciona igual y el panel no es accesible para nadie.
- **Varios administradores**: el sistema admite más de uno; el seed administra la cuenta que tiene configurada. Cambiar el correo configurado crea otra cuenta y no le quita el rol a la anterior.
- **Sesiones anteriores a la feature**: siguen siendo válidas y se tratan como de usuario común, salvo que la cuenta tenga el rol.
- **Cuenta común promovida**: conserva cartas, saldo e historial. Deja de contar como usuario registrado, y sus cartas siguen en circulación.
- **Administrador con saldo**: si la cuenta promovida tiene créditos, puede usarlos como cualquier otra. El panel no la excluye de las conciliaciones, ni de las ventas concretadas.
- **Sin cotizaciones ni tokens**: el panel muestra ceros y las conciliaciones cierran.
- **Un jugador sin emisión completa**: sus tokens cuentan en sus estados, y la conciliación por jugador lo informa como afectado.
- **Rareza sin dato**: las cartas de un jugador sin reputación cuentan como `common`, la misma regla única de rareza del resto del sistema (spec 08, FR-068 y FR-069), de modo que la distribución siga sumando el total.
- **Rareza cambiante**: la distribución usa la rareza vigente, y puede cambiar sin que cambie ninguna carta. La venta conserva la rareza de su momento.
- **Ventas de la plataforma**: cuentan como ventas concretadas y en el promedio; lo cobrado además cuenta como créditos cobrados por la plataforma.
- **Venta entre usuarios**: cuenta en el volumen, pero no en los créditos cobrados, porque pasan de una cuenta a otra sin salir de circulación.
- **Empate en la venta más alta**: se muestra la más reciente.
- **Operaciones durante la consulta**: todos los números de una carga corresponden al mismo cálculo; pueden tener hasta 1 minuto de antigüedad.
- **Tramos del gráfico**: las semanas van de lunes a domingo. El primer y el último tramo pueden quedar parciales, y cuentan solo lo que cae dentro del período.
- **Zona horaria**: los días del período y los tramos del gráfico se toman en la zona horaria del administrador, igual que en el filtro de la spec 10.
- **Período «Todo»**: arranca en la primera operación registrada. Sin operaciones, el gráfico queda vacío.
- **Cambio rápido de período**: si el administrador cambia de período con una carga en curso, el panel muestra solo el resultado del último que eligió.
- **Sesión vencida con el panel abierto**: el siguiente pedido se rechaza y la persona es llevada a iniciar sesión (spec 05).
- **Proveedor externo caído**: no afecta; todo sale de datos locales.

## Requirements *(mandatory)*

### Functional Requirements

**Rol de administrador**

- **FR-001**: Toda cuenta MUST tener exactamente un rol: usuario o administrador. Las cuentas existentes y las creadas por el registro público MUST tener el rol de usuario.
- **FR-002**: El rol de administrador MUST NOT poder obtenerse desde la aplicación: ningún pedido de registro, inicio de sesión ni otra operación pública MAY otorgarlo o cambiarlo.
- **FR-003**: El inicio de sesión y el registro MUST informar el rol de la cuenta, para que el cliente web decida qué mostrar. Esa información MUST NOT ser lo que autoriza el acceso a los datos.
- **FR-004**: La autorización de administrador MUST verificarse en el servidor en cada pedido, contra el rol actual de la cuenta. Una cuenta que perdió el rol MUST ser rechazada aunque su sesión siga vigente.
- **FR-005**: El rol de administrador MUST NOT dar acceso a los procesos protegidos por la clave administrativa (spec 05, FR-010), y la clave administrativa MUST NOT dar acceso al panel.
- **FR-006**: El rol de administrador MUST NOT dar ninguna capacidad sobre tokens, saldos, sobres, cotizaciones ni publicaciones. Sus operaciones de usuario MUST seguir las mismas reglas que las de cualquier otra cuenta.

**Seed del administrador**

- **FR-007**: MUST existir un proceso de carga inicial, ejecutable por quien opera el entorno, que cree la cuenta administradora con las credenciales definidas en la configuración del entorno. Las credenciales MUST NOT estar escritas en el repositorio.
- **FR-008**: El seed MUST validar el correo y la contraseña con las mismas reglas que el registro (spec 05) y MUST guardar la contraseña con el mismo mecanismo. Si las credenciales faltan o son inválidas, MUST fallar con un mensaje claro y sin efectos.
- **FR-009**: Una cuenta creada por el seed MUST arrancar con saldo 0 y MUST NOT recibir entrega inicial de créditos. El proceso que entrega los créditos pendientes (spec 08, FR-002) MUST excluir a las cuentas administradoras, tanto al arrancar la aplicación como al dispararse a mano.
- **FR-010**: El seed MUST ser repetible: si la cuenta ya es administradora MUST NOT cambiar nada. Si existe como cuenta común, MUST otorgarle el rol sin cambiar su contraseña, su saldo ni sus cartas. MUST NOT crear cuentas duplicadas.
- **FR-011**: El seed MUST indicar si creó la cuenta, si otorgó el rol o si no hizo cambios, y MUST NOT mostrar ni registrar la contraseña.

**Acceso al panel**

- **FR-012**: El cliente web MUST ofrecer el acceso al panel en el encabezado solo a las cuentas administradoras.
- **FR-013**: Una persona sin sesión que intente entrar al panel MUST ser llevada a iniciar sesión. Un usuario común MUST ser llevado a la home, sin ver datos.
- **FR-014**: El servidor MUST rechazar los pedidos de datos del panel: sin sesión válida como no autenticados, y con una sesión válida sin el rol como prohibidos. Una respuesta rechazada MUST NOT incluir ninguna métrica.

**Métricas clave**

- **FR-015**: El panel MUST mostrar usuarios registrados, cartas en circulación, cartas en sobres, pool de sobres restantes y precio de venta promedio, con las definiciones de la tabla «Qué significa cada métrica».
- **FR-016**: Sin ventas, el precio de venta promedio MUST indicarse como no disponible, no como 0.

**Desgloses**

- **FR-017**: El panel MUST mostrar las cartas emitidas y su reparto entre en circulación, en sobres, reservadas y en venta de la plataforma, y aparte las cartas a la venta en el Market.
- **FR-018**: El panel MUST mostrar, por cada tipo de sobre, los sobres sin abrir y los abiertos, y MUST marcar los tipos agotados.
- **FR-019**: El panel MUST mostrar las cartas en circulación por rareza vigente, según la regla única de rareza del sistema (spec 08, FR-069). La suma MUST coincidir con las cartas en circulación.
- **FR-020**: El panel MUST mostrar las ventas concretadas, el volumen de ventas, la venta más alta con su jugador y hasta 5 jugadores con más ventas, con un desempate estable.
- **FR-021**: Las métricas de mercado MUST calcularse con los precios registrados en cada compra, no con las cotizaciones vigentes.

**Actividad y conciliación**

- **FR-022**: El panel MUST mostrar los usuarios nuevos y activos del período, y un gráfico de aperturas de sobres y ventas a lo largo del período, incluidos los tramos sin actividad. Los tramos MUST ser por día en períodos de hasta 31 días, por semana hasta 26 semanas y por mes en períodos más largos.
- **FR-023**: El panel MUST mostrar los créditos emitidos, los cobrados por la plataforma y los que están en circulación.
- **FR-024**: El panel MUST evaluar dos conciliaciones sobre toda la historia, sin importar el período elegido: la de cartas (los estados suman las emitidas y cada jugador con tokens tiene exactamente 100) y la de créditos (emitidos menos cobrados igual a en circulación).
- **FR-025**: Si una conciliación no cierra, el panel MUST avisarlo con la diferencia o la cantidad de jugadores afectados. MUST NOT corregir ningún dato.

**Presentación**

- **FR-026**: El panel MUST indicar la hora en que se calcularon los datos y MUST ofrecer actualizarlos. Los datos MUST NOT tener más de 1 minuto de antigüedad, y todos los números de una carga MUST venir del mismo cálculo.
- **FR-027**: Mientras carga, el panel MUST indicarlo. Si falla, MUST mostrar un mensaje de error con opción de reintentar, sin mostrar números inventados.
- **FR-028**: Todo dato mostrado en un gráfico MUST estar también disponible como texto.
- **FR-029**: El panel MUST verse correctamente en pantallas de teléfono, sin desplazamiento horizontal de la página.

**Solo lectura, errores y observabilidad**

- **FR-030**: Consultar el panel MUST NOT crear, modificar ni borrar ningún registro.
- **FR-031**: El panel MUST NOT mostrar datos personales de los usuarios (correos, nombres, saldos individuales ni contenido de sobres sin abrir). Solo muestra cantidades agregadas y nombres de jugadores.
- **FR-032**: Todo error MUST responderse con el formato estándar de la API (código, mensaje legible e identificador de trazabilidad), con los códigos de la tabla siguiente.
- **FR-033**: Cada acceso rechazado por falta de rol MUST quedar registrado con su identificador de trazabilidad.
- **FR-034**: Los endpoints nuevos o ampliados MUST estar documentados en el contrato de la API, incluidos sus códigos de error.

**Cuentas comunes**

- **FR-035**: El seed MUST crear únicamente la cuenta administradora. Las cuentas comunes MUST seguir creándose solo por el registro de la web (spec 05), que no cambia salvo por informar el rol.

**Selector de fechas**

- **FR-036**: El panel MUST ofrecer un selector de período con los atajos 7, 30 y 90 días y «Todo», y un rango «desde–hasta» con ambos días inclusive. Al abrirse MUST aplicar los últimos 30 días e indicar qué período se está mostrando.
- **FR-037**: El período MUST acotar las métricas de período de la tabla «Qué significa cada métrica», el ranking de jugadores y el gráfico de actividad. MUST NOT cambiar las métricas de estado ni las conciliaciones, y el panel MUST distinguir unas de otras.
- **FR-038**: Los días del período y los tramos del gráfico MUST tomarse en la zona horaria del administrador.
- **FR-039**: El selector MUST impedir elegir una fecha futura y aplicar un rango invertido. Una fecha mal formada, una fecha futura, un rango invertido, un rango incompleto o una zona horaria desconocida enviados igualmente MUST rechazarse como entrada inválida, sin devolver métricas.
- **FR-040**: La suma de los tramos del gráfico de actividad MUST coincidir con los sobres abiertos y las ventas concretadas del período.

### Códigos de error

| Situación | HTTP | Código |
|---|---|---|
| Sin sesión o sesión inválida | 401 | `UNAUTHENTICATED` |
| Sesión válida sin el rol de administrador | 403 | `FORBIDDEN` |
| Entrada inválida (fecha mal formada o futura, rango invertido o incompleto, zona horaria desconocida) | 422 | `VALIDATION_ERROR` |
| Error inesperado (sin efectos) | 500 | `INTERNAL_ERROR` |

### Key Entities

- **Cuenta de usuario** *(spec 05, se amplía)*: suma un rol, usuario o administrador. No cambia ninguno de sus otros datos.
- **Métricas de la plataforma** *(derivada, no se persiste)*: la foto agregada que muestra el panel, con la hora en que se calculó. Se construye a partir de cuentas, tokens, sobres, aperturas, publicaciones, compras y movimientos de créditos.
- **Conciliación** *(derivada)*: el resultado de comprobar que cartas y créditos cierran: estado (cierra / no cierra) y diferencia.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Con credenciales configuradas, una sola ejecución del seed deja una cuenta administradora que puede iniciar sesión, y ejecutarlo más veces no crea duplicados (0 casos).
- **SC-002**: El 100 % de los intentos de obtener el rol desde la aplicación fallan.
- **SC-003**: El 100 % de los pedidos al panel sin sesión o sin el rol son rechazados sin devolver ninguna métrica.
- **SC-004**: Una cuenta que perdió el rol es rechazada desde su primer pedido siguiente.
- **SC-005**: Con datos de prueba conocidos, el 100 % de las métricas coinciden con el valor esperado según su definición.
- **SC-006**: Un administrador encuentra cualquiera de las cinco métricas pedidas en no más de 2 interacciones después de iniciar sesión (abrir el panel y leer).
- **SC-007**: El panel muestra sus datos en menos de 2 segundos en el 95 % de las cargas, con 10.000 usuarios y 100.000 tokens.
- **SC-008**: Los datos mostrados nunca tienen más de 1 minuto de antigüedad.
- **SC-009**: El 100 % de las inconsistencias introducidas a propósito en cartas o créditos se muestran como conciliación que no cierra, y ninguna se corrige sola.
- **SC-010**: Consultar el panel no agrega ni modifica ningún registro (0 cambios).
- **SC-011**: Ninguna respuesta del panel contiene correos, nombres de usuario ni saldos individuales (0 casos).
- **SC-012**: La contraseña del administrador no aparece en el repositorio, en la salida del seed ni en los registros (0 casos).
- **SC-013**: Con ventas de prueba en períodos distintos, el 100 % de las métricas de período coinciden con lo ocurrido en el período elegido, y las de estado no cambian al cambiar de período.
- **SC-014**: Un administrador cambia de período en no más de 2 interacciones.
- **SC-015**: El 100 % de los períodos inválidos son rechazados sin mostrar ninguna métrica.

## Assumptions

- **Un solo tipo de administrador**: no hay permisos por sección ni niveles. Lo que ve un administrador lo ven todos.
- **Sin gestión de roles en la aplicación**: otorgar el rol es solo por seed. Quitarlo se hace directamente sobre la base y no tiene pantalla.
- **Seed de operación**: se ejecuta a mano al preparar un entorno. No corre al arrancar la aplicación ni forma parte de las migraciones.
- **Promoción por seed**: quien ejecuta el seed ya controla el entorno y la base, así que promover una cuenta existente no le da más poder del que tiene. Es la forma de resolver un correo ya registrado sin crear duplicados.
- **Saldo 0 sin movimiento**: como la cuenta del seed no recibe créditos, no hay emisión ni movimiento que registrar, y la conciliación de créditos no se ve afectada. Hoy la entrega pendiente corre al arrancar y alcanza a toda cuenta sin entrega inicial, así que sin la exclusión de FR-009 el administrador recibiría créditos en el siguiente reinicio.
- **Métricas calculadas al consultar**: no se guardan fotos históricas. La actividad sale de los registros inmutables existentes (aperturas y compras) y de la fecha de alta de las cuentas.
- **Usuarios activos**: se mide por operaciones (aperturas, compras y ventas), no por inicios de sesión, porque los inicios de sesión no se registran.
- **Compras a la plataforma**: hoy ningún flujo devuelve tokens a la plataforma (spec 08), por lo que las cartas en venta de la plataforma y sus compras estarán en 0 hasta que exista ese flujo. El panel igual las contempla.
- **Alcance del selector de fechas**: las métricas de estado no se pueden ver a una fecha pasada, porque el sistema no guarda fotos históricas. Reconstruirlas desde los eventos queda fuera de alcance.
- **Gráficos con librería**: el equipo autorizó sumar una librería de gráficos, habilitada por la constitución v4.2.0, §2. Los gráficos de las specs anteriores no cambian.
- **Constitución**: el rol de administrador no contradice «No existe un superusuario» (§5): la constitución v4.2.0 aclara que esa cuenta no posee tokens por su rol ni representa a la plataforma.
- **Fuera de alcance**: gestión de usuarios (listar, buscar, bloquear o eliminar cuentas); editar precios de sobres, reputaciones o estrategias; disparar procesos desde el panel; exportar métricas; alertas y notificaciones; métricas históricas guardadas; registro de auditoría de accesos al panel distinto de los logs; y cualquier cambio en sobres, mercado o cotizaciones.
