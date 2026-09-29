# Feature Specification: Homepage de Mercado (Striker Market)

**Feature Branch**: `06-home`

**Created**: 2026-09-20

**Status**: Draft

**Input**: User description: "06-home" — ver el borrador original del autor en el historial de git de este archivo y la maqueta de referencia `home_Mockup.jpg` en esta misma carpeta.

**Depende de**: `01-catalogo-jugadores` (el catálogo y su endpoint de listado, que esta feature amplía), `03-ingesta-stats` (las métricas de temporada que alimentan la carta y el panel de detalle) y `05-auth` (la sesión de usuario que protege la vista y sus endpoints, y el componente de carta ya implementado en `front/src/components/player-card`).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Explorar el mercado de jugadores (Priority: P1)

Una persona con sesión iniciada entra a la aplicación y, en lugar de la pantalla mínima actual, encuentra una grilla de cartas coleccionables. Cada carta le muestra de un vistazo quién es el jugador, su valoración general, su club y nacionalidad, sus goles y asistencias de la temporada, y cuánto se movió su valor. Puede recorrer el catálogo completo paginando.

**Why this priority**: Es el corazón de la feature y la primera pantalla real del producto. Entregada sola —sin filtros ni panel de detalle— ya convierte una home vacía en un mercado navegable y demuestra el valor del catálogo y de la ingesta de estadísticas construidos en las features 01 a 04.

**Independent Test**: Iniciar sesión, abrir la home y verificar que se listan cartas con datos reales del catálogo, que la paginación recorre el conjunto completo y que un jugador sin estadísticas de temporada también aparece. No requiere que exista ningún filtro ni el panel lateral.

**Acceptance Scenarios**:

1. **Given** una sesión de usuario válida y un catálogo con jugadores cargados, **When** la persona abre la home, **Then** ve una grilla de cartas donde cada una expone nombre, posición, valoración general, club, nacionalidad, goles, asistencias y la variación porcentual de valor.
2. **Given** un catálogo con más jugadores que los que entran en una página, **When** la persona avanza a la página siguiente, **Then** recibe el siguiente conjunto de jugadores sin repetir ni omitir ninguno respecto de la página anterior.
3. **Given** un jugador cuyo club todavía no tiene escudo cargado o que no tiene foto, **When** se muestra su carta, **Then** la carta se renderiza igual usando los marcadores de posición ya previstos por el componente, sin espacios rotos ni errores.
4. **Given** un jugador sin estadísticas de temporada registradas, **When** se muestra su carta, **Then** aparece en la grilla con sus métricas en cero y sin impedir el renderizado del resto.
5. **Given** una persona sin sesión iniciada, **When** intenta abrir la home, **Then** es redirigida al inicio de sesión y no recibe datos del catálogo.
6. **Given** que el catálogo todavía está respondiendo, **When** la persona abre la home, **Then** ve un estado de carga explícito en lugar de una pantalla en blanco.
7. **Given** un jugador con un rating de temporada de 8,63, **When** se muestra su carta, **Then** exhibe un OVR de 86 y el tratamiento visual de *Legendary*.
8. **Given** un jugador con un rating de temporada de 7,08, **When** se muestra su carta, **Then** exhibe un OVR de 70 y el tratamiento visual de *Rare*.
9. **Given** un jugador con un rating de temporada de 6,94, **When** se muestra su carta, **Then** exhibe un OVR de 69 y el tratamiento visual de *Common*.

---

### User Story 2 - Filtrar y buscar dentro del mercado (Priority: P2)

La persona acota la grilla a lo que le interesa: elige una o varias ligas, una o varias posiciones, una o varias rarezas, ajusta el rango de valor y el rango de valoración general, y puede además buscar por nombre. Los filtros se combinan entre sí y el resultado sigue siendo paginado.

**Why this priority**: Es lo que hace usable un catálogo de miles de jugadores, pero la grilla ya entrega valor sin ella. Puede desarrollarse, probarse y demostrarse por separado una vez que la grilla existe.

**Independent Test**: Aplicar cada filtro por separado y luego combinados, verificando contra el catálogo que el conjunto devuelto es exactamente el esperado y que el total informado coincide con la cantidad de resultados paginables.

**Acceptance Scenarios**:

1. **Given** el catálogo completo, **When** la persona selecciona dos ligas a la vez, **Then** el resultado contiene jugadores de ambas ligas y de ninguna otra.
2. **Given** el catálogo completo, **When** la persona selecciona las posiciones FW y MF, **Then** el resultado contiene únicamente jugadores de esas dos posiciones.
3. **Given** filtros de liga, posición, rareza, rango de valor y rango de valoración aplicados simultáneamente, **When** se consulta el listado, **Then** el resultado satisface todas las condiciones a la vez y el total informado permite paginar hasta el último resultado.
4. **Given** una búsqueda por un fragmento del nombre, **When** la persona la ejecuta, **Then** obtiene los jugadores cuyo nombre contiene ese fragmento, sin distinguir mayúsculas ni acentos.
5. **Given** una combinación de filtros sin ningún jugador que la satisfaga, **When** se consulta el listado, **Then** la persona ve un estado vacío explicativo y no un error.
6. **Given** un parámetro de filtro con un valor inválido —una posición inexistente, un rango invertido o un número fuera de límites—, **When** se consulta el listado, **Then** la petición es rechazada por inválida y no se devuelven resultados parciales.
7. **Given** filtros aplicados en una página avanzada, **When** la persona cambia un filtro, **Then** el listado vuelve a la primera página del nuevo conjunto de resultados.
8. **Given** el catálogo completo, **When** la persona filtra por rareza *Legendary*, **Then** el resultado contiene únicamente jugadores con OVR 85 o superior.
9. **Given** el catálogo completo, **When** la persona ajusta el rango de valoración a 70–99, **Then** el resultado excluye tanto a los jugadores con OVR inferior a 70 como a los que no tienen rating de temporada.

---

### User Story 3 - Consultar el detalle de un jugador (Priority: P3)

Al seleccionar una carta, se despliega un panel lateral con el perfil ampliado: liga y club, el juego completo de métricas de temporada, la altura, una gráfica de evolución de valor a 30 días, el valor de mercado y la oferta de tokens. El bloque de compra se muestra para completar la composición de la pantalla, pero no opera.

**Why this priority**: Profundiza la experiencia pero no la habilita: la grilla y los filtros ya son un producto demostrable sin el panel. Además es la parte que más depende de datos que todavía no existen (cotizaciones), por lo que conviene entregarla al final.

**Independent Test**: Seleccionar una carta cualquiera y verificar que el panel muestra las siete métricas exigidas con los valores que corresponden a ese jugador, que la gráfica y el bloque de compra están identificados como no operativos, y que el panel se cierra devolviendo el foco a la grilla.

**Acceptance Scenarios**:

1. **Given** la grilla cargada, **When** la persona selecciona una carta, **Then** se abre el panel lateral con los datos de ese jugador y la carta queda marcada como seleccionada.
2. **Given** el panel abierto, **When** la persona lo consulta, **Then** ve goles, asistencias, altura, tiros por partido, pases clave, regates y entradas del jugador.
3. **Given** el panel abierto, **When** la persona observa la gráfica de valor a 30 días y el bloque de compra, **Then** ambos están visiblemente identificados como una maqueta sin datos reales, y el bloque de compra no permite ejecutar ninguna operación.
4. **Given** el panel abierto, **When** la persona lo cierra, **Then** vuelve a la grilla con los filtros y la página que tenía antes de abrirlo.
5. **Given** un jugador sin estadísticas de temporada, **When** se abre su panel, **Then** las métricas ausentes se muestran como "sin dato" y el resto del panel se renderiza normalmente.
6. **Given** el panel abierto para un jugador, **When** la persona selecciona otra carta sin cerrarlo, **Then** el panel se actualiza con el nuevo jugador sin necesidad de cerrarlo primero.

---

### Edge Cases

- **Catálogo vacío**: si todavía no se corrió la ingesta, la home muestra un estado vacío que explica la situación en lugar de una grilla rota.
- **Proveedores externos caídos**: la vista se alimenta exclusivamente de los datos ya almacenados; una falla de un proveedor externo no afecta a esta pantalla.
- **Sesión vencida mientras se navega**: si la credencial expira entre dos peticiones, la persona es enviada al inicio de sesión sin perder la aplicación ni ver un error crudo.
- **Rangos invertidos**: un valor mínimo mayor que el máximo se rechaza como entrada inválida; no se interpreta silenciosamente al revés.
- **Página fuera de rango**: pedir una página más allá de la última devuelve un conjunto vacío con el total correcto, no un error.
- **Jugador con estadísticas parciales**: si tiene goles y asistencias pero le falta alguna métrica avanzada, la carta y el panel muestran lo que hay y marcan el resto como sin dato.
- **Nombres muy largos o con caracteres especiales**: la carta los muestra sin desbordar su contenedor.
- **Jugador sin rating de temporada**: no puede calcularse su OVR, así que se muestra sin dato y se clasifica como *Common*; sigue apareciendo en la grilla salvo que haya un filtro de rango de OVR activo.
- **Rating en el extremo superior**: un rating de 10 o más no puede producir un OVR de tres cifras; se recorta a 99.
- **Rating con más de dos decimales**: solo cuentan la parte entera y el primer decimal; el resto se descarta sin redondear, de modo que 7,49 y 7,41 dan ambos 74.

## Requirements *(mandatory)*

### Functional Requirements

**Listado y filtrado del catálogo**

- **FR-001**: El listado de jugadores MUST aceptar el filtro por liga con múltiples valores simultáneos, no solo uno.
- **FR-002**: El listado MUST aceptar el filtro por posición con múltiples valores simultáneos entre GK, DF, MF y FW.
- **FR-003**: El listado MUST aceptar el filtro por rango de valor de mercado, con extremo mínimo y máximo, ambos opcionales e independientes.
- **FR-004**: El listado MUST aceptar el filtro por rango de valoración general (OVR), con extremo mínimo y máximo, ambos opcionales e independientes.
- **FR-005**: El listado MUST aceptar el filtro por rareza con múltiples valores simultáneos.
- **FR-006**: El listado MUST aceptar una búsqueda por texto sobre el nombre del jugador, que coincida con fragmentos parciales y sea insensible a mayúsculas y a acentos.
- **FR-007**: Todos los filtros anteriores MUST poder combinarse entre sí; el resultado MUST satisfacer todas las condiciones activas a la vez.
- **FR-008**: El listado MUST seguir siendo paginado e informar el total de resultados que satisfacen los filtros activos, de modo que la interfaz pueda recorrerlos por completo.
- **FR-009**: Cada jugador del listado MUST incluir todos los datos que la carta necesita para renderizarse: identificador, nombre, posición, valoración general, nombre y escudo del club, nombre y código de nacionalidad, rareza, oferta de tokens, valor actual, variación porcentual de valor, y goles y asistencias de la temporada.
- **FR-010**: Los jugadores sin estadísticas de temporada registradas MUST aparecer igualmente en el listado, con sus métricas en cero, en lugar de ser excluidos.
- **FR-011**: El sistema MUST exponer la lista de ligas disponibles para poblar el panel de filtros, en lugar de que la interfaz la tenga fija.

**Detalle del jugador**

- **FR-012**: El detalle de un jugador MUST incluir, además de todo lo del listado, la altura, los tiros por partido, los pases clave, los regates, las entradas y el rating de temporada.
- **FR-013**: El detalle MUST incluir la liga y el club actual del jugador.
- **FR-014**: El detalle MUST informar la oferta de tokens del jugador como cantidad emitida sobre cantidad total.
- **FR-015**: Las métricas que el jugador no tenga registradas MUST distinguirse explícitamente de un valor cero real.

**Reglas transversales de los endpoints**

- **FR-016**: Todos los parámetros de entrada MUST validarse de forma estricta; una entrada inválida MUST rechazarse como petición incorrecta sin devolver resultados parciales.
- **FR-017**: Los endpoints que alimentan esta vista MUST exigir sesión de usuario válida, con el mismo criterio que el catálogo actual.
- **FR-018**: Cada endpoint nuevo o modificado MUST quedar documentado y visible en la documentación de API del proyecto, incluyendo sus parámetros, su esquema de respuesta y su requisito de autenticación.
- **FR-019**: Las peticiones de esta vista MUST quedar trazadas con el identificador de correlación y el registro estructurado ya vigentes en el proyecto.

**Interfaz de la home**

- **FR-020**: La home MUST reutilizar el componente de carta ya implementado en `front/src/components/player-card` sin reimplementarlo ni duplicarlo.
- **FR-021**: La home MUST presentar un panel de filtros lateral con secciones plegables para ligas, posiciones, rareza, rango de valor y rango de valoración, y una barra de búsqueda por nombre.
- **FR-022**: Al seleccionar una carta, la interfaz MUST desplegar un panel lateral de detalle, que MUST poder cerrarse devolviendo a la persona a la grilla con sus filtros y su página intactos.
- **FR-023**: La gráfica de valor a 30 días y el bloque de compra MUST mostrarse como maqueta no operativa y estar identificados como tales para la persona usuaria; la interfaz MUST NOT ofrecer ninguna acción de compra que parezca ejecutable.
- **FR-024**: La home MUST cubrir los estados de carga, vacío y error de forma explícita, sin pantallas en blanco ni errores crudos.
- **FR-025**: La home MUST ser una ruta protegida: sin sesión válida la persona MUST ser enviada al inicio de sesión.
- **FR-026**: La interfaz MUST tolerar la ausencia de fotos de jugadores y escudos de clubes, usando los marcadores de posición del componente de carta.

**Valoración general (OVR) y rareza**

- **FR-027**: El sistema MUST derivar la valoración general (OVR) de cada jugador a partir del rating de temporada, tomando su parte entera y su primer decimal como un número entero de dos cifras. Ejemplos: un rating de 7,42 da un OVR de 74; uno de 8,07 da 80; uno de 6,95 da 69. El segundo decimal y los siguientes se descartan, no se redondean.
- **FR-028**: El OVR MUST quedar acotado al rango 0–99; un rating de 10 o superior MUST presentarse como 99.
- **FR-029**: El sistema MUST clasificar la rareza de cada jugador a partir de su OVR, con estos cortes: OVR 85 o más es *Legendary*, entre 77 y 84 es *Epic*, entre 70 y 76 es *Rare*, y por debajo de 70 es *Common*.
- **FR-030**: Un jugador sin estadísticas de temporada registradas MUST presentarse con el OVR sin dato y la rareza *Common*, y MUST quedar fuera del resultado cuando haya un filtro de rango de OVR activo, porque no hay valoración que comparar.
- **FR-031**: El OVR y la rareza que se muestran en la carta, los que se muestran en el panel de detalle y los que usan los filtros MUST provenir del mismo criterio, de modo que un jugador nunca aparezca con una rareza en la grilla y otra en el detalle.

**Alcance de la compra**

- **FR-032**: Esta feature MUST NOT implementar la compra de tokens. No se expone ningún endpoint de compra ni se registra ningún movimiento sobre saldos, supply o portfolios.
- **FR-033**: El bloque de compra del panel de detalle MUST construirse como maqueta inerte: el selector de cantidad y el botón de compra se muestran para completar la composición de la pantalla, pero MUST estar deshabilitados e identificados como no operativos.

### Key Entities

- **Jugador**: la persona del catálogo. Aporta nombre, posición, nacionalidad, altura y su club actual. Es la unidad que se lista, se filtra y se detalla.
- **Equipo**: el club del jugador. Aporta el nombre y el escudo que la carta muestra, y es el vínculo con la liga.
- **Liga**: la competición a la que pertenece el equipo. Es uno de los ejes de filtrado y la etiqueta que el panel de detalle muestra.
- **Estadísticas de temporada del jugador**: el conjunto de métricas por temporada —goles, asistencias, tiros por partido, pases clave, regates, entradas y rating—. Alimenta las métricas de la carta y las del panel de detalle. Puede no existir para un jugador dado.
- **Valoración general (OVR)**: la cifra de dos dígitos que encabeza la carta y sobre la que operan el filtro de rango y la clasificación de rareza. No es un dato propio almacenado: se deriva del rating de temporada del jugador.
- **Nivel de rareza**: la categoría coleccionable del jugador —*Legendary*, *Epic*, *Rare* o *Common*—, derivada de su OVR mediante cortes fijos. Determina el tratamiento visual de la carta y es uno de los ejes de filtrado.
- **Token del jugador**: la representación coleccionable del jugador, de la que esta vista consume la oferta emitida sobre la total. En esta feature es dato de presentación, no operativo: no se emite, no se compra y no se transfiere.
- **Valor de mercado**: el valor actual del jugador y su evolución reciente. En esta feature el valor actual proviene del catálogo existente, mientras que la variación porcentual y la serie de 30 días son maqueta hasta que exista el motor de cotizaciones.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Una persona con sesión iniciada ve la primera pantalla de cartas con datos reales en menos de 2 segundos desde que abre la home.
- **SC-002**: El 100% de las combinaciones de filtros visibles en la pantalla —ligas, posiciones, rareza, rango de valor, rango de valoración y búsqueda por nombre— puede aplicarse simultáneamente y devuelve resultados que satisfacen todas las condiciones.
- **SC-003**: Una persona que busca un jugador concreto por nombre lo encuentra en menos de 15 segundos desde que abre la home, sin necesidad de recorrer páginas.
- **SC-004**: El 100% de los jugadores del catálogo es alcanzable paginando, incluidos los que no tienen estadísticas de temporada.
- **SC-005**: Ninguna combinación de filtros válida produce un error: los conjuntos sin resultados se presentan como estado vacío explicativo.
- **SC-006**: El 100% de las entradas inválidas —rangos invertidos, posiciones inexistentes, páginas negativas— es rechazado sin devolver datos.
- **SC-007**: Ninguna persona usuaria puede iniciar una compra desde esta pantalla, y el 100% de los elementos de compra y de la gráfica de 30 días está identificado como maqueta.
- **SC-008**: El 100% de los endpoints que alimentan la vista aparece documentado en la documentación de API, con parámetros, respuesta y requisito de autenticación.
- **SC-009**: La grilla se renderiza completa aun cuando ningún jugador ni club tenga imagen cargada.
- **SC-010**: El 100% de los jugadores con rating de temporada obtiene un OVR entre 0 y 99, y la rareza que se le muestra coincide con los cortes definidos en todos los casos verificados.
- **SC-011**: Un mismo jugador muestra el mismo OVR y la misma rareza en la grilla y en el panel de detalle en el 100% de los casos.

## Assumptions

- **Compra no operativa**: decisión confirmada por el autor. Esta feature no implementa la compra de tokens; el bloque de compra se construye como maqueta inerte (FR-032 y FR-033). Resuelve la contradicción del borrador original, cuyos criterios de aceptación exigían manejar compras concurrentes: ese criterio se retiró junto con el resto del alcance de compra.
- **OVR derivado, no persistido**: el OVR se calcula a partir del rating de temporada ya almacenado (FR-027), así que no requiere un campo nuevo. Como el cálculo es monótono respecto del rating, filtrar por rango de OVR y por rareza equivale a filtrar por rango de rating, lo que mantiene el filtrado y la paginación resolubles sobre los datos persistidos.
- **Rareza derivada del OVR**: la rareza no es un atributo propio del jugador sino una lectura de su OVR (FR-029). Cuando el rating de un jugador se actualice en una nueva ingesta, su rareza puede cambiar sin que exista ninguna migración de datos.
- **Cotizaciones inexistentes**: no existe todavía motor de cotizaciones ni histórico de precios. El valor actual mostrado proviene del valor base ya almacenado en el catálogo; la variación porcentual y la serie de 30 días son datos simulados, marcados como tales.
- **Saldo del usuario fuera de alcance**: la maqueta de referencia muestra un balance en créditos en el encabezado. No existe módulo de billetera, así que el encabezado se limita a la identidad de la persona y el cierre de sesión. El balance llega con la feature de billetera.
- **Imágenes ausentes**: no hay fotos de jugadores cargadas, y la feature se diseña para funcionar con los marcadores de posición del componente de carta; incorporar fotos reales no forma parte de este alcance. *(Corregido durante la implementación: los **escudos de clubes sí están cargados** —la ingesta de Football-Data.org ya trae su URL—, así que la carta los muestra de verdad. El supuesto original decía que tampoco existían.)*
- **Temporada vigente**: cuando un jugador tiene estadísticas de más de una temporada, la carta y el panel muestran las de la temporada más reciente.
- **Ligas del filtro**: las ligas ofrecidas son las que efectivamente existen en el catálogo, no una lista fija en la interfaz.
- **Sesión reutilizada**: el control de acceso, el almacenamiento de la sesión y la redirección al inicio de sesión son los que ya entregó la feature 05; esta feature los consume sin modificarlos.
- **Componente de carta congelado**: el componente de carta existente se toma como está. Si algún dato que necesita no puede obtenerse, se resuelve alimentándolo con un valor de relleno explícito, no modificando el componente.
- **Paginación por defecto**: se mantiene el tamaño de página vigente del catálogo, con el mismo tope máximo por petición.

## Fuera de Alcance

- Cálculo o recálculo de cotizaciones, y el proceso programado que las actualiza.
- Ejecución de compras o ventas de tokens, cualquier movimiento sobre el saldo en créditos, y el control de concurrencia asociado. El bloque de compra de la pantalla es maqueta inerte (FR-032, FR-033).
- Módulo de billetera y visualización del balance de la persona usuaria.
- Pasarelas de pago externas.
- Carga de fotografías de jugadores y escudos de clubes.
- Portfolio de la persona usuaria y cualquier vista distinta de la home.
- Las secciones del menú lateral de la maqueta distintas de la grilla de mercado.

## Cumplimiento de la Constitución

Esta feature se rige por la constitución del proyecto v2.2.0. Los puntos que la condicionan directamente:

- El trabajo de backend vive en un módulo de dominio con la estructura exacta que fija la sección 7, y las entidades permanecen en la capa de infraestructura.
- El trabajo de frontend respeta el layout plano de la sección 7: la vista en `pages/`, las piezas de interfaz en `components/` y todo el tráfico HTTP a través de `services/`.
- La documentación de API de cada endpoint es obligatoria (secciones 2 y 6).
- La validación estricta de entrada mediante DTOs es obligatoria (sección 4).
- El identificador de correlación y el registro estructurado son obligatorios (sección 4).
- El stack de frontend está cerrado: esta feature no incorpora ninguna librería nueva de cliente sin enmienda previa de la constitución.

## Decisiones diferidas a la planificación

Estas cuestiones no son de especificación sino de implementación, y se resuelven en `/speckit-plan`:

- Estrategia de invalidación de la caché del catálogo cuando cambien las valoraciones.
- Forma concreta de los parámetros de filtro de valores múltiples y de la paginación.
- Origen concreto de los datos simulados de la gráfica de 30 días.
