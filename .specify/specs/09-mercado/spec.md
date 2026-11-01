# Feature Specification: Mercado de Tokens (Compra y Venta)

**Feature Branch**: `09-mercado`

**Created**: 2026-10-20

**Status**: Draft (revisión 5)

**Input**: User description: "Compra/venta de tokens."

**Revisión 5 (2026-10-20)**: ajustes del análisis de consistencia. Se suma `RATE_LIMITED` (429) para las operaciones que modifican el mercado (caso borde «Demasiados pedidos»). FR-017 aclara que el precio pagado y la cotización son el mismo número. La spec de eliminación de cuentas queda obligada a crear la publicación de la plataforma (Assumptions).

**Revisión 4 (2026-10-20)**: pasada de validación. La dependencia pasa a la constitución v4.1.0 (regla «Mercado»). Se precisan FR-002 y FR-006 (prohibiciones explícitas), FR-003 (`PRICE_NOT_AVAILABLE` al publicar) y FR-027 (paginación con total).

**Revisión 3 (2026-10-20)**: el precio de una carta deja de ser 1/100 de la cotización: cada carta vale la cotización vigente completa de su jugador y se ajusta con el score (FR-001).

**Revisión 2 (2026-10-20)**: clarificaciones (ver Clarifications). El precio de venta lo da el score: es siempre el precio del token y el vendedor no lo fija. Se compra una publicación concreta, de a una carta por compra. No hay comisión del mercado.

**Depende de**: `08-sobres` (los tokens, sus estados y su historial, el inventario, la cuenta y los movimientos de créditos, y el criterio del Market, FR-070), `07-cotizacion` (la cotización vigente de cada jugador, de la que sale el precio de un token), `06-home` (el Market, el panel de detalle del jugador y su bloque de compra), `05-auth` (la sesión de usuario) y la constitución v4.1.0, §4 (registro inmutable de las compras y ventas), §5 (la regla «Mercado»: el precio del token es la cotización vigente de su jugador; créditos y venta de tokens en poder de la plataforma) y §6 (validar disponibilidad y saldos antes de ejecutar).

**Reemplaza**: FR-036 y FR-066 de la spec 08 (el inventario sin acciones) y FR-032 y FR-033 de la spec 06 (el bloque de compra como maqueta inerte). El texto de esas specs no se edita.

**Habilita (specs posteriores, fuera de alcance acá)**: el portfolio con ganancias y pérdidas, las transferencias de cartas sin precio entre usuarios, la eliminación de cuentas (que pone tokens a la venta de la plataforma, spec 08 FR-043) y las pantallas de historial de operaciones y de historial de una carta.

## Contexto de negocio

Hasta la spec 08, la única forma de conseguir una carta es abrir un sobre, y una vez en el inventario no se puede hacer nada con ella. Esta feature abre el **mercado**: los usuarios pueden **poner a la venta** cartas propias y **comprar** cartas que otros pusieron a la venta.

**El precio lo da el score.** Cada token tiene un **precio**, que es la **cotización vigente de su jugador**, completa y sin dividir: una carta vale lo mismo que su jugador. Nadie lo fija ni lo negocia: el vendedor decide **si** vende, no **a cuánto**. Cuando el recálculo de cotizaciones cambia el precio de un jugador, cambia el de todas sus cartas a la venta. Así, un usuario gana o pierde créditos solo según cómo cambia la valuación del jugador entre que obtiene la carta y la vende (constitución §5). Esto resuelve el pendiente que dejaron la spec 07 («cómo se traduce la cotización del jugador al precio de un token individual») y la spec 08, y descarta la propuesta de 1/100 que ambas mencionaban.

Una **publicación** es un token concreto puesto a la venta. Mientras está publicado, el token **sigue siendo del vendedor**: aparece en su inventario marcado como «a la venta» y solo él puede retirarlo. Un comprador elige **una publicación concreta** y la compra: el token pasa al comprador y el precio pasa del comprador al vendedor, en una sola operación.

Además de las publicaciones de usuarios, el mercado incluye los tokens `en_venta_plataforma` (spec 08): los que vuelven a la plataforma desde un usuario. Cada uno tiene una publicación cuyo vendedor es la plataforma, y se compra igual que cualquier otra. Lo que la plataforma cobra por ellos es ingreso de la plataforma y sale de circulación (constitución §5). Ningún flujo produce todavía tokens en ese estado —llegan con la spec de eliminación de cuentas—, pero la compra los contempla desde ahora.

**No hay comisión.** En una compra a un usuario, lo que paga el comprador lo recibe íntegro el vendedor: los créditos entre usuarios no se crean ni se destruyen. En una compra a la plataforma, todo lo que paga el comprador sale de circulación.

### Estados de un token

Esta feature no agrega estados: los cuatro de la spec 08 siguen sumando 100 por jugador.

| Estado | Dueño | Qué cambia con esta feature |
|---|---|---|
| `reservado` | Plataforma | Nada. |
| `en_sobre` | Plataforma | Nada. |
| `de_usuario` | Un usuario | Puede tener **una publicación activa**. Al venderse, sigue `de_usuario`, pero de otro usuario. |
| `en_venta_plataforma` | Plataforma | Tiene una publicación de la plataforma. Al comprarse, pasa a `de_usuario` del comprador. |

## Clarifications

### Session 2026-10-20

- Q: ¿Quién fija el precio de venta de una carta? → A: El precio lo da el score: es siempre el precio del token (FR-001). El vendedor no fija ni cambia precios; el precio de una publicación sigue a la cotización.
- Q: ¿El precio de una carta es una fracción de la cotización del jugador (1/100) o la cotización completa? → A: La cotización completa: cada carta vale lo mismo que su jugador y se ajusta con el score. Reemplaza la propuesta de 1/100 de las specs 07 y 08.
- Q: ¿Cómo elige el comprador qué cartas compra? → A: Elige una publicación concreta de la lista de cartas a la venta del jugador. Cada compra es de una sola carta.
- Q: ¿Hay comisión del mercado? → A: No. El vendedor recibe el precio completo.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Poner una carta a la venta (Priority: P1)

Desde su inventario, un usuario elige una de sus cartas, ve a qué precio se vendería hoy y la pone a la venta. La carta queda marcada como «a la venta» en su inventario y aparece en el mercado. Mientras nadie la compre, puede retirarla.

**Why this priority**: Sin publicaciones no hay nada para comprar: el mercado arranca vacío (spec 08) y solo se llena con lo que los usuarios ponen a la venta. Entregada sola, ya hace que el Market muestre jugadores.

**Independent Test**: Con un usuario que tiene cartas, publicar una y verificar que aparece en su inventario como «a la venta», que su jugador aparece en el Market y que el token sigue siendo del usuario. Retirarla y verificar que deja de estar a la venta y que el jugador desaparece del Market si no tiene otra publicación.

**Acceptance Scenarios**:

1. **Given** un usuario con una carta sin publicar, **When** la pone a la venta, **Then** queda una publicación activa, la carta sigue en su inventario marcada «a la venta» con su precio actual y queda registrado el evento `puesta_en_venta` del token.
2. **Given** el paso de confirmación de una publicación, **When** se muestra, **Then** informa el precio actual del token y avisa que el precio sigue a la cotización del jugador.
3. **Given** una petición de publicación que incluye un precio, **When** se procesa, **Then** es rechazada con `VALIDATION_ERROR` y no se publica nada: el precio no lo fija el vendedor.
4. **Given** una carta que ya tiene una publicación activa, **When** el usuario intenta publicarla de nuevo, **Then** es rechazado con `TOKEN_ALREADY_LISTED`.
5. **Given** un token que no es del usuario, o un ID inexistente, **When** intenta publicarlo, **Then** es rechazado con `TOKEN_NOT_FOUND`, sin revelar si el token existe.
6. **Given** una publicación activa propia, **When** el usuario la retira, **Then** deja de estar a la venta, la carta sigue en su inventario sin la marca y queda registrado el evento `retiro_de_venta`.
7. **Given** una publicación ya vendida o retirada, **When** el usuario intenta retirarla, **Then** es rechazado con `LISTING_NOT_ACTIVE`.
8. **Given** una publicación de otro usuario o de la plataforma, **When** alguien intenta retirarla, **Then** es rechazado con `LISTING_NOT_FOUND`.
9. **Given** una publicación activa, **When** cambia la cotización del jugador, **Then** su precio pasa a ser el nuevo precio del token, sin que el vendedor haga nada.
10. **Given** que un usuario retira una publicación mientras otro la está comprando, **When** ambos terminan, **Then** se completa exactamente una de las dos operaciones.
11. **Given** una persona sin sesión, **When** intenta publicar o retirar, **Then** es rechazada con `UNAUTHENTICATED`.
12. **Given** una petición que indica a nombre de qué usuario publicar, **When** se procesa, **Then** es rechazada con `VALIDATION_ERROR`: el vendedor siempre es el de la sesión.

---

### User Story 2 - Comprar una carta (Priority: P1)

Desde el panel de detalle de un jugador, un usuario ve las cartas a la venta, elige una y la compra. Antes de confirmar ve el precio y el saldo que le quedaría. Al confirmar, la carta pasa a su inventario y el vendedor recibe el precio.

**Why this priority**: Es la otra mitad del mercado y lo que convierte al bloque de compra de la home, hoy inerte, en una operación real. Junto con la User Story 1 es un mercado completo.

**Independent Test**: Con dos usuarios, que uno publique una carta y que el otro la compre desde el detalle del jugador. Verificar que el comprador pagó exactamente el precio del token, que el vendedor recibió exactamente ese monto, que la carta pasó de un inventario al otro y que la suma de los saldos no cambió.

**Acceptance Scenarios**:

1. **Given** una carta a la venta de otro usuario, **When** el usuario elige comprarla, **Then** ve su jugador, su número de serie, su precio y el saldo que le quedaría.
2. **Given** saldo suficiente, **When** el usuario confirma la compra, **Then** se le cobra exactamente el precio vigente del token, la carta pasa a su inventario y la publicación queda `vendida`.
3. **Given** una compra completada a un usuario, **When** se revisa el vendedor, **Then** recibió exactamente el precio cobrado y la carta ya no está en su inventario.
4. **Given** una publicación de la plataforma, **When** un usuario la compra, **Then** se le cobra el precio vigente del token y ese monto sale de circulación sin acreditarse a nadie.
5. **Given** una publicación propia, **When** el usuario intenta comprarla, **Then** es rechazado con `OWN_LISTING`.
6. **Given** una publicación ya vendida o retirada, **When** un usuario intenta comprarla, **Then** es rechazado con `LISTING_NOT_ACTIVE` y no se cobra nada.
7. **Given** una publicación inexistente, **When** un usuario intenta comprarla, **Then** es rechazado con `LISTING_NOT_FOUND`.
8. **Given** un saldo menor que el precio, **When** el usuario intenta comprar, **Then** es rechazado con `INSUFFICIENT_CREDITS` y no se compra nada.
9. **Given** que entre la vista y la confirmación cambió la cotización del jugador, **When** el precio nuevo supera el que el usuario confirmó, **Then** la compra es rechazada con `PRICE_CHANGED` y no se compra nada; si el precio nuevo es igual o menor, la compra se completa y se cobra el precio vigente.
10. **Given** que dos usuarios compran al mismo tiempo la misma carta, **When** ambos terminan, **Then** exactamente uno la recibe y el otro es rechazado con `LISTING_NOT_ACTIVE` sin que se le cobre nada.
11. **Given** un usuario con saldo para una sola carta, **When** envía dos compras de cartas distintas al mismo tiempo, **Then** exactamente una se completa, la otra es rechazada con `INSUFFICIENT_CREDITS` y el saldo nunca queda negativo.
12. **Given** una compra que falla en cualquier punto, **When** termina con error, **Then** los saldos, los inventarios y las publicaciones de comprador y vendedor son idénticos a los de antes de empezar.
13. **Given** una persona sin sesión, **When** intenta comprar, **Then** es rechazada con `UNAUTHENTICATED`.
14. **Given** una petición que indica a nombre de qué usuario comprar, **When** se procesa, **Then** es rechazada con `VALIDATION_ERROR`: el comprador siempre es el de la sesión.

---

### User Story 3 - Ver qué hay a la venta (Priority: P2)

En el Market, un usuario ve los jugadores que tienen cartas a la venta, con el precio del token y cuántas cartas hay. En el panel de detalle de un jugador ve la lista de cartas a la venta, cada una con su número de serie, y puede elegir cuál comprar.

**Why this priority**: Es lo que permite decidir qué comprar. La compra de la User Story 2 necesita poder elegir una publicación, pero el Market se puede entregar después.

**Independent Test**: Publicar cartas de dos jugadores y verificar que el Market muestra exactamente esos dos jugadores con el precio del token y su cantidad a la venta, y que el detalle de cada uno lista sus publicaciones.

**Acceptance Scenarios**:

1. **Given** jugadores con cartas a la venta, **When** un usuario entra al Market, **Then** ve solo esos jugadores, y cada carta muestra el precio del token y la cantidad de cartas a la venta (spec 08, FR-070).
2. **Given** el panel de detalle de un jugador con cartas a la venta, **When** se abre, **Then** muestra el precio del token y la lista de cartas a la venta, de la publicada hace más tiempo a la más nueva, cada una con su número de serie y sin identificar al vendedor.
3. **Given** el panel de detalle de un jugador sin cartas a la venta, **When** se abre, **Then** el bloque de compra indica que no hay cartas a la venta y no permite comprar.
4. **Given** cartas propias a la venta, **When** el usuario las ve en el detalle, **Then** aparecen identificadas como suyas y no se pueden comprar.
5. **Given** que una carta se vende o se retira, **When** se vuelve a consultar el Market o el detalle, **Then** ya no aparece; si era la última del jugador, el jugador deja de aparecer en el Market.
6. **Given** que cambia la cotización de un jugador, **When** se consulta el Market o el detalle, **Then** el precio de todas sus cartas a la venta es el nuevo precio del token.
7. **Given** filtros aplicados en el Market, **When** se consulta, **Then** los filtros existentes siguen funcionando sobre los jugadores con cartas a la venta.

---

### User Story 4 - Consultar mis compras y ventas (Priority: P3)

Un usuario consulta sus operaciones del mercado: qué compró y qué vendió, cuándo, a qué precio y su saldo antes y después. Los registros no se pueden modificar ni borrar.

**Why this priority**: Es el registro inmutable que exige la constitución §4 y el insumo del portfolio, pero el mercado entrega valor antes de poder consultarlo.

**Independent Test**: Hacer compras y ventas con dos usuarios y verificar que el historial de cada uno muestra exactamente sus operaciones, que cada registro reproduce su saldo y que ninguno se puede alterar.

**Acceptance Scenarios**:

1. **Given** un usuario con compras y ventas, **When** consulta su historial de operaciones, **Then** las ve de la más reciente a la más antigua, con fecha, tipo (compra o venta), carta, precio y saldo antes y después.
2. **Given** cualquier compra, **When** se revisa, **Then** saldo antes menos precio es igual al saldo después.
3. **Given** cualquier venta, **When** se revisa, **Then** saldo antes más precio es igual al saldo después.
4. **Given** una operación, **When** la consulta la otra parte, **Then** cada uno ve su lado y la contraparte aparece sin identificar.
5. **Given** una operación registrada, **When** se intenta modificarla o borrarla, **Then** el sistema no lo permite.
6. **Given** un token vendido, **When** su dueño anterior o el nuevo consultan su historial (spec 08, User Story 4), **Then** ven el evento de venta con su fecha, su precio y la cotización del jugador en ese instante.
7. **Given** el historial de un usuario, **When** otro intenta consultarlo, **Then** no hay forma de pedirlo: el historial siempre es el de la sesión.
8. **Given** todos los movimientos de créditos de un usuario (spec 08 y esta feature), **When** se suman en orden, **Then** reconstruyen su saldo actual exactamente.

---

### Edge Cases

- **Saldo justo**: un usuario con exactamente el precio puede comprar y queda en 0; con un crédito menos, no.
- **Todas las cartas de un jugador cuestan lo mismo**: el precio es del token, no de la publicación, así que el comprador elige por número de serie u otra preferencia, no por precio.
- **Cambio de cotización con publicaciones activas**: el precio de todas las cartas a la venta del jugador cambia en el mismo instante en que cambia su cotización. Una compra se cobra siempre al precio vigente en el instante de la compra.
- **Pantalla desactualizada**: si el precio subió entre la vista y la confirmación, la compra se rechaza con `PRICE_CHANGED` y la pantalla muestra el precio nuevo; si bajó, se cobra el precio vigente, que es menor.
- **Carta vendida mientras el comprador decide**: si otra persona la compra o el vendedor la retira antes, la compra se rechaza con `LISTING_NOT_ACTIVE` y el comprador puede elegir otra.
- **Jugador sin cotización**: no puede ocurrir para tokens `de_usuario`, porque solo salen de sobres jugadores cotizados (spec 08, FR-027) y una cotización no se borra. Si llegara a faltar, la carta no se puede publicar ni comprar y se rechaza con `PRICE_NOT_AVAILABLE`.
- **Carta publicada que entra en un sobre**: imposible; solo se publican tokens `de_usuario`, que nunca vuelven a los sobres.
- **Carta comprada que se vuelve a vender**: el nuevo dueño puede publicarla de inmediato; su historial suma la nueva publicación.
- **Publicar, retirar y volver a publicar**: se permite; cada vez es una publicación nueva y queda registrada.
- **Salir durante la compra**: si el usuario abandona la pantalla con la compra ya confirmada, la compra se completa y la carta aparece en su inventario.
- **Tokens de la plataforma sin flujo que los produzca**: hasta la spec de eliminación de cuentas no hay tokens `en_venta_plataforma`; el mercado solo tiene publicaciones de usuarios.
- **Demasiados pedidos**: más de 30 publicaciones, retiros o compras por minuto desde un mismo origen se rechazan con `RATE_LIMITED`, sin efectos. Las consultas (cartas a la venta, historial de operaciones) no tienen ese límite.

## Requirements *(mandatory)*

### Functional Requirements

**Precio del token**

- **FR-001**: El precio de un token MUST ser igual a la cotización vigente de su jugador, sin dividirla ni redondearla (la cotización ya es un entero de créditos, spec 07). Todos los tokens de un mismo jugador MUST tener el mismo precio. MUST recalcularse cada vez que cambia la cotización y MUST NOT calcularse a partir de otro dato (spec 07).
- **FR-002**: El precio de una publicación MUST ser en todo momento el precio vigente de su token. El sistema MUST NOT permitir que el vendedor, el comprador ni la plataforma lo fijen, cambien o negocien.

**Publicaciones**

- **FR-003**: Un usuario con sesión MUST poder poner a la venta un token propio en estado `de_usuario` cuyo jugador tenga cotización vigente; si no la tiene, MUST rechazarse con `PRICE_NOT_AVAILABLE`. El pedido MUST NOT incluir un precio.
- **FR-004**: Un token MUST tener a lo sumo una publicación activa.
- **FR-005**: Mientras está publicado, el token MUST seguir siendo del vendedor, en estado `de_usuario`, y MUST seguir apareciendo en su inventario con la marca «a la venta».
- **FR-006**: El vendedor MUST poder retirar su publicación activa. El sistema MUST rechazar el retiro pedido por cualquier otro usuario. Una publicación de la plataforma MUST NOT poder retirarse desde la API de usuario.
- **FR-007**: Una publicación MUST estar en uno de tres estados: `activa`, `vendida` o `retirada`. Solo una publicación `activa` se puede retirar o comprar. Las publicaciones no vencen. Volver a publicar un token retirado MUST crear una publicación nueva.
- **FR-008**: Todo token `en_venta_plataforma` MUST tener una publicación activa cuyo vendedor es la plataforma, creada en el mismo instante en que el token pasa a ese estado.
- **FR-009**: El vendedor de una publicación de usuario MUST salir siempre de la sesión; MUST NOT aceptarse un usuario indicado en el pedido.

**Compra**

- **FR-010**: Un usuario con sesión MUST poder comprar una publicación activa concreta. Cada compra MUST ser de exactamente una carta.
- **FR-011**: Un usuario MUST NOT poder comprar una publicación propia.
- **FR-012**: Antes de cobrar, el sistema MUST validar, en este orden: que la publicación existe, que está activa, que no es del comprador, que el token tiene precio, que el precio vigente no supera el que confirmó el comprador y que el saldo alcanza.
- **FR-013**: El pedido de compra MUST incluir el precio que el comprador aceptó. Si el precio vigente lo supera, la compra MUST rechazarse con `PRICE_CHANGED`; si es igual o menor, MUST cobrarse el precio vigente.
- **FR-014**: Una compra MUST ser atómica: o se cobra el precio al comprador, se acredita al vendedor (si es un usuario), se transfiere la carta, se cierra la publicación como `vendida` y se registra todo, o no ocurre nada de eso.
- **FR-015**: Compras y retiros simultáneos MUST NOT vender dos veces la misma carta, vender una publicación retirada ni dejar un saldo negativo.
- **FR-016**: El comprador de una compra MUST salir siempre de la sesión; MUST NOT aceptarse un usuario indicado en el pedido.
- **FR-017**: El resultado de una compra MUST informar: ID del token, número de serie, jugador, rareza, precio pagado y saldo resultante. Por FR-001, el precio pagado es la cotización del jugador en ese instante: es un solo dato, no dos. Lo mismo vale para FR-023 y FR-028.

**Créditos**

- **FR-018**: El mercado MUST NOT cobrar comisión. En una compra a un usuario, el vendedor MUST recibir exactamente lo que pagó el comprador.
- **FR-019**: Lo que se paga por una publicación de la plataforma MUST ser ingreso de la plataforma: sale de circulación y no se acredita a ninguna cuenta.
- **FR-020**: Todo cambio de saldo de esta feature MUST registrarse como un movimiento de créditos inmutable (spec 08, FR-006) con los tipos nuevos `compra_token` (comprador) y `venta_token` (vendedor).
- **FR-021**: En todo momento, la suma de los saldos de los usuarios MUST ser igual al total emitido menos el total cobrado por la plataforma (aperturas de sobres y ventas de la plataforma). Una compra entre usuarios MUST NOT cambiar esa suma.

**Tokens y su historial**

- **FR-022**: Cada token vendido MUST pasar del vendedor al comprador, o de `en_venta_plataforma` a `de_usuario` del comprador. Para cada jugador, los tokens en los cuatro estados MUST seguir sumando exactamente 100.
- **FR-023**: Publicar, retirar y vender un token MUST registrarse como eventos inmutables del token (spec 08, FR-030), con los tipos `puesta_en_venta`, `retiro_de_venta` y `venta`. El evento `venta` MUST incluir el precio pagado y la cotización y rareza vigentes.
- **FR-024**: Un usuario que compra un token MUST poder consultar su historial completo (spec 08, FR-031); los dueños que no son él siguen apareciendo sin identificar.

**Inventario**

- **FR-025**: *(Reemplaza FR-036 de la spec 08.)* El inventario MUST indicar, por cada token, si tiene una publicación activa, e informar el precio vigente del token. Un token vendido MUST dejar de aparecer en el inventario del vendedor y aparecer en el del comprador.

**Market y detalle del jugador**

- **FR-026**: El Market MUST mostrar solo jugadores con al menos una carta a la venta (spec 08, FR-070), contando las publicaciones activas de usuarios y de la plataforma. Cada jugador MUST mostrar el precio del token y la cantidad de cartas a la venta. Los filtros existentes MUST seguir funcionando.
- **FR-027**: El detalle de un jugador MUST informar el precio del token y la lista de sus publicaciones activas, de la más antigua a la más nueva, cada una con su número de serie, paginada e informando el total de publicaciones activas. MUST NOT identificar a los vendedores; las publicaciones del usuario de la sesión MUST marcarse como propias.

**Historial de operaciones y auditoría**

- **FR-028**: Cada compra MUST registrarse de forma inmutable con: comprador, vendedor (o la plataforma), publicación, token, jugador, fecha, precio aceptado, precio cobrado, cotización y rareza vigentes, saldo antes y después del comprador, saldo antes y después del vendedor (si es un usuario) e identificador de trazabilidad.
- **FR-029**: Un usuario MUST poder consultar su historial de compras y ventas, paginado y de la más reciente a la más antigua. En cada operación, la contraparte MUST aparecer sin identificar.
- **FR-030**: Las publicaciones, las compras, los movimientos de créditos y los eventos de token MUST NOT poder modificarse ni borrarse (salvo el cierre de una publicación activa como `vendida` o `retirada`), y MUST referenciarse entre sí de modo que cualquiera se pueda reconstruir a partir de los otros.

**Acceso, errores y observabilidad**

- **FR-031**: Todas las operaciones MUST exigir sesión de usuario válida. Un usuario MUST ver únicamente sus propias compras y ventas.
- **FR-032**: Toda entrada MUST validarse; ninguna entrada inválida puede producir efectos parciales.
- **FR-033**: Todo error MUST responderse con el formato estándar de la API (código, mensaje legible e identificador de trazabilidad), usando los códigos de la tabla siguiente.
- **FR-034**: Cada publicación, retiro y compra MUST emitir al menos un registro estructurado con el identificador de trazabilidad y los tokens y movimientos que afectó.
- **FR-035**: Todos los endpoints nuevos MUST estar documentados en el contrato de la API, incluidos sus códigos de error.

**Cliente web: inventario**

- **FR-036**: *(Reemplaza FR-066 de la spec 08.)* Cada carta del inventario MUST ofrecer ponerla a la venta si no está publicada, o retirarla si lo está, y MUST mostrar la marca «a la venta».
- **FR-037**: Poner a la venta y retirar MUST pedir confirmación. La confirmación de una publicación MUST mostrar el precio actual del token y avisar que el precio sigue a la cotización del jugador.

**Cliente web: compra desde el detalle del jugador**

- **FR-038**: *(Reemplaza FR-032 y FR-033 de la spec 06.)* El bloque de compra del panel de detalle MUST estar operativo: muestra la lista de cartas a la venta (FR-027), y cada carta ajena ofrece comprarla. El selector de cantidad de la maqueta MUST quitarse, porque cada compra es de una carta.
- **FR-039**: Antes de comprar, la pantalla MUST pedir confirmación mostrando la carta, el precio y el saldo que quedaría. Cancelar MUST NOT generar ninguna compra. Mientras una compra está en curso, MUST impedir iniciar otra.
- **FR-040**: El bloque MUST indicar cuando no hay cartas a la venta y cuando el saldo no alcanza, y en esos casos MUST NOT permitir confirmar.
- **FR-041**: Tras una compra, el saldo del encabezado, la lista de cartas a la venta del detalle y el Market MUST reflejar los valores reales sin recargar la página, y la pantalla MUST ofrecer ir al inventario.
- **FR-042**: Ante un rechazo, la pantalla MUST mostrar un mensaje propio para cada código de error de la compra y MUST volver a consultar el saldo y las cartas a la venta.

### Códigos de error

| Situación | HTTP | Código |
|---|---|---|
| Sin sesión o sesión inválida | 401 | `UNAUTHENTICATED` |
| Entrada inválida (precio en una publicación, usuario indicado en el pedido, precio aceptado ausente o no entero, paginación) | 422 | `VALIDATION_ERROR` |
| Token inexistente o que no es del usuario | 404 | `TOKEN_NOT_FOUND` |
| Publicación inexistente (o, al retirar, de otro usuario o de la plataforma) | 404 | `LISTING_NOT_FOUND` |
| Jugador inexistente (al consultar sus cartas a la venta) | 404 | `PLAYER_NOT_FOUND` |
| El token ya tiene una publicación activa | 409 | `TOKEN_ALREADY_LISTED` |
| La publicación ya fue vendida o retirada | 409 | `LISTING_NOT_ACTIVE` |
| Compra de una publicación propia | 409 | `OWN_LISTING` |
| El jugador no tiene cotización vigente | 409 | `PRICE_NOT_AVAILABLE` |
| El precio vigente supera el que aceptó el comprador | 409 | `PRICE_CHANGED` |
| Saldo menor que el precio | 409 | `INSUFFICIENT_CREDITS` |
| Demasiados pedidos de publicación, retiro o compra en poco tiempo | 429 | `RATE_LIMITED` |
| Error inesperado (sin efectos) | 500 | `INTERNAL_ERROR` |

Las validaciones de una compra se aplican en el orden de FR-012, después de la sesión y la entrada. `TOKEN_NOT_FOUND` se usa también para tokens de otros usuarios, para no revelar su existencia.

### Key Entities

- **Publicación**: un token puesto a la venta. Atributos: token, vendedor (un usuario o la plataforma), estado (`activa` / `vendida` / `retirada`), fecha de publicación, fecha de cierre, trazabilidad. No tiene precio propio: su precio es el del token. A lo sumo una activa por token.
- **Compra**: la compra de una publicación. Atributos: comprador, vendedor (o la plataforma), publicación, token, jugador, fecha, precio aceptado, precio cobrado, cotización y rareza en el instante, saldos antes y después de comprador y vendedor, trazabilidad. Inmutable.
- **Movimiento de créditos** *(spec 08, se extiende)*: suma los tipos `compra_token` y `venta_token`.
- **Evento de token** *(spec 08, se extiende)*: suma `retiro_de_venta` y `venta`; `puesta_en_venta` pasa a usarse también para publicaciones de usuarios.
- **Precio del token** *(derivado)*: la cotización vigente del jugador.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 95 % de las compras devuelven el resultado al usuario en menos de 2 segundos.
- **SC-002**: En el 100 % de las compras que fallan por cualquier motivo, los saldos, los inventarios y las publicaciones de comprador y vendedor quedan idénticos a los de antes de empezar.
- **SC-003**: Ninguna carta se vende dos veces ni a dos compradores (0 casos), incluso con compras simultáneas sobre la misma publicación.
- **SC-004**: Con saldo para `k` cartas y más de `k` compras simultáneas del mismo usuario, se completan como máximo `k` y el saldo final es no negativo.
- **SC-005**: En el 100 % de las compras, el precio cobrado es igual al precio vigente del token en el instante de la compra, es decir, a la cotización vigente de su jugador.
- **SC-006**: En el 100 % de las ventas entre usuarios, lo que pagó el comprador es igual a lo que recibió el vendedor.
- **SC-007**: En todo momento, la suma de los saldos de los usuarios es igual al total emitido menos el total cobrado por la plataforma.
- **SC-008**: Para el 100 % de los jugadores, los tokens en los cuatro estados suman 100 antes y después de cualquier compra.
- **SC-009**: En el 100 % de los casos, sumando en orden los movimientos de créditos de un usuario se reconstruye su saldo actual.
- **SC-010**: Para el 100 % de los tokens vendidos, el último evento de su historial coincide con su dueño actual.
- **SC-011**: Un jugador aparece en el Market si y solo si tiene al menos una carta a la venta, y la cantidad que muestra coincide con sus publicaciones activas en el 100 % de las consultas.
- **SC-012**: El 100 % de los intentos de retirar una publicación ajena, comprar una propia o ver compras y ventas ajenas son rechazados.
- **SC-013**: El 100 % de los errores de los endpoints nuevos se responden con uno de los códigos documentados.
- **SC-014**: Un usuario pone una carta a la venta desde su inventario en no más de 2 interacciones (elegir la carta, confirmar), y compra una carta desde el detalle de un jugador en no más de 2 (elegir la carta, confirmar).
- **SC-015**: El 100 % de las compras rechazadas no muestran la carta como recibida ni cambian el saldo visible.

## Assumptions

- **Precio del token**: la cotización completa del jugador, no 1/100 como proponían las specs 07 y 08. En consecuencia, los 100 tokens de un jugador valen en conjunto 100 veces su cotización.
- **Equilibrio económico a revisar**: con este precio, una carta del mercado vale mucho más que lo que cuesta, en promedio, obtenerla en un sobre (spec 08: de 100 a 800 créditos por sobre de 3 a 6 cartas). Abrir sobres y vender las cartas deja ganancia, y una sola carta cara puede superar los 2.000 créditos iniciales. Como referencia, con las cotizaciones del 2026-10-20 el contenido de un sobre vale en promedio 1.166 créditos (Common), 1.647 (Rare), 2.181 (Epic) y 2.777 (Legendary). Recalibrar los precios de los sobres y los créditos iniciales queda **fuera del alcance** de esta spec (spec 08, «Equilibrio económico a revisar»).
- **Ganancia solo por valuación**: como el precio no se negocia, un usuario gana o pierde únicamente por la diferencia entre la cotización del jugador cuando obtuvo la carta y cuando la vende. Esto también impide pasarse créditos entre cuentas vendiendo cartas a precios arbitrarios.
- **Elección entre cartas del mismo precio**: todas las cartas a la venta de un jugador cuestan lo mismo; la lista del detalle se ordena por antigüedad de la publicación y el comprador elige la que quiera (por ejemplo, por número de serie).
- **Una carta por compra**: comprar varias cartas implica varias compras, cada una con su confirmación.
- **Sin comisión**: el mercado no cobra nada. Los únicos ingresos de la plataforma siguen siendo los sobres y, en el futuro, los tokens que venda la plataforma.
- **Sin órdenes de compra**: el comprador compra lo que ya está a la venta; no puede dejar una oferta a la espera de que aparezca un vendedor.
- **Sin vencimiento**: las publicaciones quedan activas hasta que se venden o se retiran.
- **Sin notificaciones**: el vendedor se entera de una venta porque la carta deja de estar en su inventario, su saldo aumenta y la operación aparece en su historial.
- **Vendedor anónimo**: el mercado no identifica a los vendedores ni a los compradores entre sí, igual que el historial de un token (spec 08, FR-031).
- **Tokens de la plataforma**: la compra contempla las publicaciones de la plataforma, aunque ningún flujo las produzca hasta la spec de eliminación de cuentas. Esa spec MUST crear la publicación de la plataforma en la misma operación que pasa cada token a `en_venta_plataforma` (FR-008).
- **Filtros del Market**: los filtros de valor siguen operando sobre la cotización del jugador. Como el precio del token se deriva de ella, ordenan y filtran igual.
- **Componentes del cliente ya construidos**: el bloque de compra del panel de detalle (`PlayerDetailPanel`), el modal de confirmación (`ConfirmModal`) y la carta de jugador (`PlayerCard`) ya existen y se reutilizan.
- **Fuera de alcance**: los precios de los sobres y los créditos iniciales (siguen los de la spec 08); transferencias sin precio entre usuarios; órdenes de compra; subastas; compra de varias cartas en una sola operación; el portfolio con ganancias y pérdidas; la carga de saldo; la eliminación de cuentas; las pantallas de historial de operaciones y de historial de una carta; notificaciones; y cualquier cambio en la home salvo el Market y el bloque de compra del panel de detalle (FR-026, FR-027, FR-038 a FR-042).
