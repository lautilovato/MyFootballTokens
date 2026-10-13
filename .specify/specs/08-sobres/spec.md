# Feature Specification: Créditos, Sobres e Inventario

**Feature Branch**: `08-sobres`

**Created**: 2026-10-13

**Status**: Draft

**Input**: User description: "Una cantidad de monedas iniciales para abrir sobres; abrir sobres en los que tocan cartas para poder listarlas posteriormente (no en esta spec); en un principio no hay cartas en el mercado, las primeras cartas son las que se van abriendo en sobres; lo que le toca a un usuario en un sobre por ahora solo se guarda en su inventario."

**Depende de**: `05-auth` (la sesión de usuario y el registro de cuentas), `07-cotizacion` (el precio vigente de cada jugador: sin cotización no hay carta que entregar), `01-catalogo-jugadores` y `03-ingesta-stats` (el jugador y los datos de los que se deriva su rareza) y la constitución v3.2.0, §4 (registro inmutable de transacciones financieras), §5 (tokens, créditos y momento cero) y §6 (validar disponibilidad y saldos antes de ejecutar).

**Habilita (specs posteriores, fuera de alcance acá)**: el mercado —listar, vender, comprar y transferir cartas—, el portfolio con ganancias y pérdidas y la pantalla de sobres e inventario del cliente web.

## Contexto de negocio

Cada jugador tiene **100 tokens** emitidos. Todos nacen en poder de un único **superusuario** y **ninguno está a la venta**. Para que un usuario consiga alguno hay un solo camino: **abrir un sobre**.

Un **sobre** cuesta créditos y entrega, al azar, un conjunto de **cartas**. Una **carta** es **un token de un jugador**: recibir la carta de un jugador es recibir uno de sus 100 tokens, que deja de ser del superusuario y pasa a ser del usuario. Un usuario puede recibir más de una carta del mismo jugador.

Los **créditos** son números enteros. Cada cuenta nueva arranca con una cantidad inicial; con ellos se abren sobres.

**El mercado empieza vacío.** Las primeras cartas que existen fuera del superusuario son las que se van abriendo en sobres. Esta feature termina cuando la carta queda guardada en el **inventario** del usuario: desde ahí no se puede listar, vender, comprar ni transferir. Eso lo resuelve la spec del mercado.

**Momento cero de un token**: el instante en que sale de un sobre. Se valúa con la cotización vigente del jugador en ese instante (constitución §5, spec 07), y ese valor queda registrado para siempre junto a la apertura.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recibir créditos iniciales y ver mi saldo (Priority: P1)

Una persona crea su cuenta y arranca con una cantidad inicial de créditos. En cualquier momento puede consultar cuántos créditos tiene. Los usuarios que ya existían antes de esta feature reciben también esa cantidad, una sola vez.

**Why this priority**: Sin créditos no hay sobres. Entregada sola, ya da a cada usuario un saldo propio y auditable, que es la base de todo lo demás.

**Independent Test**: Registrar una cuenta nueva y consultar su saldo; verificar que coincide con la cantidad inicial configurada. Con una cuenta anterior a la feature, verificar que recibe la cantidad una sola vez aunque el proceso se repita.

**Acceptance Scenarios**:

1. **Given** una persona que se registra, **When** se crea su cuenta, **Then** su saldo es exactamente la cantidad inicial configurada y queda registrado el movimiento que lo originó.
2. **Given** una persona con sesión iniciada, **When** consulta su saldo, **Then** recibe su cantidad de créditos como un número entero.
3. **Given** un usuario creado antes de esta feature, **When** la feature se activa, **Then** recibe la cantidad inicial, una sola vez.
4. **Given** que el proceso de entrega a usuarios existentes se ejecuta por segunda vez, **When** termina, **Then** ningún saldo cambió respecto de la primera ejecución.
5. **Given** dos usuarios, **When** uno consulta su saldo, **Then** nunca ve ni puede pedir el del otro.
6. **Given** una persona sin sesión iniciada, **When** consulta un saldo, **Then** la petición es rechazada.
7. **Given** que se registran dos cuentas a la vez, **When** ambas terminan, **Then** cada una tiene su cantidad inicial exacta, sin duplicar ni perder ninguna.

---

### User Story 2 - Abrir un sobre y recibir cartas (Priority: P1)

Un usuario con saldo suficiente abre un sobre. El sistema le cobra el precio, sortea un conjunto de cartas de jugadores con cotización y se las entrega. El usuario ve de inmediato qué le tocó: de qué jugador es cada carta, su rareza y cuánto valía el jugador en ese momento.

**Why this priority**: Es la funcionalidad central y la única forma de que existan cartas fuera del superusuario. Entregada junto con los créditos, ya es un producto usable.

**Independent Test**: Con un usuario con créditos y jugadores cotizados, abrir un sobre y verificar que el saldo baja exactamente el precio, que se reciben tantas cartas como indica el sobre, que cada una es de un jugador cotizado y que cada token recibido salió del superusuario.

**Acceptance Scenarios**:

1. **Given** un usuario con saldo igual o mayor al precio del sobre, **When** lo abre, **Then** su saldo disminuye exactamente el precio y recibe la cantidad configurada de cartas.
2. **Given** esa apertura, **When** se muestra el resultado, **Then** cada carta informa el jugador, su rareza y la cotización del jugador vigente en ese instante.
3. **Given** un usuario con menos créditos que el precio, **When** intenta abrir un sobre, **Then** es rechazado con un mensaje claro y no se cobra ni se entrega nada.
4. **Given** un usuario con exactamente el precio, **When** abre un sobre, **Then** la apertura se completa y su saldo queda en 0.
5. **Given** un jugador sin cotización, **When** se sortea un sobre, **Then** ninguna de sus cartas puede aparecer.
6. **Given** un jugador cuyos 100 tokens ya salieron todos, **When** se sortea un sobre, **Then** ninguna carta suya puede aparecer.
7. **Given** que aún no se calculó ninguna cotización, **When** un usuario intenta abrir un sobre, **Then** es rechazado con un mensaje claro y no se cobra nada.
8. **Given** que no quedan tokens suficientes en el superusuario para completar un sobre, **When** un usuario intenta abrirlo, **Then** es rechazado con un mensaje claro y no se cobra nada: no se entregan sobres incompletos.
9. **Given** un usuario con saldo para un solo sobre, **When** envía dos aperturas al mismo tiempo, **Then** exactamente una se completa y la otra es rechazada por saldo insuficiente; el saldo nunca queda negativo.
10. **Given** dos usuarios que abren sobres al mismo tiempo, **When** ambos terminan, **Then** ningún token fue entregado dos veces y ningún jugador supera sus 100 tokens.
11. **Given** una apertura que falla en cualquier punto, **When** termina con error, **Then** el saldo y el inventario son idénticos a los de antes de empezar.
12. **Given** un sobre con varias cartas, **When** sale más de una del mismo jugador, **Then** el usuario recibe ambas y su inventario suma las dos.
13. **Given** una persona sin sesión iniciada, **When** intenta abrir un sobre, **Then** la petición es rechazada.
14. **Given** una petición que intenta indicar a nombre de qué usuario abrir el sobre, **When** se procesa, **Then** el usuario siempre es el de la sesión.

---

### User Story 3 - Ver mi inventario (Priority: P2)

Un usuario consulta qué cartas tiene: por cada jugador, cuántas, y cuándo y a qué valor las obtuvo. Las cartas quedan guardadas ahí; no se pueden listar, vender ni transferir todavía.

**Why this priority**: Es el destino de todo lo que sale de un sobre y lo que va a consumir el mercado más adelante. Depende de que existan aperturas, por eso va después.

**Independent Test**: Abrir varios sobres con un mismo usuario y verificar que el inventario suma las cartas por jugador y que coincide con lo entregado; verificar que otro usuario no lo ve.

**Acceptance Scenarios**:

1. **Given** un usuario que abrió sobres, **When** consulta su inventario, **Then** ve cada jugador que tiene con la cantidad de cartas, y la suma de todas las cantidades es igual a las cartas recibidas.
2. **Given** un usuario sin sobres abiertos, **When** consulta su inventario, **Then** recibe una lista vacía, no un error.
3. **Given** un jugador con cartas en el inventario, **When** se muestra, **Then** incluye lo necesario para reconocerlo: nombre, posición, club, rareza e imagen si la tiene.
4. **Given** un usuario, **When** consulta el inventario de otro, **Then** es rechazado.
5. **Given** cualquier carta del inventario, **When** el usuario intenta listarla, venderla o transferirla, **Then** la funcionalidad no existe: no hay forma de sacarla del inventario.
6. **Given** un inventario grande, **When** se consulta, **Then** la respuesta se pagina y el total informado permite recorrerla completa.

---

### User Story 4 - Consultar el historial de aperturas (Priority: P3)

Un usuario consulta sus aperturas pasadas: cuándo, cuánto pagó, cuánto saldo tenía antes y después, y qué cartas le tocaron con la cotización de cada jugador en ese momento. Los registros no se pueden modificar ni borrar.

**Why this priority**: Es el registro inmutable que exige la constitución §4 y el insumo para el portfolio, pero el sistema entrega valor antes de poder consultarlo.

**Independent Test**: Abrir varios sobres, consultar el historial y verificar que cada registro reproduce el saldo (antes − precio = después), que sus cartas coinciden con lo que sumó el inventario y que ninguno se puede alterar.

**Acceptance Scenarios**:

1. **Given** un usuario con aperturas, **When** consulta su historial, **Then** las ve de la más reciente a la más antigua, con fecha, precio, saldo antes y después y sus cartas.
2. **Given** cualquier apertura, **When** se revisa, **Then** saldo antes menos precio es igual al saldo después.
3. **Given** cualquier apertura, **When** se revisan sus cartas, **Then** cada una conserva el jugador, la rareza y la cotización que tenían en ese instante, aunque después cambien.
4. **Given** una apertura registrada, **When** se intenta modificarla o borrarla, **Then** el sistema no lo permite.
5. **Given** el historial de un usuario, **When** otro usuario lo consulta, **Then** es rechazado.
6. **Given** el movimiento de créditos inicial y los de cada apertura, **When** se suman en orden, **Then** reconstruyen el saldo actual exactamente.
7. **Given** cada registro, **When** se revisa, **Then** conserva el identificador de trazabilidad de la solicitud que lo originó.

---

### Edge Cases

- **Saldo justo**: un usuario con exactamente el precio puede abrir un sobre y queda en 0; con un crédito menos, no.
- **Doble envío**: dos aperturas casi simultáneas del mismo usuario son dos aperturas independientes, cada una cobra su precio. Si el saldo alcanza solo para una, la otra se rechaza. Evitar el doble clic es tarea del cliente.
- **Jugadores agotados**: cuando un jugador se queda sin tokens en el superusuario deja de poder salir; el sorteo sigue con los demás.
- **Rareza agotada**: si no quedan tokens disponibles de una rareza, el sorteo reparte entre las rarezas que sí tienen, manteniendo las proporciones relativas de las que quedan.
- **Rareza cambiante**: la rareza de un jugador se deriva de su valoración y puede cambiar cuando se actualizan sus estadísticas. Cada apertura registra la rareza que tenía **en ese momento**.
- **Cotización cambiante**: un recálculo entre dos aperturas hace que el mismo jugador se valúe distinto; cada carta registra la del instante en que salió.
- **Sin cotizaciones**: antes del primer recálculo de cotizaciones no hay nada que entregar y los sobres no se pueden abrir.
- **Superusuario**: no tiene credenciales de acceso, no abre sobres y no tiene inventario de usuario; es solo el origen de los tokens.
- **Cambio de configuración**: si cambia el precio o el tamaño del sobre, rige para las aperturas siguientes; las anteriores conservan lo que se aplicó.
- **Usuario sin saldo inicial**: un usuario que por cualquier motivo no recibió el saldo (por ejemplo, creado durante la activación) lo recibe en la siguiente verificación, sin duplicarlo.
- **Emisión incompleta**: un jugador cuya emisión de 100 tokens no se hubiera generado todavía no puede entregar cartas hasta que lo esté.
- **Cuenta eliminada o inconsistente**: nunca puede haber un token en poder de un usuario inexistente.

## Requirements *(mandatory)*

### Functional Requirements

**Créditos**

- **FR-001**: Toda cuenta nueva MUST recibir al crearse la cantidad inicial de créditos configurada, como un número entero.
- **FR-002**: Los usuarios existentes antes de esta feature MUST recibir esa misma cantidad exactamente una vez; repetir el proceso MUST NOT volver a acreditarla.
- **FR-003**: Un usuario MUST poder consultar su propio saldo en cualquier momento.
- **FR-004**: El saldo MUST NOT ser negativo en ningún momento, ni siquiera ante pedidos simultáneos.
- **FR-005**: Los créditos MUST ser siempre números enteros: ninguna operación admite fracciones.
- **FR-006**: Todo cambio de saldo MUST registrarse como un movimiento inmutable con: usuario, tipo (entrega inicial o compra de sobre), monto, saldo antes, saldo después, fecha e identificador de trazabilidad.

**Apertura de sobres**

- **FR-007**: Un usuario con sesión MUST poder abrir un sobre pagando su precio en créditos.
- **FR-008**: Antes de cobrar, el sistema MUST validar que el saldo alcanza para el precio y que hay tokens disponibles para completar todo el sobre.
- **FR-009**: Una apertura MUST ser atómica: o se cobra el precio y se entregan **todas** las cartas, o no se cobra ni se entrega nada.
- **FR-010**: Si no hay tokens disponibles para completar el sobre, la apertura MUST rechazarse con un mensaje claro y sin cobrar; MUST NOT entregarse un sobre incompleto.
- **FR-011**: Cada carta MUST ser un token de un jugador que **tenga cotización vigente** y **tenga tokens disponibles** en el superusuario. Un jugador sin cotización MUST NOT salir en un sobre.
- **FR-012**: Cada token entregado MUST dejar de pertenecer al superusuario y pasar al usuario. Ningún jugador MUST superar jamás sus 100 tokens: para cada jugador, los tokens del superusuario más los de todos los usuarios suman siempre 100.
- **FR-013**: Dos aperturas simultáneas MUST NOT entregar el mismo token ni dejar un saldo negativo.
- **FR-014**: Un usuario MUST poder recibir más de una carta del mismo jugador, incluso en un mismo sobre.
- **FR-015**: El usuario del sobre MUST salir siempre de la sesión; MUST NOT aceptarse un usuario indicado en el pedido.
- **FR-016**: El resultado de la apertura MUST informar, por cada carta: el jugador, su rareza y la cotización del jugador en ese instante.

**Sorteo**

- **FR-017**: Cada carta MUST sortearse con probabilidades configurables por **rareza** del jugador (`legendary`, `epic`, `rare`, `common`): las más raras salen con menor probabilidad.
- **FR-018**: Dentro de una rareza, todos los jugadores elegibles MUST tener la misma probabilidad de salir.
- **FR-019**: Si una rareza no tiene ningún jugador elegible, el sorteo MUST repartir entre las demás manteniendo sus proporciones relativas.
- **FR-020**: La rareza MUST tomarse del jugador en el momento del sorteo, con la misma regla que usa el catálogo.

**Inventario**

- **FR-021**: Cada carta recibida MUST sumarse al inventario del usuario, que MUST mostrar por jugador la cantidad de cartas que posee.
- **FR-022**: El inventario MUST incluir, para reconocer a cada jugador: nombre, posición, club, rareza e imagen si la tiene.
- **FR-023**: El inventario MUST estar paginado.
- **FR-024**: Las cartas del inventario MUST NOT poder listarse, venderse, comprarse ni transferirse: esta feature no ofrece ninguna operación que las saque del inventario.

**Historial y auditoría**

- **FR-025**: Cada apertura MUST registrarse de forma inmutable con: usuario, fecha, precio cobrado, cantidad de cartas, saldo antes y después, identificador de trazabilidad y los parámetros del sobre aplicados.
- **FR-026**: Cada carta de una apertura MUST registrarse con: jugador, rareza y cotización del jugador vigentes en el instante del sorteo. Esos valores MUST NOT cambiar después.
- **FR-027**: Un usuario MUST poder consultar el historial de sus propias aperturas, paginado y de la más reciente a la más antigua.
- **FR-028**: Los registros de aperturas y de movimientos de créditos MUST NOT poder modificarse ni borrarse.
- **FR-029**: Entre el movimiento de créditos y la apertura MUST existir una referencia que permita reconstruir cualquiera a partir de la otra.

**Emisión y superusuario**

- **FR-030**: Cada jugador del catálogo MUST tener exactamente 100 tokens emitidos, inicialmente todos en poder del superusuario. La emisión MUST ser idempotente: repetirla no crea tokens de más.
- **FR-031**: Un jugador nuevo del catálogo MUST pasar a tener su emisión de 100 tokens sin intervención manual.
- **FR-032**: El superusuario MUST ser único, MUST NOT poder iniciar sesión y MUST NOT poder abrir sobres.
- **FR-033**: Los créditos que cobra cada apertura MUST acreditarse a la cuenta del superusuario, de modo que el total de créditos del sistema se conserve.

**Configuración**

- **FR-034**: Los créditos iniciales, el precio del sobre, la cantidad de cartas por sobre y las probabilidades por rareza MUST ser configurables sin modificar el código, y MUST validarse (enteros positivos; probabilidades no negativas con al menos una positiva).
- **FR-035**: Un cambio de configuración MUST regir solo para las aperturas posteriores, y cada apertura MUST conservar los parámetros con los que se hizo.

**Acceso, seguridad y observabilidad**

- **FR-036**: Todas las operaciones MUST exigir sesión de usuario válida. Un usuario MUST ver únicamente su propio saldo, inventario e historial.
- **FR-037**: Toda entrada MUST validarse; ninguna entrada inválida puede producir efectos parciales.
- **FR-038**: Cada apertura y cada movimiento MUST emitir registros estructurados con el identificador de trazabilidad de la solicitud.
- **FR-039**: Todos los endpoints nuevos MUST estar documentados en el contrato de la API.

### Key Entities

- **Cuenta de créditos** *(atributo del usuario)*: saldo entero y no negativo. Cada usuario tiene una; el superusuario también.
- **Movimiento de créditos**: registro inmutable de un cambio de saldo. Atributos: usuario, tipo (entrega inicial / compra de sobre), monto, saldo antes, saldo después, fecha, trazabilidad, referencia a la apertura si la hubo.
- **Emisión de tokens**: los 100 tokens de un jugador. Cada token pertenece a exactamente un dueño: el superusuario o un usuario.
- **Apertura de sobre**: un evento de apertura. Atributos: usuario, fecha, precio, cantidad de cartas, saldo antes y después, parámetros aplicados, trazabilidad. Inmutable.
- **Carta obtenida**: una carta de una apertura. Atributos: apertura, jugador, rareza en el instante, cotización del jugador en el instante. Inmutable.
- **Tenencia** *(inventario)*: cuántos tokens de un jugador posee un usuario. Se deriva de las cartas obtenidas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 95 % de las aperturas devuelven sus cartas al usuario en menos de 2 segundos.
- **SC-002**: En el 100 % de las aperturas que fallan por cualquier motivo, el saldo y el inventario quedan idénticos a los de antes de empezar.
- **SC-003**: Tras 1.000 aperturas simultáneas de usuarios distintos, para el 100 % de los jugadores los tokens del superusuario más los de todos los usuarios suman exactamente 100.
- **SC-004**: Con un saldo para `k` sobres y más de `k` aperturas simultáneas del mismo usuario, se completan exactamente `k` y el saldo final es no negativo.
- **SC-005**: El 100 % de las cuentas nuevas arrancan con la cantidad inicial exacta, y el 100 % de las cuentas anteriores la reciben exactamente una vez, aun si el proceso se ejecuta varias veces.
- **SC-006**: En 10.000 aperturas simuladas, la proporción de cartas de cada rareza difiere en menos de 2 puntos porcentuales de la probabilidad configurada, mientras esa rareza tenga tokens disponibles.
- **SC-007**: Para el 100 % de las aperturas registradas, saldo antes − precio = saldo después, y las cartas registradas coinciden con lo que sumó el inventario.
- **SC-008**: Ninguna carta de un jugador sin cotización se entrega nunca (0 casos).
- **SC-009**: El 100 % de los intentos de ver el saldo, el inventario o el historial de otro usuario son rechazados.
- **SC-010**: El 100 % de las peticiones sin sesión válida son rechazadas.
- **SC-011**: En el 100 % de los casos, sumando los movimientos de créditos de un usuario en orden se reconstruye su saldo actual.

## Assumptions

- **Valores por defecto** (configurables): 1.000 créditos iniciales, 100 créditos por sobre y 5 cartas por sobre. Probabilidades por rareza: `common` 70 %, `rare` 20 %, `epic` 8 %, `legendary` 2 %.
- **Equilibrio económico a revisar**: con estos valores, un sobre de 100 créditos entrega cartas cuyo valor de referencia (1/100 de la cotización de cada jugador) suma bastante menos. Es un punto de partida; conviene calibrarlo cuando exista la spec de venta y se defina cuánto vale un token individual.
- **Carta = token**: una carta es un único token de un jugador, no un objeto aparte.
- **Valor de referencia del token**: esta spec guarda la cotización **del jugador** vigente al sortear cada carta (créditos enteros). Cómo se traduce al precio de un token individual (propuesta: 1/100, con su redondeo) se define en la spec de venta.
- **Los sobres no tienen variantes**: todos cuestan lo mismo y entregan la misma cantidad de cartas.
- **Elegibilidad por cotización**: se considera elegible al jugador con al menos una cotización vigente y tokens disponibles. Esto incluye a jugadores sin estadísticas de la temporada actual que hubieran sido cotizados antes.
- **Dónde van los créditos**: lo que se cobra en cada apertura se acredita al superusuario, que actúa como cuenta de la plataforma, sin límite de saldo.
- **Configuración por entorno**: los parámetros se fijan por configuración del sistema y no hay una pantalla de administración para editarlos.
- **Usuarios y registro**: el registro de cuentas es el de la spec 05; esta feature solo suma el saldo inicial. El superusuario se crea por el sistema y no por registro.
- **Fuera de alcance**: listar, vender, comprar o transferir cartas; el mercado y sus precios; el portfolio con ganancias y pérdidas; la devolución o recompra de sobres; la pantalla de sobres e inventario del cliente web; y cualquier cambio en la home. La home seguirá mostrando la emisión como hoy (maqueta) hasta que una feature posterior la conecte a los datos reales de este módulo.
- **Sin idempotencia por clave**: cada apertura enviada es una apertura; evitar el doble envío accidental es responsabilidad del cliente.
