# Feature Specification: Créditos, Sobres e Inventario

**Feature Branch**: `08-sobres`

**Created**: 2026-10-13

**Status**: Draft (revisión 6)

**Input**: User description: "Una cantidad de monedas iniciales para abrir sobres; abrir sobres en los que tocan cartas para poder listarlas posteriormente (no en esta spec); en un principio no hay cartas en el mercado, las primeras cartas son las que se van abriendo en sobres; lo que le toca a un usuario en un sobre por ahora solo se guarda en su inventario."

**Revisión 2 (2026-10-13)**: se elimina el superusuario (los tokens sin dueño pertenecen a la plataforma); la entrega inicial de créditos pasa a ser una emisión; hay cuatro tipos de sobre con un stock finito que reparte exactamente todos los tokens; cada token tiene un ID y un historial propio; la rareza se deriva de la reputación; el inventario muestra solo los tokens que el usuario posee hoy; se definen los códigos de error.

**Revisión 6 (2026-10-13)**: el Market muestra solo jugadores con alguna carta a la venta (FR-070, SC-021); como el mercado arranca vacío, al principio no muestra ninguna. El inventario muestra una carta por token con su número de serie en la carta (FR-063), y el sobre comprado se abre grande y centrado (FR-058).

**Revisión 5 (2026-10-13)**: ajustes del análisis de consistencia: US2-16 (un usuario indicado en el pedido se rechaza), FR-047 (los disparos administrativos usan la credencial administrativa) y FR-050 (un registro por operación).

**Revisión 4 (2026-10-13)**: clarificaciones (ver Clarifications); el OVR pasa a ser la reputación mundial en todo el sistema (FR-067 a FR-069).

**Revisión 3 (2026-10-13)**: la pantalla de sobres y la pantalla de inventario del cliente web pasan a estar dentro del alcance (User Stories 5 y 6, FR-052 a FR-066; el historial de aperturas pasa a ser la User Story 7). Las pantallas de historial de una carta y de historial de aperturas siguen fuera.

**Depende de**: `05-auth` (la sesión de usuario y el registro de cuentas), `06-home` (el encabezado y la navegación del cliente web, y los cortes de rareza por OVR), `07-cotizacion` (el precio vigente de cada jugador: sin cotización no hay carta que entregar), `01-catalogo-jugadores` y `03-ingesta-stats` (el jugador, su reputación y la regla que deriva la rareza) y la constitución v4.0.0, §2 (animaciones y CSS propio por componente en el cliente), §4 (registro inmutable de transacciones financieras), §5 (tokens, créditos y momento cero), §6 (validar disponibilidad y saldos antes de ejecutar) y §7 (estructura del cliente web).

**Habilita (specs posteriores, fuera de alcance acá)**: el mercado —listar, vender, comprar y transferir cartas, incluida la compra de los tokens que la plataforma pone a la venta—, la carga de saldo, el portfolio con ganancias y pérdidas y las pantallas de historial de una carta y de historial de aperturas del cliente web.

## Contexto de negocio

Cada jugador tiene **100 tokens** emitidos. Cada token tiene un **ID único** y un **número de serie** del 1 al 100 dentro de su jugador. Al emitirse, los tokens **no tienen dueño**: están en poder de la **plataforma**. Ninguno se vende de forma directa: para que un usuario consiga uno hay un solo camino en esta feature, **abrir un sobre**.

Una **carta** es **un token de un jugador**. Recibir una carta es recibir un token concreto, identificado por su ID, que deja de estar en poder de la plataforma y pasa a ser del usuario. Un usuario puede recibir más de una carta del mismo jugador.

Hay **cuatro tipos de sobre**: **Common**, **Rare**, **Epic** y **Legendary**. Cada uno tiene su precio, su cantidad de cartas y sus probabilidades por rareza: cuanto más alto el tipo, más caro y más probable que entregue cartas raras.

**Los sobres son finitos.** La plataforma arma de antemano un **stock de sobres** cuyas cartas suman **exactamente** los tokens disponibles: cada token queda dentro de un único sobre y cada sobre tiene exactamente la cantidad de cartas de su tipo. Cuando un usuario abre un sobre de un tipo, recibe uno de los sobres sin abrir de ese tipo, elegido al azar. Por construcción:

- nunca puede quedar un sobre que no se pueda completar (no puede pasar que queden 2 tokens sin dueño y todavía haya un sobre de 5 cartas);
- todo token termina saliendo en algún sobre, aunque la probabilidad de su rareza sea baja.

Los **créditos** son números enteros. Cada cuenta nueva recibe una cantidad inicial, que es una **emisión** de créditos. Lo que se paga al abrir un sobre es **ingreso de la plataforma** y sale de circulación. Más adelante los usuarios podrán cargar saldo (fuera de alcance).

**El mercado empieza vacío.** Las primeras cartas que existen fuera de la plataforma son las que se van abriendo en sobres. Esta feature termina cuando la carta queda en el **inventario** del usuario. El inventario muestra **solo los tokens que el usuario posee hoy**: cuando deje de poseer uno (por una venta, en la spec del mercado), deja de aparecer ahí, aunque su historial se conserva.

**Momento cero de un token**: el instante en que sale de un sobre. Queda registrada para siempre, junto a la apertura y al historial del token, la cotización vigente del jugador en ese instante (constitución §5, spec 07). El valor de un token individual se deriva de esa cotización según lo defina la spec de venta.

### Estados de un token

| Estado | Dueño | Significado |
|---|---|---|
| `reservado` | Plataforma | Emitido, pero su jugador todavía no es elegible (sin cotización o sin reputación). No está en ningún sobre. |
| `en_sobre` | Plataforma | Asignado a un sobre que todavía no se abrió. |
| `de_usuario` | Un usuario | En poder de un usuario; aparece en su inventario. |
| `en_venta_plataforma` | Plataforma | Devuelto a la plataforma (por ejemplo, por una cuenta eliminada) y puesto a la venta. Su compra la resuelve la spec del mercado. No vuelve a los sobres. |

Para cada jugador, los tokens en los cuatro estados suman siempre exactamente 100.

## Clarifications

### Session 2026-10-13

- Q: ¿De qué dato sale la rareza de una carta: del OVR del jugador o de su reputación mundial? → A: El OVR del jugador pasa a ser su reputación mundial (0–100, cargada por un administrador, spec 07), ya no el rating de temporada; la rareza sale de ese OVR con los cortes de FR-016: 88 o más *Legendary*, 80–87 *Epic*, 70–79 *Rare*, menos de 70 *Common* (cortes ajustados por el equipo el 2026-10-13; reemplazan los de la spec 06, FR-029). Un único criterio para la home, el detalle, los sobres y el inventario.
- Q: ¿Esta feature implementa la devolución de tokens cuando se elimina una cuenta, aunque todavía no exista forma de eliminar cuentas? → A: No. La regla queda definida y el estado `en_venta_plataforma` existe en el modelo (para que los cuatro estados sumen 100), pero la devolución se implementa junto con la spec de eliminación de cuentas.
- Q: ¿Cada carta de la pantalla de inventario muestra cuánto vale hoy el jugador? → A: Sí. Cada jugador del inventario incluye su cotización vigente y la pantalla la muestra en la carta; sin ganancias ni pérdidas (eso es del portfolio).
- Q: ¿Las probabilidades por rareza publicadas reflejan lo que queda en los sobres sin abrir o quedan fijas según cómo se armó el stock? → A: En vivo: son la composición de las cartas de los sobres sin abrir de ese tipo, recalculada después de cada apertura.
- Q: ¿El cambio del OVR de la home (del rating de temporada a la reputación) se implementa dentro de esta feature o aparte? → A: Dentro de esta feature (FR-067 a FR-069). Esta spec es la dueña del cambio: reemplaza FR-027 a FR-030 de la spec 06 y su supuesto «OVR derivado, no persistido»; la spec 06 no se edita.
- Q: ¿Qué cartas muestra el Market (el listado de la home)? → A: Solo las de jugadores con alguna carta a la venta (FR-070). Como el mercado arranca vacío, al principio no muestra ninguna: explica que todavía no hay cartas a la venta y ofrece ir a sobres, con los filtros visibles. Los sobres se siguen comprando desde la pantalla de sobres.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recibir créditos iniciales y ver mi saldo (Priority: P1)

Una persona crea su cuenta y arranca con una cantidad inicial de créditos, que se emiten para ella. En cualquier momento puede consultar cuántos créditos tiene. Los usuarios que ya existían antes de esta feature reciben también esa cantidad, una sola vez.

**Why this priority**: Sin créditos no hay sobres. Entregada sola, ya da a cada usuario un saldo propio y auditable, que es la base de todo lo demás.

**Independent Test**: Registrar una cuenta nueva y consultar su saldo; verificar que coincide con la cantidad inicial configurada. Con una cuenta anterior a la feature, verificar que recibe la cantidad una sola vez aunque el proceso se repita.

**Acceptance Scenarios**:

1. **Given** una persona que se registra, **When** se crea su cuenta, **Then** su saldo es exactamente la cantidad inicial configurada y queda registrado el movimiento de emisión que lo originó.
2. **Given** una persona con sesión iniciada, **When** consulta su saldo, **Then** recibe su cantidad de créditos como un número entero.
3. **Given** un usuario creado antes de esta feature, **When** la feature se activa, **Then** recibe la cantidad inicial, una sola vez.
4. **Given** que el proceso de entrega inicial se ejecuta por segunda vez, **When** termina, **Then** ningún saldo cambió respecto de la primera ejecución.
5. **Given** dos usuarios, **When** uno consulta su saldo, **Then** nunca ve ni puede pedir el del otro.
6. **Given** una persona sin sesión iniciada, **When** consulta un saldo, **Then** la petición es rechazada con `UNAUTHENTICATED`.
7. **Given** que se registran dos cuentas a la vez, **When** ambas terminan, **Then** cada una tiene su cantidad inicial exacta, sin duplicar ni perder ninguna.

---

### User Story 2 - Elegir un tipo de sobre y abrirlo (Priority: P1)

Un usuario consulta los tipos de sobre disponibles —precio, cantidad de cartas, probabilidades por rareza y cuántos quedan— y abre uno del tipo que elige. El sistema le cobra el precio, le asigna al azar uno de los sobres sin abrir de ese tipo y le entrega sus cartas. El usuario ve de inmediato qué le tocó: el ID y número de serie de cada carta, de qué jugador es, su rareza y cuánto valía el jugador en ese momento.

**Why this priority**: Es la funcionalidad central y la única forma de que existan cartas fuera de la plataforma. Entregada junto con los créditos, ya es un producto usable.

**Independent Test**: Con un usuario con créditos y un stock de sobres generado, abrir un sobre de cada tipo y verificar que el saldo baja exactamente el precio de ese tipo, que se reciben exactamente las cartas que indica el tipo, que el stock del tipo baja en uno y que cada token recibido pasó de la plataforma al usuario.

**Acceptance Scenarios**:

1. **Given** un usuario con sesión, **When** consulta los tipos de sobre, **Then** ve los cuatro tipos con su precio, cantidad de cartas, probabilidades por rareza y cantidad de sobres sin abrir que quedan.
2. **Given** un usuario con saldo igual o mayor al precio de un tipo con stock, **When** abre un sobre de ese tipo, **Then** su saldo disminuye exactamente ese precio, recibe exactamente la cantidad de cartas del tipo y el stock del tipo baja en uno.
3. **Given** esa apertura, **When** se muestra el resultado, **Then** cada carta informa el ID del token, su número de serie, el jugador, su rareza y la cotización del jugador vigente en ese instante.
4. **Given** un usuario con menos créditos que el precio del tipo, **When** intenta abrir un sobre, **Then** es rechazado con `INSUFFICIENT_CREDITS` y no se cobra ni se entrega nada.
5. **Given** un usuario con exactamente el precio, **When** abre un sobre, **Then** la apertura se completa y su saldo queda en 0.
6. **Given** un tipo de sobre sin stock, **When** un usuario intenta abrirlo, **Then** es rechazado con `PACK_SOLD_OUT`, no se cobra nada y los demás tipos siguen disponibles.
7. **Given** que todavía no se generó ningún sobre (por ejemplo, porque no hay cotizaciones), **When** un usuario intenta abrir uno, **Then** es rechazado con `PACKS_NOT_AVAILABLE` y no se cobra nada.
8. **Given** un tipo de sobre inexistente, **When** un usuario intenta abrirlo, **Then** es rechazado con `PACK_TYPE_NOT_FOUND`.
9. **Given** un jugador sin cotización, **When** se abre cualquier sobre, **Then** ninguna de sus cartas puede aparecer, porque sus tokens están reservados fuera de todo sobre.
10. **Given** un usuario con saldo para un solo sobre, **When** envía dos aperturas al mismo tiempo, **Then** exactamente una se completa y la otra es rechazada con `INSUFFICIENT_CREDITS`; el saldo nunca queda negativo.
11. **Given** que queda un solo sobre de un tipo, **When** dos usuarios intentan abrirlo al mismo tiempo, **Then** exactamente uno lo recibe y el otro es rechazado con `PACK_SOLD_OUT` sin que se le cobre nada.
12. **Given** dos usuarios que abren sobres al mismo tiempo, **When** ambos terminan, **Then** ningún sobre se abrió dos veces y ningún token fue entregado dos veces.
13. **Given** una apertura que falla en cualquier punto, **When** termina con error, **Then** el saldo, el inventario y el stock son idénticos a los de antes de empezar.
14. **Given** un sobre con varias cartas del mismo jugador, **When** se abre, **Then** el usuario recibe todas y su inventario suma cada una.
15. **Given** una persona sin sesión iniciada, **When** intenta abrir un sobre, **Then** la petición es rechazada con `UNAUTHENTICATED`.
16. **Given** una petición que intenta indicar a nombre de qué usuario abrir el sobre, **When** se procesa, **Then** es rechazada con `VALIDATION_ERROR` y no se abre nada: el usuario de una apertura siempre es el de la sesión.

---

### User Story 3 - Ver mis cartas (Priority: P2)

Un usuario consulta qué cartas tiene hoy: por cada jugador, cuántas y cuáles (ID y número de serie de cada token), ordenadas de mayor a menor reputación del jugador. Solo aparecen los tokens que posee en este momento. Las cartas no se pueden listar, vender ni transferir todavía.

**Why this priority**: Es el destino de todo lo que sale de un sobre y lo que va a consumir el mercado más adelante. Depende de que existan aperturas, por eso va después.

**Independent Test**: Abrir varios sobres con un mismo usuario y verificar que el inventario contiene exactamente los tokens recibidos, agrupados por jugador y ordenados por reputación; verificar que otro usuario no lo ve.

**Acceptance Scenarios**:

1. **Given** un usuario que abrió sobres, **When** consulta su inventario, **Then** ve cada jugador del que posee tokens, con la cantidad y el ID y número de serie de cada uno, y la suma de las cantidades es igual a los tokens que posee hoy.
2. **Given** un usuario sin cartas, **When** consulta su inventario, **Then** recibe una lista vacía, no un error.
3. **Given** un jugador del inventario, **When** se muestra, **Then** incluye lo necesario para reconocerlo: nombre, posición, club, rareza, reputación e imagen si la tiene, y su cotización vigente.
4. **Given** un inventario con varios jugadores, **When** se consulta, **Then** aparecen ordenados por reputación de mayor a menor, y ante igual reputación por identificador del jugador.
5. **Given** un token que el usuario ya no posee, **When** consulta su inventario, **Then** ese token no aparece.
6. **Given** un usuario, **When** intenta consultar el inventario de otro, **Then** no hay forma de pedirlo: el inventario siempre es el de la sesión.
7. **Given** cualquier carta del inventario, **When** el usuario intenta listarla, venderla o transferirla, **Then** la funcionalidad no existe: no hay forma de sacarla del inventario.
8. **Given** un inventario grande, **When** se consulta, **Then** la respuesta se pagina y el total informado permite recorrerla completa.

---

### User Story 4 - Ver el historial de una carta (Priority: P2)

Un usuario consulta el historial de un token suyo por su ID: cuándo se emitió, cuándo y en qué sobre lo obtuvo, a qué cotización y con qué rareza, y todos los movimientos que tenga. Los registros no se pueden modificar ni borrar.

**Why this priority**: Es la trazabilidad individual de cada carta, que la constitución §4 exige y que el mercado va a extender con ventas y transferencias. El sistema entrega valor antes de poder consultarla.

**Independent Test**: Abrir un sobre, consultar el historial de uno de los tokens recibidos y verificar que muestra la emisión y la entrega en sobre con la fecha, el tipo de sobre, la cotización y la rareza de ese instante, y que de los eventos se deduce el dueño actual.

**Acceptance Scenarios**:

1. **Given** un token que el usuario posee, **When** consulta su historial, **Then** ve sus eventos en orden cronológico, desde la emisión.
2. **Given** cada evento, **When** se muestra, **Then** informa fecha, tipo de evento, origen, destino, cotización del jugador y rareza vigentes en ese instante y la operación que lo originó (por ejemplo, la apertura).
3. **Given** un token que tuvo otros dueños, **When** un usuario consulta su historial, **Then** los dueños que no son él aparecen sin identificar.
4. **Given** un token que el usuario nunca poseyó, o un ID inexistente, **When** consulta su historial, **Then** es rechazado con `TOKEN_NOT_FOUND`, sin revelar si el token existe.
5. **Given** un token que el usuario poseyó y ya no posee, **When** consulta su historial, **Then** puede verlo.
6. **Given** un evento registrado, **When** se intenta modificarlo o borrarlo, **Then** el sistema no lo permite.
7. **Given** el historial completo de un token, **When** se recorren sus eventos, **Then** el último determina su estado y dueño actual.

---

### User Story 5 - Abrir sobres desde la pantalla de sobres (Priority: P2)

Un usuario con sesión entra a la pantalla de sobres desde el encabezado del cliente web. Ve su saldo y los cuatro tipos de sobre, cada uno con su precio, cantidad de cartas, probabilidades por rareza y cuántos quedan. Elige uno, confirma la compra viendo el precio y el saldo que le quedaría, mira la apertura animada del sobre y ve las cartas que le tocaron. Al terminar, su saldo está actualizado y puede abrir otro o ir a ver sus cartas.

**Why this priority**: Es la cara visible de las User Stories 1 y 2: sin esta pantalla, abrir un sobre solo es posible llamando a la API. Va después de ellas porque las consume.

**Independent Test**: Con un usuario con créditos y un stock de sobres generado, entrar a la pantalla, abrir un sobre de un tipo y verificar que se pidió confirmación, que se mostraron exactamente las cartas que entregó la apertura, que el saldo visible bajó exactamente el precio cobrado y que la cantidad restante del tipo bajó en uno.

**Acceptance Scenarios**:

1. **Given** un usuario con sesión, **When** entra a la pantalla de sobres, **Then** ve su saldo y los cuatro tipos con su precio, cantidad de cartas, probabilidades por rareza y cantidad de sobres sin abrir que quedan.
2. **Given** un tipo con stock y saldo suficiente, **When** el usuario elige abrirlo, **Then** se le pide confirmación mostrando el tipo, el precio y el saldo que le quedaría; si cancela, no se hace ninguna apertura.
3. **Given** que el usuario confirma, **When** la apertura se completa, **Then** se muestra la animación de apertura y después cada carta recibida con su jugador, rareza, número de serie y la cotización del jugador en ese instante.
4. **Given** una apertura completada, **When** termina la revelación, **Then** el saldo visible es el que informó la apertura y la cantidad restante del tipo bajó en uno, sin recargar la página.
5. **Given** un tipo cuyo precio supera el saldo del usuario, **When** se muestra, **Then** no se puede abrir y se indica que el saldo no alcanza.
6. **Given** un tipo sin stock, **When** se muestra, **Then** aparece como agotado y no se puede abrir; los demás tipos siguen disponibles.
7. **Given** que todavía no se generó ningún sobre, **When** el usuario entra a la pantalla, **Then** ve un mensaje que explica que todavía no hay sobres disponibles, no un error genérico.
8. **Given** una apertura en curso, **When** el usuario intenta abrir otro sobre, **Then** la pantalla no lo permite hasta que la primera termine.
9. **Given** que la apertura es rechazada (saldo insuficiente, tipo agotado, sobres no disponibles o error inesperado), **When** llega la respuesta, **Then** no se reproduce la animación de apertura, se muestra un mensaje que corresponde al código de error y el saldo y el stock visibles se actualizan con los valores reales.
10. **Given** un usuario con la preferencia del sistema de reducir movimiento, **When** abre un sobre, **Then** ve el resultado sin la animación completa y con las mismas cartas.
11. **Given** una persona sin sesión, **When** intenta entrar a la pantalla de sobres, **Then** es llevada a iniciar sesión.

---

### User Story 6 - Ver mis cartas en la pantalla de inventario (Priority: P2)

Un usuario con sesión entra a la pantalla de inventario desde el encabezado o al terminar de abrir un sobre. Ve los jugadores de los que posee tokens, ordenados de mayor a menor reputación, cada uno con su carta, la cantidad de tokens que tiene y el número de serie de cada uno.

**Why this priority**: Es la cara visible de la User Story 3: el lugar donde el usuario encuentra lo que le tocó. Va después de ella porque la consume.

**Independent Test**: Abrir varios sobres con un mismo usuario, entrar a la pantalla de inventario y verificar que muestra exactamente los jugadores y tokens que devuelve el inventario, en el mismo orden, y que se puede recorrer completo con la paginación.

**Acceptance Scenarios**:

1. **Given** un usuario con cartas, **When** entra a la pantalla de inventario, **Then** ve cada jugador del que posee tokens con su nombre, posición, club, rareza, reputación, imagen si la tiene, su cotización vigente, la cantidad de tokens y el número de serie de cada uno.
2. **Given** un inventario con varios jugadores, **When** se muestra, **Then** aparecen en el orden que devuelve el inventario: de mayor a menor reputación.
3. **Given** un inventario de más de una página, **When** el usuario navega entre páginas, **Then** puede recorrerlo completo y ve en qué página está y cuántas hay.
4. **Given** un usuario sin cartas, **When** entra a la pantalla, **Then** ve un mensaje que lo invita a abrir sobres, con un acceso directo a la pantalla de sobres.
5. **Given** una carta del inventario, **When** se muestra, **Then** no ofrece ninguna acción para listarla, venderla ni transferirla.
6. **Given** que el inventario no se puede cargar, **When** falla la consulta, **Then** se muestra un mensaje de error con la opción de reintentar.
7. **Given** una persona sin sesión, **When** intenta entrar a la pantalla de inventario, **Then** es llevada a iniciar sesión.

---

### User Story 7 - Consultar el historial de aperturas (Priority: P3)

Un usuario consulta sus aperturas pasadas: cuándo, qué tipo de sobre, cuánto pagó, cuánto saldo tenía antes y después, y qué cartas le tocaron con la cotización de cada jugador en ese momento. Los registros no se pueden modificar ni borrar.

**Why this priority**: Es el registro inmutable que exige la constitución §4 y el insumo para el portfolio, pero el sistema entrega valor antes de poder consultarlo.

**Independent Test**: Abrir varios sobres, consultar el historial y verificar que cada registro reproduce el saldo (antes − precio = después), que sus cartas coinciden con los tokens entregados y que ninguno se puede alterar.

**Acceptance Scenarios**:

1. **Given** un usuario con aperturas, **When** consulta su historial, **Then** las ve de la más reciente a la más antigua, con fecha, tipo de sobre, precio, saldo antes y después y sus cartas.
2. **Given** cualquier apertura, **When** se revisa, **Then** saldo antes menos precio es igual al saldo después.
3. **Given** cualquier apertura, **When** se revisan sus cartas, **Then** cada una conserva el ID del token, el jugador, la rareza y la cotización que tenían en ese instante, aunque después cambien.
4. **Given** una apertura cuyas cartas el usuario ya no posee, **When** consulta su historial, **Then** la apertura sigue mostrando todas las cartas que recibió.
5. **Given** una apertura registrada, **When** se intenta modificarla o borrarla, **Then** el sistema no lo permite.
6. **Given** el historial de un usuario, **When** otro usuario intenta consultarlo, **Then** no hay forma de pedirlo: el historial siempre es el de la sesión.
7. **Given** el movimiento de créditos inicial y los de cada apertura, **When** se suman en orden, **Then** reconstruyen el saldo actual exactamente.
8. **Given** cada registro, **When** se revisa, **Then** conserva el identificador de trazabilidad de la solicitud que lo originó.

---

### Edge Cases

- **Saldo justo**: un usuario con exactamente el precio puede abrir un sobre y queda en 0; con un crédito menos, no.
- **Doble envío**: dos aperturas casi simultáneas del mismo usuario son dos aperturas independientes y cada una cobra su precio. Si el saldo alcanza solo para una, la otra se rechaza. Evitar el doble clic es tarea del cliente.
- **Último sobre de un tipo**: si varios usuarios lo piden a la vez, lo recibe exactamente uno; los demás reciben `PACK_SOLD_OUT` sin cobro.
- **Tipo agotado**: cuando se abren todos los sobres de un tipo, ese tipo deja de poder abrirse; los demás siguen.
- **Nunca un sobre incompleto**: como el stock reparte exactamente los tokens disponibles, no puede existir un sobre sin abrir cuyas cartas no estén aseguradas.
- **Fin del stock**: cuando se abren todos los sobres, no quedan tokens `en_sobre`. Solo se generan sobres nuevos si se suman tokens elegibles (por ejemplo, jugadores nuevos con cotización).
- **Rareza cambiante**: la rareza se deriva del OVR, que es la reputación cargada; cambia cuando un administrador actualiza la reputación de un jugador. El stock se arma con la rareza vigente al generarlo, y cada carta registra la rareza que tenía **en el momento de la apertura**, que puede ser distinta. La plataforma puede rearmar los sobres sin abrir (FR-017).
- **Probabilidades cambiantes**: cada apertura saca cartas del stock sin abrir, así que las probabilidades publicadas de ese tipo cambian. Al agotarse las cartas de una rareza, su probabilidad pasa a 0 %, y un tipo de mayor nivel puede quedar momentáneamente con menos `epic` y `legendary` que uno inferior: la monotonía de FR-009 rige al generar cada lote.
- **Cotización cambiante**: un recálculo entre dos aperturas hace que el mismo jugador se valúe distinto; cada carta registra la del instante en que salió. El inventario muestra siempre la cotización vigente, que puede diferir de la registrada en la apertura.
- **Sin cotizaciones**: antes del primer recálculo de cotizaciones todos los tokens están reservados, no hay sobres y nada se puede abrir.
- **Jugador nuevo**: sus 100 tokens se emiten como `reservado` y entran a un lote nuevo de sobres en cuanto el jugador es elegible.
- **Cambio de configuración**: un cambio de precio rige para las aperturas siguientes; un cambio de cartas, probabilidades o participación rige para los lotes que se generen después. Cada apertura conserva los parámetros con los que se hizo.
- **Usuario sin saldo inicial**: un usuario que por cualquier motivo no recibió el saldo (por ejemplo, creado durante la activación) lo recibe en la siguiente ejecución del proceso de entrega inicial, sin duplicarlo.
- **Emisión incompleta**: un jugador cuya emisión de 100 tokens no se hubiera generado todavía no puede entrar al stock hasta que lo esté.
- **Cuenta eliminada**: si se elimina la cuenta de un usuario, sus tokens vuelven a la plataforma y quedan automáticamente a la venta (FR-043). Nunca puede haber un token en poder de un usuario inexistente. Esta feature no ofrece forma de eliminar cuentas, así que el caso no puede ocurrir todavía; se implementa con la spec de eliminación de cuentas.
- **Token que deja de ser del usuario**: desaparece de su inventario, pero sigue en su historial de aperturas y en el historial del token.
- **Pantalla desactualizada**: entre que el usuario ve la pantalla de sobres y confirma, otro usuario puede agotar el tipo o la plataforma puede cambiar el precio. La apertura se resuelve con los valores vigentes al abrir: si el tipo se agotó, se rechaza con `PACK_SOLD_OUT`; si cambió el precio, se cobra el vigente. La pantalla muestra siempre el precio efectivamente cobrado y el saldo real resultante.
- **Salir durante la animación**: si el usuario abandona la pantalla mientras se reproduce la apertura, la apertura ya está hecha y sus cartas aparecen en el inventario.

## Requirements *(mandatory)*

### Functional Requirements

**Créditos**

- **FR-001**: Toda cuenta nueva MUST recibir al crearse la cantidad inicial de créditos configurada, como un número entero.
- **FR-002**: Los usuarios existentes antes de esta feature MUST recibir esa misma cantidad exactamente una vez. Cada usuario MUST tener a lo sumo un movimiento de entrega inicial, de modo que repetir el proceso no vuelva a acreditarla.
- **FR-003**: Un usuario MUST poder consultar su propio saldo en cualquier momento.
- **FR-004**: El saldo MUST NOT ser negativo en ningún momento, ni siquiera ante pedidos simultáneos.
- **FR-005**: Los créditos MUST ser siempre números enteros: ninguna operación admite fracciones.
- **FR-006**: Todo cambio de saldo MUST registrarse como un movimiento inmutable con: usuario, tipo, monto, saldo antes, saldo después, fecha, identificador de trazabilidad y referencia a la operación que lo originó. Los tipos de esta feature son `entrega_inicial` y `compra_sobre`; el modelo MUST admitir tipos futuros (por ejemplo, `carga_saldo` o los del mercado) sin modificar los registros existentes.
- **FR-007**: La entrega inicial MUST ser una **emisión** de créditos: aumenta el total en circulación. Los créditos que cobra cada apertura MUST ser **ingreso de la plataforma**: salen de circulación, quedan registrados en el movimiento y en la apertura, y no se acreditan a ninguna cuenta. En todo momento, la suma de los saldos de los usuarios MUST ser igual al total emitido menos el total cobrado.

**Tipos de sobre**

- **FR-008**: MUST existir cuatro tipos de sobre: `common`, `rare`, `epic` y `legendary`. Cada tipo MUST tener precio, cantidad de cartas, probabilidades objetivo por rareza y participación en el stock (qué parte de los tokens de cada lote se reparte en sobres de ese tipo).
- **FR-009**: A mayor tipo de sobre, la probabilidad objetivo combinada de `epic` y `legendary` MUST NOT ser menor que la del tipo inferior.
- **FR-010**: Un usuario con sesión MUST poder consultar, para cada tipo: precio, cantidad de cartas, probabilidades por rareza y cantidad de sobres sin abrir que quedan. Las probabilidades MUST ser la proporción de cada rareza entre las cartas de los sobres **sin abrir** de ese tipo en ese momento, de modo que cambian después de cada apertura y siempre reflejan la última apertura confirmada. Un tipo agotado no publica probabilidades.

**Stock de sobres**

- **FR-011**: Los tokens de un jugador MUST entrar al stock solo cuando el jugador tiene su emisión completa, cotización vigente y reputación cargada (de la que sale su OVR y su rareza, FR-016). Hasta entonces MUST quedar en estado `reservado`, fuera de todo sobre.
- **FR-012**: Cada vez que haya tokens `reservado` de jugadores elegibles (por ejemplo, tras el primer cálculo de cotizaciones o al incorporarse un jugador nuevo), el sistema MUST generar con ellos un **lote** de sobres sin intervención manual.
- **FR-013**: Cada lote MUST repartir sus tokens con **partición exacta**: cada token queda en exactamente un sobre, cada sobre tiene exactamente la cantidad de cartas de su tipo y la suma de las cartas de todos los sobres del lote es igual a la cantidad de tokens del lote. Ningún token MUST quedar afuera y ningún sobre MUST quedar incompleto.
- **FR-014**: La asignación de tokens a sobres MUST ser aleatoria, MUST respetar la participación de cada tipo y MUST aproximar sus probabilidades objetivo tanto como lo permita la cantidad de tokens de cada rareza en el lote. Un token de cualquier rareza MUST poder terminar en cualquier tipo cuya probabilidad objetivo para esa rareza sea positiva.
- **FR-015**: El contenido de los sobres sin abrir MUST NOT exponerse en ninguna respuesta ni registro accesible a los usuarios.
- **FR-016**: La rareza de un jugador MUST derivarse de su **OVR**, que es su **reputación mundial** cargada (0–100), con estos cortes: 88 o más `legendary`, 80 a 87 `epic`, 70 a 79 `rare` y menos de 70 `common`. Reemplazan los cortes de la spec 06 (FR-029) y son el mismo criterio que usan la home, el panel de detalle y sus filtros por rareza. La generación del stock usa la rareza vigente al generarlo; cada carta registra la rareza vigente al abrirse.
- **FR-017**: El sistema MAY rearmar el contenido de los sobres sin abrir de un lote (por ejemplo, tras una carga de reputación que cambie rarezas) siempre que conserve la partición exacta y la cantidad de sobres de cada tipo. MUST NOT tocar sobres ya abiertos.

**Apertura de sobres**

- **FR-018**: Un usuario con sesión MUST poder abrir un sobre del tipo que elija pagando su precio en créditos.
- **FR-019**: Antes de cobrar, el sistema MUST validar que el tipo existe, que quedan sobres sin abrir de ese tipo y que el saldo alcanza para el precio.
- **FR-020**: El sobre entregado MUST ser uno de los sobres sin abrir del tipo elegido, seleccionado al azar con igual probabilidad entre todos ellos en el momento de la apertura.
- **FR-021**: Una apertura MUST ser atómica: o se cobra el precio, se marca el sobre como abierto, se transfieren **todos** sus tokens al usuario y se registra todo, o no ocurre nada de eso.
- **FR-022**: Aperturas simultáneas MUST NOT abrir el mismo sobre, entregar el mismo token dos veces ni dejar un saldo negativo.
- **FR-023**: Cada token entregado MUST pasar de `en_sobre` (plataforma) a `de_usuario` (el usuario). Para cada jugador, los tokens en estado `reservado`, `en_sobre`, `de_usuario` y `en_venta_plataforma` MUST sumar siempre exactamente 100.
- **FR-024**: Un usuario MUST poder recibir más de una carta del mismo jugador, incluso en un mismo sobre.
- **FR-025**: El usuario de la apertura MUST salir siempre de la sesión; MUST NOT aceptarse un usuario indicado en el pedido.
- **FR-026**: El resultado de la apertura MUST informar, por cada carta: ID del token, número de serie, jugador, rareza y cotización del jugador en ese instante.
- **FR-027**: Ningún token de un jugador sin cotización vigente MUST entregarse nunca.

**Tokens y su historial**

- **FR-028**: Cada token MUST tener un ID único e inmutable y un número de serie del 1 al 100, único dentro de su jugador.
- **FR-029**: Cada jugador del catálogo MUST tener exactamente 100 tokens emitidos, inicialmente en estado `reservado`. La emisión MUST ser idempotente: repetirla no crea tokens de más. Un jugador nuevo del catálogo MUST recibir su emisión sin intervención manual.
- **FR-030**: Todo cambio de estado o de dueño de un token MUST registrarse como un evento inmutable con: token, tipo de evento, origen, destino, fecha, cotización del jugador y rareza vigentes, referencia a la operación que lo originó e identificador de trazabilidad. Los tipos de esta feature son `emision`, `asignacion_a_sobre`, `entrega_en_sobre`, `devolucion_a_plataforma` y `puesta_en_venta`; el modelo MUST admitir tipos futuros (venta, compra, transferencia) sin modificar los registros existentes.
- **FR-031**: Un usuario MUST poder consultar el historial de un token que posee o que poseyó. Los dueños que no sean él MUST aparecer sin identificar. Los eventos `asignacion_a_sobre` son internos y MUST NOT mostrarse.
- **FR-032**: El estado y el dueño actuales de cualquier token MUST poder reconstruirse a partir de sus eventos.

**Inventario**

- **FR-033**: El inventario de un usuario MUST contener únicamente los tokens que están hoy en estado `de_usuario` a su nombre. Un token que deja de ser suyo MUST dejar de aparecer.
- **FR-034**: El inventario MUST agruparse por jugador, con la cantidad de tokens y el ID y número de serie de cada uno, e incluir para reconocer al jugador: nombre, posición, club, rareza, reputación (su OVR, FR-067) e imagen si la tiene. MUST incluir además la **cotización vigente** del jugador (su última cotización, spec 07), sin ganancias ni pérdidas.
- **FR-035**: El inventario MUST ordenarse por reputación del jugador de mayor a menor, con el identificador del jugador como desempate, y MUST estar paginado con el total de elementos.
- **FR-036**: Esta feature MUST NOT ofrecer ninguna operación que saque un token del inventario: no se puede listar, vender, comprar ni transferir.

**Historial de aperturas y auditoría**

- **FR-037**: Cada apertura MUST registrarse de forma inmutable con: usuario, fecha, tipo de sobre, sobre abierto, precio cobrado, cantidad de cartas, saldo antes y después, parámetros del tipo aplicados e identificador de trazabilidad.
- **FR-038**: Cada carta de una apertura MUST registrarse con: ID del token, jugador, rareza y cotización del jugador vigentes en el instante de la apertura. Esos valores MUST NOT cambiar después, y la apertura MUST seguir mostrándolos aunque el usuario ya no posea el token.
- **FR-039**: Un usuario MUST poder consultar el historial de sus propias aperturas, paginado y de la más reciente a la más antigua.
- **FR-040**: Los movimientos de créditos, las aperturas y los eventos de tokens MUST NOT poder modificarse ni borrarse.
- **FR-041**: El movimiento de créditos, la apertura y los eventos de sus tokens MUST referenciarse entre sí, de modo que cualquiera se pueda reconstruir a partir de los otros.

**Plataforma y cuentas eliminadas**

- **FR-042**: No existe un usuario superusuario: los tokens sin dueño pertenecen a la plataforma, que no tiene credenciales, ni saldo, ni inventario de usuario.
- **FR-043**: *(Regla definida acá; se implementa con la spec de eliminación de cuentas, no en esta feature.)* Si se elimina la cuenta de un usuario, todos sus tokens MUST volver a la plataforma en estado `en_venta_plataforma`, puestos a la venta automáticamente al valor vigente del token según la spec de venta, y cada cambio MUST registrarse como evento. Esos tokens MUST NOT volver a los sobres. La cuenta MUST desactivarse sin borrarse físicamente, para conservar los registros inmutables que la referencian.

**Configuración**

- **FR-044**: Los créditos iniciales y, para cada tipo de sobre, el precio, la cantidad de cartas, las probabilidades objetivo por rareza y la participación en el stock MUST ser configurables sin modificar el código.
- **FR-045**: La configuración MUST validarse: precios, cantidades de cartas y créditos iniciales enteros positivos; probabilidades no negativas con al menos una positiva por tipo; participaciones no negativas con al menos una positiva; las cantidades de cartas de los tipos MUST permitir sumar exactamente 100, de modo que cualquier lote de jugadores completos admita partición exacta; y MUST cumplirse FR-009.
- **FR-046**: Un cambio de precio MUST regir solo para las aperturas posteriores. Un cambio de cartas, probabilidades o participación MUST regir solo para los lotes generados o rearmados después. Cada apertura MUST conservar los parámetros con los que se hizo.

**Acceso, errores y observabilidad**

- **FR-047**: Todas las operaciones de usuario MUST exigir sesión de usuario válida. Un usuario MUST ver únicamente su propio saldo, inventario, historial de aperturas y el historial de los tokens que posee o poseyó. Los disparos manuales de los procesos batch —la entrega inicial a los usuarios existentes (FR-002) y la emisión y generación del stock (FR-012, FR-029)—, que la constitución §7 exige exponer, MUST exigir la credencial administrativa y no forman parte de la API de usuario.
- **FR-048**: Toda entrada MUST validarse; ninguna entrada inválida puede producir efectos parciales.
- **FR-049**: Todo error MUST responderse con el formato estándar de la API: código, mensaje legible e identificador de trazabilidad, usando los códigos de la tabla siguiente.
- **FR-050**: Cada operación —apertura, entrega de créditos, emisión de tokens y generación de un lote— MUST emitir al menos un registro estructurado con el identificador de trazabilidad y la cantidad de movimientos y tokens que afectó. El detalle de cada movimiento y de cada token queda en sus registros inmutables (FR-006, FR-030), que llevan el mismo identificador.
- **FR-051**: Todos los endpoints nuevos MUST estar documentados en el contrato de la API, incluidos sus códigos de error.

**Cliente web: navegación**

- **FR-052**: El cliente web MUST ofrecer, solo a usuarios con sesión, una pantalla de sobres y una pantalla de inventario, accesibles desde el encabezado. Una persona sin sesión que intente entrar MUST ser llevada a iniciar sesión.
- **FR-053**: El encabezado MUST mostrar el saldo del usuario con sesión y mantenerlo actualizado tras cada apertura.

**Cliente web: pantalla de sobres**

- **FR-054**: La pantalla MUST mostrar el saldo del usuario y, para cada tipo de sobre, su precio, cantidad de cartas, probabilidades por rareza y cantidad de sobres sin abrir que quedan, tal como los informa el sistema (FR-010).
- **FR-055**: Un tipo agotado o cuyo precio supera el saldo MUST mostrarse como no disponible, indicando el motivo, y MUST NOT poder abrirse desde la pantalla.
- **FR-056**: Antes de abrir un sobre, la pantalla MUST pedir confirmación mostrando el tipo, el precio y el saldo que quedaría. Cancelar MUST NOT generar ninguna apertura.
- **FR-057**: Mientras una apertura está en curso, la pantalla MUST impedir iniciar otra.
- **FR-058**: La animación de apertura MUST reproducirse solo después de que el sistema confirme la apertura, en primer plano: el sobre comprado se muestra grande y centrado sobre el resto de la pantalla mientras se abre. La revelación MUST mostrar exactamente las cartas que informó el sistema, con su jugador, rareza, número de serie y cotización en ese instante.
- **FR-059**: Tras una apertura, el saldo, la cantidad restante y las probabilidades del tipo MUST reflejar los valores reales del sistema sin recargar la página; al terminar la revelación, la pantalla MUST ofrecer abrir otro sobre o ir a la pantalla de inventario.
- **FR-060**: Ante un rechazo, la pantalla MUST mostrar un mensaje propio para cada código de error de la apertura (`INSUFFICIENT_CREDITS`, `PACK_SOLD_OUT`, `PACKS_NOT_AVAILABLE`, `PACK_TYPE_NOT_FOUND`, `INTERNAL_ERROR`) y MUST volver a consultar el saldo y los tipos de sobre.
- **FR-061**: Si todavía no se generó ningún sobre, la pantalla MUST explicarlo con un mensaje en lugar de mostrar el catálogo vacío o un error genérico.
- **FR-062**: Las animaciones de la pantalla MUST respetar la preferencia del sistema de reducir movimiento, mostrando el mismo resultado sin la animación completa.

**Cliente web: pantalla de inventario**

- **FR-063**: La pantalla MUST mostrar los jugadores del inventario en el orden que lo devuelve el sistema (FR-035), con una carta por token (incluida la cotización vigente del jugador) que muestra en la propia carta el número de serie de ese token.
- **FR-064**: La pantalla MUST paginar el inventario, indicar la página actual y el total, y permitir recorrerlo completo.
- **FR-065**: Un inventario vacío MUST mostrarse con un mensaje y un acceso directo a la pantalla de sobres; un error de carga MUST mostrarse con la opción de reintentar.
- **FR-066**: La pantalla MUST NOT ofrecer ninguna acción sobre las cartas (listar, vender, comprar ni transferir).

**OVR y rareza en todo el sistema**

- **FR-067**: El OVR de un jugador MUST ser su reputación mundial cargada (spec 07), en lugar del valor derivado del rating de temporada, y MUST quedar acotado a 0–99: una reputación de 100 se presenta como 99. Reemplaza FR-027 y FR-028 de la spec 06. Los cortes de rareza son los de FR-016, y la consistencia de FR-031 de la spec 06 se mantiene. Aplica a la home, el panel de detalle, los filtros por rango de OVR y por rareza, la generación del stock de sobres, las cartas de una apertura y el inventario.
- **FR-068**: *(Reemplaza FR-030 de la spec 06.)* Un jugador sin reputación cargada MUST presentarse con el OVR sin dato y la rareza `common`, MUST quedar fuera del resultado cuando haya un filtro de rango de OVR activo y MUST NOT entrar al stock de sobres (FR-011).
- **FR-069**: La rareza de un mismo jugador MUST ser la misma en la home, el panel de detalle, los sobres sin abrir y el inventario en todo momento; la de una carta ya entregada es la registrada en su apertura (FR-038).

**Market**

- **FR-070**: El Market (el listado de jugadores de la home) MUST mostrar solo jugadores con al menos un token a la venta. En esta feature el único estado a la venta es `en_venta_plataforma`; la spec del mercado va a sumar las publicaciones de usuarios. Las cartas en sobres, reservadas o en poder de usuarios no cuentan. Sin ninguna carta a la venta, la home MUST explicarlo con un mensaje y un acceso a la pantalla de sobres, y MUST mantener visibles los filtros; con filtros aplicados y sin resultados, sigue mostrando «Sin resultados». El panel de detalle de un jugador sigue disponible aunque no tenga cartas a la venta (lo usan el inventario y las aperturas).

### Códigos de error

| Situación | HTTP | Código |
|---|---|---|
| Sin sesión o sesión inválida | 401 | `UNAUTHENTICATED` |
| Entrada inválida (parámetros, paginación, formato) | 422 | `VALIDATION_ERROR` |
| Tipo de sobre inexistente | 404 | `PACK_TYPE_NOT_FOUND` |
| Todavía no se generó ningún sobre | 409 | `PACKS_NOT_AVAILABLE` |
| No quedan sobres sin abrir del tipo elegido | 409 | `PACK_SOLD_OUT` |
| Saldo menor que el precio del tipo | 409 | `INSUFFICIENT_CREDITS` |
| Token inexistente o que el usuario nunca poseyó | 404 | `TOKEN_NOT_FOUND` |
| Error inesperado (sin efectos) | 500 | `INTERNAL_ERROR` |

Las validaciones de una apertura se aplican en este orden: sesión, entrada, tipo, disponibilidad de sobres y saldo. Así, si no quedan sobres, el usuario se entera de eso antes que de su falta de saldo. `TOKEN_NOT_FOUND` se usa también para tokens de otros usuarios, para no revelar su existencia.

### Key Entities

- **Cuenta de créditos** *(atributo del usuario)*: saldo entero y no negativo. Solo la tienen los usuarios.
- **Movimiento de créditos**: registro inmutable de un cambio de saldo. Atributos: usuario, tipo (`entrega_inicial` / `compra_sobre`, extensible), monto, saldo antes, saldo después, fecha, trazabilidad, referencia a la operación.
- **Token (carta)**: uno de los 100 tokens de un jugador. Atributos: ID único, jugador, número de serie (1–100), estado y dueño actual (la plataforma o un usuario).
- **Evento de token**: registro inmutable de un cambio de estado o de dueño de un token. Atributos: token, tipo, origen, destino, fecha, cotización y rareza vigentes, referencia a la operación, trazabilidad.
- **Tipo de sobre**: `common`, `rare`, `epic` o `legendary`, con precio, cantidad de cartas, probabilidades objetivo por rareza y participación en el stock.
- **Lote de sobres**: conjunto de sobres generado de una vez con los tokens de jugadores que se volvieron elegibles. Parámetros aplicados y fecha.
- **Sobre**: una unidad del stock. Atributos: lote, tipo, tokens que contiene (secretos hasta abrirse), estado (sin abrir / abierto).
- **Apertura de sobre**: un evento de apertura. Atributos: usuario, sobre, tipo, fecha, precio, cantidad de cartas, saldo antes y después, parámetros aplicados, trazabilidad. Inmutable.
- **Carta de apertura**: una carta entregada en una apertura. Atributos: apertura, token, jugador, rareza y cotización en el instante. Inmutable.
- **Inventario** *(derivado)*: los tokens que un usuario posee hoy, agrupados por jugador, con la cotización vigente de cada jugador.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 95 % de las aperturas devuelven sus cartas al usuario en menos de 2 segundos.
- **SC-002**: En el 100 % de las aperturas que fallan por cualquier motivo, el saldo, el inventario y el stock quedan idénticos a los de antes de empezar.
- **SC-003**: Con un saldo para `k` sobres y más de `k` aperturas simultáneas del mismo usuario, se completan exactamente `k` y el saldo final es no negativo.
- **SC-004**: El 100 % de las cuentas nuevas arrancan con la cantidad inicial exacta, y el 100 % de las cuentas anteriores la reciben exactamente una vez, aun si el proceso se ejecuta varias veces.
- **SC-005**: Para el 100 % de los lotes generados, cada token del lote está en exactamente un sobre, cada sobre tiene exactamente las cartas de su tipo y la suma de cartas es igual a los tokens del lote.
- **SC-006**: Al abrir todos los sobres de un lote, el 100 % de sus tokens quedaron entregados a algún usuario y no se rechazó ninguna apertura por falta de cartas (0 sobres incompletos).
- **SC-007**: En el 100 % de las consultas, las probabilidades publicadas de cada tipo coinciden con la composición de sus sobres sin abrir en ese momento, incluso inmediatamente después de una apertura. Al generarse cada lote, la proporción de `epic` más `legendary` de sus sobres no disminuye al subir de tipo.
- **SC-008**: Para el 100 % de las aperturas registradas, saldo antes − precio = saldo después, y las cartas registradas coinciden con los tokens que cambiaron de dueño.
- **SC-009**: Ninguna carta de un jugador sin cotización se entrega nunca (0 casos).
- **SC-010**: El 100 % de los intentos de ver el saldo, el inventario, el historial de aperturas o el historial de un token ajeno son rechazados.
- **SC-011**: El 100 % de las peticiones sin sesión válida son rechazadas con `UNAUTHENTICATED`.
- **SC-012**: En el 100 % de los casos, sumando los movimientos de créditos de un usuario en orden se reconstruye su saldo actual.
- **SC-013**: En todo momento, la suma de los saldos de los usuarios es igual al total de créditos emitidos menos el total cobrado en aperturas.
- **SC-014**: Para el 100 % de los tokens, el último evento de su historial coincide con su estado y dueño actuales.
- **SC-015**: El 100 % de los errores de los endpoints nuevos se responden con uno de los códigos documentados.
- **SC-016**: Un usuario con sesión llega desde la home a abrir un sobre en no más de 3 interacciones (entrar a sobres, elegir el tipo, confirmar).
- **SC-017**: En el 100 % de las aperturas hechas desde la pantalla, las cartas reveladas coinciden con las que registró la apertura y el saldo mostrado al terminar coincide con el saldo real.
- **SC-018**: El 0 % de las aperturas rechazadas reproduce la animación de apertura o muestra cartas.
- **SC-019**: En el 100 % de los casos, la pantalla de inventario muestra exactamente los tokens que el usuario posee, en el orden del inventario, y se puede recorrer completa.
- **SC-020**: En el 100 % de los jugadores verificados, el OVR que muestran la home y el panel de detalle es igual a su reputación cargada, y su rareza coincide con la que se usa para armar los sobres.
- **SC-021**: Mientras no haya ninguna carta a la venta, el 100 % de las consultas del Market devuelven un listado vacío; un jugador aparece en el Market si y solo si tiene al menos un token a la venta.

## Assumptions

- **Valores por defecto** (configurables): 2.000 créditos iniciales y estos tipos de sobre:

  | Tipo | Precio | Cartas | `common` | `rare` | `epic` | `legendary` | Participación en el stock |
  |---|---|---|---|---|---|---|---|
  | Common | 100 | 3 | 78 % | 18 % | 3,5 % | 0,5 % | 50 % de los tokens |
  | Rare | 200 | 4 | 55 % | 32 % | 10 % | 3 % | 28 % de los tokens |
  | Epic | 400 | 5 | 35 % | 35 % | 24 % | 6 % | 14 % de los tokens |
  | Legendary | 800 | 6 | 20 % | 30 % | 30 % | 20 % | 8 % de los tokens |

  Con la reputación cargada (EA FC 27) y los cortes de FR-016, el catálogo tiene 25 jugadores `legendary` (~1 % de los tokens), 343 `epic` (~13 %), 1.369 `rare` (~52 %) y 907 `common` (~34 %), así que los objetivos de `legendary` de los tipos superiores no se alcanzan y lo publicado será menor.
  Las probabilidades son objetivos: la composición real depende de cuántos tokens de cada rareza haya en el lote, y lo que se publica es la composición real de los sobres sin abrir (FR-010), que cambia a medida que se abren.
- **Equilibrio económico a revisar**: los precios no guardan relación todavía con el valor de referencia de las cartas que entregan. Son un punto de partida; conviene calibrarlos cuando exista la spec de venta y se defina cuánto vale un token individual.
- **Oferta finita**: hay 100 tokens por jugador y cada uno sale una sola vez en un sobre. Una vez abiertos todos los sobres, la única fuente de cartas será el mercado, salvo que se incorporen jugadores nuevos.
- **Carta = token**: una carta es un único token de un jugador, con su ID, no un objeto aparte.
- **Valor de referencia del token**: esta spec guarda la cotización **del jugador** vigente al abrir el sobre (créditos enteros). Cómo se traduce al precio de un token individual (propuesta: 1/100, con su redondeo) se define en la spec de venta.
- **Sin superusuario**: la plataforma es la dueña de los tokens sin dueño de usuario. La constitución v4.0.0 §5 ya lo refleja.
- **Rareza por reputación**: el OVR de un jugador es su reputación mundial, y la rareza sale de ese OVR con los cortes de FR-016 (88 / 80 / 70). El cambio pertenece a esta feature (FR-016, FR-067 a FR-069), que reemplaza FR-027 a FR-030 de la spec 06 y su supuesto «OVR derivado, no persistido»; el texto de la spec 06 no se edita. Como la reputación ya está almacenada en el jugador, el OVR deja de ser un valor derivado del rating y los filtros de la home por OVR y por rareza operan directamente sobre la reputación.
- **Rearme de sobres**: FR-017 es opcional y esta feature no lo implementa. Un cambio de reputación no publica datos falsos: las probabilidades usan la rareza actual y cada carta registra la rareza vigente al abrirse.
- **Créditos cobrados**: son ingreso de la plataforma; no se acreditan a ninguna cuenta ni vuelven a circular.
- **Carga de saldo**: en el futuro los usuarios podrán cargar créditos; será otro tipo de movimiento (FR-006) y otra fuente de emisión.
- **Eliminación de cuentas**: cuándo y cómo se elimina una cuenta lo define la spec correspondiente; esta spec solo define qué pasa con sus tokens y registros (FR-043). En esta feature solo existe el estado `en_venta_plataforma` y los tipos de evento `devolucion_a_plataforma` y `puesta_en_venta` en el modelo; ningún flujo los produce todavía.
- **Configuración por entorno**: los parámetros se fijan por configuración del sistema y no hay una pantalla de administración para editarlos.
- **Usuarios y registro**: el registro de cuentas es el de la spec 05; esta feature solo suma el saldo inicial.
- **Componentes del cliente ya construidos**: la pantalla de sobres reutiliza el sobre animado (`Pack`), el modal de confirmación (`ConfirmModal`) y la carta de jugador (`PlayerCard`) que ya existen en el cliente web; la pantalla de inventario reutiliza `PlayerCard`. El nivel visual de cada tipo de sobre coincide con la rareza de su mismo nombre.
- **Fuera de alcance**: listar, vender, comprar o transferir cartas; la compra de los tokens `en_venta_plataforma`; el mercado y sus precios; la carga de saldo; el portfolio con ganancias y pérdidas; la devolución o recompra de sobres; las pantallas de historial de una carta y de historial de aperturas del cliente web; y cualquier cambio en la home salvo el encabezado (accesos a sobres e inventario y saldo, FR-052 y FR-053) , el origen del OVR (FR-067 a FR-069) y el criterio del Market (FR-070). La home seguirá mostrando la emisión como hoy (maqueta) hasta que una feature posterior la conecte a los datos reales de este módulo.
- **Sin idempotencia por clave**: cada apertura enviada es una apertura; evitar el doble envío accidental es responsabilidad del cliente, que lo cumple bloqueando una segunda apertura en curso (FR-057).