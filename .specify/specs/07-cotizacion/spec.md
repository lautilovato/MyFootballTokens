# Feature Specification: Sistema de Score y Cotización de Jugadores

**Feature Branch**: `07-cotizacion`

**Created**: 2026-10-03

**Status**: Draft

**Input**: User description: "Sistema de cotización de jugadores: a cada jugador se le calcula un score a partir de sus métricas y ese score se convierte en su precio. Recálculo periódico automático (y disparable a mano), historial consultable, al menos dos estrategias de valuación configurables con pesos por métrica y por posición, selección de la estrategia activa, traza de la estrategia y versión usadas en cada cotización, y una nueva métrica de «reputación mundial» del jugador para una estrategia que priorice la calidad general por sobre los números recientes. Los tokens del superusuario se entregarán después mediante sobres."

**Depende de**: `01-catalogo-jugadores` (el jugador, su posición y su equipo), `03-ingesta-stats` (las métricas de temporada que alimentan el score) y `05-auth` (la sesión de usuario que protege las consultas y la credencial administrativa que protege el recálculo, la configuración y la carga de reputación).

**Habilita (specs posteriores, fuera de alcance acá)**: apertura de sobres, venta de tokens y portfolio. Ver «Relación con las features posteriores».

## Contexto de negocio

Cada jugador tiene 100 tokens emitidos, todos en poder del superusuario, y **ninguno está a la venta de entrada**. Los usuarios se registran con una cantidad inicial de créditos y abren sobres (spec posterior); los tokens que salen en sobres son los **únicos que existen en el mercado**. Un token solo se puede vender una vez que un usuario lo obtuvo de un sobre.

**Esta feature valúa al jugador, no al token.** Para cada jugador calcula un **score** —un número que resume qué tan bueno es según sus métricas— y lo convierte en su **cotización**: el precio del jugador en créditos. Cómo se reparte ese precio entre sus tokens, y cómo salen los tokens del superusuario hacia los usuarios, se resuelve en las specs de sobres y de venta (ver «Relación con las features posteriores»).

**El score es el dato fundamental**: el precio es una consecuencia del score, no al revés. Por eso el score se calcula, se guarda, se puede consultar y se puede explicar métrica por métrica (ver «Cómo se calcula el score»).

**Unidad de la cotización**: precio del **jugador** expresado en **créditos**, en **números enteros**.

**No existe un precio inicial fijo.** El primer precio de un jugador es el que resulta de calcular su score por primera vez; el «momento cero» de un token —el instante en que sale de un sobre— se valúa con la cotización vigente de ese jugador en ese instante. Un jugador que todavía no fue calculado no tiene cotización, y el sistema lo informa así en lugar de inventarle un precio.

## Cómo se calcula el score

El score de un jugador es un número **mayor o igual a 0 y sin tope superior**. La escala de referencia va de 0 (nivel de los jugadores más bajos de la temporada) a 1 (nivel de los más altos), pero un jugador que supera a los más altos sigue sumando y su score pasa de 1. Se obtiene en cuatro pasos:

1. **Se toman las métricas** del jugador de la temporada vigente: goles, asistencias, tiros por partido, pases clave, regates, entradas, rating, ausencia y reputación mundial.
2. **Se normaliza cada métrica**, comparando al jugador contra el resto de los jugadores de la temporada (0 = entre los más bajos, 1 = entre los más altos). Quien está por debajo de los más bajos vale 0; quien está por encima de los más altos **vale más de 1**, sin recorte. La ausencia y la reputación están acotadas a [0,1]: la reputación ya viene en 0–100 y se divide por 100.
3. **Se multiplica cada métrica normalizada por su peso** en la estrategia (según la posición del jugador) y se suman los aportes. Las métricas que restan, como la ausencia, tienen peso negativo.
4. **Se aplica un piso en 0** (el score nunca es negativo) y ese es el score. No hay límite superior.

El precio sale del score: `precio = valorBase + score × factorEscala`, redondeado al entero más cercano y nunca menor al mínimo configurado.

**Ejemplo con la estrategia de performance** (delantero, valores ya normalizados):

| Métrica | Valor normalizado | Peso | Aporte |
|---|---|---|---|
| goles | 0,90 | 0,25 | +0,225 |
| asistencias | 0,60 | 0,15 | +0,090 |
| tiros | 0,80 | 0,10 | +0,080 |
| pases clave | 0,50 | 0,10 | +0,050 |
| regates | 0,70 | 0,10 | +0,070 |
| entradas | 0,20 | 0,10 | +0,020 |
| rating | 0,85 | 0,20 | +0,170 |
| ausencia | 0,12 | −0,10 | −0,012 |
| **Score** | | | **0,693** |

Con `valorBase` = 100 y `factorEscala` = 900: `precio = 100 + 0,693 × 900 = 723,7`, es decir **724 créditos**.

El mismo jugador con la estrategia de prestigio tendría otro score (y otro precio) porque cambian los pesos y entra la reputación; por eso cada cotización guarda qué estrategia y versión la produjo.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Calcular el score y la cotización de cada jugador (Priority: P1)

Un administrador dispara el recálculo. El sistema toma las estadísticas de temporada de cada jugador, calcula su **score** con la estrategia activa y lo convierte en su **cotización** (el precio del jugador en créditos). Cada jugador queda con un score y una cotización nuevos, y cada uno sabe qué estrategia y qué versión de ella lo produjo.

**Why this priority**: El score es el núcleo de la feature y todo lo demás depende de él. Entregada sola, con una única estrategia y sin job automático, ya transforma el valor placeholder de los jugadores en scores y precios derivados de su rendimiento real, y deja a las features posteriores un precio contra el cual operar.

**Independent Test**: Con jugadores que tengan estadísticas de temporada, disparar el recálculo manual y verificar que cada uno obtiene un score coherente con sus métricas, que el precio sigue al score, que quien tiene mejores números puntúa y cotiza más alto que quien tiene peores (a igual posición), y que cada cotización registra estrategia y versión. No requiere job automático, historial ni la estrategia de prestigio.

**Acceptance Scenarios**:

1. **Given** un catálogo con jugadores que tienen estadísticas de la temporada vigente y la estrategia de performance activa, **When** el administrador dispara el recálculo, **Then** cada uno de esos jugadores recibe un score y una cotización nuevos, y el resultado informa cuántos jugadores se cotizaron y cuántos se omitieron.
2. **Given** dos delanteros donde uno tiene más goles, asistencias y mejor rating que el otro, **When** se recalcula con la estrategia de performance, **Then** el de mejores números obtiene un score estrictamente mayor y, por lo tanto, un precio mayor.
3. **Given** un jugador que jugó muchos menos partidos que el resto de su liga y cuyas demás métricas son iguales a las de otro que sí jugó, **When** se recalcula, **Then** el que menos jugó obtiene un score menor (la ausencia penaliza).
4. **Given** un jugador que todavía no fue calculado (por ejemplo, sin estadísticas de la temporada vigente), **When** se consulta su cotización actual, **Then** la respuesta indica que no tiene cotización; no se devuelve ningún precio por defecto.
5. **Given** un recálculo que falla a mitad de camino, **When** termina con error, **Then** no queda ningún score ni cotización del lote persistido y los vigentes siguen siendo los anteriores.
6. **Given** una persona sin la credencial administrativa, **When** intenta disparar el recálculo, **Then** la petición es rechazada y no se calcula nada.
7. **Given** que no hay ninguna estrategia activa, **When** el administrador dispara el recálculo, **Then** recibe un error explicativo y no se genera ninguna cotización.
8. **Given** un jugador cuyas penalizaciones superan a sus aportes, **When** se recalcula, **Then** su score es 0 (nunca negativo) y su precio es el valor base.

---

### User Story 2 - Consultar el score, la cotización y su historial (Priority: P2)

Una persona con sesión iniciada consulta cuánto vale hoy un jugador, cuál es su score y **por qué** tiene ese score: para cada métrica ve el valor del jugador, su valor normalizado, el peso que se le aplicó y cuánto aportó al total. También puede ver cómo fueron cambiando el score y el precio en el tiempo. Cada punto del historial muestra el score, el precio, la fecha, cómo se originó (automático o manual) y con qué estrategia y versión se calculó.

**Why this priority**: Hace visible el trabajo de la P1 y es lo que consumen la home, el detalle del jugador y, más adelante, la venta y el portfolio. Que el score sea explicable es lo que permite auditar y defender un precio. Depende de que existan cotizaciones, por eso va después.

**Independent Test**: Recalcular varias veces, consultar un jugador y verificar que el desglose suma exactamente su score, que el historial devuelve todas las cotizaciones en orden cronológico, ninguna sobrescrita, cada una con su estrategia y versión, y que la última coincide con la cotización actual.

**Acceptance Scenarios**:

1. **Given** un jugador con cotizaciones, **When** una persona con sesión consulta su cotización actual, **Then** recibe el precio, el score, la fecha de cálculo, la estrategia y versión usadas y la variación de precio respecto de la cotización inmediatamente anterior.
2. **Given** esa misma consulta, **When** se revisa el desglose, **Then** para cada métrica figuran su valor, su valor normalizado, su peso y su aporte, y la suma de los aportes coincide con el score (antes de aplicar el piso en 0).
3. **Given** un jugador que fue recalculado tres veces, **When** se consulta su historial, **Then** recibe todas las cotizaciones ordenadas cronológicamente, cada una con su score, sin pérdidas ni duplicados.
4. **Given** un historial largo, **When** la persona acota por rango de fechas o por cantidad, **Then** recibe solo ese tramo, y el total informado permite paginar hasta el último resultado.
5. **Given** un identificador de jugador que no existe, **When** se consulta su cotización, **Then** recibe un error de «no encontrado», no un precio por defecto.
6. **Given** un parámetro inválido —fecha mal formada, rango invertido, cantidad fuera de límites—, **When** se consulta el historial, **Then** la petición es rechazada por inválida.
7. **Given** una persona sin sesión iniciada, **When** consulta una cotización, **Then** la petición es rechazada.
8. **Given** que acaba de terminar un recálculo, **When** se consulta la cotización actual de cualquier jugador, **Then** ya refleja el lote nuevo, sin esperar a que expire ninguna memoria intermedia.

---

### User Story 3 - Valuar por calidad general con la «reputación mundial» (Priority: P3)

Un administrador asigna a cada jugador una **reputación mundial** (qué tan grande es como figura, más allá de sus números de la temporada). Existe una segunda estrategia de valuación que prioriza esa reputación sobre el rendimiento reciente, de modo que una superestrella como Mbappé o Lamine Yamal cotiza por encima de un jugador menos renombrado aunque este último tenga mejores números.

**Why this priority**: Es la diferencia de fondo entre las dos estrategias y lo que justifica tener más de una, pero requiere que el motor de la P1 exista y que se pueda elegir estrategia (P4). Es una porción independiente de datos y reglas.

**Independent Test**: Cargar reputación a dos jugadores —uno de reputación alta y números modestos, otro de reputación baja y mejores números—, recalcular con la estrategia de prestigio y verificar que el de reputación alta cotiza más; recalcular con la de performance y verificar que el orden se invierte.

**Acceptance Scenarios**:

1. **Given** un jugador de reputación 95 y rating 7,1 y otro de reputación 40 y rating 7,6, **When** se recalcula con la estrategia de prestigio, **Then** el primero cotiza por encima del segundo.
2. **Given** esos mismos dos jugadores, **When** se recalcula con la estrategia de performance, **Then** el segundo cotiza por encima del primero.
3. **Given** un jugador al que nunca se le cargó reputación, **When** se recalcula con la estrategia de prestigio, **Then** se usa la reputación por defecto (baja y configurable) y la cotización deja constancia de que se aplicó ese valor por defecto.
4. **Given** una reputación fuera del rango 0–100 o no numérica, **When** el administrador intenta cargarla, **Then** la carga es rechazada por inválida.
5. **Given** una lista de varios jugadores con su reputación, **When** el administrador la carga de una sola vez, **Then** se actualizan los que existen, y el resultado informa cuáles se actualizaron y cuáles no se encontraron, sin que un error en uno impida los demás.
6. **Given** que se modificó la reputación de un jugador, **When** se consulta su cotización antes del próximo recálculo, **Then** la cotización no cambió (la reputación impacta en la próxima corrida, no retroactivamente).
7. **Given** una persona sin la credencial administrativa, **When** intenta cargar o modificar reputaciones, **Then** la petición es rechazada.

---

### User Story 4 - Configurar y seleccionar estrategias de valuación (Priority: P4)

Un administrador consulta las estrategias disponibles, ajusta los pesos de cada métrica (positivos o negativos), define pesos distintos por posición, cambia los parámetros de conversión a precio y elige cuál estrategia queda activa. Cada cambio de configuración crea una **versión nueva** de la estrategia; las cotizaciones ya calculadas siguen apuntando a la versión con la que se hicieron.

**Why this priority**: Es lo que vuelve «configurables» a las estrategias, pero el sistema entrega valor con las dos estrategias y sus pesos por defecto antes de poder editarlas.

**Independent Test**: Listar estrategias, crear una versión nueva con otros pesos, activarla, recalcular y verificar que las cotizaciones nuevas citan la versión nueva mientras las anteriores conservan la anterior intacta.

**Acceptance Scenarios**:

1. **Given** el sistema recién instalado, **When** el administrador lista las estrategias, **Then** ve al menos «performance» y «prestigio», con su versión vigente, sus pesos por métrica, sus pesos por posición, sus parámetros de conversión y cuál está activa.
2. **Given** una estrategia, **When** el administrador cambia el peso de una métrica y guarda, **Then** se crea una versión nueva con el número siguiente y la versión previa queda intacta y consultable.
3. **Given** cotizaciones calculadas con la versión 1 de una estrategia, **When** se crea la versión 2, **Then** esas cotizaciones siguen mostrando versión 1 y los pesos que realmente se usaron.
4. **Given** una configuración con una métrica inexistente, un peso fuera de límites, ningún peso positivo o un factor de escala no positivo, **When** el administrador intenta guardarla, **Then** es rechazada por inválida con el motivo, y no se crea ninguna versión.
5. **Given** dos estrategias, **When** el administrador activa una, **Then** la otra queda inactiva: nunca hay más de una activa.
6. **Given** que se activó otra estrategia, **When** pasa el tiempo sin recalcular, **Then** las cotizaciones vigentes no cambian; el cambio rige desde el próximo recálculo.
7. **Given** una estrategia con pesos distintos para la posición DF, **When** se recalcula, **Then** a los defensores se les aplican sus pesos específicos y a las posiciones sin pesos propios se les aplican los pesos generales de la estrategia.
8. **Given** una persona sin la credencial administrativa, **When** intenta crear una versión o activar una estrategia, **Then** la petición es rechazada.

---

### User Story 5 - Recálculo automático semanal (Priority: P5)

Sin que nadie intervenga, el sistema recalcula las cotizaciones de todo el catálogo una vez por semana con la estrategia activa en ese momento, y deja registro de cada corrida (cuándo corrió, con qué estrategia y versión, qué resultado tuvo).

**Why this priority**: Es la automatización de lo que ya se puede hacer a mano. Las anteriores prioridades demuestran el valor del cálculo; esta lo vuelve desatendido.

**Independent Test**: Configurar la frecuencia de la corrida a un intervalo corto en un entorno de prueba, esperar a que dispare sin intervención y verificar que se generó un lote de cotizaciones marcado como automático y un registro de corrida.

**Acceptance Scenarios**:

1. **Given** el sistema en funcionamiento, **When** llega el momento programado de la semana, **Then** se ejecuta un recálculo completo con la estrategia activa y las cotizaciones quedan marcadas como automáticas.
2. **Given** un recálculo en curso (manual o automático), **When** se dispara otro, **Then** el segundo es rechazado o ignorado sin duplicar cotizaciones, y queda constancia.
3. **Given** que el sistema estuvo apagado en el momento programado, **When** vuelve a levantar, **Then** no ejecuta corridas duplicadas por el período perdido (a lo sumo se ejecuta la siguiente programada).
4. **Given** una corrida automática que falla, **When** termina, **Then** queda registrada como fallida con el motivo, las cotizaciones vigentes no cambian y la siguiente semana se intenta de nuevo.
5. **Given** que cada corrida lleva un identificador de trazabilidad, **When** se revisan los registros, **Then** todo lo que hizo una corrida —incluido su error, si lo hubo— se puede seguir por ese identificador.

---

### Edge Cases

- **Sin variación en una métrica**: si todos los jugadores tienen el mismo valor en una métrica, esa métrica aporta 0 al score de todos (no se divide por cero ni se distorsiona el resto).
- **Valores extremos**: un jugador con una marca muy superior al resto no aplasta al resto de la escala; la normalización usa un rango de referencia robusto (percentiles 5 y 95) para que un valor extremo no aplaste la escala del resto. El jugador que lo supera **no se recorta**: su score y su precio suben sin límite, y por eso dos jugadores por encima del percentil 95 no empatan.
- **Score fuera de rango**: si las penalizaciones superan a los aportes el score es 0 (piso); no hay tope superior, y un score mayor a 1 es válido. El desglose conserva la suma original para poder auditarlo. El precio nunca baja del mínimo configurado y no tiene máximo.
- **Muestras chicas**: al inicio de la temporada, un jugador con pocos partidos y una racha excepcional en una métrica por partido puede alcanzar un precio muy alto. Es consecuencia de no tener tope; el administrador puede moderarlo bajando el peso de esa métrica en una versión nueva de la estrategia.
- **Datos incompletos**: un jugador sin dato de partidos jugados no se penaliza por ausencia y sus métricas por partido valen 0, y la cotización lo deja registrado.
- **Jugador nuevo en el catálogo**: sin estadísticas, no tiene cotización hasta que tenga datos y corra un recálculo; no se le asigna ningún precio provisorio.
- **Antes del primer recálculo**: ningún jugador tiene cotización. El primer recálculo es lo que pone en marcha el sistema de precios.
- **Tokens en circulación**: la cotización es del jugador y no depende de cuántos de sus tokens salieron en sobres.
- **Redondeo**: el precio es un entero; el score conserva cuatro decimales y es el que se usa para ordenar y comparar jugadores.
- **Jugador sin posición definida**: se le aplican los pesos generales de la estrategia.
- **Cambio de temporada**: el score se calcula siempre contra la temporada vigente (la más reciente con datos); al cambiar de temporada la normalización se rehace con el nuevo universo.
- **Proveedor externo caído**: el recálculo trabaja con los datos ya guardados localmente; una falla del proveedor de estadísticas no impide recalcular ni consultar.
- **Corrida concurrente**: nunca hay dos corridas escribiendo cotizaciones a la vez.
- **Estrategia desactivada con cotizaciones existentes**: el historial conserva sus referencias; desactivar no borra nada.

## Requirements *(mandatory)*

### Functional Requirements

**Cálculo**

- **FR-001**: El sistema MUST calcular, para cada jugador con estadísticas de la temporada vigente, un **score** como suma ponderada de métricas normalizadas, según los pesos de la estrategia aplicada, con un piso en 0, **sin tope superior** y con cuatro decimales.
- **FR-002**: El sistema MUST derivar la **cotización del jugador** exclusivamente de su score con la fórmula `precio = valorBase + score × factorEscala`, redondeada al entero más cercano y nunca por debajo de un precio mínimo configurable. La cotización se expresa en créditos enteros.
- **FR-002a**: El score MUST ser un dato de primera clase: se guarda con cada cotización, se expone en las consultas y se usa para comparar jugadores entre sí. Dos jugadores con el mismo score, la misma estrategia y la misma versión MUST recibir el mismo precio.
- **FR-002b**: Para cada score el sistema MUST conservar y poder exponer su **desglose por métrica**: valor del jugador, valor normalizado, peso aplicado y aporte (peso × valor normalizado). La suma de los aportes MUST coincidir con el score antes de aplicar el piso en 0.
- **FR-003**: El catálogo de métricas MUST incluir como mínimo: goles, asistencias, tiros por partido, pases clave, regates, entradas, rating de temporada, ausencia (cuánto jugó el jugador respecto de lo que se jugó en su liga) y reputación mundial.
- **FR-004**: Cada métrica MUST poder tener peso positivo (suma) o negativo (resta). La ausencia aporta con peso negativo por defecto.
- **FR-005**: Las métricas de rendimiento MUST normalizarse contra el universo de jugadores de la temporada vigente tomando como referencia un rango robusto frente a valores extremos (0 = nivel bajo del universo, 1 = nivel alto), con piso en 0 y **sin recorte superior**: un valor que supera la referencia alta normaliza a más de 1. La reputación (ya expresada en 0–100) se lleva a [0,1] dividiéndola por 100, y la ausencia es una fracción en [0,1].
- **FR-006**: Cada estrategia MUST admitir pesos generales y pesos específicos por posición (arquero, defensor, mediocampista, delantero). Un jugador usa los pesos de su posición si existen y los generales en caso contrario.
- **FR-007**: Si los pesos positivos de una configuración no suman 1, el sistema MUST dividir el score por la suma de los pesos positivos, de modo que el parámetro `factorEscala` conserve el mismo significado entre estrategias y versiones.
- **FR-008**: El cálculo MUST trabajar sobre los datos ya almacenados localmente y MUST NOT depender de que un proveedor externo esté disponible.

**Estrategias**

- **FR-009**: El sistema MUST proveer, desde su instalación, dos estrategias:
  - **Performance**: `score = 0.25·goles + 0.15·asistencias + 0.10·tiros + 0.10·pases clave + 0.10·regates + 0.10·entradas + 0.20·rating − 0.10·ausencia`, con perfiles por posición (el delantero prioriza goles y tiros; el defensor, entradas; el arquero, rating).
  - **Prestigio** (calidad general): `score = 0.60·reputación + 0.15·rating + 0.08·goles + 0.05·asistencias + 0.04·pases clave + 0.04·regates + 0.04·entradas − 0.05·ausencia`, con perfiles por posición equivalentes.
- **FR-010**: Cada estrategia MUST tener una configuración editable: peso por métrica (general y por posición), `valorBase`, `factorEscala` y precio mínimo. Los valores por defecto son `valorBase` = 100 créditos (el precio de un jugador con score 0), `factorEscala` = 900 (un jugador en el nivel alto de referencia vale unos 1.000 créditos; no es un máximo) y mínimo = 10.
- **FR-011**: Toda modificación de la configuración de una estrategia MUST crear una **versión nueva** inmutable. Las versiones anteriores MUST permanecer consultables y sin cambios.
- **FR-012**: El sistema MUST validar toda configuración antes de guardarla: solo métricas conocidas, pesos dentro de límites, al menos un peso positivo, `factorEscala` positivo y mínimo positivo. Una configuración inválida MUST rechazarse sin crear versión.
- **FR-013**: Exactamente **una** estrategia MUST estar activa en todo momento. Activar una MUST desactivar la anterior de forma atómica.
- **FR-014**: Cambiar la estrategia activa o su configuración MUST NOT alterar las cotizaciones ya calculadas; solo rige desde el próximo recálculo.
- **FR-015**: El administrador MUST poder listar las estrategias con su versión vigente, su configuración completa y su estado de activación.

**Cotización e historial**

- **FR-016**: Cada cotización MUST registrar: jugador, precio, score, fecha de cálculo, origen (automática o manual), la estrategia y la versión usadas, y una foto de los valores de cada métrica (crudos y normalizados) y de los pesos aplicados, suficiente para reproducir el precio.
- **FR-017**: Las cotizaciones MUST ser inmutables y acumulativas: un recálculo agrega registros, nunca modifica ni borra los existentes.
- **FR-018**: Un jugador que todavía no fue calculado MUST informarse como «sin cotización». El sistema MUST NOT asignar ningún precio inicial fijo ni por defecto: el primer precio de un jugador es el de su primer cálculo.
- **FR-019**: El sistema MUST permitir consultar la **cotización actual** de un jugador (la más reciente) con su score, su desglose y la variación de precio respecto de la inmediatamente anterior.
- **FR-020**: El sistema MUST permitir consultar el **historial** de un jugador (score y precio de cada cotización) ordenado cronológicamente, con filtro por rango de fechas y paginación acotada.
- **FR-021**: La cotización actual MUST reflejar un lote nuevo de forma inmediata al terminar el recálculo; ninguna memoria intermedia puede servir un precio anterior después de ese momento.
- **FR-022**: Un jugador sin estadísticas de la temporada vigente MUST omitirse del recálculo y contarse como omitido en el resultado. Si ya tenía cotizaciones, conserva la última; si no, queda sin cotización.

**Reputación mundial**

- **FR-023**: El jugador MUST tener un atributo «reputación mundial» numérico en escala 0–100, que puede estar sin cargar.
- **FR-024**: El administrador MUST poder establecer la reputación de un jugador individual y de muchos jugadores en una sola operación; esta última MUST informar qué jugadores se actualizaron y cuáles no se encontraron, sin que un fallo individual aborte el resto.
- **FR-025**: Un jugador sin reputación cargada MUST valuarse con una reputación por defecto baja y configurable (20 sobre 100), y la cotización MUST dejar constancia de que se usó ese valor por defecto.
- **FR-026**: Los cambios de reputación MUST impactar recién en el próximo recálculo.

**Corridas y automatización**

- **FR-027**: El sistema MUST recalcular automáticamente todo el catálogo con la estrategia activa con frecuencia semanal; el día y la hora MUST ser configurables sin modificar el código.
- **FR-028**: El administrador MUST poder disparar el mismo recálculo manualmente, opcionalmente indicando una estrategia puntual distinta de la activa; en ese caso la corrida queda marcada como manual y registra la estrategia usada.
- **FR-029**: Cada corrida MUST registrar su disparador (automático o manual), la estrategia y versión, el momento de inicio y fin, el resultado (cotizados, omitidos) y, si falló, el motivo.
- **FR-030**: Una corrida MUST ser atómica: o se persisten todas sus cotizaciones o ninguna.
- **FR-031**: MUST NOT haber dos corridas ejecutándose a la vez; un disparo que llega durante una corrida en curso se rechaza con un mensaje claro.

**Acceso, seguridad y observabilidad**

- **FR-032**: El recálculo manual, la creación de versiones de estrategia, la activación de estrategia y la carga de reputación MUST exigir la credencial administrativa. Una sesión de usuario común MUST NOT bastar.
- **FR-033**: La consulta de cotización actual, historial y estrategias MUST exigir una sesión de usuario válida.
- **FR-034**: Todas las entradas MUST validarse: identificadores, fechas, rangos, pesos y reputaciones inválidos se rechazan sin efectos parciales.
- **FR-035**: Cada corrida y cada operación administrativa MUST emitir registros estructurados con el identificador de trazabilidad de la solicitud o de la corrida.
- **FR-036**: Todos los endpoints nuevos MUST estar documentados en el contrato de la API.

### Relación con las features posteriores

Esta feature **no** implementa sobres, compra/venta ni portfolio, pero fija el contrato de precio que ellas consumirán:

- La cotización vigente de un jugador es el **único precio** de referencia de ese jugador. Las features de sobres, venta y portfolio MUST leerlo de acá y MUST NOT calcularlo por su cuenta.
- Los **tokens** salen del superusuario hacia los usuarios mediante sobres (spec posterior). Esta feature no emite, entrega ni mueve tokens.
- No hay precio inicial fijo: el «momento cero» de un token (cuando sale de un sobre) se valúa con la cotización vigente del jugador en ese instante. Un jugador sin cotización no puede entregarse en sobres hasta tenerla (regla a confirmar en la spec de sobres).
- El **mercado** está formado únicamente por los tokens que salieron en sobres; los que siguen en poder del superusuario no están a la venta. Esta feature no cambia eso ni depende de ello.
- **Pendiente para la spec de venta**: cómo se traduce la cotización del jugador al precio de un token individual. La propuesta de partida es que cada token valga 1/100 de la cotización (la suma de los 100 tokens vale lo que el jugador), pero esa regla —incluido el redondeo, dado que los créditos son enteros— se define allá.
- Los 100 tokens por jugador no cambian con la cotización: la cotización mueve el precio, no la oferta.

### Key Entities

- **Cotización**: precio de un jugador, y el score del que se deriva, en un momento dado. Atributos: jugador, score (≥ 0, sin tope superior), precio (créditos enteros), fecha, origen (automática / manual), referencia a la estrategia y versión usadas, desglose por métrica (valor, valor normalizado, peso, aporte), corrida a la que pertenece. Inmutable. Toda cotización tiene score y estrategia: no existen cotizaciones provisorias.
- **Estrategia de valuación**: criterio de ponderación identificado por un nombre estable (por ejemplo «performance», «prestigio») y una versión. Atributos: pesos por métrica (generales y por posición), `valorBase`, `factorEscala`, precio mínimo, indicador de activa. Cada versión es inmutable.
- **Corrida de recálculo**: ejecución de un lote. Atributos: disparador, estrategia y versión, inicio, fin, estado (en curso / completada / fallida), cantidad de cotizados y omitidos, motivo de falla, identificador de trazabilidad.
- **Reputación mundial** *(atributo del Jugador)*: valor 0–100 que expresa la calidad y el renombre del jugador, independiente de sus números de la temporada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un recálculo completo de un catálogo de hasta 5.000 jugadores con estadísticas termina en menos de 2 minutos.
- **SC-002**: El 100 % de las cotizaciones guardadas permite responder qué estrategia y qué versión produjeron su precio y reproducir su score y su precio a partir de los datos registrados en ella, con una diferencia de score menor a 0,0001.
- **SC-002a**: En el 100 % de las consultas, la suma de los aportes del desglose coincide con el score informado.
- **SC-003**: La consulta de la cotización actual de un jugador responde en menos de 1 segundo en el 95 % de los casos.
- **SC-004**: En el conjunto de verificación de referencia, con la estrategia de prestigio, un jugador de reputación ≥ 90 cotiza por encima de uno de reputación ≤ 40 con mejores números en el 100 % de los casos; con la estrategia de performance el orden sigue a los números en el 100 % de los casos.
- **SC-005**: Cada semana el sistema genera, sin intervención humana, un lote completo de cotizaciones en el 100 % de las semanas en que estuvo en funcionamiento en el momento programado.
- **SC-006**: Tras N recálculos, el historial de un jugador cotizado en todas las corridas contiene exactamente N registros; ninguno se pierde ni se modifica.
- **SC-007**: Después de crear una versión nueva de una estrategia o de activar otra, el 100 % de las cotizaciones previas permanece idéntico.
- **SC-008**: Una corrida que falla deja 0 cotizaciones parciales persistidas.
- **SC-009**: Un administrador completa «ajustar un peso, activar la estrategia y recalcular» en menos de 5 minutos y sin tocar el código ni reiniciar el sistema.
- **SC-010**: Las operaciones administrativas y las consultas son rechazadas el 100 % de las veces cuando falta la credencial correspondiente.

## Assumptions

- **Precio por jugador, no por token**: la cotización es el precio del jugador en créditos enteros. No se almacena un precio por token; su derivación pertenece a la spec de venta.
- **Reputación curada a mano**: no existe una fuente externa autorizada de «reputación mundial» en el stack del proyecto; se carga manualmente por el administrador, individualmente o en lote, y la lista inicial de figuras se prepara como dato de la feature. La carga masiva identifica a los jugadores por su identificador en el catálogo.
- **Reputación por defecto**: 20 sobre 100 para jugadores sin carga, configurable. Se elige baja para que el prestigio sea un atributo que el administrador otorga, no uno que se presume.
- **Datos disponibles**: hoy las estadísticas de temporada incluyen goles, asistencias, tiros por partido, pases clave, regates, entradas, rating y partidos jugados; no incluyen minutos, faltas ni tarjetas. La «ausencia» se mide por partidos jugados respecto del máximo de la liga, y las métricas negativas de disciplina (tarjetas, faltas) quedan fuera hasta que se ingieran esos datos.
- **Temporada vigente**: la más reciente que tenga estadísticas cargadas, igual que en el resto del catálogo.
- **Valores por defecto de conversión**: `valorBase` = 100 créditos (lo que vale un jugador con score 0), `factorEscala` = 900 (un jugador en el nivel alto de referencia vale unos 1.000 créditos) y mínimo de 10. Son ajustables por el administrador. **El precio no tiene máximo**: los jugadores excepcionales superan los 1.000 créditos, por lo que los filtros de valor de la home (hoy hasta 10.000) deberán revisarse si el rango se amplía.
- **Desvío respecto del enunciado, ya regularizado**: el enunciado (3.3) dice que cada token vale 1 crédito en el momento cero y que los 100 tokens están en el mercado desde el inicio. Este diseño lo reemplaza —el valor inicial lo da el cálculo y solo circulan los tokens obtenidos en sobres— y la constitución v3.0.0 (§5, 2026-10-03) lo recoge, por lo que no requiere excepción en el plan.
- **Escala del score**: cuatro decimales, piso en 0 y sin tope superior. La fórmula del enunciado (`valor = valorBase + score × factorEscala`) se mantiene; lo que cambia respecto del ejemplo del enunciado es que las métricas normalizadas no se recortan a 1, decisión del equipo (2026-10-13) para que los mejores jugadores no se amontonen en un precio máximo.
- **Una sola estrategia activa**: no se cotiza cada jugador con una estrategia distinta ni se mezclan estrategias en un mismo lote.
- **Frecuencia**: semanal por defecto (lunes de madrugada, hora del servidor), configurable.
- **Fuera de alcance**: sobres, compra y venta, portfolio, saldo de créditos, superusuario y emisión de tokens, y cualquier rediseño de la home o del detalle del jugador. **Actualización 2026-10-13**: la home y el detalle del jugador dejaron de mostrar la maqueta de variación y serie de precio y muestran las cotizaciones reales (variación entre las dos últimas y hasta 30 cotizaciones, sin inventar nada para quien tiene menos de dos). La emisión de tokens (`supply`) y el bloque de compra siguen siendo maqueta.
- **Idioma de contrato**: las métricas se nombran en el contrato de la API con los identificadores en inglés ya usados por las estadísticas (`goals`, `assists`, `shots`, `keyPasses`, `dribbles`, `tackles`, `rating`), más `absence` y `worldReputation`.
- **Contrato fijado por el enunciado**: el disparo manual del recálculo es `POST /quotes/recalculate`; el resto de las rutas se definen en el plan.
