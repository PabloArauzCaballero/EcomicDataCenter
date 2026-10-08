# Anexo de servicios territorio y condiciones de transmisión

Fecha de revisión: 4 de octubre de 2026. Alcance: propuesta de investigación y planificación para Bolivia; no modifica colectores, base de datos ni interfaz del producto.

## 1. Resultado y criterio económico

Se proponen **95 familias de indicadores**, repartidas en **13 ámbitos**, con definición, unidad, frecuencia, geografía, canal, rezago de hipótesis, fuente, prioridad, rol y disponibilidad en [catalogo_servicios.csv](catalogo_servicios.csv). Una familia puede abrirse por ciudad, país de origen, corredor o rubro; esas aperturas no se contabilizan como indicadores independientes para inflar la diversidad.

La propuesta distingue **6 drivers externos**, **7 candidatos externos condicionados**, **29 exposiciones**, **21 mecanismos de transmisión**, **25 resultados locales**, **5 eventos locales potencialmente endógenos** y **2 variables de política local**. Hay **47 P0**, **28 P1** y **20 P2**, armonizados con el esquema del plan maestro. **P0 significa primera evaluación prioritaria**, por utilidad y accesibilidad inicial: no garantiza disponibilidad, cobertura completa ni colector funcionando. P1 identifica segunda evaluación e integración condicionada; P2 identifica investigación de brechas, convenios y desarrollo posterior.

El sector servicios necesita un sistema de explicación económica, no solamente otra lista de precios. Un cierre de puerto causado por marejada, una epidemia en un país vecino o un aumento del precio externo de nube pueden ser shocks externos respecto a una empresa boliviana. Las llegadas hoteleras, la venta de un comercio, el pago QR, el abandono escolar y el volumen importado son resultados o mecanismos locales. La decisión pública de restringir movilidad puede responder al mismo shock que se intenta estimar. Todo rol debe documentarse respecto a una variable objetivo y un horizonte.

Los factores macrofinancieros, cambiarios, climáticos, energéticos y de materias primas del plan general alimentan estos modelos mediante referencias a sus identificadores canónicos. No crear una copia de diésel para transporte, otra para turismo y otra para comercio: una sola serie fuente, varias exposiciones sectoriales y canales diferentes.

## 2. Hallazgos concretos del repositorio

Revisados en modo lectura:

- `EcomicDataCenter/scripts/exogenous/exogenous-spec.ts`: siete grupos, cinco ámbitos, tipo PRICE/INDEX y orígenes Banco Mundial, FRED, FAO y Freightos.
- `EcomicDataCenter/scripts/exogenous/exogenous-freight.ts`: conserva publicaciones semanales observadas de Freightos; no permite inferir una historia anterior completa.
- `observatorio-dashboard/src/lib/exogenous-board.ts`: admite frecuencia mensual/anual y gráficos de nivel, base visible e interanual.
- `observatorio-dashboard/src/lib/exogenous.ts`: lee `read_models.exogenous_price` y añade flete implícito.
- `observatorio-dashboard/src/lib/exogenous-freight.ts`: calcula transporte y seguro mediante CIF menos FOB sobre peso; la mezcla de importaciones cambia el indicador.

Consecuencia de diseño: cantidades, personas, horas, porcentajes, probabilidades, eventos, stocks censales, datos semanales e indicadores territoriales no caben semánticamente en una tabla llamada precio ni en una interfaz que aplica automáticamente interanual a cualquier valor.

Proponer una entidad general de indicador con `measure_type`, `economic_role`, `frequency`, `time_support`, `geography`, `source_status`, `published_at`, `available_at`, `revision`, `coverage` y `aggregation_rule`. Mantener adaptador para las series de precios existentes. Es una decisión para implementación posterior, no un cambio realizado.

## 3. Mesa de comercio mayorista, minorista y comercio electrónico

**Rubros:** alimentos y bebidas; farmacia y cuidado personal; ropa y calzado; electrodomésticos; vehículos y repuestos; ferretería; suministros de oficina; distribuidores mayoristas; mercados populares; ventas digitales y última milla.

**Decisiones:** anticipar costo de reposición, redimensionar inventario, evaluar proveedores alternativos, estimar riesgo de quiebre y separar caída de unidades de inflación nominal.

**Cadena analítica:** precio del proveedor externo + divisa efectivamente accesible + transporte + tiempo de reposición → costo puesto en almacén → stock → disponibilidad y margen → ventas. El valor unitario aduanero recoge composición, calidad, proveedor y condiciones de compra: sirve como transmisión y requiere una cesta homogénea, no es una cotización externa pura.

**Familias:** ST_001–ST_009. Para bienes durables, separar compra de reposición y crédito; para alimentos, vida útil y estacionalidad; para farmacia, dosis/presentación; para autopartes, compatibilidad del parque. Una simple deflación por IPC general no resuelve cambios de calidad.

**Geografía:** La Paz–El Alto, Santa Cruz, Cochabamba y ciudades intermedias; mercados de frontera Desaguadero, Yacuiba, Villazón, Bermejo, Puerto Quijarro y Cobija como unidades de observación propuestas, sujetas a cobertura real.

**Fuente y límites:** el [anuario de comercio exterior del INE](https://anuario.ine.gob.bo/2024/paginas/cap05.html) permite localizar estadísticas por aduana; [SEPREC](https://www.seprec.gob.bo/index.php/datos/) publica base y movimientos formales. El [informe de pagos del BCB consultado](https://www.bcb.gob.bo/webdocs/publicacionesbcb/2023/04/35/SISTEMA%20DE%20PAGOS%202022.pdf) muestra que QR sirve para múltiples transferencias y pagos: no equivale a ventas de comercio electrónico. Su edición histórica no demuestra cobertura actual.

**Brecha prioritaria:** stock, ventas por canal, entregas fallidas, costo de última milla y tiempo real puerta a puerta requieren un panel voluntario de empresas. No vender una API comercial hipotética como si existiera. Separar formal/informal; no extrapolar el primero a toda la economía sin un diseño muestral.

## 4. Mesa de transporte y logística multimodal

**Rubros:** camiones, buses, transporte urbano, taxis, carga ferroviaria, aviación de pasajeros, carga aérea, navegación fluvial, almacenes, cadena de frío, transitarios, despachantes y servicios portuarios.

**Decisiones:** elección de ruta, buffers de inventario, costo por entrega, asignación de flota, riesgo de cancelación y costo de exportar.

**Familias:** ST_010–ST_025. El tablero debe mostrar por separado costo, capacidad, volumen y confiabilidad. Caer toneladas no demuestra restricción de oferta: puede caer la demanda. Subir costo por tonelada no demuestra subir tarifa: puede cambiar la carga o su densidad.

**Corredores de estudio:**

| Corredor propuesto | Nodos que deben relacionarse | Shock y mecanismo |
|---|---|---|
| Pacífico norte | La Paz/El Alto–Tambo Quemado–Arica | Marejada, cierre portuario, espera y desvío |
| Pacífico alternativo | Oruro–Pisiga–Iquique | Restricción fronteriza y sustitución de puerto |
| Perú | La Paz–Desaguadero–puertos peruanos | Estado de vía, frontera y disponibilidad del tramo marítimo |
| Brasil | Santa Cruz–Puerto Suárez/Puerto Quijarro–Corumbá | Conectividad terrestre, cruce y abastecimiento |
| Hidrovía | Puerto Quijarro/Tamengo–Paraguay–Paraná | Bajante, calado, convoy y costo por tonelada |
| Argentina | Tarija/Yacuiba y Potosí/Villazón | Frontera, oferta de transporte y demanda bilateral |
| Amazonía | Beni/Pando–rutas fluviales y terrestres | Crecida, aislamiento estacional y abastecimiento |
| Aéreo | Viru Viru, El Alto y Cochabamba–hubs extranjeros | Asientos, cancelaciones y costo externo de combustible |

No afirmar que cada ruta tenga hoy una tarifa abierta. La matriz debe indicar cobertura y servicios realmente operativos al momento de incorporar datos.

El [INE publica cuadros de transporte](https://www.ine.gob.bo/index.php/estadisticas-economicas/transportes/cuadros-estadisticos-t/) que sirven como resultados de actividad. Su [descripción metodológica](https://anda.ine.gob.bo/index.php/catalog/178) diferencia redes y modalidades; no representa un censo diario de cualquier viaje.

La [consulta ABC observada](https://transitabilidad.abc.gob.bo/captcha-form) requiere CAPTCHA. Debe negociarse acceso, conseguir reportes públicos descargables o efectuar captura manual autorizada. No eludir controles ni asumir API abierta. Distinguir bloqueos sociales endógenos de daños meteorológicos; ambos requieren hora, duración y causa verificada.

El [puerto de Arica](https://puertoarica.cl/estadisticas-transferencia-de-carga) publica carga y algunos indicadores de eficiencia. Un [comunicado oficial de 2026](https://puertoarica.cl/novedad/puerto-de-arica-crece-6-en-transferencia-de-carga-en-primer-semestre) documenta cierres por marejadas; es evidencia de la variable, no de una serie diaria descargable. La carga boliviana movilizada sigue siendo resultado local compartido con el puerto.

El [INA](https://alerta.ina.gob.ar/a5/diario/reporte_diario) ofrece niveles por estación. Una altura en territorio argentino no es el calado operativo de Tamengo. Para obtener capacidad de convoy hace falta relación física validada, restricciones oficiales y datos de embarcación. No convertir metros a toneladas mediante un coeficiente arbitrario.

**Indicador compuesto propuesto:** exposición logística = suma de participación histórica por corredor × intensidad del evento × duración. Las participaciones se fijan antes del shock. Publicar componentes, cobertura y alternativa sin agregación.

## 5. Mesa de turismo, alojamiento, gastronomía y eventos

**Rubros:** turismo receptivo e interno, operadores, guías, hoteles/hostales, turismo comunitario, restaurantes, gastronomía de mercado, negocios, congresos y eventos.

**Familias:** ST_026–ST_034. Segmentos de estudio: Uyuni, La Paz, Titicaca, Sucre/Potosí, Rurrenabaque/Madidi, circuitos amazónicos y Chiquitanía; la presencia en la propuesta no implica representatividad estadística actual.

**Decisiones:** estacionalidad de demanda, reservas, duración de estancia, ajuste de compras, precio de habitación y riesgo de cancelación. Separar turista, visitante del día, viajero, residente y nacionalidad.

El [INE publica ingresos a hospedaje, oferta y tarifas](https://www.ine.gob.bo/index.php/estadisticas-economicas/turismo/estadisticas-hoteleras-cuadros-estadisticos/). La [ficha hotelera](https://anda.ine.gob.bo/index.php/catalog/149) describe variables de noches y capacidad; localizar el cuadro efectivo antes de prometer ocupación mensual. La tarifa publicada no es automáticamente ADR; ingresos divididos por habitaciones disponibles no pueden calcularse sin denominadores y cobertura compatibles.

**Drivers externos que el modelo debe conectar:** ingreso y empleo de países emisores, tipo de cambio relativo, vuelos desde hubs, alertas de viaje, feriados emisores, clima del destino, combustible internacional y alimentos. No contar todos estos drivers otra vez si existen en catálogos macro/clima/agro.

**Diseño de modelo:** visitas por país emisor × destino; incluir calendario, estacionalidad y accesibilidad. Un aumento de visitantes por frontera puede ser tránsito comercial, no auge hotelero. Para gastronomía, separar demanda turística de clientes residentes y ponderar canasta de insumos por receta, no por canasta alimentaria nacional.

**Brecha:** reservas futuras, cancelaciones, gasto por visitante y alojamientos no registrados. Panel consentido de operadores por destino con definición constante y publicación agregada. Fuentes antiguas de gasto turístico no deben presentarse como gasto actual.

## 6. Mesa de telecomunicaciones, tecnología y servicios digitales

**Rubros:** conectividad fija/móvil, operadores, centros de datos, software, nube, servicios tecnológicos exportados, plataformas digitales, comercio electrónico y seguridad operativa.

**Familias:** ST_035–ST_043. El costo internacional de cómputo se mueve distinto del costo de una conexión doméstica. Añadir una cesta estable por región de nube, cómputo, almacenamiento, transferencia de datos, licencia y condiciones de uso; registrar cambios de producto.

Los [boletines ATT](https://www.att.gob.bo/situacion-de-las-telecomunicaciones-en-bolivia) permiten iniciar con infraestructura/conexiones; no transformar conexiones en usuarios únicos. La [metodología ITU](https://datahub.itu.int/about/) documenta cestas comparables de conectividad: las tarifas son cargos mensuales observados en una recolección anual, no una serie mensual de precios efectivamente cobrados. El [INE TIC](https://www.ine.gob.bo/index.php/encuesta-de-hogares-tics/) permite estudiar acceso y señala actualización de factores de expansión: guardar versión histórica.

**Riesgos externos:** corte de enlace fuera de Bolivia, indisponibilidad del proveedor global, restricción de suministro de equipos y repricing de licencia en divisa. **Riesgos locales:** infraestructura eléctrica, mora, ciberincidentes y capacidad operativa. Registrar región afectada y usuarios expuestos; un aviso global no demuestra interrupción en Bolivia.

**Brechas:** servicios digitales exportados, trabajo remoto, comisión de plataforma, nube y continuidad. El catálogo coloca enlaces institucionales como punto de investigación y dice expresamente cuando no publican esa variable. Requiere identificar proveedor primario y derechos de reutilización antes de activar series.

## 7. Mesa de salud y riesgo epidemiológico

**Rubros:** prestadores públicos/privados, farmacias, laboratorios, distribución de medicamentos, seguros asistenciales, prevención y servicios de cuidado.

**Familias:** ST_044–ST_051. La finalidad es medir presión económica, continuidad y exposición, no emitir diagnóstico clínico.

Separar incidencia en vecinos —candidato externo— de casos locales —resultado— y de capacidad hospitalaria —exposición—. La vigilancia responde a disponibilidad de pruebas, reporte y estacionalidad; incorporar volumen de pruebas cuando exista. Usar fecha de síntomas, notificación y publicación como campos distintos.

[OPS dengue](https://opendata.paho.org/en/dengue-indicators) y [tableros regionales](https://www.paho.org/en/health-emergencies/dashboards) ofrecen puntos primarios para seguimiento regional. Los [boletines semanales del Ministerio](https://www.minsalud.gob.bo/component/jdownloads/category/71-boletines-epidemiologicos-semanal?Itemid=465) permiten construir un registro local revisable. [SNIS](https://snis.minsalud.gob.bo/snis) aporta infraestructura institucional; la existencia de un establecimiento no garantiza camas operativas.

**Modelo propuesto:** presión externa ponderada por movilidad histórica + clima + susceptibilidad territorial → casos locales y ausentismo → atención, compras y continuidad productiva. La plausibilidad del canal no identifica causalidad por sí sola.

**Compras sanitarias:** medir procesos desiertos, plazos y dependencia de origen; separar principio activo, dosis y presentación. HS farmacéutico amplio no permite comparar precio de tratamiento. Inventario hospitalario no se observa en una adjudicación.

**Protección estadística:** publicación agregada por territorio suficientemente poblado, sin nombres de pacientes. No reconstruir personas desde eventos geográficos escasos.

## 8. Mesa de educación, capital humano y cuidados

**Rubros:** educación inicial, escolar, técnica, superior, formación continua, educación especial, guarderías y servicios de apoyo.

**Familias educativas:** ST_052–ST_057; hogares y cuidados ST_072–ST_078. El [SEIE](https://seie.minedu.gob.bo/reportes/) ofrece indicadores educativos; la [pantalla de oferta](https://seie.minedu.gob.bo/reportes/indicadores/grupo2/b12) permite comprobar niveles de desagregación y descarga. La matrícula y el abandono son resultados, no shocks externos.

**Decisiones:** ubicación de plazas, demanda por cohorte, transporte escolar, necesidades de conectividad, compras de material y presión de cuidados. Distinguir años académicos y calendario civil. Ni un pico de inscripciones ni una base ampliada prueban mejora de aprendizaje.

**Drivers y exposiciones:** cohorte preexistente, movilidad de hogares, interrupción por clima/salud, costo externo de papel/equipo y recursos fiscales del catálogo macro. Los cierres preventivos son respuesta de política y no instrumentos causales automáticos.

**Cuidados:** medir niños, mayores, personas dependientes, disponibilidad de cuidado formal y carga horaria por sexo y situación laboral. El [material localizado de uso del tiempo](https://anda.ine.gob.bo/index.php/catalog/60/related-materials) corresponde a una prueba piloto de 2019; no se presenta como encuesta nacional continua ni como estimación actual. Se requiere localizar operación representativa posterior o diseñar levantamiento.

**Vacío profesional:** formación técnica/superior, graduados por especialidad, vacantes, movilidad internacional de profesionales y aprendizaje necesitan fuentes específicas adicionales. No sustituir calidad educativa por número de edificios.

## 9. Mesa de servicios profesionales, creativos, recreativos y deporte

**Rubros:** contabilidad, auditoría, legal, consultoría, ingeniería, arquitectura, publicidad, investigación, selección de personal, soporte empresarial, limpieza, seguridad, artes, producción audiovisual, música, diseño, deporte y recreación.

**Cobertura complementaria sin duplicar familias:** los servicios administrativos y de apoyo incluyen alquiler de equipo, agencias de empleo, centros de atención, organización empresarial, limpieza y seguridad; comparten ST_058–ST_060 y sus exposiciones a clientes y compras. Otros servicios incluyen reparación de computadoras y efectos personales, peluquería y cuidado personal, lavandería, servicios funerarios y organizaciones asociativas: reutilizan costos importados, demografía, continuidad urbana y capacidad formal, con necesidad de encuestas para el segmento informal. Las actividades de los hogares como empleadores y la producción para uso propio se vinculan a ST_072–ST_078; conservar su frontera con cuidado no remunerado.

**Organismos extraterritoriales y cooperación internacional:** incluir organismos internacionales, representación diplomática y proyectos de cooperación como bloque de demanda de servicios, empleo, compras y alquileres. Drivers candidatos: presupuestos de donantes, programación de desembolsos y calendario de proyectos; mecanismos: contratación local, demanda de servicios profesionales y flujos de visitantes. Reutilizar ST_058–ST_060 y ST_065–ST_071 solo cuando el mecanismo y universo apliquen: SICOES no representa todo el gasto de organismos internacionales. Sus compras, desembolsos y dotación requieren portales primarios de cada organismo y auditoría específica, aún sin fuente homogénea verificada. No clasificar por nacionalidad del trabajador ni tratar automáticamente toda cooperación como shock exógeno.

**Familias:** ST_058–ST_064. Las aperturas por rubro deben seguir una correspondencia versionada con clasificación de actividad. Un registro puede englobar varias actividades efectivas.

**Mecanismo central profesional:** shock del cliente minero/agroindustrial/constructor/financiero/estatal → gasto contratado → carga de trabajo profesional. Construir exposición a clientes; no asumir que una empresa registrada con actividad ingeniería trabaja exclusivamente para construcción.

[SEPREC](https://www.seprec.gob.bo/index.php/datos/) permite iniciar con oferta formal y movimientos. [SICOES](https://www.sicoes.gob.bo/contrat/procesos.php) permite explorar demanda pública. Ninguna de estas fuentes identifica por sí sola facturación efectiva, productividad de autónomos o informalidad.

**Creativa:** registrar calendario, aforo, costos de equipo, dependencia de plataforma y cobros del exterior. Interacciones con turismo: ferias, festivales y deporte pueden mover hoteles y transporte, pero una programación puede responder a demanda esperada. Documentar cancelación y cambio de fecha.

**Brechas:** ingresos por plataformas/derechos, asistencia y venta de entradas, horas de trabajo independiente, producción creativa informal y compradores B2B. Se propone convenio estadístico y panel de empresas/organizadores; no scraping de información privada ni atribuir datos individuales públicamente.

## 10. Mesa de administración pública y compras

**Familias:** ST_065–ST_071. Separar anuncio, convocatoria, adjudicación, contrato, recepción, devengado y pago; son etapas del mismo proceso y no se suman.

**Decisiones:** cartera de oportunidades, incertidumbre de demanda, competencia de proveedores, desiertos, demora y liquidez empresarial. SICOES es un portal público consultable; la búsqueda realizada no verifica una API abierta, licencia de redistribución masiva ni universo descargable completo.

**Modelo de datos de procesos:** identificador persistente, entidad, modalidad, objeto, clasificación del bien/servicio, moneda, monto por etapa, fecha, versión, estado y adjudicatario normalizado. Desagregar por entidad compradora y lugar de entrega; domicilio del proveedor no es destino del gasto.

**Calidad:** deduplicar relanzamientos, conservar correcciones, no usar procesos abiertos como adjudicaciones cero, calcular duración con censura y cohortes comparables. HHI de proveedores mide concentración observada, no corrupción. Proceso desierto no demuestra escasez: puede reflejar especificaciones, presupuesto o litigio.

**Principal brecha:** mora de pagos. Una fecha de contrato no identifica pago real. Hace falta enlace con ejecución presupuestaria/tesorería y reglas de exigibilidad. Catalogarla como necesidad pendiente mantiene visible un mecanismo muy relevante sin fabricar su serie.

## 11. Mesa de agua, saneamiento, residuos y continuidad urbana

**Familias:** ST_079–ST_085. [AAPS](https://www.aaps.gob.bo/wordpress/index.php/indicadores-de-desempeno/) publica informes de desempeño y documentos de PTAR. Auditar cada edición para homologar EPSA, perímetro, indicador y año. El área prestada puede atravesar municipios o cubrir solo parte de ellos.

**Decisiones:** riesgo de racionamiento, capacidad de hotel/restaurante/hospital, inversión de respaldo, continuidad industrial y presión presupuestaria. Conectar clima/caudal/embalse externos con continuidad de agua y luego resultado económico. No llamar exógena a la mala cobranza de una EPSA.

El [INE publica residuos recolectados](https://www.ine.gob.bo/index.php/medio-ambiente/residuos-solidos-cuadros-estadisticos/). Menor recolección puede significar menor actividad, huelga, cambio de cobertura o problema operativo. Recolección no equivale a generación ni reciclaje. Añadir calendario, cobertura de ciudad y cambio de operador.

**Brechas:** stock de residuos no recogidos, cierres de relleno, recuperación de materiales, tarifas efectivas, agua industrial y calidad puntual. No derivar estos conceptos desde toneladas recolectadas sin datos adicionales.

## 12. Mesa de territorio, demografía, migración y riesgo social

**Familias:** ST_086–ST_095. El [Censo 2024](https://cpv2024.ine.gob.bo/) es ancla territorial; sus límites se presentan con finalidad geoestadística. Las [tablas de migración interna](https://www.ine.gob.bo/index.php/estadisticas-sociales/migracion-interna/) incluyen ventanas retrospectivas y grupos de edad. No repartir automáticamente un saldo quinquenal en cinco flujos anuales.

**Capas propuestas:** país → departamento → municipio/TIOC → aglomeración → localidad, junto a cuenca, corredor, área de servicio y frontera. Estas geometrías se solapan; una suma entre ellas duplica personas. Registrar correspondencia y versión territorial.

**Decisiones:** tamaño de mercado, oferta laboral, demanda de vivienda/educación/salud, accesibilidad y sensibilidad diferencial a shocks nacionales. Distinguir nacimiento, residencia previa, residencia habitual y cruce fronterizo.

**Exposición de frontera:** pesos históricos de comercio, viajeros y vínculos migratorios por vecino. Los cinco vecinos deben aparecer, aunque Paraguay se manifieste especialmente por la hidrovía y no por una simple matriz de aduanas terrestres.

**Riesgo social:** eventos de acceso a servicios con causa, comienzo, final, territorio, grado de corroboración y población potencialmente afectada. Un conteo de noticias no mide intensidad real. Bloqueos pueden responder a inflación, desempleo y conflictos sectoriales: estimación conjunta o lectura descriptiva.

**Brechas:** población flotante, desplazamiento reciente, tiempos reales de acceso, asentamientos de rápida expansión y vínculos entre origen/destino. Usar rangos y escenarios donde no haya medida observada.

## 13. Casos cruzados que justifican la diversidad

1. **Marejada en Arica:** horas de cierre externas → espera de carga según corredor → reposición comercial → stock → precio local. Controlar cambio de puerto y mezcla de bienes. Resultado evaluable: tiempo y costo de reposición por cesta.
2. **Bajante de hidrovía:** nivel por estación → restricción de calado verificada → capacidad por convoy → costo de grano/mineral → margen exportador. No usar solo tonelaje exportado como shock.
3. **Brote en vecino:** intensidad externa × conectividad rezagada → presión local → ausentismo → ventas/servicios y compras sanitarias. Registrar diferencias de vigilancia y fase de publicación.
4. **Depreciación de país emisor:** precio relativo de destino → reservas y llegadas → noches → restaurantes/transporte. Incorporar ingreso del emisor, calendario y asientos.
5. **Interrupción vial prolongada:** acceso a medicamentos/alimentos → disponibilidad → continuidad de escuela/hospital → carga de cuidados y oferta laboral. Un solo evento puede afectar varios sectores sin contarse como eventos independientes.
6. **Repricing de nube o licencia:** costo externo en USD → costo efectivo en moneda local → margen de proveedor TI → precio contractual y contratación de personal. Mantener fija especificación del servicio.
7. **Demora estatal:** proceso/recepción/pago → liquidez del proveedor → cumplimiento, empleo y cierre. Hace falta evidencia de pago; la adjudicación sola no permite inferir mora.
8. **Racionamiento de agua:** condición hídrica externa + fragilidad EPSA → horas de servicio → costo de respaldo en hotel/restaurante/hospital → capacidad y tarifas. No sumar porcentajes de cobertura y continuidad.
9. **Migración hacia ciudad intermedia:** población y estructura por edad → demanda escolar/vivienda/comercio → congestión de servicios. Tratar migración como respuesta económica cuando corresponda.
10. **Festival y cierre de acceso:** calendario planificado × shock de accesibilidad → cancelaciones y ocupación → ingreso de artistas/restaurantes/transporte. Distinguir turismo incremental de sustitución de otras fechas.

Los rezagos del CSV son **hipótesis de trabajo** para ventanas de prueba, no elasticidades estimadas ni promesas predictivas.

## 14. Secuencia ejecutable de investigación

### Primera ola: fuentes localizadas y diccionario

- Inventariar cuadros exactos de INE transporte/hotel/residuos/comercio, ATT, SEPREC, SEIE, AAPS, Censo y OPS.
- Para cada variable P0, registrar enlace de descarga, cobertura real, primera/última observación, retraso, formato, revisiones, permiso de reutilización y esfuerzo de extracción.
- Tomar una muestra de tres períodos y dos geografías, verificar contra publicación y documentar cambios de clasificación/base.
- Cargar resultados locales y exposiciones en componentes diferenciados de shocks externos.
- Entregable: diccionario validado, inventario de fuentes y primer panel que muestre estado de cobertura.

### Segunda ola: eventos y rutas

- Obtener acceso autorizado o archivo público de ABC; incorporar cierres portuarios con fuente primaria.
- Seleccionar estaciones de hidrovía con un especialista operativo y relación verificable con rutas de Bolivia.
- Construir entidades de proceso SICOES y evento de interrupción con versionado.
- Registrar calendario emisor y eventos de destino desde publicadores oficiales.
- Entregable: mapa de exposición y líneas de tiempo, sin interpolación ficticia.

### Tercera ola: brechas de mercado y servicios

- Diseñar paneles voluntarios para comercio/inventarios, turismo/reservas, profesionales/clientes, cuidado/plazas y continuidad de prestadores.
- Solicitar información agregada de pagos reales públicos, logística puerta a puerta y capacidad sanitaria operativa.
- Revisar costos/licencias de asientos programados, precios de nube y estadísticas privadas.
- Entregable: contratos de datos o decisión explícita de no disponibilidad, con proxies identificados como tales.

### Cuarta ola: evaluación analítica

- Elegir objetivos concretos por sector y construir modelos simples de referencia con estacionalidad y tendencia.
- Añadir bloques externos uno por uno; usar cortes temporales y fechas efectivas de disponibilidad.
- Evaluar mejora fuera de muestra, estabilidad por régimen y aporte sobre el modelo base.
- No promover una correlación a causalidad. Si la pregunta exige efecto causal, explicitar estrategia de identificación, supuestos y pruebas de sensibilidad.
- Publicar resultado negativo cuando la variable no agrega señal; conservarla como contexto si tiene valor descriptivo.

## 15. Controles mínimos y condiciones de publicación

| Riesgo | Control exigido |
|---|---|
| Información futura | Usar vintage disponible al momento de la predicción |
| Mezcla de base | Conservar base 1990, referencia 2017 y series revisadas como versiones distintas |
| Stock versus flujo | Censo/empresas vigentes/camas no se suman en el tiempo |
| Semana epidemiológica | Definir calendario y regla de agregación mensual; conservar fecha original |
| Fuente intermitente | Mostrar cobertura, demora y nulos; nunca rellenar silencio con cero |
| PDF variable | Validar cabecera, unidad y total; cuarentena si cambia estructura |
| Geografía incompatible | Tabla de correspondencia versionada; no identificar EPSA con municipio |
| Datos nominales | Separar moneda, deflactor y efecto cambiario de cantidades |
| Muestra comercial | Publicar cobertura y composición; evitar extrapolación nacional no sustentada |
| Proxy distante | Mostrar etiqueta proxy, distancia conceptual y pregunta que sí puede responder |
| Clasificación causal | Revisar rol por objetivo; evento extranjero no garantiza exogeneidad |
| Doble conteo | Identificador único por fuente y evento, múltiples vínculos sectoriales |
| Acumulados | Diferenciar acumulado de flujo del período; derivar incrementos solo con igual vintage |
| Ratio inestable | Validar denominador positivo, coherencia temporal y tamaños mínimos |
| Baja frecuencia | No interpolar censo o informe anual como si fuera observación mensual |
| Licencia/acceso | Portal visible no implica API, archivo completo ni redistribución libre |

## 16. Cómo leer disponibilidad en el catálogo

Una URL puede ser una **fuente verificada del dato**, una **fuente institucional candidata**, un **proxy parcial** o un **punto de partida para resolver una brecha**. El campo disponibilidad lo expresa por fila. Las familias P2 con aviso de brecha no están listas para implementación y no cuentan como series existentes.

Casos que requieren especial cuidado al consolidar: ST_043 y ST_064 enlazan un informe de pagos como referencia institucional, pero ese informe **no mide** exportaciones digitales ni regalías creativas; ST_040 enlaza ITU para situar conectividad, pero **no contiene** tarifas de nube; ST_070 enlaza SICOES, pero **no demuestra** pagos efectivos; ST_077 usa Censo como posible denominador, pero **no publica** plazas de cuidado; ST_031 y ST_034 requieren fuentes de calendarios y reservas adicionales. Los enlaces FRED y Banco Mundial de ST_003, ST_018 y ST_033 requieren seleccionar y comprobar series concretas. Esta precisión no cambia IDs ni convierte fuentes candidatas en fuentes listas para producción.

La investigación verificó páginas primarias y contenido descriptivo; no descargó todos los archivos históricos, no probó endpoints de producción ni validó licencias exhaustivamente. El siguiente hito es la auditoría de descarga y cobertura de cada P0. El repositorio conserva aquí una propuesta detallada y revisable, no una afirmación de integración completada.
