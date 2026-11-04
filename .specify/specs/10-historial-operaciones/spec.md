# Feature Specification: Historial de Operaciones y Consulta de Cotizaciones por Fecha

**Feature Branch**: `10-historial-operaciones`

**Created**: 2026-10-26

**Status**: Draft

**Input**: User description: "Historial de operaciones: una sección en «Mi perfil» donde el usuario ve todas sus compras y ventas de tokens (mercado) y también las cartas que obtuvo por sobres. Cartas adquiridas (por compra en el mercado o por sobre) y vendidas. Además, poder ver la cotización de un jugador en una fecha dada: en el gráfico de precios del detalle del jugador hay un botón «Ver más» que abre un modal con el gráfico completo y un filtro de fechas para buscar una cotización específica. Cada cotización debe aclarar con qué estrategia (y versión) fue cotizada."

**Depende de**: `09-mercado` (las compras y ventas de tokens y su registro inmutable, FR-028 y FR-029, y el precio del token, que es la cotización del jugador), `08-sobres` (las aperturas de sobres y las cartas que entregaron, FR-037 a FR-039, y la cuenta de créditos), `07-cotizacion` (el historial de cotizaciones, su estrategia y versión, FR-016 y FR-020), `06-home` (el panel de detalle del jugador y su bloque «Price History»), `05-auth` (la sesión de usuario) y la constitución v4.1.0, §4 (registro inmutable de las operaciones financieras) y §5 (traza de estrategia y versión en cada cotización).

**Completa**: la pantalla de historial de operaciones que la spec 09 dejó fuera de alcance («Habilita…», «Fuera de alcance») y el historial ampliado de cotizaciones que la spec 07 dejó limitado a las últimas 30 en la home (actualización 2026-10-13).

**Habilita (specs posteriores, fuera de alcance acá)**: el portfolio con ganancias y pérdidas, el historial de una carta individual y las notificaciones de venta.

## Contexto de negocio

Hasta la spec 09, el usuario puede **obtener** cartas (abriendo sobres o comprándolas) y **venderlas**, y el sistema guarda todo de forma inmutable, pero **no hay ninguna pantalla donde el usuario vea lo que hizo**. Si vendió una carta, solo lo nota porque dejó de estar en su inventario; si abrió sobres, solo ve el último resultado. Esta feature le da al usuario su **historial de operaciones**: una línea de tiempo de las cartas que adquirió —por sobre o por compra— y las que vendió, con fecha, precio y saldo.

Segunda mitad de la feature: hoy el panel de detalle de un jugador muestra un gráfico mínimo con sus **últimas 30 cotizaciones**, sin ejes, sin fechas y sin indicar cómo se calculó cada una. Quien compra o vende por «lo que cuesta hoy» no puede ver **cuánto costaba** una carta el día que la compró ni **por qué** cambió de precio. Esta feature agrega un botón «Ver más» al gráfico, que abre el **gráfico completo** del jugador en una ventana con un **filtro de fechas** para encontrar la cotización de un día concreto. Cada cotización dice **con qué estrategia y versión** se calculó, porque dos cotizaciones consecutivas pueden venir de estrategias distintas (por ejemplo, un cambio de «performance» a «prestigio» mueve el precio sin que el jugador haya cambiado).

**Las dos mitades se conectan**: el historial de operaciones muestra, para cada compra y venta, la cotización del jugador **en el instante de la operación** y con qué estrategia se calculó; esa misma consulta («¿cuánto valía el jugador en esta fecha y cómo se calculó?») es la que el usuario hace a mano desde el gráfico completo.

**Esta feature no crea operaciones ni cambia precios**: es de lectura. Todo lo que muestra ya existe como registro inmutable (aperturas, compras, cotizaciones); no se altera ninguno.

### Qué cuenta como «adquirida» y «vendida»

| Tipo de entrada | Qué es | Origen |
|---|---|---|
| **Adquirida por sobre** | Una carta que el usuario recibió al abrir un sobre. No tiene precio de compra: se muestra como «Primer propietario». | Apertura de sobre (spec 08) |
| **Adquirida por compra** | Una carta que el usuario compró en el mercado. | Compra (spec 09) |
| **Vendida** | Una carta que el usuario vendió en el mercado. | Venta (spec 09) |

Poner a la venta o retirar una publicación **no** es una operación del historial: no mueve cartas ni créditos hasta que se vende.

## Clarifications

### Session 2026-10-26

- Q: ¿Existe hoy una pantalla «Mi perfil»? → A: No. Esta feature crea la pantalla con lo mínimo —el usuario, su saldo y la sección de historial— y un acceso desde el encabezado. Cualquier otra sección del perfil queda fuera de alcance.
- Q: ¿Qué significa «la cotización de un jugador en una fecha dada» si las cotizaciones se calculan una vez por semana? → A: La **cotización vigente** ese día: la última calculada hasta el final de esa fecha. La respuesta aclara cuándo se calculó, para que no se confunda con una cotización hecha exactamente ese día.
- Q: ¿El filtro del historial separa también sobres de compras? → A: No. Solo Todas / Adquiridas (sobres y compras) / Vendidas; cada entrada indica su origen.
- Q: ¿Las cartas de sobre muestran también la cotización del jugador en ese momento y su estrategia? → A: No. Solo «Primer propietario» y el tipo de sobre. La cotización y estrategia en el instante se muestran únicamente en las compras y ventas; para una carta de sobre, el usuario la consulta desde el gráfico del jugador.
- Q: ¿Un sobre es una entrada o una por carta? → A: Una entrada por carta, también para los sobres: las cartas de un mismo sobre aparecen juntas y comparten fecha y tipo de sobre. Una carta recibida en un sobre no tiene precio de compra: en su lugar se muestra «Primer propietario».

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver mi historial de cartas adquiridas y vendidas en «Mi perfil» (Priority: P1)

Un usuario entra a «Mi perfil» desde el encabezado y ve, de la más reciente a la más antigua, todo lo que adquirió y vendió: sobres que abrió, cartas que compró y cartas que vendió. Cada entrada es una carta y dice la fecha, de qué tipo es y, si se compró o se vendió, a qué precio y cómo quedó su saldo; las cartas que salieron de un sobre dicen «Primer propietario» en lugar de un precio. Puede filtrar por adquiridas o vendidas.

**Why this priority**: Es lo que el usuario pidió y lo que hoy falta: sin esta pantalla, el registro inmutable de las specs 08 y 09 no sirve a nadie. Entregada sola, ya muestra el historial completo con sus precios y saldos.

**Independent Test**: Con un usuario que abrió un sobre de 3 cartas, compró una carta y vendió otra, entrar a «Mi perfil» y verificar que el historial muestra exactamente esas 5 entradas, de la más reciente a la más antigua: las 3 del sobre con «Primer propietario», la compra y la venta con su fecha, precio y saldo antes y después. Verificar con un segundo usuario que nunca ve las operaciones del primero.

**Acceptance Scenarios**:

1. **Given** un usuario con sesión, **When** entra al encabezado, **Then** ve un acceso a «Mi perfil» que lo lleva a la pantalla; una persona sin sesión que intente entrar es llevada a iniciar sesión.
2. **Given** un usuario que abrió un sobre de varias cartas, **When** mira su historial, **Then** ve una entrada «Adquirida por sobre» por cada carta, con la fecha, el tipo de sobre, la carta (jugador, número de serie y rareza) y la leyenda «Primer propietario» en lugar de un precio; las cartas de ese sobre aparecen juntas.
3. **Given** un usuario que compró una carta en el mercado, **When** mira su historial, **Then** ve una entrada «Adquirida por compra» con la fecha, la carta (jugador, número de serie y rareza), el precio pagado y el saldo antes y después.
4. **Given** un usuario que vendió una carta, **When** mira su historial, **Then** ve una entrada «Vendida» con la fecha, la carta, el precio recibido y el saldo antes y después, aunque la carta ya no esté en su inventario.
5. **Given** un historial con entradas de los tres tipos, **When** se muestra, **Then** están ordenadas de la más reciente a la más antigua, y cada entrada distingue con claridad si es adquirida por sobre, adquirida por compra o vendida.
6. **Given** el filtro «Adquiridas», **When** el usuario lo aplica, **Then** ve solo sobres y compras; con «Vendidas», solo ventas; con «Todas», todo.
7. **Given** una operación del mercado, **When** se muestra la contraparte, **Then** aparece como «Plataforma» u «Otro usuario», sin identificar a nadie (spec 09, FR-029).
8. **Given** un usuario sin ninguna operación, **When** entra a «Mi perfil», **Then** el historial indica que todavía no hizo operaciones y ofrece ir a Sobres o al Market.
9. **Given** un historial largo, **When** el usuario avanza de página, **Then** ve las entradas siguientes sin repetir ni saltear ninguna, y la pantalla informa el total.
10. **Given** una compra o venta que acaba de completarse, **When** el usuario abre «Mi perfil», **Then** la operación ya figura en su historial, y una compra rechazada no figura.
11. **Given** que una carta fue comprada, vendida y vuelta a comprar por el mismo usuario, **When** mira su historial, **Then** aparecen las tres operaciones por separado.
12. **Given** un usuario, **When** intenta ver el historial de otro, **Then** no hay forma de pedirlo: el historial es siempre el de la sesión.

---

### User Story 2 - Ver el gráfico completo de cotizaciones de un jugador (Priority: P2)

En el panel de detalle de un jugador, al lado del gráfico de precios aparece un botón «Ver más». Al apretarlo se abre una ventana (modal) con el **gráfico completo**: todas las cotizaciones del jugador, con fechas y precios en sus ejes. Al elegir un punto del gráfico, el usuario ve el detalle de esa cotización: precio, fecha, cómo se originó y **con qué estrategia y versión fue cotizada**.

**Why this priority**: Es la segunda petición del usuario y hace visible la traza de estrategia que exigen la constitución §5 y la spec 07. Es independiente de la US1: no necesita el historial de operaciones.

**Independent Test**: Con un jugador con varias cotizaciones de dos estrategias distintas, abrir el modal desde su detalle y verificar que el gráfico muestra todas las cotizaciones, que cada punto muestra su estrategia y versión, y que el cambio de estrategia se distingue en el gráfico.

**Acceptance Scenarios**:

1. **Given** el panel de detalle de un jugador con al menos una cotización, **When** se abre, **Then** el bloque «Price History» ofrece el botón «Ver más».
2. **Given** un jugador sin cotizaciones, **When** se abre su detalle, **Then** el bloque indica que todavía no tiene cotizaciones y no ofrece «Ver más».
3. **Given** el botón «Ver más», **When** el usuario lo aprieta, **Then** se abre un modal con el nombre del jugador y el gráfico de **todas** sus cotizaciones (no solo las últimas 30), con fechas en el eje horizontal y precios en el vertical.
4. **Given** el modal abierto, **When** el usuario elige un punto del gráfico (con el mouse, al tocar o con el teclado), **Then** ve el detalle de esa cotización: precio, score, fecha y hora de cálculo, origen (automática o manual) y **estrategia con su versión**.
5. **Given** cotizaciones calculadas con estrategias o versiones distintas, **When** se muestra el gráfico, **Then** el cambio de estrategia o de versión se distingue visualmente, con una leyenda que lo explica, para que un salto de precio no se confunda con una variación del jugador.
6. **Given** el modal abierto, **When** el usuario lo cierra (botón, tecla Escape o clic fuera), **Then** vuelve al panel de detalle en el mismo estado en que estaba.
7. **Given** el modal abierto, **When** una lectora de pantalla o el teclado lo recorren, **Then** el gráfico tiene una alternativa en texto con la lista de cotizaciones (fecha, precio y estrategia) y el foco queda dentro del modal mientras está abierto.
8. **Given** un jugador con una sola cotización, **When** se abre el modal, **Then** muestra esa cotización y su detalle, con un aviso de que todavía no hay historial para comparar.
9. **Given** que falla la carga del historial, **When** se abre el modal, **Then** muestra un mensaje de error con opción de reintentar, sin cerrar el panel.
10. **Given** el bloque «Price History» del panel, **When** hay cotizaciones, **Then** debajo del gráfico indica con qué estrategia y versión se calculó la cotización vigente.

---

### User Story 3 - Buscar la cotización de un jugador en una fecha dada (Priority: P3)

Dentro del modal del gráfico completo, el usuario usa un **filtro de fechas** para encontrar una cotización específica. Puede acotar el gráfico a un rango («desde» y «hasta») y puede elegir **un día** para ver cuánto valía el jugador ese día y con qué estrategia se calculó.

**Why this priority**: Responde la pregunta concreta del usuario («¿cuánto valía este jugador el día que compré?»), pero requiere el modal de la US2.

**Independent Test**: Con un jugador con cotizaciones semanales de las últimas ocho semanas, abrir el modal, elegir una fecha intermedia y verificar que la respuesta es la última cotización calculada hasta ese día, con su fecha de cálculo, su precio y su estrategia y versión. Elegir una fecha anterior a la primera cotización y verificar el aviso de que no había cotización.

**Acceptance Scenarios**:

1. **Given** el modal abierto, **When** el usuario elige un día, **Then** ve la **cotización vigente** ese día: la última calculada hasta el final de esa fecha, con su precio, score, fecha y hora de cálculo, origen y estrategia con versión; y esa cotización queda resaltada en el gráfico.
2. **Given** un día en que no se calculó ninguna cotización pero hubo una anterior, **When** se busca, **Then** el resultado aclara que es la cotización vigente calculada el día X, no una calculada ese día.
3. **Given** un día anterior a la primera cotización del jugador, **When** se busca, **Then** el resultado indica que el jugador no tenía cotización a esa fecha y cuándo se calculó la primera; no se muestra ningún precio.
4. **Given** una fecha futura, **When** el usuario intenta elegirla, **Then** no es posible elegirla; si se envía igual, es rechazada como inválida y no se muestra ningún precio.
5. **Given** un rango «desde–hasta», **When** el usuario lo aplica, **Then** el gráfico y la lista de cotizaciones muestran solo las calculadas dentro del rango (inclusive), con sus estrategias.
6. **Given** un rango sin ninguna cotización calculada dentro, **When** se aplica, **Then** el modal lo informa e indica cuál era la cotización vigente al comienzo del rango, si la había.
7. **Given** un rango invertido («desde» posterior a «hasta») o una fecha mal formada, **When** el usuario intenta aplicarlo, **Then** el modal muestra un mensaje claro y no consulta ni cambia lo que se veía.
8. **Given** un filtro aplicado, **When** el usuario lo limpia, **Then** vuelve a ver el gráfico completo.
9. **Given** una fecha elegida, **When** el usuario cambia a otra, **Then** el resultado y el resaltado se actualizan sin cerrar el modal.
10. **Given** el filtro, **When** se compara el resultado de un día con el historial completo, **Then** coinciden: la cotización de un día es siempre una de las cotizaciones del historial, nunca una interpolación ni un valor calculado para la ocasión.

---

### User Story 4 - Ver con qué cotización y estrategia compré o vendí cada carta (Priority: P4)

En cada compra y venta del historial, el usuario ve la **cotización del jugador en el instante de la operación** y con qué estrategia y versión se calculó. Así entiende, por ejemplo, que pagó 1.200 créditos porque ese día el jugador estaba cotizado en 1.200 con la estrategia «prestigio» v2.

**Why this priority**: Cierra el círculo entre las dos mitades de la feature y entrega la traza que pide la constitución §5. El historial de la US1 ya es útil sin este dato, por eso va al final.

**Independent Test**: Con una carta comprada y otra vendida, cada una con una cotización de estrategia distinta en ese instante, verificar que sus entradas muestran la cotización de ese instante y su estrategia y versión, y que coinciden con lo que devuelve la búsqueda por fecha de la US3 para esa misma fecha y hora.

**Acceptance Scenarios**:

1. **Given** una compra o una venta, **When** se muestra su entrada, **Then** indica el precio de la operación y que ese precio es la cotización del jugador en ese instante, con su estrategia y versión (spec 09, FR-017: precio pagado y cotización son el mismo número).
2. **Given** una carta recibida en un sobre, **When** se muestra su entrada, **Then** indica «Primer propietario» y el tipo de sobre, y no muestra ninguna cotización ni estrategia; el usuario puede consultarlas abriendo el gráfico del jugador (escenario 4).
3. **Given** una operación realizada con una estrategia que después dejó de estar activa, **When** el usuario mira su historial, **Then** la entrada sigue mostrando la estrategia y versión de ese momento, no la activa hoy.
4. **Given** cualquier entrada del historial (de sobre, compra o venta), **When** el usuario elige ver la evolución del jugador, **Then** se abre el modal del gráfico completo del jugador (US2) con la cotización vigente en el instante de esa operación resaltada, con su estrategia y versión.
5. **Given** que no se puede determinar la estrategia de una cotización antigua, **When** se muestra la entrada, **Then** indica «estrategia no disponible» y sigue mostrando el precio; nunca inventa un valor.

---

### Edge Cases

- **Historial vacío**: un usuario recién registrado solo tiene la entrega inicial de créditos, que no es una operación de cartas y no aparece; el historial indica que todavía no hizo operaciones.
- **Carta que ya no tengo**: las cartas vendidas y las recibidas en un sobre y vendidas después siguen apareciendo en sus entradas originales; el historial no depende del inventario actual.
- **Sobres con muchas cartas**: una apertura de hasta 6 cartas genera hasta 6 entradas consecutivas, una por carta, con la misma fecha; el filtro y la paginación cuentan entradas (cartas), y las cartas de un mismo sobre pueden quedar en páginas distintas.
- **Misma fecha y hora**: dos entradas del mismo instante (por ejemplo, las cartas de un sobre) se ordenan de forma estable, agrupadas por operación y luego por identificador, de modo que la paginación no repita ni saltee entradas.
- **Operaciones que ocurren mientras se pagina**: una operación nueva puede desplazar las páginas; el historial nunca muestra una entrada dos veces en la misma carga, y recargar muestra el estado actual.
- **Jugador cotizado una sola vez o nunca**: una cotización única se muestra con aviso; sin cotizaciones no hay «Ver más».
- **Cotización al instante exacto**: si una operación ocurre en el mismo instante en que se calculó una cotización, vale la calculada hasta ese instante inclusive.
- **Historial muy largo de un jugador**: el modal muestra el historial completo aunque supere lo que cabe en una pantalla; el gráfico sigue siendo legible (no dibuja miles de marcas ilegibles) y toda cotización sigue siendo accesible por la lista y por la búsqueda por fecha.
- **Zona horaria**: «un día» se toma completo en la zona horaria del usuario; una cotización calculada a las 02:00 del lunes pertenece al lunes.
- **Cambio de estrategia activa**: no cambia ninguna cotización pasada (spec 07, FR-014); el historial y el gráfico muestran siempre la estrategia con la que se calculó cada una.
- **Desactivación de una estrategia**: sus cotizaciones conservan su nombre y versión.
- **Sesión vencida durante la consulta**: el pedido se rechaza y el usuario es llevado a iniciar sesión (spec 05).
- **Proveedor externo caído**: no afecta; todo se consulta de datos locales.
- **Jugador inexistente**: al pedir el historial o la cotización en una fecha de un jugador que no existe, la respuesta es de «no encontrado».
- **Operaciones de la plataforma**: no hay operaciones en las que la plataforma compre al usuario; la contraparte «Plataforma» solo aparece cuando el usuario le compra un token (spec 09).

## Requirements *(mandatory)*

### Functional Requirements

**Mi perfil**

- **FR-001**: El cliente web MUST ofrecer, solo a usuarios con sesión, una pantalla «Mi perfil», accesible desde el encabezado. Una persona sin sesión que intente entrar MUST ser llevada a iniciar sesión.
- **FR-002**: «Mi perfil» MUST mostrar el nombre del usuario, su saldo de créditos y la sección «Historial de operaciones». No muestra otros datos del usuario (por ejemplo su correo).

**Historial de operaciones**

- **FR-003**: El sistema MUST permitir al usuario con sesión consultar su historial de operaciones: las cartas que recibió al abrir sobres, las cartas que compró en el mercado y las cartas que vendió en el mercado.
- **FR-004**: Cada entrada del historial MUST corresponder a una sola carta e indicar: tipo (adquirida por sobre, adquirida por compra o vendida), fecha y hora, y la carta (ID del token, número de serie, jugador y rareza).
- **FR-005**: Una **adquirida por sobre** MUST indicar el tipo de sobre y MUST mostrar la leyenda «Primer propietario» en lugar de un precio. MUST NOT mostrar un precio de compra, y MUST NOT mostrar el precio del sobre ni el saldo antes y después de la apertura. Las cartas de un mismo sobre MUST aparecer juntas.
- **FR-006**: Una **adquirida por compra** y una **vendida** MUST indicar el precio pagado o recibido y el saldo antes y después de la operación.
- **FR-007**: La contraparte de una compra o de una venta MUST aparecer como «Plataforma» u «Otro usuario», sin identificar a nadie.
- **FR-008**: El historial MUST ordenarse de la entrada más reciente a la más antigua, con un desempate estable cuando dos entradas tienen el mismo instante (agrupadas por operación y luego por identificador), y MUST estar paginado informando el total de entradas, es decir, de cartas.
- **FR-009**: El historial MUST poder filtrarse por «Todas», «Adquiridas» (sobres y compras) y «Vendidas». El total informado MUST corresponder al filtro aplicado.
- **FR-010**: Una operación MUST aparecer en el historial desde el instante en que se confirma. Una operación rechazada o que no se completó MUST NOT aparecer. Publicar o retirar una publicación MUST NOT aparecer.
- **FR-011**: Las entradas MUST seguir mostrándose aunque el usuario ya no posea las cartas, y MUST mostrar los valores que se registraron en el momento de la operación (precio, cotización, rareza, saldos), sin recalcularlos con los datos de hoy.
- **FR-012**: Un usuario MUST ver únicamente su propio historial; ningún pedido puede indicar a nombre de qué usuario consultar.
- **FR-013**: Cuando el historial está vacío, MUST indicarlo y ofrecer ir a Sobres y al Market.
- **FR-014**: La consulta del historial MUST NOT modificar ningún registro: es de solo lectura.

**Cotización en el instante de una operación**

- **FR-015**: Cada compra y cada venta MUST informar que su precio es la cotización del jugador en el instante de la operación y la **estrategia y versión** con la que se calculó esa cotización. Las cartas adquiridas por sobre MUST NOT mostrar cotización ni estrategia en el historial.
- **FR-016**: La estrategia y la versión de una compra o venta MUST salir de la cotización del jugador vigente en el instante de la operación, es decir, la última calculada hasta ese instante. Si no se puede determinar, MUST informarse como «estrategia no disponible» sin inventar ningún valor.
- **FR-017**: La estrategia y versión mostradas MUST ser las que se usaron al calcular esa cotización, aunque después se haya activado otra estrategia o creado otra versión (spec 07, FR-014).
- **FR-018**: Cada entrada MUST ofrecer abrir el gráfico completo del jugador (FR-021) con la cotización de la operación resaltada.

**Gráfico completo de cotizaciones**

- **FR-019**: El bloque «Price History» del panel de detalle MUST ofrecer un botón «Ver más» cuando el jugador tiene al menos una cotización, y MUST no ofrecerlo cuando no tiene ninguna.
- **FR-020**: Debajo del gráfico del panel MUST indicarse con qué estrategia y versión se calculó la cotización vigente.
- **FR-021**: «Ver más» MUST abrir un modal con el gráfico de **todas** las cotizaciones del jugador, con fechas en el eje horizontal y precios en el vertical, y con el nombre del jugador. El modal MUST poder cerrarse con un botón, con Escape y con un clic fuera de él, y al cerrarse MUST dejar el panel como estaba.
- **FR-022**: Al elegir una cotización del gráfico (mouse, toque o teclado), el modal MUST mostrar su detalle: precio, score, fecha y hora de cálculo, origen (automática o manual) y estrategia con su versión.
- **FR-023**: Cada cotización que se muestre en el modal MUST indicar la estrategia y la versión con la que fue calculada. Cuando consecutivas cotizaciones difieren en estrategia o versión, el gráfico MUST distinguir el cambio y MUST incluir una leyenda.
- **FR-024**: El modal MUST ofrecer una alternativa en texto del gráfico —la lista de cotizaciones con fecha, precio y estrategia— de modo que la información no dependa solo de la forma o el color de la línea. MUST mantener el foco dentro del modal mientras está abierto.
- **FR-025**: Mientras carga el historial, el modal MUST indicarlo. Si la carga falla, MUST mostrar un mensaje de error con la opción de reintentar, sin cerrar el panel. Si el historial excede lo que se trae en una consulta, el modal MUST cargarlo completo en tramos.
- **FR-026**: Con una sola cotización, el modal MUST mostrarla con un aviso de que todavía no hay historial para comparar; con ninguna, MUST NOT abrirse.

**Búsqueda por fecha**

- **FR-027**: El modal MUST ofrecer un filtro de fechas con dos usos: acotar el gráfico y la lista a un rango «desde–hasta» (ambos inclusive), y buscar la cotización de un **día** puntual.
- **FR-028**: La cotización de un día MUST ser la **cotización vigente** ese día: la última calculada hasta el final de esa fecha, tomando el día completo en la zona horaria del usuario. El resultado MUST informar su precio, score, fecha y hora de cálculo, origen y estrategia con versión, y MUST aclarar cuándo se calculó cuando no fue ese mismo día.
- **FR-029**: La cotización de un día MUST ser siempre una cotización existente del historial; el sistema MUST NOT interpolar ni calcular un precio para la ocasión.
- **FR-030**: Si el día es anterior a la primera cotización del jugador, MUST informarse que no tenía cotización a esa fecha y cuándo se calculó la primera, sin mostrar ningún precio.
- **FR-031**: El filtro MUST impedir elegir una fecha futura. Una fecha futura, una fecha mal formada o un rango invertido enviados igualmente MUST rechazarse como entrada inválida, sin efectos y sin cambiar lo que se muestra.
- **FR-032**: Si un rango no contiene ninguna cotización, MUST informarlo y mostrar la cotización vigente al comienzo del rango, si existe.
- **FR-033**: El filtro MUST poder limpiarse y volver al gráfico completo. Al cambiar el filtro o la fecha, el resultado y el resaltado en el gráfico MUST actualizarse sin cerrar el modal.

**Acceso, errores y observabilidad**

- **FR-034**: Todas las operaciones de esta feature MUST exigir sesión de usuario válida. Cualquier usuario con sesión puede consultar las cotizaciones de cualquier jugador (spec 07, FR-033); solo puede consultar su propio historial de operaciones.
- **FR-035**: Toda entrada (fechas, rangos, filtros, paginación) MUST validarse; ninguna entrada inválida puede producir efectos ni resultados parciales.
- **FR-036**: Todo error MUST responderse con el formato estándar de la API (código, mensaje legible e identificador de trazabilidad), con los códigos de la tabla siguiente.
- **FR-037**: Esta feature MUST NOT crear, modificar ni borrar ninguna operación, movimiento de créditos, cotización ni evento de token (constitución §4): solo los lee.
- **FR-038**: Los endpoints nuevos o ampliados MUST estar documentados en el contrato de la API, incluidos sus códigos de error.

### Códigos de error

| Situación | HTTP | Código |
|---|---|---|
| Sin sesión o sesión inválida | 401 | `UNAUTHENTICATED` |
| Entrada inválida (fecha mal formada, fecha futura, rango invertido, filtro desconocido, paginación fuera de límites, usuario indicado en el pedido) | 422 | `VALIDATION_ERROR` |
| Jugador inexistente (al pedir su historial o la cotización en una fecha) | 404 | `PLAYER_NOT_FOUND` |
| Error inesperado (sin efectos) | 500 | `INTERNAL_ERROR` |

Un jugador sin cotización, o sin cotización a una fecha, **no es un error**: la respuesta lo informa como «sin cotización» (spec 07, FR-018).

El historial de cotizaciones que ya existe (spec 07, FR-020) solo se amplía con el nombre de la estrategia y conserva su formato de error publicado, que responde 400 ante una fecha o una paginación inválidas; el cliente valida el rango antes de pedirlo.

### Key Entities

- **Entrada del historial** *(derivada, no se persiste)*: una carta que el usuario adquirió o vendió. Atributos: tipo (adquirida por sobre / adquirida por compra / vendida), fecha y hora, carta (ID de token, serie, jugador, rareza). En compras y ventas: precio pagado o recibido (que es la cotización del jugador en ese instante), su estrategia y versión, saldo antes y después y contraparte. En cartas de sobre: tipo de sobre y la leyenda «Primer propietario» (sin precio ni saldo). Se construye a partir de las aperturas (spec 08) y las compras (spec 09), que son inmutables.
- **Cotización** *(spec 07, se muestra más)*: precio y score de un jugador en un momento, con origen, estrategia y versión. Esta feature la lee; no la modifica.
- **Estrategia de valuación** *(spec 07)*: nombre y versión con la que se calculó una cotización. Se muestra en cada cotización.
- **Cotización vigente en una fecha** *(derivada)*: la última cotización de un jugador calculada hasta el final de un día dado. Puede no existir.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100 % de las cartas recibidas en sobres y de las compras y ventas confirmadas de un usuario aparecen en su historial, y ninguna operación rechazada, publicación ni retiro aparece.
- **SC-002**: El 100 % de las entradas del historial muestran el precio, los saldos (en compras y ventas) y la rareza que se registraron en el momento de la operación, y no cambian cuando cambia la cotización del jugador o la estrategia activa.
- **SC-003**: Ningún usuario ve operaciones de otro (0 casos) y ninguna entrada identifica a la contraparte.
- **SC-004**: Un usuario encuentra una operación concreta de su historial en no más de 3 interacciones (entrar a «Mi perfil», elegir el filtro, avanzar de página si hace falta).
- **SC-005**: El historial muestra su primera página en menos de 2 segundos en el 95 % de las consultas, con hasta 1.000 entradas acumuladas.
- **SC-006**: El 100 % de las cotizaciones que muestra el cliente —en el modal, en la búsqueda por fecha y en las compras y ventas del historial— indican su estrategia y versión, o «estrategia no disponible» cuando no se puede determinar.
- **SC-007**: Para cualquier fecha, la cotización vigente informada coincide en el 100 % de los casos con la última cotización del historial calculada hasta el final de ese día, y nunca con un valor inventado.
- **SC-008**: Un usuario abre el gráfico completo desde el detalle del jugador en 1 interacción («Ver más») y encuentra la cotización de un día puntual en no más de 3 interacciones (elegir la fecha, confirmar, leer el resultado).
- **SC-009**: El modal abre y muestra el gráfico en menos de 2 segundos en el 95 % de los casos, con jugadores de hasta 500 cotizaciones.
- **SC-010**: El 100 % de las fechas inválidas (futuras, mal formadas, rango invertido) son rechazadas sin mostrar ningún resultado.
- **SC-011**: La información del gráfico completo es accesible sin depender del color: el 100 % de las cotizaciones del gráfico también están disponibles en texto, y el modal se maneja completo con el teclado.
- **SC-012**: Tras abrir sobres o comprar o vender cartas, la nueva entrada aparece en «Mi perfil» sin que el usuario deba cerrar la sesión.
- **SC-013**: El 100 % de los errores de los endpoints nuevos o ampliados se responden con uno de los códigos documentados.

## Assumptions

- **Solo lectura**: no hay datos nuevos que guardar. Las aperturas (spec 08, FR-037 y FR-038) y las compras (spec 09, FR-028) ya registran de forma inmutable todo lo que el historial muestra, incluida la cotización de cada carta recibida en un sobre; el historial las junta.
- **Estrategia de una operación**: las compras guardan solo el precio, sin vínculo a la cotización usada. Como las cotizaciones son inmutables y acumulativas (spec 07, FR-017), la estrategia y versión de una operación se determinan buscando la cotización del jugador vigente en ese instante, que es la misma búsqueda de la US3. Si el plan decide registrar el vínculo hacia adelante, no cambia lo que ve el usuario.
- **Una entrada por carta**: también para los sobres (decisión del equipo, 2026-10-26). El filtro y la paginación cuentan cartas. Como las entradas de sobre no muestran precio ni saldo, el precio pagado por un sobre y el saldo de la apertura no se ven en este historial; siguen registrados en la apertura (spec 08, FR-037 y FR-039) y en los movimientos de créditos.
- **«Adquiridas» incluye sobres y compras**: es el criterio del pedido («adquiridas: compra o sobre»). Cada entrada aclara su origen; no hay un filtro aparte por origen.
- **Mi perfil mínimo**: la pantalla no existía; esta feature la crea con el nombre del usuario, el saldo y el historial. El correo, el cambio de contraseña, la eliminación de cuenta y cualquier otra sección quedan fuera de alcance.
- **Cotización en una fecha**: es la vigente ese día (la última calculada hasta el final de esa fecha), no una interpolación. Como las cotizaciones se recalculan semanalmente (spec 07), la mayoría de los días la cotización es la de un cálculo anterior, y la respuesta lo aclara.
- **Día completo en la zona horaria del usuario**: la interpretación de «un día» y de los límites del rango usa la zona horaria del navegador; los instantes siguen almacenados como en el resto del sistema.
- **Gráfico completo con todas las cotizaciones**: el historial de un jugador crece una cotización por corrida (semanal por defecto más las manuales), por lo que se asume que no supera unos pocos cientos de puntos en la vida del producto. Si lo superara, el modal debe seguir siendo legible, pero no se fija un límite de cotizaciones.
- **El gráfico del panel no cambia**: sigue mostrando las últimas 30 cotizaciones como mini-gráfico; «Ver más» y la línea de estrategia son lo único que se agrega al bloque (spec 06, actualización de la spec 07 del 2026-10-13).
- **Accesibilidad del gráfico**: el modal debe poder manejarse sin mouse; la lista en texto de las cotizaciones cumple el rol de alternativa al gráfico.
- **Operaciones no incluidas**: la entrega inicial de créditos, publicar y retirar publicaciones no son operaciones del historial. Las futuras transferencias, devoluciones por eliminación de cuenta y cargas de saldo, cuando existan, definirán si se agregan.
- **Filtros del historial**: solo por tipo (Todas / Adquiridas / Vendidas). Buscar por jugador, por rango de fechas o exportar el historial quedan fuera de alcance; el filtro de fechas de esta feature es el del gráfico de cotizaciones.
- **Componentes ya construidos**: el panel de detalle (`PlayerDetailPanel`), el modal de confirmación (`ConfirmModal`) y la carta de jugador (`PlayerCard`) existen; se reutiliza lo que corresponda.
- **Fuera de alcance**: el portfolio con ganancias y pérdidas; el historial de una carta individual (spec 08, FR-031); la exportación del historial; las notificaciones; los filtros por jugador o por fecha del historial de operaciones; cualquier cambio en precios, sobres o mercado; y cualquier cambio en la home distinto del botón «Ver más» y de la línea de estrategia del bloque «Price History».
