# Plan integral de variables exógenas para el Observatorio Económico de Bolivia

Documento de planificación preparado el 4 de octubre de 2026 a partir del árbol de trabajo local y de investigación de fuentes primarias. Su propósito es convertir la sección actual de precios internacionales en un sistema de vigilancia de factores externos y de sus efectos sobre toda la economía boliviana. Las propuestas de plazo, dotación, umbrales y rezagos son hipótesis de trabajo; las series candidatas todavía requieren validación individual.

La decisión recomendada es ampliar en tres dimensiones a la vez: actividades económicas, tipos de señal y canales de transmisión. Cada sector debe poder responder qué cambió fuera de su control, a qué está expuesto, cuándo podría sentirlo y qué resultado local permite comprobar esa hipótesis. La primera entrega debe combinar precios con cantidades, financiamiento, clima, logística y regulación; sumar cotizaciones similares no resolvería la falta de diversidad.

El trabajo se dividió entre tres agentes paralelos con perspectivas de macroeconomía y finanzas, producción y recursos naturales, y servicios y territorio. La coordinación revisó el código y diseñó la integración, la priorización, la cobertura sectorial y los criterios de aceptación. Estas perspectivas no equivalen a certificaciones profesionales ni a validación institucional.

## Documentos que forman el plan

| Documento | Uso |
| --- | --- |
| [Anexo de macroeconomía y finanzas](ANEXO_MACRO_FINANZAS.md) | Variables y casos de uso monetarios, fiscales, financieros, externos y de hogares |
| [Anexo de producción y recursos](ANEXO_PRODUCCION_RECURSOS.md) | Cadenas agropecuarias, minería, energía, industria, construcción y clima |
| [Anexo de servicios y territorio](ANEXO_SERVICIOS_TERRITORIO.md) | Comercio, logística, turismo, tecnología, servicios sociales y territorio |
| [Arquitectura e implementación](ARQUITECTURA_IMPLEMENTACION.md) | Contratos de datos, integración con el código actual, pruebas y backlog |
| [Catálogo consolidado](catalogo_consolidado.csv) | Familias candidatas filtrables por sector, prioridad, rol y fuente |
| [Inventario actual](inventario_actual.json) | Conteo reproducible de las semillas locales revisadas |
| [Validación del catálogo](validacion_catalogo.json) | Conteos, integridad de campos, identificadores y prioridades |

Los CSV son un catálogo de investigación. Una fila puede necesitar varias series por país, producto, ruta o territorio; también puede corresponder a una capacidad parcialmente existente. Su número no representa nuevas series implementadas, conectores probados ni disponibilidad de todos los datos.

El catálogo consolidado contiene **287 familias candidatas**: 88 de macroeconomía y finanzas, 104 de producción y recursos, y 95 de servicios y territorio. La priorización inicial suma 136 P0, 118 P1 y 33 P2. Hay 287 identificadores únicos y 80 URLs distintas de referencia; una familia normativa externa conserva la fuente pendiente. Tener identificadores distintos no descarta solapamientos económicos: la primera fase debe fusionar, reutilizar o ampliar conceptos cuando corresponda. Las URLs son referencias de investigación, no 80 conectores validados.

Cada fila incluye definición, unidad, frecuencia, geografía, canal, rezago hipotético, fuente, prioridad, rol y disponibilidad. La consolidación añade mesa de origen, estado de integración pendiente y `rol_filtro`. Este último armoniza las categorías explícitas de macro y servicios mediante correspondencia exacta. Las 104 familias productivas mantienen su rol descriptivo y quedan `POR_DEFINIR_SEGUN_OBJETIVO` en el filtro, porque varias combinan referencia externa, exposición y resultado local. La fase 1 debe separar esas variantes y fijar `target_scope`; no se deduce exogeneidad buscando la palabra “externo”. El [script de consolidación](consolidar_catalogo.ps1) comprueba estructura, campos, identificadores y prioridades; la validación no certifica el contenido económico ni el acceso a fuentes.

## Punto de partida y brechas verificadas

El inventario se limita a archivos del repositorio `EcomicDataCenter` y componentes de `observatorio-dashboard`. No se consultó la base productiva, no se ejecutaron recolectores y no se verificó que todas las semillas estén desplegadas. Existen cambios previos del usuario en ambos repositorios; este trabajo agrega documentación en una carpeta nueva.

| Activo local | Evidencia | Consecuencia para el plan |
| --- | --- | --- |
| Semilla mensual `exogenous-prices.json` | 112 series, 26.181 observaciones; extremos generales 2000-01 y 2026-09 | Hay una base aprovechable; los extremos no significan historia completa por serie |
| Semilla anual `exogenous-customs.json` | 35 series, 490 observaciones; extremos 2010 y 2025 | Valores unitarios aduaneros útiles como resultados y referencias, sensibles a mezcla y calidad |
| Monedas en `exogenous-currencies` | 23 series diarias en archivos separados | Reutilizar la información; el tablero exógeno las excluye deliberadamente |
| Siete grupos actuales | Energía, minerales, agricultura, ganadería, industria, construcción, fletes | Representación estrecha de servicios, financiamiento, demanda, riesgos y territorio |
| Tipos actuales del tablero | `PRICE`, `INDEX`; mensual y anual | No representan adecuadamente tasas, stocks, cantidades, eventos, datos espaciales ni trimestrales |
| Límites del esquema de precios | Hasta 200 series y 420 puntos por serie | El catálogo amplio no cabe como ampliación indiscriminada de la misma semilla |
| Cinco ámbitos actuales | Mundial, regional, PPI de EE. UU., mercado boliviano, aduana boliviana | Mezclan geografía, metodología y naturaleza de la referencia; se deben separar esas dimensiones |
| Procedencia y revisiones | Artefactos con hash, afirmaciones y vista de última observación publicada | Base valiosa que debe extenderse con disponibilidad temporal para análisis históricos |
| Flete implícito | Derivado de `read_models.trade_flow` en el dashboard | Reutilizar la derivación con linaje; no duplicar observaciones base |

Distribución de las 112 series mensuales: energía 9; minerales 9; agricultura 41; ganadería 18; industria 10; construcción 8; fletes 17. Agricultura y ganadería reúnen 59 de 112. Este conteo identifica concentración del catálogo; no mide importancia económica ni calidad de las series.

Riesgos detectados por lectura de código que deben entrar en la fase inicial:

1. La vista `0086-read-the-exogenous-prices` conserva la última versión recibida para la lectura actual. Una simulación histórica necesita escoger únicamente la información disponible en su fecha de corte.
2. `latestMonth` informa el mes máximo entre series; no garantiza que todas estén actualizadas. La vigencia debe mostrarse por serie y fuente.
3. `summarize` compara con el punto anterior disponible. Con huecos, ese punto puede no ser el mes anterior. La etiqueta necesita expresar el intervalo real.
4. El índice base 100 actual usa el primer valor no cero de cada serie visible. Para comparar varias series se requiere una fecha base común y mostrar las exclusiones.
5. El catálogo asigna un mismo mercado a varios metales y contiene afirmaciones generales sobre indexación contractual del gas. Deben revisarse con la metodología de cada referencia y la vigencia de los contratos; el código no es prueba de la afirmación económica.
6. El lector de monedas contiene una combinación de CNY y CNH para cubrir huecos. Cualquier reutilización analítica debe conservar ambas series originales y registrar explícitamente los puntos sustituidos y el método.
7. Se encontraron fechas cambiarias de 2026-10-05, posteriores al corte de esta sesión, 2026-10-04. Revisar fecha de vigencia, calendario de publicación, zona horaria y reloj del recolector antes de usar esos puntos. Esto es una alerta de temporalidad, no una conclusión de que los valores sean falsos.

La evidencia reproducible está en `inventariar_estado_actual.mjs`; ejecutar desde esta carpeta `node inventariar_estado_actual.mjs 2026-10-04`. Una nueva ejecución refleja el árbol de trabajo de ese momento.

El total inventariado es de **170 series y 46.411 puntos** en 25 archivos, incluyendo las monedas. Los 23 puntos con fecha diaria posterior al corte se registran por archivo para su revisión. El inventario conserva hash SHA-256 de cada semilla. Los fletes derivados al consultar y los indicadores de otros módulos no están contados en este total.

Referencias locales principales: [contrato actual de precios](../../../scripts/exogenous/exogenous-spec.ts), [esquema y límites](../../../src/database/seeds/schemas/exogenous-prices.schema.ts), [recolector](../../../scripts/exogenous/collect-exogenous-prices.ts) y [vista actual](../../../src/database/migration-sql/0086-read-the-exogenous-prices.view.ts). Las observaciones sobre dashboard corresponden al árbol de trabajo hermano `observatorio-dashboard`, no a una instancia desplegada.

## Qué se considerará una variable exógena

La exogeneidad depende de la pregunta, del horizonte y del modelo. Una tasa bancaria local puede ser un costo fuera del control de una tienda, pero responder a la inflación y a la liquidez del país en un modelo macroeconómico. Una exportación boliviana es normalmente un resultado a explicar, no un shock externo.

| Papel | Definición operativa | Ejemplos | Uso permitido |
| --- | --- | --- | --- |
| Impulsor externo | Se origina fuera de la unidad analizada y tiene un mecanismo plausible de transmisión | Demanda china, tasa internacional, precipitación, enfermedad en un proveedor extranjero | Monitoreo y predicción; causalidad requiere supuestos adicionales |
| Condicionante local | Restricción o política local relevante para el sector; puede ser simultánea con el resultado | Oferta de combustible, tasa crediticia local, arancel vigente, bloqueo | Escenarios y explicación condicionada; declarar posible endogeneidad |
| Exposición | Característica que determina sensibilidad al shock | Dependencia importada, cuota exportadora, deuda en dólares, riego, concentración de clientes | Interactuar con el impulsor; preferir pesos previos al shock |
| Resultado | Consecuencia económica que se desea anticipar o explicar | Producción, ventas reales, IPC, empleo, morosidad, exportación | Variable objetivo y validación de hipótesis |
| Proxy | Medición indirecta de una magnitud no disponible | Luz nocturna, avisos de empleo, precio ofertado en línea | Señal complementaria con limitaciones visibles |

La relación mínima será `factor → exposición → mecanismo → resultado → decisión`. Cada vínculo debe registrar unidad afectada, signo esperado, rango de rezagos, evidencia, hipótesis rivales y responsable de revisión. Los rezagos de los anexos son propuestas de investigación, no elasticidades estimadas.

El carácter de proxy describe cómo se mide una variable y puede coexistir con cualquiera de los otros papeles; tampoco “pronosticado” o “espacial” reemplazan el tipo de medida. El contrato técnico mantiene esas dimensiones separadas.

Ejemplo: mayor precio internacional de diésel → transportista dependiente de combustible importado → mayor costo de abastecimiento o presión presupuestaria → tarifa, disponibilidad de viajes o margen. El traslado puede amortiguarse por políticas, inventarios o contratos. No se aplica automáticamente el mismo porcentaje al precio del pasaje.

## Cobertura de todas las actividades económicas

Para auditar cobertura, se propone conservar la correspondencia con CAEB 2011 y CIIU Rev. 4 presente en estadísticas bolivianas, y añadir una tabla versionada hacia CIIU Rev. 5. El INE describe el uso de CAEB 2011 dentro del marco CIIU Rev. 4; Naciones Unidas ya registra Rev. 5 como operacional. No se deben trasladar letras entre revisiones sin concordancia. Fuentes: [INE sobre clasificación de MYPES](https://www.ine.gob.bo/index.php/estadisticas-economicas/industria-manufacturera-y-comercio/mypes-introduccion/), [UNSD Rev. 4](https://unstats.un.org/unsd/classifications/Family/Detail/27), [UNSD Rev. 5](https://unstats.un.org/unsd/classifications/Family/Detail/2095).

La tabla siguiente es una matriz editorial de cobertura usando secciones de Rev. 4, no una concordancia oficial ni una declaración de disponibilidad estadística. En la implementación se desagregará por división y clase relevante para Bolivia.

| Sección | Perspectiva sectorial | Factores que deben cubrirse | Resultados para contrastar |
| --- | --- | --- | --- |
| A Agropecuaria, silvicultura y pesca | Agrónomo económico, ganadero, forestal, acuícola | Lluvia, temperatura, sanidad, semillas, fertilizantes, alimento animal, agua, demanda y precios por cadena | Rendimientos, mortalidad, cosecha, faena, desembarques, margen por hectárea |
| B Minas y canteras | Metales básicos, preciosos, industriales y salares | Precios por calidad, tratamiento/refinación, demanda, energía, reactivos, agua, permisos | Producción pagable, exportación, regalías, costos y recuperación |
| C Manufactura | Alimentos, bebidas, textiles, cuero, madera, papel, química, fármacos, plásticos, metalmecánica | Insumos, repuestos, tipo de cambio, electricidad, demanda, competencia importada, tecnología | Volumen físico, utilización, pedidos, empleo y margen |
| D Electricidad y gas | Sistemas eléctricos y combustibles | Hidrología, combustible, disponibilidad de centrales, interconexión, clima, equipos importados | Generación, costo, reserva operativa e interrupciones |
| E Agua y residuos | Empresas de agua, saneamiento y reciclaje | Precipitación, embalses, reactivos, electricidad, materiales reciclables, regulación | Continuidad, pérdidas, tratamiento y costo por unidad |
| F Construcción | Edificación e infraestructura | Acero, cemento, equipos, crédito, inversión pública, permisos y calendario de obras | Superficie, avance, costos, empleo y plazos |
| G Comercio y reparación | Mayorista, minorista, vehículos y talleres | Reposición, demanda familiar, crédito, importación, logística, repuestos y plataformas | Ventas reales, rotación, disponibilidad y márgenes |
| H Transporte y almacenamiento | Carretero, aéreo, ferroviario, fluvial, puertos y depósitos | Combustible, rutas, niveles de ríos, cierres, fletes, seguros y tiempos fronterizos | Toneladas, pasajeros, demora y costo puerta a puerta |
| I Alojamiento y comida | Hoteles, restaurantes y operadores | Ingreso y moneda del visitante, conectividad, feriados, clima, alimentos y reputación | Ocupación, noches, gasto, tarifa y empleo |
| J Información y comunicación | Telecom, software, medios y servicios digitales | Equipamiento, capacidad internacional, nube, licencias, conectividad y demanda externa | Tráfico, continuidad, accesos, exportación y productividad |
| K Finanzas y seguros | Bancos, microfinanzas, valores, seguros y pensiones | Tasas externas, liquidez, moneda, concentración, catástrofes y regulación | Costo de fondos, cartera, mora, solvencia, siniestralidad |
| L Inmobiliarias | Vivienda, comercial, industrial y suelo | Crédito, demografía, costos, oferta nueva, localización y conectividad | Renta, vacancia, absorción y transacciones |
| M Profesionales y científicas | Consultoría, ingeniería, legal, contabilidad e investigación | Inversión de clientes, licitaciones, salarios especializados, software y comercio de servicios | Contratos, facturación, empleo y exportación |
| N Servicios administrativos | Alquiler, agencias, seguridad, limpieza, soporte y viajes | Actividad de empresas clientes, costo laboral, equipos, combustible y normas | Demanda contratada, horas, empleo y margen |
| O Administración pública | Presupuesto, inversión, compras y seguridad social obligatoria | Ingresos externos, deuda, calendario fiscal, reglas y desastres | Ejecución, pagos, provisión y tiempos de compra |
| P Educación | Inicial, escolar, técnica, universitaria y capacitación | Cohortes, migración, presupuesto, conectividad, transporte y demanda de habilidades | Matrícula, asistencia, abandono y egreso |
| Q Salud y asistencia social | Salud pública/privada, cuidados y protección social | Epidemiología, clima, medicamentos, equipos, personal y financiamiento | Atenciones, ocupación, disponibilidad, ausentismo |
| R Arte, entretenimiento y deporte | Eventos, patrimonio, deporte, audiovisual y juegos | Ingreso disponible, turismo, calendario, transporte, derechos y plataformas | Asistencia, empleo, ingresos y cancelaciones |
| S Otros servicios | Reparación personal, peluquería, asociaciones y servicios comunitarios | Demanda barrial, insumos, energía, movilidad y alquileres | Actividad, costos e ingreso laboral |
| T Hogares empleadores y producción para uso propio | Cuidados y economía del hogar | Demografía, empleo, migración, remesas, transporte y servicios de cuidado | Tiempo de trabajo, participación y bienestar; separar frontera contable |
| U Organismos extraterritoriales | Cooperación y organismos internacionales | Presupuestos de donantes, programas, compras, misiones y tipos de cambio | Desembolsos, contratación y demanda local; cobertura probablemente pequeña |

La cobertura total significa que cada actividad tiene una ficha con factores, resultados, fuentes o brecha explícita. No significa que toda clase económica tenga series públicas diarias. La economía informal se trata como dimensión transversal a comercio, producción, transporte, servicios y hogares, con definiciones estadísticas documentadas.

## Dimensiones de diversidad

Cada familia se etiquetará por sector receptor y también por mecanismo. Un precio de combustible puede servir a agro, transporte, industria y hogares mediante una sola serie original.

| Dimensión | Desagregación propuesta | Regla de selección |
| --- | --- | --- |
| Mecanismo | Costos, demanda, liquidez, oferta física, acceso, productividad, regulación, riesgo | Incorporar al menos tres mecanismos pertinentes por sector antes de añadir referencias muy similares |
| Tipo de dato | Precio, índice, tasa, flujo, stock, volumen, duración, evento, pronóstico, exposición espacial | No convertir todos a índice salvo una comparación explícita |
| Territorio | Bolivia, nueve departamentos, ciudades, municipios, cuencas y corredores | Publicar detalle local sólo cuando el dato o el método lo sostiene |
| Socios | Brasil, Argentina, Chile, Perú, Paraguay; China, EE. UU., UE y otros según exposición | Escoger socios con pesos comerciales, remesas o transporte; revisar anualmente |
| Horizonte | Intradía selectivo, diario, semanal, mensual, trimestral, anual, por evento | Frecuencia de publicación y frecuencia de observación son campos diferentes |
| Cadena | Insumo, producción, transformación, distribución, consumo y financiamiento | Cubrir cuellos de botella, no sólo producto final |
| Mercado | Físico, spot, contrato, futuros, mayorista, minorista, oficial, ofertado | No sustituir entre mercados sin documentar el ajuste |
| Unidad económica | Empresa grande, pyme, microempresa, hogar, cooperativa, productor rural y Estado | Exposiciones distintas; evitar aplicar un promedio nacional a todos |

Para la geografía, las primeras fichas deben explicar: soya y agroindustria en Santa Cruz; minería en Potosí y Oruro; gas en Tarija y otros territorios productores; comercio, servicios e industria en La Paz, Cochabamba y Santa Cruz; ganadería y exposición a inundaciones en Beni; castaña y bosque amazónico en Pando y Beni; construcción, agricultura, servicios y administración en Chuquisaca. Es una selección orientativa, no una especialización exclusiva: todos los departamentos requieren cobertura multisectorial.

## Primera cartera de implementación

La siguiente cartera combina reutilización y nuevas adquisiciones. Son paquetes de trabajo: no deben contarse como 40 series nuevas. `P0` significa alto valor para evaluar primero, no disponibilidad garantizada. Antes de incorporarlos se debe buscar su equivalencia en módulos de BCB, bancos, mercados, aduana, ambiente, energía y social existentes.

| Paquete | Señales prioritarias | Decisión que habilita |
| --- | --- | --- |
| 01 Monedas de socios | BRL, ARS, CLP, PEN, PYG, CNY y USD con mercado y convención | Competitividad y costo de importación |
| 02 Condiciones financieras globales | Tasa de política de EE. UU., SOFR, Treasury 2/10 años | Sensibilidad de financiamiento externo |
| 03 Demanda de socios | Producción industrial, importaciones y actividad por destino | Riesgo de pedidos de exportación |
| 04 Precios de energía | Brent, diésel, gasolina, gas por mercado | Presión de costos y términos de intercambio |
| 05 Abastecimiento local | Volumen de importación, inventarios si publicables, disponibilidad | Riesgo de interrupción productiva |
| 06 Minerales relevantes | Zinc, estaño, plata, oro y plomo, con especificación correcta | Sensibilidad de ingreso exportador |
| 07 Granos y oleaginosas | Soya, aceite, harina, maíz, trigo, arroz | Márgenes de cadena y costos alimentarios |
| 08 Fertilización | Urea, fosfatos, potasio y logística | Presupuesto de campaña agrícola |
| 09 Clima de campaña | Precipitación, anomalía térmica, humedad y déficit hídrico | Riesgo de rendimiento por calendario agrícola |
| 10 Incendios e inundación | Área y exposición, no sólo número de focos | Priorización territorial de continuidad |
| 11 Hidrología energética | Caudal, embalse e hidrología disponible | Riesgo de oferta eléctrica |
| 12 Sanidad productiva | Alertas animales y vegetales verificadas | Riesgo de abastecimiento y acceso comercial |
| 13 Flete marítimo | Rutas relevantes, calendario, cobertura de publicación | Presión sobre reposición importada |
| 14 Puertos y frontera | Tráfico, demora y eventos en corredores reales | Elección de ruta y plazos |
| 15 Carreteras | Cierres, restricción y duración verificadas | Continuidad de abastecimiento |
| 16 Hidrovía | Nivel de ríos y restricciones operativas | Riesgo de despacho de carga |
| 17 Importaciones físicas | Volumen por insumo, origen y clasificación | Detección de faltantes, separando precio y cantidad |
| 18 Crédito sectorial | Saldos, tasas y condiciones por actividad | Fragilidad de capital de trabajo |
| 19 Liquidez y depósitos | Composición, moneda y concentración agregada | Presión sobre financiamiento local |
| 20 Remesas | Origen, moneda y frecuencia publicada | Demanda de consumo en hogares expuestos |
| 21 Empleo e ingreso | Empleo de calidad, ingresos reales y horas | Capacidad de compra; son resultados locales |
| 22 Inflación desagregada | Canastas, ciudad y componentes disponibles | Contrastar traslado de costos |
| 23 Inversión y compras públicas | Programación, adjudicación, ejecución y pagos separados | Demanda de construcción y proveedores |
| 24 Normativa comercial | Aranceles, cupos, permisos, vigencia y derogación | Riesgo de acceso y costo de comercio |
| 25 Demanda turística | Llegadas, conectividad, ingresos de mercados emisores | Planificación de ocupación y empleo |
| 26 Calendario | Feriados, vacaciones y eventos verificables | Estacionalidad de turismo, comercio y transporte |
| 27 Insumos de construcción | Acero, cemento, químicos, vidrio y equipo | Presupuestación y margen de obra |
| 28 Vivienda y alquiler | Oferta, transacción cuando exista, vacancia y crédito | Lectura inmobiliaria con sesgo de anuncios visible |
| 29 Telecomunicaciones | Accesos, tráfico, continuidad y equipos importados | Dependencia digital por sector |
| 30 Servicios de nube | Precios comparables, moneda y condiciones de uso | Costo de operación de empresas digitales |
| 31 Salud | Alertas epidemiológicas, importación de fármacos y equipos | Demanda sanitaria y ausentismo |
| 32 Educación | Cohortes, matrícula, migración y calendario | Planificación de plazas, transporte y cuidados |
| 33 Agua urbana | Continuidad, almacenamiento, demanda y costos químicos | Riesgo para industria y hogares |
| 34 Seguros | Exposición catastrófica, siniestros y condiciones de reaseguro | Riesgo de cobertura y primas |
| 35 Consumibles industriales | Resinas, papel, envases, textiles y reactivos | Costo de producción manufacturera |
| 36 Maquinaria y repuestos | Valor y volumen importado, origen y demora | Continuidad y productividad |
| 37 Servicios profesionales | Demanda de clientes, proyectos, contratos y habilidades | Anticipar cartera comercial |
| 38 Cultura y eventos | Programación, asistencia, turismo y costos | Viabilidad de eventos y demanda creativa |
| 39 Hogares y cuidados | Dependencia demográfica, servicios de cuidado y remesas | Restricciones de participación laboral |
| 40 Cooperación internacional | Programas y desembolsos verificables | Demanda pública y territorial financiada externamente |

## Priorización verificable

Primero aplicar filtros obligatorios: definición precisa, relación con una decisión, fuente identificada, derechos de uso revisables, método reproducible y una forma explícita de indicar ausencia de datos. Las familias que no los superen pasan a investigación; no se rellenan con información inventada.

Para ordenar candidatas que sí tienen ficha, usar provisionalmente un puntaje de 0 a 100: relevancia para decisiones bolivianas 25%; diversidad marginal de mecanismo 20%; factibilidad de adquisición 15%; oportunidad temporal 15%; calidad y claridad metodológica 15%; reutilización entre sectores 10%. Calificar cada criterio de 0 a 5 y dividir por 5 antes de ponderar. La factibilidad debe basarse en una prueba de extracción y condiciones de uso, no en la existencia de una página web.

Aplicar después una penalización documentada de 0 a 20 puntos por redundancia, fragilidad operativa o restricciones de publicación. No usar la correlación alta como único motivo para eliminar dos variables que representan mecanismos distintos. Tampoco premiar diez desagregaciones de una sola cotización como diez mecanismos nuevos.

`P0`: necesario para la primera explicación multisectorial o para corregir semántica y temporalidad. `P1`: amplía cobertura sectorial y geográfica tras resolver conectores base. `P2`: investigación, fuentes costosas, detalle fino, alternativas difíciles de validar. Las prioridades iniciales de los especialistas no implican que toda fila P0 deba entrar en el primer lanzamiento: se seleccionarán por capacidad y diversidad del conjunto.

Cada sector debe recibir una ruta mínima: dos impulsores de distinta naturaleza, una medida de exposición, un resultado y una decisión. Si no hay fuente, la ficha explicará qué falta, qué proxy se evaluó y por qué se aceptó o rechazó. Éste es el mecanismo para evitar que los sectores pequeños desaparezcan frente a los que tienen más datos.

## Política de fuentes y adquisición

Se propone una ficha por publicador y producto de datos, con productor original, distribuidor, URL, identificador de serie, responsable, derechos de acceso y redistribución, autenticación, límites de consulta, calendario, revisión histórica, archivo de evidencia y conector sustituto. FRED, por ejemplo, puede distribuir una serie cuyo productor original sea otra institución; registrar ambos.

| Estado | Evidencia necesaria | Qué se puede afirmar |
| --- | --- | --- |
| Descubierta | Página oficial o documentación relevante | La fuente merece investigación |
| Muestra obtenida | Archivo o respuesta conservados, fecha y hash | Se obtuvo una muestra concreta |
| Serie validada | Identificador, unidad, fechas, cobertura, método y controles | La serie es utilizable para el propósito documentado |
| Automatizable | Extracción repetible y condiciones de uso revisadas | Se puede operar el conector bajo esas condiciones |
| Publicable | Validación semántica, derechos, calidad y trazabilidad | Se puede mostrar esa serie al público |
| Operativa | Varias ejecuciones observadas, monitoreo y recuperación | El conector cumple el servicio medido |

Las fuentes citadas en los anexos se encuentran en distintos estados iniciales. Una referencia a un portal no equivale a un endpoint probado ni asegura detalle municipal o una historia continua. Para Banco Mundial y FMI existen páginas oficiales de API, pero hay que descubrir códigos, estructuras y cobertura vigentes antes de programar: [API del Banco Mundial](https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation), [API del FMI](https://data.imf.org/en/Resource-Pages/IMF-API).

Orden propuesto de adquisición: reutilización interna con linaje; descarga oficial estructurada; API oficial documentada; tabla oficial estable; documento oficial con extracción y revisión; convenio o licencia; proxy marcado. Cada alternativa debe conservar la definición económica. No sustituir una serie inaccesible por otra sólo porque comparte una palabra en el nombre.

Para fuentes comerciales de fletes, futuros, precios minerales especializados, reservas turísticas o datos de tarjetas, crear un carril de evaluación de costo y permisos. No se presupuesta disponibilidad gratuita. Si hay CAPTCHA o acceso restringido, registrar el bloqueo y buscar descarga autorizada, convenio o una fuente alternativa explícita.

## Calidad económica y temporal

El contrato por serie debe conservar período observado, fecha de publicación, primera disponibilidad comprobada, descarga, versión y vigencia. Si no se conoce la publicación histórica, no reconstruirla como si estuviera verificada: marcarla como desconocida y limitar su uso en pruebas retrospectivas.

Reglas mínimas de publicación:

1. Unidad, moneda, base del índice, geografía, metodología y mercado siempre visibles.
2. Unicidad a nivel serie, territorio, período y versión; no eliminar revisiones legítimas como duplicados.
3. `null` para ausencia; distinguir no publicado, no aplicable, suprimido, cero real y falla de adquisición.
4. Frescura según calendario del publicador y tolerancia por fuente, no una regla universal de siete días.
5. Valores negativos permitidos cuando sean económicamente posibles; rechazar por dominio específico, no por intuición.
6. Diferenciar precio observado, valor unitario aduanero, precio ofertado, índice, tarifa y pronóstico.
7. Conservar cambios de base, clasificación, composición, metodología y cobertura como rupturas o versiones.
8. No interpolar una serie anual para presentarla como información mensual observada.
9. No convertir monedas usando una cotización posterior al período, ni mezclar Bs/USD con USD/Bs.
10. No contar repetidamente una noticia sindicada como varios eventos económicos.
11. Para clima, conservar resolución y versión del producto, método de agregación espacial y cobertura de píxeles válidos.
12. Para microdatos o información comercial sensible, publicar agregados apropiados y respetar el acceso concedido.

La imputación y el empalme se publican como derivados separados. El usuario debe poder ver dato observado y transformación. La revisión de unidades, temporalidad y publicación es más importante que aumentar la cantidad visible de líneas.

## Productos analíticos que debe permitir el sistema

| Producto | Insumos y método propuesto | Límite que se mostrará |
| --- | --- | --- |
| Mapa de exposición sectorial | Dependencia importada, exportadora, energética y financiera × shocks externos | Pesos disponibles, antigüedad y cobertura |
| Presión de costos importados | Índice de insumos, moneda, logística y pesos fijos predefinidos | No equivale a inflación efectiva ni costo contractual |
| Demanda externa ponderada | Actividad de socios × participaciones exportadoras previas | Pesos cambian; reexportaciones y composición importan |
| Riesgo agroclimático | Anomalías por cultivo, calendario y área expuesta | Señal de riesgo; no pérdida de cosecha medida |
| Riesgo logístico por corredor | Cierre, duración, capacidad alternativa y carga expuesta | Ausencia de reporte no prueba transitabilidad |
| Presión financiera | Tasas, moneda, liquidez y exposición de deuda | Un índice exploratorio no sustituye un modelo de solvencia |
| Riesgo de continuidad industrial | Combustible, electricidad, agua, insumos y repuestos | Inventarios privados pueden no observarse |
| Demanda territorial | Empleo, remesas, turismo, calendario y gasto público | Proxies deben validarse frente a resultados oficiales |
| Calendario de choques | Eventos sanitarios, regulatorios, climáticos y logísticos | Correlación temporal no demuestra causalidad |
| Tablero de oportunidades | Mejora de precios exportadores, mercados y acceso | Se exige revisar costos, volúmenes y capacidad; sin recomendación automática de inversión |

Ejemplos de fórmulas candidatas:

- Costo importado en bolivianos por unidad: `(precio externo + transporte + seguro comparables) × tipo de cambio aplicable + cargos locales`. Documentar Incoterm y evitar sumar flete incluido en el precio CIF.
- Demanda externa: `suma de pesos exportadores del período base × variación de actividad del socio`. Recalcular pesos en una revisión programada, no usando ventas futuras.
- Valor unitario aduanero: `valor comercial / cantidad comparable`. No interpretarlo como precio puro cuando cambia producto, calidad, presentación o destino.
- Exposición climática: `suma de área productiva base × anomalía climática local / área base con cobertura válida`. Mostrar la cobertura; no asignar uniformemente la lluvia departamental a todas las parcelas.
- Presión sectorial normalizada: combinación de indicadores estandarizados sólo dentro de una ventana de entrenamiento, con pesos transparentes y análisis de sensibilidad. No publicar una escala arbitraria como probabilidad.

## Predicción, escenarios y causalidad

La primera etapa es descriptiva y de seguimiento de mecanismos. La segunda puede producir pronósticos de resultados concretos: inflación de un componente, exportación física, producción, ventas o mora. Se evitará un único modelo que mezcle cientos de variables y todos los sectores.

Para cada modelo: fijar objetivo y horizonte; construir un calendario de información disponible; comparar con una referencia estacional sencilla; seleccionar variables sólo dentro del entrenamiento; evaluar con ventanas temporales sucesivas; comprobar estabilidad de signo y error por régimen; mostrar intervalos y documentar revisiones. Separar modelos mensuales, trimestrales y de eventos. Las observaciones escasas no se compensan creando columnas artificiales.

Las variables muy correlacionadas pueden agruparse por mecanismo o reducirse con métodos estimados dentro de cada ventana de entrenamiento. La publicación de un modelo exige demostrar mejora fuera de muestra frente a su referencia y estabilidad razonable, además de explicar los períodos en que falla. No se fija una mejora porcentual antes de conocer la línea base.

Una prueba de precedencia temporal o un modelo con buen ajuste no identifica causalidad. Para afirmaciones causales se requiere un diseño defendible —por ejemplo, un cambio externo con grupo de comparación adecuado—, supuestos explícitos y revisión especializada. Hasta entonces usar lenguaje de asociación o escenario condicionado.

Escenarios iniciales, todos hipotéticos y sin probabilidades asignadas:

| Escenario | Combinación de señales | Sectores y respuesta a estudiar |
| --- | --- | --- |
| Combustible caro y abastecimiento limitado | Precio externo, moneda, importación e inventario | Transporte, cosecha, minería; margen y continuidad |
| Sequía en zonas productivas | Precipitación, humedad, calor y riego | Agro, alimento animal, energía; producción e inflación |
| Interrupción de corredor | Cierre de ruta, puerto o frontera y alternativas | Comercio, industria y exportación; demoras y reposición |
| Menor demanda de socio | Actividad, importaciones, moneda y cartera de destinos | Exportadores y proveedores; pedidos y empleo |
| Alza de tasas externas | Tasas, vencimientos y deuda por moneda | Estado, banca y empresas; costo y refinanciamiento |
| Shock sanitario animal | Alerta, área afectada, restricciones y sustitución | Ganadería, avicultura y alimentos; oferta y costos |
| Recuperación turística | Conectividad, moneda del visitante y reservas observables | Hoteles, comida, transporte y cultura; ocupación y empleo |
| Retraso de pagos públicos | Ejecución, devengado, pagado y cartera de contratos | Construcción, salud y servicios; liquidez y atrasos |
| Inundación urbana | Área expuesta, accesos, infraestructura y hogares | Comercio, agua, salud y seguros; continuidad y pérdidas |
| Cambio tecnológico | Precio de equipo, adopción, habilidades y demanda | Manufactura y servicios digitales; productividad y empleo |

Los shocks numéricos de cada simulación se parametrizarán como supuestos visibles. Primero se estimarán exposiciones y sensibilidades; no se multiplicará un shock internacional por toda la producción del país sin un modelo de transmisión.

## Experiencia de uso propuesta

La entrada principal debe permitir elegir una pregunta: costos, demanda, abastecimiento, financiamiento o riesgo. Desde allí se filtra por sector, territorio y horizonte. La navegación por fuente sigue disponible para especialistas.

Cada sector tendrá una ficha con factores externos, exposiciones, resultados locales y calendario de publicaciones. Las tarjetas mostrarán último período propio, fecha de actualización, unidad, fuente, estado de calidad y carácter observado/estimado/proxy. Un dato anual de calidad no debe aparentar ser un dato de hoy.

El comparador sólo superpone niveles compatibles. Para unidades distintas ofrecer paneles separados o un índice con base común explícita. Las variaciones de tasas se expresarán preferentemente en puntos porcentuales o básicos; el porcentaje relativo quedará como transformación optativa cuando sea interpretable. Las series diarias no se presentarán con las funciones actuales diseñadas para año y mes.

La página de una señal incluirá historia, revisiones, metodología, descarga, fuentes y sectores expuestos. Una señal sin fuente tendrá estado de investigación y no ocupará el mismo espacio visual que una señal medida. El calendario distinguirá publicación esperada, dato recibido, revisión y evento económico.

El asistente del observatorio deberá responder con fecha de corte, unidades, fuente y calidad. Su resumen actual titulado como precios internacionales debe evolucionar para cubrir distintos mecanismos y no presentar resultados locales como shocks externos. Las explicaciones automáticas serán hipótesis citadas, sin convertir coincidencias en causas.

## Hoja de ruta de veinticuatro semanas

Estimación de planificación, no compromiso de fecha. Supone un equipo de alrededor de 6 a 8 equivalentes de tiempo completo, acceso a fuentes básicas y entregas pequeñas. El plazo se recalibra tras las primeras cuatro semanas. Fuentes con convenios, pago o acceso institucional pueden llevar más tiempo.

| Fase | Semanas | Entregable | Criterio para pasar |
| --- | --- | --- | --- |
| Diagnóstico y diseño | 1–2 | Inventario de módulos existentes, diccionario, cobertura CAEB y evaluación inicial de fuentes | Cada familia seleccionada tiene papel, objetivo y fuente o brecha; duplicidades identificadas |
| Contrato y piloto | 3–4 | Prototipo acotado con 8–12 familias, muestras archivadas y adaptadores sobre capacidades existentes | Demostración reproducible de unidades, fechas y comparación; todavía sin cerrar toda la arquitectura general |
| Primera entrega diversa | 5–8 | Cartera de 40–60 familias aceptadas o reutilizadas, factores financieros, físicos, climáticos y logísticos | Fichas de los 21 sectores; cada serie publicada supera sus controles |
| Profundidad productiva | 9–12 | Cadenas agropecuarias, mineras, manufactureras y de construcción | Exposición, costos y resultado diferenciados por cadena; calidad comercial identificada |
| Servicios y territorio | 13–16 | Comercio, turismo, tecnología, servicios sociales, hogares y geografía | Todas las secciones tienen ruta mínima o brecha justificada, sin cobertura local ficticia |
| Analítica y escenarios | 17–20 | Índices reproducibles, escenarios y pilotos de pronóstico | Validación temporal, comparadores base y sensibilidad; sin causalidad no demostrada |
| Operación y expansión | 21–24 | Runbooks, responsables, indicadores de servicio y backlog de fuentes difíciles | Recuperación probada y trazabilidad completa de la cartera publicada |

Las 40–60 familias de la primera entrega son una meta de alcance sujeta a acceso y capacidad; no se sacrificarán controles para cumplirla. El catálogo completo funciona como universo de evaluación. La secuencia se organiza por dependencias: no comenzar modelos antes de tener disponibilidad temporal ni expandir el dashboard antes de normalizar unidades y frecuencia.

El piloto de semanas 3–4 usa un subconjunto del contrato y datos archivados; puede funcionar como prototipo de consulta y comparación sin completar todas las migraciones y APIs propuestas. Las estimaciones S/M/L del backlog corresponden a la versión general de cada capacidad, cuyo desarrollo continúa entre semanas 5 y 16. La primera cartera pública sólo incorpora series que puedan servirse correctamente mediante adaptadores validados; si una serie depende de la arquitectura completa, se desplaza a una fase posterior. El piloto no habilita por sí mismo pronósticos históricos ni publicación automática.

## Plan de las primeras cuatro semanas

| Semana | Trabajo concreto | Responsable propuesto | Evidencia de finalización |
| --- | --- | --- | --- |
| 1 | Cruzar catálogo con semillas, registros BCB, comercio, bancos, mercados, ambiente y energía | Líder de datos y analistas sectoriales | Matriz `reutilizar/ampliar/nuevo/descartar`, sin duplicados conceptuales ocultos |
| 1 | Revisar temporalidad, notas de mercado, moneda, calidad e índices base | Econometrista y responsable semántico | Registro de problemas con fuente y decisión |
| 1 | Escoger resultados y decisiones de cinco pilotos: agro, transporte, comercio, minería, servicios | Responsable de producto y especialistas | Cinco fichas completas de cadena de transmisión |
| 2 | Probar muestra de fuentes de clima, actividad de socios, tasas, logística y regulación | Ingeniería de datos | Archivos originales, cobertura, condiciones y conector candidato |
| 2 | Definir dimensiones, claves, estados, calendarios, revisiones y contrato de consulta | Backend y gobierno de datos | Diseño revisable y ejemplos válidos/ inválidos |
| 3 | Preparar muestras versionadas y adaptador de lectura del piloto | Backend e ingeniería de datos | Reejecución reproducible y selección demostrable por fechas conocidas dentro de la muestra |
| 3 | Construir ficha sectorial y comparador de unidades/frecuencias | Frontend y diseño | Prototipo con datos reales validados del piloto |
| 4 | Revisar semántica de la muestra, comportamiento ante faltantes y comparación | Analistas y QA | Prototipo aceptado y lista explícita de controles pendientes para producción |
| 4 | Medir tiempos/costos por conector y ajustar alcance de semanas 5–8 | Líder técnico y producto | Estimación basada en trabajo observado y cartera priorizada |

## Organización del trabajo por especialidad

La investigación debe operar como una red de fichas especializadas, aunque una persona pueda cubrir varias. El especialista define la pregunta y valida el significado; ingeniería valida extracción y operación; gobierno de datos resuelve versiones y metadatos; producto valida utilidad de la decisión.

Roles propuestos: macroeconomista; analista fiscal; econometrista; especialista bancario y de microfinanzas; analista de seguros/pensiones; analista de divisas/capitales; agrónomo económico; analista pecuario; especialista forestal/pesquero; analista energético; analista minero y metalúrgico; analista industrial; especialista de construcción/inmobiliario; analista de comercio/consumo; especialista logístico; analista turístico; especialista digital/telecom; analista de salud; analista educativo; especialista laboral/hogares; analista de servicios profesionales; especialista cultural; geógrafo/climatólogo; analista normativo; responsables de datos, backend, frontend y calidad.

Dotación orientativa: 1 responsable de producto/economía, 2 ingenieros de datos, 1 backend, 1 frontend, 1 econometrista/calidad y entre 0,5 y 2 personas equivalentes de especialistas distribuidos. El tiempo de expertos puede contratarse por revisión sectorial; no se presupone contratar una persona permanente por cada rubro.

Costo total a estimar después del piloto: horas por rol × tarifa efectiva + licencias + infraestructura + almacenamiento de históricos y satélite + mantenimiento de conectores + revisión de datos. No se asigna una cifra monetaria sin conocer tarifas, contratos y volumen. El cómputo de clima y documentos puede requerir una infraestructura distinta a la de series tabulares.

## Cómo se medirá el éxito

Se proponen tres indicadores principales. Los umbrales siguientes son criterios iniciales de aceptación, no resultados observados.

| Indicador | Definición | Meta provisional | Riesgo de interpretación |
| --- | --- | --- | --- |
| Cobertura útil de sectores | Secciones con ruta mínima validada / 21 secciones de la matriz Rev. 4 | Ficha y brecha explícita para 21/21; aumentar las rutas realmente medidas durante el programa | Tener ficha no implica tener datos suficientes; mostrar ambos numeradores |
| Confiabilidad temporal | Publicaciones esperadas recibidas dentro de la tolerancia / publicaciones esperadas de fuentes activas | Proponer 95% tras medir calendario y línea base; excluir sólo pausas documentadas | No penalizar fuentes anuales en semanas sin publicación |
| Utilidad de decisiones | Casos piloto aceptados por usuarios que completan tarea con evidencia / casos evaluados | Validar primero cinco casos, luego fijar umbral con usuarios | Aperturas de páginas no equivalen a mejores decisiones |

Indicadores de diagnóstico: tiempo de alta por fuente, tasa de fallas de extracción, tiempo hasta resolver incidencias y distribución de mecanismos por sector. Dos restricciones de calidad: toda serie pública debe tener procedencia, unidad y versión; ningún modelo debe usar información posterior a la fecha de pronóstico.

La diversidad se auditará mediante una matriz sector × mecanismo × geografía × tipo de dato. Se puede calcular concentración de familias por mecanismo como diagnóstico, pero no convertir una distribución uniforme en objetivo: algunos sectores dependen más de energía, otros de ingresos o demografía.

## Riesgos y decisiones pendientes

| Riesgo | Consecuencia | Respuesta prevista |
| --- | --- | --- |
| Confundir referencia mundial con precio boliviano | Diagnóstico incorrecto de márgenes | Mercado, calidad y canal contractual explícitos |
| Muchas candidatas sin acceso verificable | Plan imposible de operar | Embudo de adquisición y cartera por capacidad |
| Duplicar datos ya existentes | Más mantenimiento y números inconsistentes | Reutilizar con identificador canónico y linaje |
| Mezclar dato vigente y disponible | Pronósticos retrospectivos irreales | Versiones y consultas por fecha de conocimiento |
| Cobertura territorial insuficiente | Falsa precisión municipal | Mostrar resolución real y pesos de exposición |
| Fuentes cambiantes o licencias restrictivas | Interrupción o imposibilidad de publicar | Versionar contratos de fuente y mantener alternativas compatibles |
| Exceso de indicadores sin una pregunta | Tablero difícil de usar | Fichas por decisión y cartera inicial acotada |
| Índices sintéticos opacos | Confianza excesiva en un puntaje | Fórmulas, pesos, contribuciones y sensibilidad visibles |
| Eventos extraídos automáticamente sin revisión | Falsas alertas y duplicados | Evidencia, vigencia y revisión según criticidad |
| Plazo incompatible con dotación real | Entregas incompletas | Recalibración después del piloto, preservando calidad |

Se asume Bolivia como centro, datos públicos como primera opción, reutilización de la arquitectura existente y una interfaz en español. Quedan por resolver durante la fase 1: usuarios prioritarios, decisiones de mayor valor, dotación real, presupuesto de licencias, permisos de fuentes y fuentes de verdad por indicador. Estas decisiones no impiden entregar el plan ni investigar fuentes; sí condicionan el tamaño de la primera implementación.

## Condiciones de aceptación del programa

El programa estará listo para operación cuando el catálogo publicado tenga definiciones y derechos revisados; las series puedan reproducirse desde evidencia; cada sector tenga cobertura o una brecha explícita; las consultas respeten fecha de disponibilidad; las transformaciones declaren unidad y método; las fuentes tengan responsables y recuperación; y los casos de uso hayan sido revisados con resultados reales.

La implementación debe conservar los precios actuales útiles y ampliar el sistema hacia mecanismos económicos medibles. Su criterio final es que un usuario pueda explicar la exposición de su sector y comprobar la evidencia detrás de cada señal, conociendo también lo que todavía no se observa.

## Verificación de esta entrega documental

Se consolidaron los tres catálogos y se comprobaron los campos requeridos, 287 identificadores únicos, prioridades P0/P1/P2 y formato de URL, permitiendo una fuente explícitamente pendiente. Se verificaron los enlaces locales de los cinco documentos y su lectura UTF-8. El inventario local se ejecutó con corte 2026-10-04 y hashes de las semillas. La revisión cruzada corrigió la normalización de roles, la separación entre medición y atributos espaciales/pronosticados, y el alcance temporal del piloto.

Estos controles verifican la integridad de la entrega, no la exactitud económica de todas las series propuestas. Permanecen como trabajo de implementación la prueba de cada fuente, la revisión de licencias, la conciliación de conceptos y la validación de cobertura. No se ejecutaron pruebas del producto porque esta tarea no modifica su código ni comportamiento.
