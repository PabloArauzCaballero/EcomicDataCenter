# Anexo de producción recursos naturales y riesgos físicos

Fecha de corte de la investigación: 4 de octubre de 2026. Este documento propone una ampliación; no afirma que las series candidatas estén descargadas, automatizadas o disponibles con la frecuencia deseada.

El catálogo adjunto contiene **104 familias**: 24 de agricultura, 10 de pecuario, 6 de forestal y pesca, 14 de energía, 12 de minería, 17 de manufactura, 8 de construcción e inmobiliario y 13 de clima, agua y biodiversidad. Distribución propuesta: **47 P0, 51 P1 y 6 P2**. Una familia puede producir varias series al desagregarse por producto, calidad, ubicación, unidad, contrato o frecuencia. No sumar familias como si fueran observaciones o series ya implementadas.

El resultado buscado es explicar cómo shocks de precios, disponibilidad física, clima, sanidad, tecnología y acceso a mercados afectan costos, producción, ingresos y capacidad de cada cadena boliviana. Cada variable debe pertenecer a una pregunta concreta. Una mayor cantidad de cotizaciones sobre el mismo producto no garantiza mayor diversidad económica.

El [catálogo de producción](catalogo_produccion.csv) registra ID, sector, variable, definición, unidad, frecuencia objetivo, geografía, canal, rezago hipotético, URL de la fuente, prioridad, rol y disponibilidad. Los rezagos son hipótesis iniciales para contrastar; no resultados econométricos. P0 indica valor y dependencia para el primer producto analítico, no acceso asegurado.

## 1. Separar causas, exposición y resultados

| Rol | Criterio de uso | Ejemplo | Restricción |
|---|---|---|---|
| Driver externo candidato | Bolivia difícilmente determina su realización dentro del horizonte estudiado | Referencia mundial de urea | La demanda mundial puede afectar también exportaciones; controlar causas comunes |
| Shock físico | Variación meteorológica sobre territorio definido | Lluvia de una cuenca durante floración | La exposición elegida y las decisiones de siembra pueden ser endógenas |
| Exposición predeterminada | Medida anterior al shock y congelada para el análisis | Hato del año anterior o intensidad importadora de año base | No recalcular pesos con resultados posteriores |
| Mediador | Variable que transmite parte del efecto | Humedad de suelo, reserva hidroeléctrica, despacho de combustible | Controlarla puede eliminar el efecto total que se quiere medir |
| Indicador adelantado endógeno | Anticipa otro resultado, pero responde a expectativas y decisiones | Permisos de obra, importación de maquinaria | Útil para pronóstico; no llamarlo causa externa |
| Resultado | Es precisamente lo que cambia por los shocks | Producción industrial, precio local, faena, ventas YLB | No introducir valores futuros o contemporáneos como drivers de sí mismos |
| Escenario o índice derivado | Construcción explícita con insumos, pesos y fórmula versionados | Costo de ración, margen teórico de molienda | Publicar supuestos y distinguir simulación de medición |

En este anexo, **exógeno es relativo al resultado, territorio, horizonte y diseño del análisis**. Un precio internacional puede tratarse como dado para una empresa boliviana y ser endógeno al ciclo mundial. Un brote o incendio requiere estudiar exposición, vigilancia y acción humana. La inclusión de resultados en el catálogo es deliberada: permiten validar el sistema; deben almacenarse y mostrarse separados de los drivers.

**Regla de normalización del consolidado:** el campo `rol` de las 104 filas de producción es descriptivo y puede mencionar más de una función. Debe conservarse íntegro. Hasta revisar el resultado, geografía y horizonte explícitos de cada caso (`target_scope`), asignar `rol_filtro=POR_DEFINIR_SEGUN_OBJETIVO`. No extraer automáticamente un enum buscando palabras como EXTERNO o RESULTADO: una misma fila puede distinguir benchmark externo, valor unitario endógeno y exposición previa. La clasificación filtrable definitiva se aprueba por combinación de variable y objetivo, no por familia de forma universal.

## 2. Brechas concretas del repositorio revisado

La lectura de [exogenous-spec.ts](../../../scripts/exogenous/exogenous-spec.ts), [exogenous-agro-livestock.ts](../../../scripts/exogenous/exogenous-agro-livestock.ts), [exogenous-energy-minerals.ts](../../../scripts/exogenous/exogenous-energy-minerals.ts), [exogenous-industry-construction.ts](../../../scripts/exogenous/exogenous-industry-construction.ts), [collect-exogenous-prices.ts](../../../scripts/exogenous/collect-exogenous-prices.ts) y [el esquema de semillas](../../../src/database/seeds/schemas/exogenous-prices.schema.ts) muestra una base útil de precios mundiales, vecinos, productor estadounidense, mercado boliviano y aduana.

| Observación del código | Consecuencia para el plan |
|---|---|
| Siete grupos económicos; sólo tipos PRICE e INDEX | Incorporar cantidades, existencias, tasas, estados operativos, eventos y campos espaciales en un modelo de drivers más amplio |
| Colector de precios al mes cerrado | Mantener frecuencia original y agregaciones explícitas para sanidad, clima, energía y campañas |
| Esquema admite MONTHLY y ANNUAL; máximo 420 puntos por serie y 200 series por archivo | No insertar cientos de familias ni datos diarios dentro de la misma semilla; diseñar particiones y contratos de datos compatibles |
| Procedencia contiene URL, huella y fecha de descarga | Añadir fecha de publicación, fecha de vigencia, versión de fuente, versión metodológica y estado preliminar/revisado |
| Brent aparece descrito como referencia directa de contratos de gas con Brasil y Argentina | Auditar contratos y períodos efectivos antes de atribuir una fórmula; no deducir precio realizado únicamente de Brent |
| Se asigna un mercado genérico de Londres a ocho minerales/metales | Revisar cada benchmark; oro, plata y mineral de hierro requieren descripciones específicas, no una bolsa genérica |
| Los PPI de EEUU aproximan insumos industriales y materiales de obra | Conservar su identidad extranjera; estimar representatividad y traspaso al costo boliviano |
| El comentario presenta PPI como único registro abierto y mensual para ciertos materiales | Sustituir esa afirmación por el estado real de fuentes evaluadas; no se demostró exclusividad |
| La harina de pescado se presenta como principal insumo de piscicultura | La relevancia depende de especie, etapa y formulación; construir recetas específicas y no generalizar |

Estas observaciones se refieren al árbol de trabajo leído, que contiene cambios previos del usuario y otros trabajos. Este anexo no modifica colectores, semillas, esquemas, fuentes productivas ni el dashboard.

## 3. Mesas de análisis por cadena

Cada mesa debe entregar una ficha de negocio, una hipótesis causal, un conjunto pequeño de drivers, una validación territorial y una decisión que la información permita tomar.

| Mesa especialista | Pregunta de decisión | Drivers y exposiciones centrales | Resultado que se evalúa | Horizonte y trampas |
|---|---|---|---|---|
| Soya y oleaginosas | ¿Conviene procesar, almacenar o vender grano bajo cada escenario? | AG01–04, AG16, AG20, CL01–04, EN02 | Margen teórico y realizado, molienda, exportación | Campaña y 1–6 meses; rendimiento industrial, aceite y harina deben ser coherentes |
| Cereales y molienda | ¿Cuánta vulnerabilidad tiene el abastecimiento de trigo, maíz, arroz y sorgo? | AG04–06, AG16–20, CL01–06 | Disponibilidad y costo de harina, pan y balanceado | 1–12 meses; distinguir campañas de vecinos y calidad del grano |
| Quinua y granos andinos | ¿Proviene el cambio comercial de demanda, oferta peruana, calidad o rendimiento? | AG07–08, AG11, AG20–22, CL03 | Precio efectivo y volumen de exportación | 1–12 meses; orgánico, variedad y limpieza alteran el valor unitario |
| Café y cacao | ¿Qué parte del ingreso responde al benchmark y qué parte a calidad y daño físico? | AG09–11, AG23, CL01–08 | Rendimiento, ingreso por lote y exportación | 3–12 meses; prima de especialidad no observada no se inventa |
| Frutas y hortalizas | ¿Dónde hay riesgo de caída de oferta y pérdidas por perecibilidad? | AG14–15, AG18, AG23, CL01–05, EN09 | Precio por plaza, abastecimiento y merma | Días a tres meses; no extender rezagos de cereales a hortalizas |
| Caña, azúcar y bioenergía | ¿Cómo cambian las alternativas productivas ante azúcar, energía y agua? | AG12–13, MA15, EN01–03, CL01–05 | Margen técnico, zafra y producción | Zafra y 1–12 meses; el ratio brasileño exige fuente regional real |
| Ganadería bovina | ¿Se deterioran disponibilidad forrajera, ingreso exportador y condición del hato? | LV01–02, LV04, LV07, LV10, CL07–10 | Faena, peso e ingreso ganadero | Meses y ciclos plurianuales; liquidación de vientres puede subir faena hoy y reducir oferta futura |
| Avicultura y huevos | ¿Qué shock de alimento o sanidad afecta los próximos ciclos? | LV02–03, LV06, EN09, EN12 | Producción de pollo y huevos, costo por unidad | Semanas a meses; postura y engorde tienen ciclos distintos |
| Porcicultura | ¿Aumenta riesgo por ración, genética o enfermedad regional? | LV02, LV04, LV06, LV07 | Faena y costo por kg | 3–12 meses; importación de reproductores responde a expectativas |
| Lechería | ¿Cómo interactúan calor, forraje y competencia de leche en polvo? | LV02, LV05, LV07, LV10, EN12 | Leche recolectada, costo y calidad | Días a meses; leche cruda y polvo no son la misma mercancía |
| Camélidos, ovinos y apicultura | ¿Qué exposición tienen fibra, carne y miel a demanda y degradación del hábitat? | LV07–09, CL01–04, CL11–12 | Volumen, ingreso y estabilidad productiva | Campaña y años; separar especies y reconocer vacíos de registro |
| Forestal y castaña | ¿Dónde se concentran riesgo físico, demanda externa y pérdida de acceso? | FO01–03, CL01–02, CL07, CL11 | Volumen legal, exportación e ingreso recolector | Campaña y 1–12 meses; precio de especie o grado distinto es proxy |
| Pesca y acuicultura | ¿Qué combina estrés de agua, alimento y competencia importada? | FO04–06, LV02, CL03–05, CL09 | Producción y costo por especie | 1–12 meses; harina de pescado no domina todas las dietas |
| Petróleo y refinados | ¿Qué parte de la factura se explica por crudo, refinación, logística y cantidades? | EN01–04, EN08–09 | Costo importado y abastecimiento | Semanas a meses; benchmark del Golfo no equivale a costo puesto en Bolivia |
| Gas y servicios petroleros | ¿Qué riesgos provienen de precio contractual, volumen, declinación y comprador? | EN05–07, EN10 | Ingreso efectivo y capacidad disponible | 3–24 meses; contrato, poder calorífico y condición de entrega deben conocerse |
| Electricidad y renovables | ¿Cómo alteran sequía, recurso renovable y fallas el despacho? | EN11–14, CL01–06 | Generación, reserva y costo marginal | Horas a seis meses; embalse responde a decisiones operativas |
| Metales tradicionales | ¿Cómo cambia ingreso neto por precio, ley, pagabilidad y energía? | MI01–04, MI09–12, EN12 | Valor exportado y margen operativo | 1–12 meses; metal fino, mineral y concentrado no se suman como misma unidad |
| Litio y evaporíticos | ¿Qué significan precios por grado, oferta competidora y capacidad efectivamente utilizada? | MI06–08, MI11, AG16 | Volumen comercial, precio realizado y utilización | 6–36 meses; anuncios de capacidad y precio grado batería no representan producción local |
| Alimentos y bebidas | ¿Qué ramas reciben shocks por receta y cuáles por envase o energía? | MA01–02, LV05, MA09–10, EN09, EN12 | Costo y volumen industrial por rama | 1–6 meses; ponderar costos técnicos, no promediar materias primas sin receta |
| Textiles, cuero y calzado | ¿Predominan costo de fibra/piel, demanda o competencia de importación? | MA03–05, LV09, MA12, MA17 | Producción, ventas y costo por tipo | 1–12 meses; el comercio formal no mide contrabando |
| Química y farmacia | ¿Qué insumos críticos dependen de un origen, molécula o plazo de reposición? | MA06–08, MA17, EN09 | Disponibilidad de insumos y continuidad industrial | 1–12 meses; HS no identifica necesariamente molécula o fabricante |
| Plástico, papel y embalaje | ¿Qué rama sufre por polímero, celulosa, energía o demanda de clientes? | MA09–10, MA01–02, EN12 | Precio industrial y capacidad utilizada | 1–6 meses; agregado de resinas no informa todos los polímeros |
| Metalmecánica y equipo eléctrico | ¿Cómo cambian costos de metal, reposición y capacidad industrial? | MA11–13, MI03, EN12 | Producción, inversión y mantenimiento | 3–24 meses; separar repuesto, equipo completo, nuevo y usado |
| Construcción y materiales | ¿Qué variación de costo y plazo proviene de material, capacidad, energía y clima? | CO01–05, CO08, EN09, EN12 | Presupuesto, plazo y actividad | 1–18 meses; permisos no son obra comenzada ni cemento es todo el sector |
| Inmobiliario | ¿El riesgo viene de demanda, financiación, costos o exceso de oferta? | CO02, CO04, CO06–07 más variables financieras del plan principal | Precio, alquiler, absorción y stock | 3–24 meses; anuncios no son transacciones; falta de registro exige línea de investigación propia |
| Agua, clima y biodiversidad | ¿Qué actividades comparten exposición física y dónde coinciden riesgos? | CL01–13 y capas de exposición previas | Pérdida de producción o interrupción, por sector | Evento a años; índice de cobertura no equivale a riqueza de especies |

## 4. Territorialización y diversificación real

La siguiente tabla define prioridades de investigación, no afirma participaciones departamentales medidas. Cada atribución deberá validarse con área, hato, establecimientos, minas, plantas y estadísticas oficiales.

| Territorio de análisis | Cadenas que deben investigarse | Capas físicas y de infraestructura necesarias |
|---|---|---|
| Santa Cruz | Oleaginosas, cereales, caña, bovinos, avicultura, industria y construcción | Campañas, cuencas, calor, incendios, rutas, disponibilidad de combustible |
| Beni | Bovinos, cacao, forestal, pesca y servicios ligados a río | Inundación, pasturas, navegación, distancia a mercados, agua |
| Pando | Castaña, forestal, productos amazónicos y logística | Bosque, recolección, incendios, accesibilidad fluvial y vial |
| La Paz | Café, cacao, horticultura, camélidos, minería, industria urbana | Gradiente altitudinal, heladas, cuencas, riego y acceso |
| Cochabamba | Leche, horticultura, frutas, avicultura, industria y energía | Cuencas lecheras, disponibilidad hídrica, calor, frío y conexiones |
| Oruro | Quinua, camélidos, minería, metalurgia y logística | Heladas, sequía, viento, exposición hídrica y rutas |
| Potosí | Minería, quinua, camélidos y evaporíticos | Salar, altura, agua, recuperación metalúrgica, electricidad |
| Tarija | Gas, uva, horticultura, agroindustria y construcción | Cuencas, heladas, producción de campos, contratos y energía |
| Chuquisaca | Gas, agricultura de valle, ganadería, alimentos y materiales | Fragmentación territorial, agua, accesibilidad y estacionalidad |

La unidad estadística no siempre debe ser departamento: un campo de gas, un embalse, una cuenca, un mercado mayorista o una campaña agrícola puede explicar mejor el mecanismo. Las series mundiales no se multiplican nueve veces para aparentar cobertura territorial; se combinan con nueve exposiciones distintas cuando existe evidencia.

Para ponderar clima agrícola, usar superficie del cultivo del año previo o una máscara publicada antes del período explicado. Para energía, usar cuenca y configuración de planta. Para minería, vincular operación, agua y suministro eléctrico. Para industria, usar estructura de insumos anterior al shock. Publicar el porcentaje del área o actividad que queda sin cobertura.

## 5. Indicadores derivados y simulaciones

Estas fórmulas son propuestas metodológicas. Los coeficientes técnicos y conversiones se deben documentar antes de publicar resultados.

1. **Índice de costo de ración por especie:** costo(t) = suma de participación fija del ingrediente i × precio comparable del ingrediente i. Añadir transporte, procesamiento y otros costos sólo si se observan. Publicar una versión benchmark externa y otra puesta en granja; no mezclarlas.
2. **Margen teórico de molienda de soya:** rendimiento de aceite × precio de aceite + rendimiento de harina × precio de harina + valor de coproductos − costo de grano − costos de conversión observados. Si falta el último término, llamar al resultado spread bruto de transformación.
3. **Paridad de importación:** precio FOB + flete + seguro + gastos portuarios + transporte interno + gravámenes aplicables, convertido a moneda local con tipo y fecha de cambio explícitos. Usar sólo componentes efectivamente verificados; no completar con cero.
4. **Ingreso minero pagable:** contenido fino vendible × porcentaje pagable × benchmark contractual − tratamiento − refinación − penalidades − logística. Una cotización por tonelada de metal no se aplica directamente a toneladas de concentrado.
5. **Ingreso de gas:** energía entregada × precio contractual efectivo. La transformación de volumen a energía requiere poder calorífico y condiciones de medición; el vínculo con petróleo exige contrato y versión.
6. **Exposición climática sectorial:** suma de peso territorial previo × anomalía del territorio. Conservar anomalía, peso y superficie válida. Reportar percentiles y distribución, además de promedio.
7. **Dependencia de proveedores:** participación del mayor origen y suma de cuadrados de participaciones por partida. Calcular sobre valores y, cuando sean comparables, cantidades; fijar el año base para el análisis de shocks.
8. **Costo industrial de canasta fija:** suma de pesos de costo anteriores al shock × variación de cada insumo. Tratar energía, envase, materia prima y transporte como categorías mutuamente excluyentes.
9. **Estrés compuesto:** construir un vector de indicadores de sequía, calor, fuego y exposición; sólo convertirlo en puntaje después de calibrar y validar. Un puntaje 80/100 carece de interpretación si no existe criterio de pérdida o probabilidad.
10. **Margen de obra:** presupuesto de referencia actualizado con índices pertinentes y exposición importadora, más escenario de duración. Si salarios, financiación o materiales locales faltan, presentar cobertura parcial.

### Matriz inicial de shocks e interacciones

Los tamaños son escenarios ilustrativos, no pronósticos ni estimaciones de elasticidad.

| Escenario | Combinación | Pregunta y salida | Riesgo de interpretación |
|---|---|---|---|
| Agro con energía restringida | Fertilizante +20%, lluvia en percentil 10, menor disponibilidad de diésel | Costo/ha y distribución de rendimiento por campaña | No sumar variaciones porcentuales como si fueran pérdidas observadas |
| Avicultura tensionada | Maíz +15%, soya +15%, brote regional | Cambio de costo de ración y rutas potencialmente afectadas | Brote regional no implica contagio local ni restricción vigente |
| Exportador de quinua | Oferta competidora +10%, menor demanda de destino, helada local | Riesgo separado de precio, cantidad y calidad | Valor unitario puede variar por mezcla orgánica |
| Bosque y castaña | Sequía, fuego y acceso reducido | Área productiva expuesta y destinos afectados | Foco térmico no prueba daño de castañal |
| Diésel caro | Brent estable, crack de diésel +30%, flete +20% | Descomposición del costo potencial puesto en frontera | Benchmark y factura contractual pueden tener rezagos distintos |
| Hidroelectricidad baja | Aportes en percentil 10 y planta térmica indisponible | Generación simulada, reserva y costo bajo restricciones | Requiere modelo técnico; no extrapolar linealmente un costo marginal |
| Minería presionada | Zinc −15%, reactivos +20%, electricidad interrumpida | Sensibilidad del margen por operación | Ley, pagabilidad y coproductos pueden cambiar signo del efecto |
| Litio competitivo | Oferta competidora mayor, distinto descuento técnico/batería | Ingresos bajo calidad y volumen efectivamente vendible | No aplicar capacidad nominal como volumen vendido |
| Manufactura con doble shock | Insumo externo +15%, energía no disponible, demanda menor | Costo, capacidad y ventas como resultados separados | Precio de insumo no explica por sí solo caída de ventas |
| Construcción lenta | Acero +15%, días adversos +20%, crédito más caro | Presupuesto, duración y sensibilidad financiera | Permisos aprobados pueden no ejecutarse |

### Modelos por propósito

- Para explicar un mecanismo, definir un diagrama causal, unidad de observación, confusores, mediadores y resultado antes de estimar.
- Para pronosticar, comparar primero con un pronóstico estacional y un modelo que use sólo historia del resultado. Añadir drivers por grupos y medir ganancia incremental.
- Para costos técnicos, usar contabilidad física y recetas; no exigir causalidad econométrica para una identidad correctamente especificada.
- Para escenarios raros, usar intervalos y supuestos transparentes; datos insuficientes no justifican intervalos artificialmente estrechos.
- Para comparar sectores, normalizar shocks y reportar exposición absoluta y relativa. La misma caída porcentual no equivale al mismo impacto monetario.

## 6. Fuentes, cobertura observada y condiciones de uso

Se verificó la existencia y contenido pertinente de las páginas primarias indicadas. Esto no prueba que todas las combinaciones de país, producto, frecuencia y años estén disponibles. Los campos del catálogo que dicen CANDIDATA o NO VERIFICADA conservan esa condición aunque la institución sea oficial.

| Fuente primaria | Evidencia observada y utilidad | Verificación pendiente antes de automatizar |
|---|---|---|
| [Banco Mundial, Commodity Markets](https://www.worldbank.org/en/research/commodity-markets) | Publicación de referencias de materias primas y datos mensuales | Especificación por columna, cambios de metodología, condiciones de redistribución |
| [FAO FPMA](https://www.fao.org/giews/food-prices/home/en/) | Plataforma de seguimiento de precios alimentarios | IDs, mercados, huecos, calidad, antigüedad y condiciones del proveedor original |
| [USDA FAS, bases de datos](https://fas.usda.gov/data/databases-applications) | PSD, comercio y otras aplicaciones oficiales de oferta/demanda agropecuaria | Productos, países, año comercial, revisiones, credenciales y límites |
| [FAO Statistics / FAOSTAT](https://www.fao.org/statistics/en/) | Estadísticas agrícolas, pecuarias y forestales | Elemento estadístico, banderas, estimaciones e imputaciones; no equivale a registro fitosanitario |
| [INE, agropecuaria](https://www.ine.gob.bo/index.php/estadisticas-economicas/agropecuaria/) | Secciones agrícolas y pecuarias para resultados y exposición | Archivo exacto, calendario, desagregación, revisiones y cobertura |
| [UN Comtrade](https://comtradeplus.un.org/) | Portal de comercio internacional para investigar productos, socios y flujos | Clasificación HS, peso, revisiones, acceso y términos; no se verificaron consultas exhaustivas |
| [IPPC, boletines de plagas](https://www.ippc.int/en/countries/reportingsystem-summary/all/) | Índice de reportes nuevos y actualizados enviados por países | Cobertura regional, fecha de ocurrencia frente a publicación y sesgo de reporte |
| [WOAH, WAHIS](https://www.woah.org/en/what-we-do/animal-health-and-welfare/disease-data-collection/world-animal-health-information-system/) | Sistema oficial de alertas y reportes de sanidad animal | Diferenciar evento, seguimiento, sospecha, confirmación y ejercicios |
| [FAO, FishStat](https://www.fao.org/statistics/data-dissemination/fishery-and-aquaculture/) | Colecciones pesqueras y acuícolas | Cobertura boliviana por especie, frecuencia, estimación y revisiones |
| [ITTO, Market Information Service](https://www.itto.int/market_information_service/) | Reportes quincenales y precios indicativos de madera; registro gratuito anunciado | Acceso con cuenta, permiso de redistribución, especie, grado, puerto y comparabilidad |
| [EIA, petróleo y líquidos](https://www.eia.gov/petroleum/data.php) | Precios, stocks, oferta y refinación; frecuencias semanales y mensuales | Serie concreta, unidad, región, método y API correspondiente |
| [ANH, planificación y estadística](https://www.anh.gob.bo/w2019/contenido.php?s=8) | Índice de anuarios y documentos; visible anuario 2024 y boletines históricos | Descarga, contenido, continuidad reciente y nivel territorial; no asumir feed mensual vigente |
| [INE, hidrocarburos/minería](https://www.ine.gob.bo/index.php/estadisticas-economicas/hidrocarburos-mineria/) | Sección estadística nacional del sector | Tablas y detalle por campo/mina; no aporta automáticamente contratos o costos |
| [CNDC, resultados operativos](https://www.cndc.bo/resultados-operativos/) | Portal que anuncia operación, hidrología, indisponibilidades y resultados | Acceso de cada documento, exportación real, historia disponible y carácter provisional |
| [USGS, Mineral Commodity Summaries 2026](https://www.usgs.gov/publications/mineral-commodity-summaries-2026) | Compendio anual de minerales y materiales | Definición por mineral, unidad, reservas/recursos, datos de terceros y precios licenciados |
| [YLB, rendición final 2025](https://www.ylb.gob.bo/wp-content/uploads/2026/03/Informe_de_RPCF_2025_Publicado.pdf) | Publicación empresarial con resultados y diferenciación entre carbonato técnico y grado batería | Extraer tablas y contrastar unidades; no convertir un PDF anual en supuesto API mensual |
| [BLS, metodología PPI](https://www.bls.gov/ppi/overview.htm) | Índices de precios recibidos por productores domésticos estadounidenses | Código específico, base, ajuste estacional y representatividad del insumo comprado por Bolivia |
| [INE, coyuntura industrial](https://www.ine.gob.bo/index.php/estadisticas-economicas/industria-manufacturera-y-comercio/estadisticas-coyunturales-cuadros-estadisticos/) | Tablas industriales; algunos índices listados tienen corte 2019 | Localizar versión vigente y no atribuir actualización a una tabla histórica |
| [INE, construcción](https://www.ine.gob.bo/index.php/estadisticas-economicas/construccion/) | Costos, cemento y permisos | Geografía, base y frecuencia; no demuestra inventario inmobiliario o transacciones |
| [Copernicus, reanálisis climático](https://climate.copernicus.eu/climate-reanalysis) | ERA5 y ERA5-Land; campos meteorológicos y del suelo | Producto, versión, resoluciones, variables, autorización de descarga y corrección de sesgo |
| [CHIRPS v3](https://www.chc.ucsb.edu/data/chirps3) | Precipitación con productos preliminares y finales y varias agregaciones | Seleccionar versión y producto diario; preservar revisiones y ventanas temporales |
| [NOAA CPC, ONI](https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/ensostuff/ONI_v5.php) | Índice oceánico para ENSO | Versiones, ventanas móviles y relación local estimada por estación |
| [NASA FIRMS, detecciones activas](https://firms.modaps.eosdis.nasa.gov/active_fire/) | Datos de detección térmica | Sensor, confianza, duplicados, falsas detecciones y paso de preliminar a archivo |
| [NASA Earthdata, productos MOD13](https://search.earthdata.nasa.gov/search?q=mod13) | Familias de índices de vegetación con distintas resoluciones | Elegir colección y máscara de calidad; tratar nubes y cambios de sensor |
| [ESA WorldCover](https://esa-worldcover.org/en) | Productos de cobertura terrestre 2020 y 2021 | No asumir actualización anual 2026; distinguir clasificación de cambio real |
| [FAO AQUASTAT](https://www.fao.org/aquastat/en/) | Estadísticas y contexto sobre agua | Año efectivo, vacíos, estimación y representatividad; no asumir detalle por mina o municipio |

### Dos decisiones de fuente que cambian el diseño

**CHIRPS:** la página oficial comunica la transición a v3 y el fin de producción v2 después de diciembre de 2026. El primer adaptador debe ser versionado y diseñarse para v3. Sus productos diarios derivan de la distribución de acumulados pentadales; no deben presentarse como mediciones uniformes de estación por día. Guardar producto preliminar/final y procedimiento de desagregación. La página v3 combina lenguaje de dominio público y enlace a CC BY 4.0: registrar los términos exactos consultados y mantener atribución, sin extrapolar una etiqueta de licencia no revisada. [Documentación CHIRPS v3](https://www.chc.ucsb.edu/data/chirps3) y [aviso de transición](https://www.chc.ucsb.edu/data/chirps).

**Litio:** la rendición de YLB explica diferencias comerciales entre carbonato técnico y batería. Esa distinción exige dos especificaciones y un vínculo de descuento contractual sólo cuando exista evidencia. No usar una nota coyuntural como descuento constante para todos los años, compradores y grados. [YLB, rendición 2025](https://www.ylb.gob.bo/wp-content/uploads/2026/03/Informe_de_RPCF_2025_Publicado.pdf).

### Licencias y adquisición

Para cada adaptador conservar URL de términos, fecha de revisión, titular, permisos de descarga/almacenamiento/redistribución y uso permitido de derivados. La ausencia de pago no demuestra libre redistribución. Las series republicadas por FRED o FAO pueden remitir a condiciones del proveedor original. No se han confirmado en esta investigación derechos de redistribución de todas las series.

Crear cuatro estados de acceso: público descargable, público con registro, publicación documental, convenio/licencia pendiente. El precio de una licencia, la identidad de un contacto y una API no se estiman. Para contratos, primas, costos empresariales, TC/RC y transacciones inmobiliarias, registrar la necesidad de convenio o investigación específica; no llenar el vacío con una fuente institucional genérica. El URL del catálogo puede señalar contexto útil y el campo disponibilidad aclara cuando no es proveedor directo de la variable.

## 7. Contrato de datos y control de calidad

La implementación futura debe extender el catálogo sin romper los consumidores del módulo actual. Diseñar un registro de familias y un almacén de observaciones separados, con vistas compatibles para los precios existentes.

Campos adicionales mínimos por observación o serie:

- Identidad: ID de familia, ID estable de serie, producto, especie, grado, unidad física, moneda, calidad y etapa de cadena.
- Geografía: lugar de formación del precio, país reportante, contraparte, región de exposición y geometría versionada.
- Tiempo: inicio/fin del período, fecha de observación, publicación, primera disponibilidad, recuperación y revisión; año calendario y campaña separados.
- Naturaleza: precio, índice, flujo, stock, ratio, evento, exposición, escenario o resultado; observado, estimado, imputado, simulado.
- Procedencia: publicador original, redistribuidor, URL exacta del archivo/consulta, huella, ubicación de la cifra y licencia revisada.
- Transformación: fórmula, versión, parámetros, pesos, método de agregación y lista de insumos con sus versiones.
- Calidad: estado preliminar, cobertura, porcentaje faltante, confianza, bandera de anomalía y causa de revisión.
- Exogeneidad: resultado al que se refiere, hipótesis, horizonte, posible confusor, mediador y nivel de evidencia.

### Reglas por modalidad

| Modalidad | Validación necesaria |
|---|---|
| Materias primas | Moneda, unidad, calidad, mercado, base FOB/CIF/CFR, impuestos y estado nominal/real |
| Aduana | Valor positivo y masa válida; distinguir peso neto de unidades suplementarias; revisar HS, reexportación y cambios de mezcla |
| Producción y stocks | Flujos sumables versus existencias al cierre; no sumar reservas mensuales ni tratar capacidad como producción |
| Índices PPI | Preservar base y ajuste estacional; rebases con empalme documentado; no convertir puntos de índice a USD |
| Clima | Sistema de coordenadas, pesos de área, máscara válida, huso/ventana temporal, unidades y elevación |
| Detecciones satelitales | Evitar doble conteo de pases/sensores; conservar QA; no confundir NDVI con rendimiento ni foco con área quemada |
| Eventos sanitarios | Identificador único, ocurrencia, notificación, seguimiento, cierre y estado de confirmación |
| PDF y planilla | Fuente, página/hoja/celda, unidad, doble revisión de una muestra y conciliación de totales |
| Simulación | Separar escenario de histórico, publicar parámetros, rango y cobertura de componentes |

No interpolar datos anuales para presentarlos como observaciones mensuales. No arrastrar el último valor sin mostrar antigüedad. No tratar faltante como cero. No introducir la última versión revisada en una simulación histórica como si hubiera estado disponible en su fecha original. Un histórico reconstruido con datos definitivos sirve para ciertos análisis retrospectivos, pero no prueba desempeño operativo en tiempo real.

## 8. Fases, entregables y puertas de aceptación

Las duraciones son estimaciones de planificación para este bloque, sujetas al equipo y accesos del plan principal. No equivalen a compromisos de proveedores.

| Fase | Duración orientativa | Trabajo | Entregable verificable |
|---|---|---|---|
| 0. Auditoría | 1–2 semanas | Revisar benchmarks, roles, unidades, fuentes vigentes y límites del esquema | Inventario con cada serie existente marcada conservar/corregir/retirar y cada candidata con evidencia |
| 1. Primeras cadenas | 2–4 semanas | Soya/cereales, ración, diésel, metales, lluvia y resultados locales básicos | Seis fichas de decisión con datos trazables y gráfico de exposición |
| 2. Territorio y físicos | 3–5 semanas | Clima por cultivo/cuenca, sanidad, electricidad e hidrocarburos físicos | Mapas de cobertura, eventos deduplicados y medición de antigüedad |
| 3. Diversificación industrial | 4–6 semanas | Textil/cuero, química/farmacia, plástico/papel, metalmecánica, forestal y pesca | Canastas de costo documentadas y resultados por rama con vacíos visibles |
| 4. Contratos y nichos | 4–8 semanas según acceso | Litio por grado, TC/RC, primas, operación específica e inmobiliario | Convenios o fuentes verificadas; si faltan, permanece investigación sin serie ficticia |
| 5. Validación y operación | Transversal y 2–3 semanas de cierre | Backtest, sensibilidad, revisión de especialistas y documentación | Informe reproducible por caso de uso, métricas de calidad y plan de mantenimiento |

### Paquete inicial concreto

Comenzar por seis casos, no por cargar 104 familias simultáneamente:

1. **Costo de balanceado y proteína animal:** AG01, AG05, LV02, LV03, LV05 y LV08; distinguir pollo, huevo, cerdo y leche.
2. **Soya y campaña agrícola:** AG01–04, AG16, AG20–21 y CL01–04; comparar Santa Cruz por campaña con exposición previa.
3. **Factura y disponibilidad de refinados:** EN01–04 y EN08–09; separar benchmark, factura y despacho.
4. **Ingreso minero:** MI01–04, MI09–10; publicar cobertura de costos y no afirmar margen cuando falten cargos.
5. **Agua y electricidad:** EN11–14 y CL01–06; conservar operación horaria y vista mensual.
6. **Costo de obra:** CO01–05 y CO08; enlazar costo y permisos con horizonte distinto.

### Criterios propuestos para aceptar cada familia

- Identidad económica, fuente y unidad inequívocas; sin contradicción entre etiqueta, mercado y moneda.
- Evidencia del acceso real a por lo menos una serie representativa antes de prometer cobertura.
- Matriz de productos/territorios/años con faltantes y antigüedad; cobertura mínima definida por caso, no un porcentaje universal.
- Revisión de licencia y ruta de actualización documentadas.
- Transformación reproducible, controles de unidades y ejemplo calculado a mano.
- Resultado objetivo y rol causal explícitos; sin usar datos conocidos sólo después del período predicho.
- Validación por al menos un especialista de la cadena y revisión de datos independiente.
- Si el caso es pronóstico, evaluación fuera de muestra por origen temporal; si es costo, conciliación técnica; si es evento, auditoría de clasificación.

### Evaluación que aporta evidencia

Probar modelos estacionales simples contra modelos con grupos adicionales: precios, clima, stocks, sanidad, energía y acceso. Medir MAE/RMSE o pérdida apropiada, sesgo y cobertura de intervalos, por departamento y época crítica. Para eventos medir precisión, recuperación y anticipación con etiquetas verificadas. Para alertas elegir umbrales según costo de falsos positivos y omisiones, con validación prospectiva.

Usar validación temporal expansiva y dejar un período final sin tocar. Cuando haya varios territorios, evaluar transferencia a una región no usada para ajustar parámetros. No reportar cien modelos y elegir sólo el ganador. Examinar colinealidad y estabilidad: precio de petróleo, diésel y crack comparten información; lluvia, humedad de suelo y NDVI forman una cadena de mediación.

El éxito se mide por casos que ayudan a explicar o decidir, cobertura de mecanismos distintos y confiabilidad operacional. El conteo de variables sólo mide el tamaño del inventario.

## 9. Índice de las 104 familias

Los IDs de esta tabla remiten a la ficha completa del CSV. Los productos enumerados dentro de una familia se separan en series durante el mapeo; no se agregan por defecto.

### Agricultura (24)

| ID | Familia | Prioridad |
|---|---|---|
| PRD_AG01 | Precios del complejo soya | P0 |
| PRD_AG02 | Margen teórico de molienda | P1 |
| PRD_AG03 | Oferta competidora sudamericana | P0 |
| PRD_AG04 | Inventarios relativos globales | P0 |
| PRD_AG05 | Precios regionales de cereales | P0 |
| PRD_AG06 | Balance físico de campañas vecinas | P1 |
| PRD_AG07 | Demanda externa de quinua por destino | P1 |
| PRD_AG08 | Valor unitario competidor de quinua | P1 |
| PRD_AG09 | Referencias de café y cacao | P0 |
| PRD_AG10 | Oferta mundial de tropicales | P1 |
| PRD_AG11 | Prima de calidad y certificación | P2 |
| PRD_AG12 | Precio mundial de azúcar | P0 |
| PRD_AG13 | Competencia azúcar-etanol | P1 |
| PRD_AG14 | Demanda vecina de fruta fresca | P1 |
| PRD_AG15 | Abastecimiento y precio mayorista perecedero | P0 |
| PRD_AG16 | Fertilizantes por nutriente | P0 |
| PRD_AG17 | Agroquímicos importados | P1 |
| PRD_AG18 | Disponibilidad de semillas | P1 |
| PRD_AG19 | Maquinaria agrícola importada | P1 |
| PRD_AG20 | Área sembrada por campaña | P0 |
| PRD_AG21 | Producción y rendimiento observados | P0 |
| PRD_AG22 | Exposición de cultivos al riego | P1 |
| PRD_AG23 | Presión fitosanitaria regional | P2 |
| PRD_AG24 | Margen agrícola estandarizado por cadena | P1 |

### Pecuario (10)

| ID | Familia | Prioridad |
|---|---|---|
| PRD_LV01 | Precio exportador competidor bovino | P0 |
| PRD_LV02 | Costo de ración por especie | P0 |
| PRD_LV03 | Brotes regionales de influenza aviar | P0 |
| PRD_LV04 | Brotes de enfermedades ganaderas | P1 |
| PRD_LV05 | Referencias internacionales de lácteos | P0 |
| PRD_LV06 | Genética y material reproductivo importado | P1 |
| PRD_LV07 | Existencias y estructura del hato | P0 |
| PRD_LV08 | Faena leche huevos y productos apícolas | P0 |
| PRD_LV09 | Mercado de fibras de camélidos y lana | P2 |
| PRD_LV10 | Estrés térmico y forrajero | P0 |

### Forestal y pesca (6)

| ID | Familia | Prioridad |
|---|---|---|
| PRD_FO01 | Precios de madera tropical por especie | P1 |
| PRD_FO02 | Demanda y competencia de castaña | P1 |
| PRD_FO03 | Oferta forestal legal y extracción | P1 |
| PRD_FO04 | Precio de insumos acuícolas | P1 |
| PRD_FO05 | Oferta pesquera competidora | P1 |
| PRD_FO06 | Producción acuícola y pesquera local | P1 |

### Energía (14)

| ID | Familia | Prioridad |
|---|---|---|
| PRD_EN01 | Curva de precios de crudo de referencia | P0 |
| PRD_EN02 | Precios de diésel gasolina jet y GLP | P0 |
| PRD_EN03 | Diferencial de refinación por producto | P0 |
| PRD_EN04 | Inventarios y uso de refinerías externos | P1 |
| PRD_EN05 | Referencias de gas y GNL por mercado | P0 |
| PRD_EN06 | Precio efectivo de gas exportado | P0 |
| PRD_EN07 | Exposición contractual de gas | P1 |
| PRD_EN08 | Valor unitario y volumen de combustibles importados | P0 |
| PRD_EN09 | Despachos y ventas locales de combustibles | P0 |
| PRD_EN10 | Producción gas líquidos y declinación | P0 |
| PRD_EN11 | Aportes y reservas hidroeléctricas | P0 |
| PRD_EN12 | Indisponibilidad y reserva eléctrica | P0 |
| PRD_EN13 | Generación demanda y costo marginal | P0 |
| PRD_EN14 | Recurso solar eólico y potencial técnico | P1 |

### Minería (12)

| ID | Familia | Prioridad |
|---|---|---|
| PRD_MI01 | Metales base de exportación | P0 |
| PRD_MI02 | Metales preciosos | P0 |
| PRD_MI03 | Precio de mineral de hierro y acero competidor | P0 |
| PRD_MI04 | Descuento y liquidación de concentrados | P1 |
| PRD_MI05 | Oferta y referencias de minerales críticos | P1 |
| PRD_MI06 | Precio de litio por compuesto y grado | P1 |
| PRD_MI07 | Oferta competidora y demanda de litio | P1 |
| PRD_MI08 | Producción venta y utilización YLB | P1 |
| PRD_MI09 | Costo de reactivos y consumibles mineros | P1 |
| PRD_MI10 | Volumen ley y recuperación minera | P0 |
| PRD_MI11 | Exposición hídrica y energética minera | P1 |
| PRD_MI12 | Concentración de compradores y fundiciones | P1 |

### Manufactura (17)

| ID | Familia | Prioridad |
|---|---|---|
| PRD_MA01 | Canasta de materias primas de alimentos | P0 |
| PRD_MA02 | Costo de insumos de bebidas | P1 |
| PRD_MA03 | Fibras textiles internacionales | P1 |
| PRD_MA04 | Competencia externa de prendas y telas | P1 |
| PRD_MA05 | Pieles cuero curtido y calzado | P1 |
| PRD_MA06 | Químicos básicos e intermedios | P1 |
| PRD_MA07 | Insumos farmacéuticos importados | P1 |
| PRD_MA08 | Concentración y dependencia de proveedores | P1 |
| PRD_MA09 | Resinas y elastómeros | P0 |
| PRD_MA10 | Celulosa papel y cartón | P1 |
| PRD_MA11 | Metales transformados y semielaborados | P0 |
| PRD_MA12 | Precio y disponibilidad de bienes de capital | P1 |
| PRD_MA13 | Equipos eléctricos y electrónicos industriales | P1 |
| PRD_MA14 | Competitividad exportadora de fertilizantes | P1 |
| PRD_MA15 | Insumos y balance de biocombustibles | P1 |
| PRD_MA16 | Volumen industrial por rama | P0 |
| PRD_MA17 | Intensidad de insumos importados | P1 |

### Construcción e inmobiliario (8)

| ID | Familia | Prioridad |
|---|---|---|
| PRD_CO01 | Canasta externa de materiales | P0 |
| PRD_CO02 | Índice local de costo de construcción | P0 |
| PRD_CO03 | Producción ventas y consumo aparente | P0 |
| PRD_CO04 | Permisos y superficie autorizada | P0 |
| PRD_CO05 | Días técnicamente adversos para obra | P1 |
| PRD_CO06 | Oferta nueva y absorción observada | P2 |
| PRD_CO07 | Precios y alquileres de inmueble homogéneo | P2 |
| PRD_CO08 | Maquinaria y equipo de construcción importado | P1 |

### Clima, agua y biodiversidad (13)

| ID | Familia | Prioridad |
|---|---|---|
| PRD_CL01 | Precipitación y anomalía territorial | P0 |
| PRD_CL02 | Sequía multiescala y rachas secas | P0 |
| PRD_CL03 | Extremos térmicos agrícolas | P0 |
| PRD_CL04 | Humedad de suelo por estrato | P0 |
| PRD_CL05 | Demanda evaporativa y balance hídrico | P1 |
| PRD_CL06 | Estado y evolución de ENSO | P0 |
| PRD_CL07 | Detecciones térmicas y exposición al fuego | P0 |
| PRD_CL08 | Anomalía de vegetación y fenología | P0 |
| PRD_CL09 | Recursos extracción y presión hídrica | P1 |
| PRD_CL10 | Exceso de lluvia y superficie inundable | P1 |
| PRD_CL11 | Cobertura y fragmentación de hábitat | P1 |
| PRD_CL12 | Dependencia productiva de servicios ecosistémicos | P2 |
| PRD_CL13 | Exposición simultánea a shocks físicos | P1 |
