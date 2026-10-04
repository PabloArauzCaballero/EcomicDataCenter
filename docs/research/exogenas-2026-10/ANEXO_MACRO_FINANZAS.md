# Anexo de macroeconomía finanzas y hogares para Bolivia

Fecha de investigación: 4 de octubre de 2026. Documento de diseño; no constituye integración, validación de cobertura histórica ni pronóstico. Se proponen **88 familias candidatas**: 42 P0, 39 P1 y 7 P2. Son 20 familias tratadas como exógenas externas, 49 condicionantes domésticas y 19 resultados endógenos. Una familia puede contener varias series por país, moneda, sector o territorio. La cantidad de series realmente nuevas solo se conocerá después de deduplicar contra todos los dominios del Observatorio, en especial el módulo cambiario.

Los canales y rezagos de este documento son hipótesis de trabajo formuladas para investigar; no son elasticidades estimadas ni hechos demostrados. Las fuentes enlazadas justifican la existencia del publicador, tema o documento indicado. No prueban que todos los desgloses propuestos existan, sean descargables, tengan historia homogénea o admitan redistribución.

## 1. Decisión principal: ampliar el sistema de factores de la economía

El inventario debe distinguir tres capas analíticas: choques externos, mecanismos de transmisión y resultados observados. Llamar exógenos al IPC boliviano, la mora o las remesas realizadas crea un problema de identificación: estas variables reaccionan a los mismos shocks que se intenta explicar.

- **Exógena externa**: razonablemente no determinada por una empresa o por el conjunto de la economía boliviana en el horizonte del modelo, como SOFR, dólar amplio o crecimiento de un socio. Es una hipótesis relativa al objetivo, no una propiedad universal; puede estar correlacionada con shocks globales omitidos.
- **Condicionante doméstica**: reserva líquida, acceso a divisas, crédito, encaje, gasto público o exposición importada. Puede ser predeterminada para una empresa y simultáneamente endógena en un modelo macro nacional.
- **Endógena/resultado**: inflación, empleo, PIB, mora, cuenta corriente, consumo y otras respuestas del sistema. Se incluyen porque permiten medir transmisión y validar utilidad, sin presentarlas como causas externas.

La columna `rol` del CSV utiliza estas categorías con el objetivo de explicar resultados sectoriales bolivianos mediante factores externos y condiciones domésticas. Para cualquier análisis causal concreto debe añadirse `target_id`, horizonte, DAG o diagrama causal, supuesto de identificación, controles permitidos y variables que deben excluirse por ser mediadoras o efectos posteriores al shock.

### Qué revela el código actual

Se revisaron en lectura `scripts/exogenous/exogenous-spec.ts`, `collect-exogenous-prices.ts`, `observatorio-dashboard/src/lib/exogenous-board.ts` y `src/lib/exogenous.ts`. Los tipos de esta sección representan siete grupos productivos y dos clases de medida, `PRICE` e `INDEX`; el tablero expone frecuencias mensual y anual. El lector indica además que las monedas se muestran en otro capítulo y excluye el grupo `CURRENCY`.

Por ello, agregar familias macro no debe consistir en forzar una tasa de interés a ser precio o repetir divisas existentes. Se requiere un registro común de indicadores y vistas especializadas: tasa, stock, flujo, razón, conteo, evento y distribución; frecuencias diaria, semanal, mensual, trimestral, anual e irregular; moneda, base de precios, ajuste estacional, universo y fecha real de publicación. La recolección de precios actual conserva la serie anterior cuando falla una fuente: este comportamiento es útil si se acompaña de antigüedad visible y estado de actualización.

## 2. Perspectivas especializadas y preguntas de decisión

| Perspectiva analítica | Pregunta que debe poder responder | Desagregación imprescindible | Error que debe impedir |
|---|---|---|---|
| Macroeconomía de economía pequeña y abierta | ¿Cuánto del cambio de actividad procede de demanda externa y cuánto de restricciones internas? | Socio, sector, producto, vintage | Atribuir toda correlación externa a causalidad |
| Estrategia de divisas y tesorería | ¿Cuál es el costo efectivo de financiar una importación en su fecha de pago? | Canal, entidad, punta, monto, comisión y plazo | Usar cambio oficial como costo efectivo universal |
| Riesgo soberano y finanzas públicas | ¿Qué vencimientos y fuentes de financiamiento presionan caja y divisas? | Moneda, acreedor, plazo, perímetro y estado aprobado/desembolsado | Sumar saldos, flujos y deuda intrasector sin consolidación |
| Política monetaria | ¿Cómo se transmite una modificación de liquidez a tasas y crédito? | Moneda, instrumento, vigencia y balance | Tratar toda expansión de base como shock autónomo |
| Riesgo bancario | ¿Qué sectores combinan exposición crediticia y sensibilidad al shock? | Actividad, tamaño, tipo de préstamo y entidad | Comparar mora sin considerar reprogramaciones |
| Microfinanzas e inclusión | ¿Qué unidades pequeñas tienen menor capacidad de absorción? | IFD, cooperativas, microcrédito, territorio y categoría laboral | Equiparar microcrédito, informalidad e IFD |
| Seguros y reaseguro | ¿Qué pérdida es asegurable y qué parte queda retenida localmente? | Ramo, prima, siniestro incurrido/pagado y cesión | Usar prima emitida como protección efectiva |
| Pensiones y ahorro institucional | ¿Cómo cambia la demanda de instrumentos y el retorno real del ahorro? | Instrumento, emisor, moneda, duración y aportante efectivo | Confundir afiliación acumulada con cobertura contributiva |
| Mercados globales y capitales | ¿Qué shock de tasas, dólar o liquidez externa afecta financiamiento local? | Moneda, madurez y benchmark | Mezclar rendimientos de distinta duración |
| Economía laboral y hogares | ¿Quién absorbe el shock mediante precios, empleo, horas o ingreso? | Sexo, edad, categoría, actividad y dominio de encuesta | Leer desempleo bajo como ausencia de fragilidad |
| Riesgo regulatorio e institucional | ¿Qué norma cambia realmente los flujos de caja y desde cuándo? | Texto legal, producto afectado, anuncio, aprobación y vigencia | Transformar opiniones o rumores en evento normativo |

Estas perspectivas son marcos de análisis utilizados por el agente; no se afirma que participaron profesionales humanos de cada especialidad.

## 3. Convenciones del catálogo

**P0** significa investigar e integrar primero por relevancia transversal; no significa acceso confirmado. **P1** amplía profundidad sectorial; **P2** exige mayor trabajo de datos, convenio, muestra o metodología. La frecuencia es la deseada o publicada según se especifica. Cuando lleva “propuesta”, se deberá confirmar el calendario del cuadro; no se interpolarán datos anuales para inventar series mensuales.

El rezago es una ventana inicial para explorar transmisión económica. Debe mantenerse separado del retraso de publicación, que se medirá empíricamente para cada fuente. Las geografías “Bolivia y municipio” o “por entidad” expresan el desglose buscado, pendiente de cobertura y restricciones. Las claves `MF_*` son identificadores de familia del plan, no códigos de series oficiales ni cambios al esquema de producción.

El catálogo CSV contiene todos los campos requeridos y es la referencia para importación al backlog. Las fichas siguientes reproducen la definición y el contexto económico de cada familia.

## 4. Catálogo completo de familias candidatas

### Divisas

**MF_FX_OFFICIAL — Cambio oficial compra/venta** (P0; condicionante). Cotización BOB por USD conservando ambas puntas y fecha de vigencia.

- Unidad: BOB/USD. Frecuencia: diaria. Geografía: Bolivia.
- Canal propuesto: Valuación de contratos y conversión contable. Rezago económico a investigar: 0-3 meses.
- Fuente: [publicador o documento candidato](https://www.bcb.gob.bo/?q=content%2Fsector-externo-0). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_FX_REFERENCE — Cambio referencial publicado** (P0; condicionante). Referencia bancaria vigente si la autoridad publica serie distinta de la oficial; conservar metodología.

- Unidad: BOB/USD. Frecuencia: diaria propuesta. Geografía: Bolivia.
- Canal propuesto: Costo observable de operaciones autorizadas. Rezago económico a investigar: 0-3 meses.
- Fuente: [publicador o documento candidato](https://www.bcb.gob.bo/?q=content%2Fsector-externo-0). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_FX_EFFECTIVE — Costo efectivo de acceso a divisas** (P1; condicionante). Monto BOB pagado dividido entre USD netos recibidos incluyendo comisiones por canal y monto.

- Unidad: BOB/USD. Frecuencia: semanal propuesta. Geografía: Bolivia por canal.
- Canal propuesto: Costo importador y de servicios digitales. Rezago económico a investigar: 0-3 meses.
- Fuente: [publicador o documento candidato](https://asfi.gob.bo/la/tarifarios). Estado: Propuesta de medición; fuente parcial no valida serie completa; requiere muestra o convenio.

**MF_FX_PREMIUM — Prima cambiaria por canal** (P1; condicionante). 100 por cociente entre cambio efectivo comparable y oficial menos uno; separar medios de pago.

- Unidad: %. Frecuencia: semanal derivada. Geografía: Bolivia por canal.
- Canal propuesto: Presión de costos y sustitución de ahorro. Rezago económico a investigar: 0-6 meses.
- Fuente: [publicador o documento candidato](https://asfi.gob.bo/la/tarifarios). Estado: Propuesta de medición; fuente parcial no valida serie completa; requiere muestra o convenio.

**MF_FX_DISPERSION — Dispersión de cotizaciones efectivas** (P2; condicionante). Rango intercuartílico de cotizaciones del mismo día monto y canal.

- Unidad: BOB/USD. Frecuencia: semanal propuesta. Geografía: Ciudades y canales.
- Canal propuesto: Segmentación del mercado y fricción comercial. Rezago económico a investigar: 0-3 meses.
- Fuente: [publicador o documento candidato](https://asfi.gob.bo/la/tarifarios). Estado: Propuesta de medición; fuente parcial no valida serie completa; requiere muestra o convenio.


### Sector externo

**MF_RESERVES_NET — Reservas internacionales netas** (P0; condicionante). Stock RIN con composición y definición oficial; separar transacciones y revalorización.

- Unidad: millones USD. Frecuencia: mensual propuesta. Geografía: Bolivia.
- Canal propuesto: Capacidad de absorción externa y confianza. Rezago económico a investigar: 0-6 meses.
- Fuente: [publicador o documento candidato](https://www.bcb.gob.bo/?q=content%2Fsector-externo-0). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_RESERVES_LIQUID — Reservas líquidas por componente** (P0; condicionante). Divisas y activos disponibles según clasificación oficial; no equiparar todo el oro a caja.

- Unidad: millones USD. Frecuencia: mensual propuesta. Geografía: Bolivia.
- Canal propuesto: Capacidad inmediata de pagos externos. Rezago económico a investigar: 0-3 meses.
- Fuente: [publicador o documento candidato](https://www.bcb.gob.bo/?q=content%2Fsector-externo-0). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_RESERVE_COVER — Cobertura de importaciones** (P0; condicionante). Reservas seleccionadas divididas entre promedio mensual de importaciones de 12 meses.

- Unidad: meses. Frecuencia: mensual derivada. Geografía: Bolivia.
- Canal propuesto: Vulnerabilidad ante interrupción de divisas. Rezago económico a investigar: 0-6 meses.
- Fuente: [publicador o documento candidato](https://www.bcb.gob.bo/?q=content%2Fsector-externo-0). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_REER — Tipo de cambio real efectivo** (P0; condicionante). Índice multilateral oficial con base y pesos identificados.

- Unidad: índice. Frecuencia: mensual. Geografía: Bolivia y socios.
- Canal propuesto: Competitividad precio y sustitución importadora. Rezago económico a investigar: 3-12 meses.
- Fuente: [publicador o documento candidato](https://www.bcb.gob.bo/?q=content%2Fsector-externo-0). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_CURRENT_ACCOUNT — Cuenta corriente** (P0; endogena). Saldo corriente de balanza de pagos sin confundirlo con balanza comercial.

- Unidad: millones USD y % PIB. Frecuencia: trimestral. Geografía: Bolivia.
- Canal propuesto: Necesidad de financiamiento externo. Rezago económico a investigar: 1-4 trimestres.
- Fuente: [publicador o documento candidato](https://www.bcb.gob.bo/?q=content%2Fsector-externo-0). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_FDI — Inversión extranjera directa** (P1; endogena). Flujos brutos y netos por actividad cuando disponibles.

- Unidad: millones USD. Frecuencia: trimestral propuesta. Geografía: Bolivia y sector.
- Canal propuesto: Capital tecnología e inversión productiva. Rezago económico a investigar: 2-8 trimestres.
- Fuente: [publicador o documento candidato](https://www.bcb.gob.bo/?q=content%2Fsector-externo-0). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_EXTERNAL_DEBT — Deuda externa pública por moneda** (P0; condicionante). Saldo por acreedor moneda y plazo sin sumar valorizaciones como desembolso.

- Unidad: millones USD. Frecuencia: trimestral propuesta. Geografía: Bolivia.
- Canal propuesto: Exposición a dólar y tasas internacionales. Rezago económico a investigar: 1-8 trimestres.
- Fuente: [publicador o documento candidato](https://www.bcb.gob.bo/?q=content%2Fsector-externo-0). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_DEBT_SERVICE — Calendario de servicio externo** (P0; condicionante). Amortización e intereses contractuales por fecha y moneda.

- Unidad: millones USD. Frecuencia: mensual propuesta. Geografía: Bolivia.
- Canal propuesto: Demanda predeterminada de divisas. Rezago económico a investigar: 0-24 meses.
- Fuente: [publicador o documento candidato](https://www.bcb.gob.bo/?q=content%2Fsector-externo-0). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_NET_DISBURSEMENT — Transferencia neta de deuda externa** (P1; condicionante). Desembolsos menos amortización e intereses distinguiendo saldo aprobado de efectivo.

- Unidad: millones USD. Frecuencia: trimestral propuesta. Geografía: Bolivia.
- Canal propuesto: Liquidez fiscal y externa. Rezago económico a investigar: 0-4 trimestres.
- Fuente: [publicador o documento candidato](https://www.bcb.gob.bo/?q=content%2Fsector-externo-0). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_BANK_CROSS_BORDER — Crédito bancario transfronterizo a Bolivia** (P1; condicionante). Posiciones acreedoras de bancos declarantes frente a residentes; confirmar dimensión Bolivia.

- Unidad: millones USD. Frecuencia: trimestral. Geografía: Contrapartes Bolivia.
- Canal propuesto: Disponibilidad de financiamiento comercial. Rezago económico a investigar: 1-4 trimestres.
- Fuente: [publicador o documento candidato](https://data.bis.org/topics/LBS). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_TRANSFER_COST — Costo de transferencia internacional** (P1; condicionante). Comisión fija porcentual y tipo de cambio para operación estandarizada.

- Unidad: USD y %. Frecuencia: mensual propuesta. Geografía: Bolivia por entidad.
- Canal propuesto: Fricciones de pagos de importadores y hogares. Rezago económico a investigar: 0-3 meses.
- Fuente: [publicador o documento candidato](https://asfi.gob.bo/la/tarifarios). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.


### Remesas

**MF_REMITTANCES — Remesas recibidas** (P0; endogena). Flujo por país de origen y plaza de pago; moneda y método consistentes.

- Unidad: millones USD. Frecuencia: mensual propuesta. Geografía: Bolivia y origen.
- Canal propuesto: Ingreso disponible y oferta de divisas. Rezago económico a investigar: 0-3 meses.
- Fuente: [publicador o documento candidato](https://www.bcb.gob.bo/?q=content%2Fsector-externo-0). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_REMIT_ORIGIN_FX — Divisa de países emisores** (P1; exogena). Variación de moneda de países que remiten frente a USD ponderada con pesos rezagados.

- Unidad: índice. Frecuencia: mensual derivada. Geografía: España EEUU y socios documentados.
- Canal propuesto: Poder de compra de remesas en Bolivia. Rezago económico a investigar: 0-6 meses.
- Fuente: [publicador o documento candidato](https://www.federalreserve.gov/releases/h10/). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_REMIT_ORIGIN_UNEMPLOYMENT — Desempleo en países emisores** (P1; exogena). Tasa de desempleo por país emisor ponderada por remesas de periodo previo.

- Unidad: %. Frecuencia: anual por vintage. Geografía: Países emisores.
- Canal propuesto: Ingreso de migrantes y remesas futuras. Rezago económico a investigar: 1-4 trimestres.
- Fuente: [publicador o documento candidato](https://data.imf.org/en/datasets/IMF.RES%3AWEO). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.


### Mercados globales

**MF_USD_BROAD — Dólar amplio nominal** (P0; exogena). Índice amplio ponderado comercialmente del USD publicado por la Fed.

- Unidad: índice. Frecuencia: diaria a mensual. Geografía: Global.
- Canal propuesto: Dólar fuerte commodities y costo importador. Rezago económico a investigar: 0-6 meses.
- Fuente: [publicador o documento candidato](https://www.federalreserve.gov/releases/h10/). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_BRLUSD — Real brasileño por dólar** (P0; exogena). Cotización BRL por USD; mantener sentido de unidad.

- Unidad: BRL/USD. Frecuencia: diaria a mensual. Geografía: Brasil.
- Canal propuesto: Competitividad fronteriza y costo de suministros. Rezago económico a investigar: 0-6 meses.
- Fuente: [publicador o documento candidato](https://www.federalreserve.gov/releases/h10/). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_EURUSD — Dólares por euro** (P1; exogena). Cotización USD por EUR; no invertir sin metadato.

- Unidad: USD/EUR. Frecuencia: diaria a mensual. Geografía: Zona euro.
- Canal propuesto: Remesas importación de capital y turismo. Rezago económico a investigar: 0-6 meses.
- Fuente: [publicador o documento candidato](https://www.federalreserve.gov/releases/h10/). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_CNYUSD — Renminbi por dólar** (P0; exogena). Cotización CNY por USD distinguiendo mercado doméstico y exterior.

- Unidad: CNY/USD. Frecuencia: diaria a mensual. Geografía: China.
- Canal propuesto: Costo de bienes industriales y de consumo. Rezago económico a investigar: 0-6 meses.
- Fuente: [publicador o documento candidato](https://www.federalreserve.gov/releases/h10/). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_FEDFUNDS — Tasa efectiva federal funds** (P0; exogena). Tasa efectiva diaria de fondos federales.

- Unidad: % anual. Frecuencia: diaria a mensual. Geografía: EEUU.
- Canal propuesto: Costo global de financiamiento y apetito por riesgo. Rezago económico a investigar: 0-12 meses.
- Fuente: [publicador o documento candidato](https://www.federalreserve.gov/releases/h15/). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_UST_CURVE — Curva Tesoro EEUU** (P0; exogena). Rendimientos comparables a 3 meses 2 años y 10 años y pendiente 10y menos 2y.

- Unidad: % anual y puntos básicos. Frecuencia: diaria a mensual. Geografía: EEUU.
- Canal propuesto: Descuento de inversiones y costo de deuda. Rezago económico a investigar: 0-12 meses.
- Fuente: [publicador o documento candidato](https://www.federalreserve.gov/releases/h15/). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_UST_REAL — Rendimiento real Tesoro EEUU** (P1; exogena). Rendimiento real indexado a inflación en madurez comparable.

- Unidad: % anual. Frecuencia: diaria a mensual. Geografía: EEUU.
- Canal propuesto: Costo de oportunidad de oro y capital. Rezago económico a investigar: 0-12 meses.
- Fuente: [publicador o documento candidato](https://www.federalreserve.gov/releases/h15/). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_SOFR — SOFR** (P0; exogena). Referencia overnight garantizada por valores del Tesoro; conservar convención de capitalización.

- Unidad: % anual. Frecuencia: diaria. Geografía: EEUU.
- Canal propuesto: Costo de deuda y contratos a tasa variable. Rezago económico a investigar: 0-12 meses.
- Fuente: [publicador o documento candidato](https://www.newyorkfed.org/markets/reference-rates/sofr). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_VIX — Volatilidad implícita VIX** (P1; exogena). Índice de volatilidad implícita de opciones del S&P 500 según metodología del titular.

- Unidad: puntos índice. Frecuencia: diaria a semanal. Geografía: EEUU y global.
- Canal propuesto: Aversión global al riesgo y acceso a financiamiento. Rezago económico a investigar: 0-3 meses.
- Fuente: [publicador o documento candidato](https://www.cboe.com/tradable_products/vix/vix_historical_data/). Estado: Fuente candidata; acceso web no logrado; serie y derechos pendientes.

**MF_GLOBAL_USD_CREDIT — Liquidez global en USD** (P1; exogena). Crédito en dólares a prestatarios no bancarios fuera de EEUU.

- Unidad: billones USD y % anual. Frecuencia: trimestral. Geografía: Global y emergentes.
- Canal propuesto: Condiciones globales de financiamiento. Rezago económico a investigar: 1-4 trimestres.
- Fuente: [publicador o documento candidato](https://data.bis.org/topics/GLI?m=213). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_ARSUSD — Peso argentino por dólar** (P0; exogena). Cotización oficial con régimen y mercado identificados; no equiparar a cotización financiera o informal.

- Unidad: ARS/USD. Frecuencia: diaria a mensual. Geografía: Argentina.
- Canal propuesto: Costo de alimentos importados comercio fronterizo y turismo. Rezago económico a investigar: 0-6 meses.
- Fuente: [publicador o documento candidato](https://www.bcra.gob.ar/catalogo_de_datos/principales-variables-monetarias-y-financieras/). Estado: Página primaria localizada; código endpoint histórico derechos y reutilización de serie existente pendientes.

**MF_CLPUSD — Peso chileno por dólar** (P0; exogena). Dólar observado según metodología del Banco Central de Chile.

- Unidad: CLP/USD. Frecuencia: diaria a mensual. Geografía: Chile.
- Canal propuesto: Costos portuarios compras y turismo. Rezago económico a investigar: 0-6 meses.
- Fuente: [publicador o documento candidato](https://www.bcentral.cl/es/web/banco-central/areas/estadisticas/tipos-de-cambios-y-paridades). Estado: Página primaria localizada; código endpoint histórico derechos y reutilización de serie existente pendientes.

**MF_PENUSD — Sol peruano por dólar** (P0; exogena). Cotización por mercado y punta identificados en BCRP.

- Unidad: PEN/USD. Frecuencia: diaria a mensual. Geografía: Perú.
- Canal propuesto: Comercio fronterizo alimentos y servicios. Rezago económico a investigar: 0-6 meses.
- Fuente: [publicador o documento candidato](https://estadisticas.bcrp.gob.pe/estadisticas/series/diarias). Estado: Página primaria localizada; código endpoint histórico derechos y reutilización de serie existente pendientes.


### Demanda externa

**MF_PARTNER_GROWTH — Crecimiento de socios** (P0; exogena). Crecimiento PIB real de Brasil Argentina China EEUU Perú y Chile con pesos comerciales rezagados.

- Unidad: % anual. Frecuencia: anual por vintage. Geografía: Socios de Bolivia.
- Canal propuesto: Demanda de exportaciones y turismo. Rezago económico a investigar: 1-6 trimestres.
- Fuente: [publicador o documento candidato](https://data.imf.org/en/datasets/IMF.RES%3AWEO). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_PARTNER_INFLATION — Inflación de socios** (P1; exogena). IPC promedio de socios por país y agregado con pesos de importación rezagados.

- Unidad: % anual. Frecuencia: anual por vintage. Geografía: Socios de Bolivia.
- Canal propuesto: Inflación importada y competencia regional. Rezago económico a investigar: 1-6 trimestres.
- Fuente: [publicador o documento candidato](https://data.imf.org/en/datasets/IMF.RES%3AWEO). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_GLOBAL_TRADE — Crecimiento del comercio mundial** (P1; exogena). Volumen de comercio de bienes y servicios en agregados WEO; verificar definición.

- Unidad: % anual. Frecuencia: anual por vintage. Geografía: Global.
- Canal propuesto: Demanda exportadora y restricciones de oferta. Rezago económico a investigar: 1-6 trimestres.
- Fuente: [publicador o documento candidato](https://data.imf.org/en/datasets/IMF.RES%3AWEO). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_FORECAST_REVISION — Revisión de previsión de socios** (P1; exogena). Diferencia en previsión del mismo año entre ediciones disponibles en su fecha real.

- Unidad: puntos porcentuales. Frecuencia: semestral por vintage. Geografía: Socios de Bolivia.
- Canal propuesto: Cambios anticipados de demanda y presupuestos. Rezago económico a investigar: 0-4 trimestres.
- Fuente: [publicador o documento candidato](https://data.imf.org/en/datasets/IMF.RES%3AWEO). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.


### Fiscal

**MF_FISCAL_BALANCE — Resultado fiscal SPNF** (P0; endogena). Ingresos menos gastos del perímetro SPNF y base contable documentados.

- Unidad: millones BOB y % PIB. Frecuencia: trimestral propuesta. Geografía: Bolivia.
- Canal propuesto: Demanda agregada y necesidad de financiamiento. Rezago económico a investigar: 0-4 trimestres.
- Fuente: [publicador o documento candidato](https://www.economiayfinanzas.gob.bo/sites/default/files/2023-12/BOLETIN%20TGN%202022.pdf). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_PRIMARY_BALANCE — Resultado primario** (P1; endogena). Resultado fiscal excluyendo intereses con idéntico perímetro.

- Unidad: millones BOB y % PIB. Frecuencia: trimestral propuesta. Geografía: Bolivia.
- Canal propuesto: Sostenibilidad fiscal y espacio de gasto. Rezago económico a investigar: 1-8 trimestres.
- Fuente: [publicador o documento candidato](https://www.economiayfinanzas.gob.bo/sites/default/files/2023-12/BOLETIN%20TGN%202022.pdf). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_TAX_REVENUE — Recaudación por tributo** (P0; endogena). Ingresos tributarios efectivos por IVA IT IUE y otros; netear devoluciones según fuente.

- Unidad: millones BOB. Frecuencia: mensual propuesta. Geografía: Bolivia.
- Canal propuesto: Actividad demanda y disponibilidad de recursos. Rezago económico a investigar: 0-6 meses.
- Fuente: [publicador o documento candidato](https://www.economiayfinanzas.gob.bo/sites/default/files/2023-12/BOLETIN%20TGN%202022.pdf). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_HYDROCARBON_REVENUE — Ingresos hidrocarburíferos** (P0; condicionante). IDH regalías y otros ingresos identificados sin doble conteo de transferencias.

- Unidad: millones BOB. Frecuencia: mensual propuesta. Geografía: Bolivia y departamentos.
- Canal propuesto: Gasto subnacional y exposición a gas. Rezago económico a investigar: 1-6 meses.
- Fuente: [publicador o documento candidato](https://www.economiayfinanzas.gob.bo/sites/default/files/2023-12/BOLETIN%20TGN%202022.pdf). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_PUBLIC_INVESTMENT — Inversión pública ejecutada** (P0; condicionante). Ejecución devengada y pagada por sector y territorio separadas del presupuesto.

- Unidad: millones BOB. Frecuencia: mensual propuesta. Geografía: Bolivia y departamento.
- Canal propuesto: Demanda de construcción maquinaria y empleo. Rezago económico a investigar: 0-12 meses.
- Fuente: [publicador o documento candidato](https://www.economiayfinanzas.gob.bo/sites/default/files/2023-12/BOLETIN%20TGN%202022.pdf). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_PUBLIC_ARREARS — Atrasos de pagos públicos** (P2; condicionante). Obligaciones vencidas verificadas por antigüedad; no inferir de presupuesto sin ejecutar.

- Unidad: millones BOB y días. Frecuencia: trimestral propuesta. Geografía: Bolivia y entidad.
- Canal propuesto: Liquidez de proveedores y morosidad. Rezago económico a investigar: 0-6 meses.
- Fuente: [publicador o documento candidato](https://www.economiayfinanzas.gob.bo/sites/default/files/2023-12/BOLETIN%20TGN%202022.pdf). Estado: Propuesta de medición; fuente parcial no valida serie completa; requiere muestra o convenio.

**MF_DOMESTIC_DEBT — Deuda interna TGN** (P0; condicionante). Saldo por tenedor moneda e instrumento; respetar exclusión de deuda intrasector BCB.

- Unidad: millones BOB. Frecuencia: mensual. Geografía: Bolivia.
- Canal propuesto: Absorción de ahorro y refinanciamiento. Rezago económico a investigar: 1-12 meses.
- Fuente: [publicador o documento candidato](https://economiayfinanzas.gob.bo/viceministerios/vtcp/deuda-interna-tgn). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_DOMESTIC_SERVICE — Servicio de deuda interna** (P1; condicionante). Pagos previstos y realizados de principal e interés por instrumento.

- Unidad: millones BOB. Frecuencia: mensual propuesta. Geografía: Bolivia.
- Canal propuesto: Liquidez presupuestaria y demanda de títulos. Rezago económico a investigar: 0-12 meses.
- Fuente: [publicador o documento candidato](https://economiayfinanzas.gob.bo/viceministerios/vtcp/deuda-interna-tgn). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_SUBSIDY_BURDEN — Costo fiscal de subsidios** (P1; condicionante). Gasto devengado y pagado por programa; separar estimación económica de partida presupuestaria.

- Unidad: millones BOB y % PIB. Frecuencia: trimestral propuesta. Geografía: Bolivia.
- Canal propuesto: Sensibilidad fiscal a shocks de importación. Rezago económico a investigar: 0-12 meses.
- Fuente: [publicador o documento candidato](https://www.economiayfinanzas.gob.bo/sites/default/files/2023-12/BOLETIN%20TGN%202022.pdf). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.


### Monetario

**MF_CENTRAL_BANK_GOV_CREDIT — Crédito del BCB al sector público** (P0; condicionante). Stock bruto y neto identificando depósitos contrapartida y perímetro.

- Unidad: millones BOB. Frecuencia: mensual. Geografía: Bolivia.
- Canal propuesto: Expansión monetaria y financiamiento fiscal. Rezago económico a investigar: 1-12 meses.
- Fuente: [publicador o documento candidato](https://www.bcb.gob.bo/?q=node%2F237525). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_MONETARY_BASE — Base monetaria** (P0; condicionante). Saldo y determinantes según definición oficial.

- Unidad: millones BOB. Frecuencia: mensual. Geografía: Bolivia.
- Canal propuesto: Liquidez y demanda nominal. Rezago económico a investigar: 0-12 meses.
- Fuente: [publicador o documento candidato](https://www.bcb.gob.bo/?q=node%2F237525). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_MONEY_AGGREGATES — Agregados monetarios** (P0; condicionante). M1 M2 y agregados amplios manteniendo monedas y definición oficial.

- Unidad: millones BOB y % anual. Frecuencia: mensual. Geografía: Bolivia.
- Canal propuesto: Capacidad transaccional e inflación. Rezago económico a investigar: 1-12 meses.
- Fuente: [publicador o documento candidato](https://www.bcb.gob.bo/?q=node%2F237525). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_RESERVE_REQUIREMENT — Encaje efectivo y normativo** (P1; condicionante). Tasa por moneda base y componente con vigencia de cada regla.

- Unidad: %. Frecuencia: por evento y mensual. Geografía: Bolivia.
- Canal propuesto: Oferta prestable y costo de intermediación. Rezago económico a investigar: 0-6 meses.
- Fuente: [publicador o documento candidato](https://www.bcb.gob.bo/?q=node%2F237525). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.


### Banca

**MF_DEPOSITS — Depósitos por moneda plazo y territorio** (P0; condicionante). Saldos por modalidad y moneda; separar tipo de cambio de variación transaccional.

- Unidad: millones BOB. Frecuencia: mensual. Geografía: Bolivia y departamento.
- Canal propuesto: Fondeo bancario y confianza. Rezago económico a investigar: 0-6 meses.
- Fuente: [publicador o documento candidato](https://www.asfi.gob.bo/pb/series-historicas-depositos-del-publico-y-cartera-creditos). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_CREDIT_SECTOR — Crédito por actividad y tamaño** (P0; condicionante). Cartera por actividad destino tamaño empresarial tipo de entidad y moneda.

- Unidad: millones BOB. Frecuencia: mensual. Geografía: Bolivia sector y entidad.
- Canal propuesto: Financiamiento productivo y exposición sectorial. Rezago económico a investigar: 1-12 meses.
- Fuente: [publicador o documento candidato](https://www.asfi.gob.bo/pb/series-historicas-depositos-del-publico-y-cartera-creditos). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_NPL — Mora por sector y producto** (P0; endogena). Cartera vencida y en ejecución dividida entre cartera comparable.

- Unidad: %. Frecuencia: mensual. Geografía: Bolivia sector y entidad.
- Canal propuesto: Estrés de hogares empresas y canal crédito. Rezago económico a investigar: 1-12 meses.
- Fuente: [publicador o documento candidato](https://www.asfi.gob.bo/pb/boletines-estadisticos). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_RESTRUCTURED — Cartera reprogramada y refinanciada** (P1; condicionante). Saldo y proporción por categoría conservando definición regulatoria.

- Unidad: millones BOB y %. Frecuencia: mensual propuesta. Geografía: Bolivia y tipo entidad.
- Canal propuesto: Estrés previo o distinto a mora reconocida. Rezago económico a investigar: 0-12 meses.
- Fuente: [publicador o documento candidato](https://www.asfi.gob.bo/pb/boletines-estadisticos). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_PROVISION_COVER — Cobertura de previsiones** (P1; condicionante). Previsiones computables divididas entre cartera en mora según fórmula ASFI.

- Unidad: %. Frecuencia: mensual. Geografía: Bolivia y entidad.
- Canal propuesto: Capacidad de absorber pérdidas. Rezago económico a investigar: 0-12 meses.
- Fuente: [publicador o documento candidato](https://www.asfi.gob.bo/pb/boletines-estadisticos). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_CAPITAL — Adecuación patrimonial** (P1; condicionante). Patrimonio regulatorio sobre activos ponderados por riesgo según fórmula vigente.

- Unidad: %. Frecuencia: mensual propuesta. Geografía: Bolivia y entidad.
- Canal propuesto: Restricción a crecimiento crediticio. Rezago económico a investigar: 0-12 meses.
- Fuente: [publicador o documento candidato](https://www.asfi.gob.bo/pb/boletines-estadisticos). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_BANK_LIQUIDITY — Liquidez por moneda y vencimiento** (P0; condicionante). Activos líquidos sobre obligaciones de plazo comparable según indicador oficial.

- Unidad: %. Frecuencia: mensual. Geografía: Bolivia y entidad.
- Canal propuesto: Capacidad de retiros y nuevos préstamos. Rezago económico a investigar: 0-6 meses.
- Fuente: [publicador o documento candidato](https://www.asfi.gob.bo/pb/boletines-estadisticos). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_LOAN_RATES — Tasas activas efectivas** (P0; condicionante). Tasa por moneda plazo producto y tipo de cliente con ponderación explícita.

- Unidad: % anual. Frecuencia: mensual propuesta. Geografía: Bolivia.
- Canal propuesto: Costo de capital de trabajo y consumo. Rezago económico a investigar: 0-12 meses.
- Fuente: [publicador o documento candidato](https://www.asfi.gob.bo/pb/boletines-estadisticos). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_DEPOSIT_RATES — Tasas pasivas efectivas** (P1; condicionante). Tasa por moneda plazo instrumento y tipo de entidad.

- Unidad: % anual. Frecuencia: mensual propuesta. Geografía: Bolivia.
- Canal propuesto: Costo de fondeo y elección de ahorro. Rezago económico a investigar: 0-6 meses.
- Fuente: [publicador o documento candidato](https://www.asfi.gob.bo/pb/boletines-estadisticos). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_CREDIT_CONCENTRATION — Concentración de exposición** (P1; condicionante). Herfindahl por sector de cartera y participación de mayores sectores; no inferir deudores individuales.

- Unidad: índice y %. Frecuencia: mensual derivada. Geografía: Bolivia y tipo entidad.
- Canal propuesto: Amplificación de shocks sectoriales. Rezago económico a investigar: 1-12 meses.
- Fuente: [publicador o documento candidato](https://www.asfi.gob.bo/pb/boletines-estadisticos). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.


### Microfinanzas

**MF_MICROCREDIT — Microcrédito e IFD** (P0; condicionante). Saldo mora y número de prestatarios por tipo de entidad; IFD no equivale a todo microcrédito.

- Unidad: BOB personas y %. Frecuencia: mensual propuesta. Geografía: Bolivia y territorio.
- Canal propuesto: Capital de trabajo de pequeñas unidades. Rezago económico a investigar: 1-12 meses.
- Fuente: [publicador o documento candidato](https://www.asfi.gob.bo/pb/boletines-estadisticos). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.


### Inclusión

**MF_FINANCIAL_ACCESS — Puntos de atención y cuentas** (P2; condicionante). Puntos de atención y cuentas por población; cuentas no equivalen a personas únicas.

- Unidad: número y por 10000 adultos. Frecuencia: trimestral propuesta. Geografía: Bolivia y municipio.
- Canal propuesto: Acceso a pagos ahorro y crédito. Rezago económico a investigar: 2-8 trimestres.
- Fuente: [publicador o documento candidato](https://www.asfi.gob.bo/pb/boletines-estadisticos). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.


### Capitales locales

**MF_FUNDS_ASSETS — Cartera y liquidez de fondos** (P1; condicionante). Patrimonio neto liquidez y composición por emisor moneda y duración disponible.

- Unidad: millones BOB y %. Frecuencia: mensual propuesta. Geografía: Bolivia y fondo.
- Canal propuesto: Demanda de títulos y riesgo de rescates. Rezago económico a investigar: 0-6 meses.
- Fuente: [publicador o documento candidato](https://www.asfi.gob.bo/la/reportes-dinamicos). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_FUNDS_RETURN — Rendimiento de fondos** (P1; condicionante). Retorno por ventana y moneda con comisiones y anualización documentadas.

- Unidad: %. Frecuencia: mensual propuesta. Geografía: Bolivia y fondo.
- Canal propuesto: Costo de oportunidad del ahorro. Rezago económico a investigar: 0-6 meses.
- Fuente: [publicador o documento candidato](https://www.asfi.gob.bo/la/reportes-dinamicos). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.


### Seguros

**MF_INSURANCE_PREMIUM — Primas por ramo** (P1; condicionante). Producción de seguros por ramo distinguiendo prima emitida cobrada y neta.

- Unidad: millones BOB. Frecuencia: trimestral propuesta. Geografía: Bolivia y ramo.
- Canal propuesto: Protección financiera y actividad asegurada. Rezago económico a investigar: 1-4 trimestres.
- Fuente: [publicador o documento candidato](https://www.aps.gob.bo/index.php/component/rsfiles/Descargar?Itemid=437&path=UPCC%2Fboletines%2Ftrimestrales%2F2025%2FSeguros%2FBoletin+Trimestral+Estadistico+de+Seguros+-+2do+Trimestre.pdf). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_INSURANCE_CLAIMS — Siniestros y siniestralidad** (P1; endogena). Siniestros pagados e incurridos por ramo y ratio con prima compatible.

- Unidad: millones BOB y %. Frecuencia: trimestral propuesta. Geografía: Bolivia y ramo.
- Canal propuesto: Pérdidas por clima accidentes y salud. Rezago económico a investigar: 0-4 trimestres.
- Fuente: [publicador o documento candidato](https://www.aps.gob.bo/index.php/component/rsfiles/Descargar?Itemid=437&path=UPCC%2Fboletines%2Ftrimestrales%2F2025%2FSeguros%2FBoletin+Trimestral+Estadistico+de+Seguros+-+2do+Trimestre.pdf). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_REINSURANCE — Dependencia de reaseguro** (P2; condicionante). Prima cedida y recuperaciones por ramo; costos específicos requieren contratos o reporte autorizado.

- Unidad: % y millones BOB. Frecuencia: trimestral propuesta. Geografía: Bolivia y exterior.
- Canal propuesto: Transmisión de costo global de cobertura. Rezago económico a investigar: 1-4 trimestres.
- Fuente: [publicador o documento candidato](https://www.aps.gob.bo/index.php/component/rsfiles/Descargar?Itemid=437&path=UPCC%2Fboletines%2Ftrimestrales%2F2025%2FSeguros%2FBoletin+Trimestral+Estadistico+de+Seguros+-+2do+Trimestre.pdf). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.


### Pensiones

**MF_PENSION_ASSETS — Cartera previsional** (P1; condicionante). Activos administrados por instrumento emisor moneda y plazo según reporte regulatorio.

- Unidad: millones BOB y %. Frecuencia: mensual propuesta. Geografía: Bolivia.
- Canal propuesto: Demanda estructural de deuda pública y privada. Rezago económico a investigar: 1-8 trimestres.
- Fuente: [publicador o documento candidato](https://www.aps.gob.bo/). Estado: Institución identificada; cuadro específico endpoint cobertura y derechos pendientes.

**MF_PENSION_CONTRIBUTORS — Aportantes efectivos** (P1; endogena). Contribuyentes que realizaron aporte en periodo separando afiliados acumulados.

- Unidad: personas y % afiliados. Frecuencia: mensual propuesta. Geografía: Bolivia.
- Canal propuesto: Formalidad y recaudación previsional. Rezago económico a investigar: 1-4 trimestres.
- Fuente: [publicador o documento candidato](https://www.aps.gob.bo/). Estado: Institución identificada; cuadro específico endpoint cobertura y derechos pendientes.

**MF_PENSION_REAL_RETURN — Rentabilidad real previsional** (P2; endogena). Retorno nominal compatible deflactado por IPC de igual periodo.

- Unidad: % real. Frecuencia: trimestral derivada. Geografía: Bolivia.
- Canal propuesto: Poder adquisitivo futuro y asignación de ahorro. Rezago económico a investigar: 2-12 trimestres.
- Fuente: [publicador o documento candidato](https://www.aps.gob.bo/). Estado: Institución identificada; cuadro específico endpoint cobertura y derechos pendientes.


### Hogares y empleo

**MF_UNEMPLOYMENT — Desocupación** (P0; endogena). Tasa con universo edad y cobertura urbana o nacional explícitos.

- Unidad: % fuerza laboral. Frecuencia: trimestral. Geografía: Bolivia dominios ECE.
- Canal propuesto: Ingreso consumo y riesgo crediticio. Rezago económico a investigar: 0-4 trimestres.
- Fuente: [publicador o documento candidato](https://www.ine.gob.bo/index.php/boletines-estadisticos-ece/). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_PARTICIPATION — Participación laboral** (P1; condicionante). Fuerza laboral sobre población en edad de trabajar por sexo edad y dominio.

- Unidad: %. Frecuencia: trimestral. Geografía: Bolivia dominios ECE.
- Canal propuesto: Oferta laboral y presión sobre ingresos. Rezago económico a investigar: 1-4 trimestres.
- Fuente: [publicador o documento candidato](https://www.ine.gob.bo/index.php/boletines-estadisticos-ece/). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_LABOUR_INCOME — Ingreso laboral real mediano** (P0; endogena). Mediana ponderada de ingresos laborales deflactada; preservar ceros y tratamiento de no respuesta.

- Unidad: BOB constantes. Frecuencia: trimestral propuesta. Geografía: Bolivia dominios ECE.
- Canal propuesto: Consumo y capacidad de servicio de deuda. Rezago económico a investigar: 0-4 trimestres.
- Fuente: [publicador o documento candidato](https://www.ine.gob.bo/index.php/boletines-estadisticos-ece/). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_UNDEREMPLOYMENT — Subocupación por horas** (P1; endogena). Población ocupada con insuficiencia de horas según definición de encuesta.

- Unidad: % ocupados. Frecuencia: trimestral propuesta. Geografía: Bolivia dominios ECE.
- Canal propuesto: Fragilidad del ingreso oculta en desempleo. Rezago económico a investigar: 0-4 trimestres.
- Fuente: [publicador o documento candidato](https://www.ine.gob.bo/index.php/boletines-estadisticos-ece/). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_INFORMALITY — Empleo informal** (P0; condicionante). Proporción según definición OIT preservando cambio entre estándares CIST.

- Unidad: % ocupados. Frecuencia: anual propuesta. Geografía: Bolivia y sector disponible.
- Canal propuesto: Productividad protección social y transmisión de shocks. Rezago económico a investigar: 1-8 trimestres.
- Fuente: [publicador o documento candidato](https://ilostat.ilo.org/es/data/?cat_mode=subject). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_EMPLOYMENT_SECTOR — Empleo por actividad y categoría** (P0; endogena). Ocupados por actividad cuenta propia asalariado sexo y edad con diseño muestral.

- Unidad: personas y %. Frecuencia: trimestral. Geografía: Bolivia dominios ECE.
- Canal propuesto: Exposición laboral diferenciada por sector. Rezago económico a investigar: 0-4 trimestres.
- Fuente: [publicador o documento candidato](https://www.ine.gob.bo/index.php/boletines-estadisticos-ece/). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_WAGE_POLICY — Salario mínimo y ajuste salarial** (P1; condicionante). Monto y porcentaje legal por fecha anuncio aprobación y vigencia.

- Unidad: BOB/mes y %. Frecuencia: por evento. Geografía: Bolivia.
- Canal propuesto: Costo laboral formal y poder de compra. Rezago económico a investigar: 0-12 meses.
- Fuente: [publicador o documento candidato](https://www.gacetaoficialdebolivia.gob.bo/). Estado: Fuente candidata; acceso web no logrado; serie y derechos pendientes.


### Actividad macro

**MF_GDP_SECTOR — PIB real sectorial** (P0; endogena). Volumen encadenado por actividad y base documentada; no sumar niveles encadenados sin método.

- Unidad: índice y % crecimiento. Frecuencia: trimestral y anual. Geografía: Bolivia.
- Canal propuesto: Resultado sectorial para validar impactos. Rezago económico a investigar: 0-8 trimestres.
- Fuente: [publicador o documento candidato](https://www.ine.gob.bo/referencia2017/indice_2.html). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_HOUSEHOLD_CONSUMPTION — Consumo privado real** (P0; endogena). Gasto final real de hogares según cuentas nacionales y versión estadística.

- Unidad: índice y % crecimiento. Frecuencia: trimestral propuesta. Geografía: Bolivia.
- Canal propuesto: Demanda de comercio servicios y manufacturas. Rezago económico a investigar: 0-4 trimestres.
- Fuente: [publicador o documento candidato](https://www.ine.gob.bo/referencia2017/indice_2.html). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_FIXED_INVESTMENT — Formación bruta de capital fijo** (P1; endogena). Inversión real por componente disponible conservando perímetro y revisiones.

- Unidad: índice y % crecimiento. Frecuencia: trimestral propuesta. Geografía: Bolivia.
- Canal propuesto: Demanda de capital y capacidad futura. Rezago económico a investigar: 1-8 trimestres.
- Fuente: [publicador o documento candidato](https://www.ine.gob.bo/referencia2017/indice_2.html). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.

**MF_CPI_DIVISIONS — IPC por división y ciudad** (P0; endogena). Índice oficial por división y dominio con ponderaciones y base.

- Unidad: índice y % mensual. Frecuencia: mensual. Geografía: Bolivia y ciudades cubiertas.
- Canal propuesto: Inflación sectorial y costo de vida. Rezago económico a investigar: 0-12 meses.
- Fuente: [publicador o documento candidato](https://www.ine.gob.bo/). Estado: Institución identificada; cuadro específico endpoint cobertura y derechos pendientes.

**MF_INFLATION_DIFFUSION — Difusión y persistencia inflacionaria** (P1; endogena). Porcentaje ponderado de componentes que suben y persistencia a 3 meses con panel estable.

- Unidad: % y puntos porcentuales. Frecuencia: mensual derivada. Geografía: Bolivia.
- Canal propuesto: Amplitud de transmisión de shocks. Rezago económico a investigar: 0-6 meses.
- Fuente: [publicador o documento candidato](https://www.ine.gob.bo/). Estado: Institución identificada; cuadro específico endpoint cobertura y derechos pendientes.


### Exposición estructural

**MF_IMPORT_PROPENSITY — Contenido importado sectorial** (P1; condicionante). Coeficientes de insumo importado sobre producción derivados de cuadros oferta utilización.

- Unidad: %. Frecuencia: anual o benchmark. Geografía: Bolivia y sector.
- Canal propuesto: Multiplicador de shocks de divisas y costos. Rezago económico a investigar: 1-12 meses.
- Fuente: [publicador o documento candidato](https://www.ine.gob.bo/referencia2017/indice_2.html). Estado: Página o documento primario localizado; serie exacta endpoint histórico y derechos pendientes.


### Regulatorio

**MF_TRADE_RULES — Cambios de aranceles cuotas y permisos** (P0; condicionante). Evento codificado por producto norma fecha anuncio y vigencia; tasas legales no inventadas.

- Unidad: evento y % si aplica. Frecuencia: por evento. Geografía: Bolivia y producto.
- Canal propuesto: Costo acceso a mercado e incentivos comerciales. Rezago económico a investigar: 0-12 meses.
- Fuente: [publicador o documento candidato](https://www.gacetaoficialdebolivia.gob.bo/). Estado: Fuente candidata; acceso web no logrado; serie y derechos pendientes.

**MF_FINANCIAL_RULES — Cambios de reglas financieras** (P1; condicionante). Evento de encaje topes cuotas diferimientos y requisitos con versión legal.

- Unidad: evento y parámetro. Frecuencia: por evento. Geografía: Bolivia y entidades.
- Canal propuesto: Transmisión de crédito fondeo y pagos. Rezago económico a investigar: 0-12 meses.
- Fuente: [publicador o documento candidato](https://www.gacetaoficialdebolivia.gob.bo/). Estado: Fuente candidata; acceso web no logrado; serie y derechos pendientes.

**MF_TAX_RULES — Cambios tributarios y devoluciones** (P1; condicionante). Norma codificada por tasa base régimen beneficiario y vigencia efectiva.

- Unidad: evento y % si aplica. Frecuencia: por evento. Geografía: Bolivia por actividad.
- Canal propuesto: Margen empresarial e inversión. Rezago económico a investigar: 0-24 meses.
- Fuente: [publicador o documento candidato](https://www.gacetaoficialdebolivia.gob.bo/). Estado: Fuente candidata; acceso web no logrado; serie y derechos pendientes.


### Riesgo institucional

**MF_POLICY_EVENT_CALENDAR — Calendario de decisiones económicas** (P1; condicionante). Anuncios aprobaciones vigencias y vencimientos de normas; separar expectativas de norma ejecutada.

- Unidad: evento y días. Frecuencia: por evento. Geografía: Bolivia.
- Canal propuesto: Anticipación o postergación de inversión. Rezago económico a investigar: 0-12 meses.
- Fuente: [publicador o documento candidato](https://www.gacetaoficialdebolivia.gob.bo/). Estado: Fuente candidata; acceso web no logrado; serie y derechos pendientes.

**MF_REGULATORY_UNCERTAINTY — Incertidumbre regulatoria documentada** (P2; condicionante). Conteo de cambios sustantivos y plazos de transición con protocolo de codificación y revisión humana.

- Unidad: eventos por mes y días. Frecuencia: mensual derivada. Geografía: Bolivia y sector.
- Canal propuesto: Costo de cumplimiento y espera de inversión. Rezago económico a investigar: 1-12 meses.
- Fuente: [publicador o documento candidato](https://www.gacetaoficialdebolivia.gob.bo/). Estado: Fuente candidata; acceso web no logrado; serie y derechos pendientes.


### Riesgo externo

**MF_EXTERNAL_POLICY_SHOCK — Shock de política comercial de socios** (P2; exogena). Cambios de reglas externas que afectan productos bolivianos; norma oficial por jurisdicción.

- Unidad: evento y % arancel. Frecuencia: por evento. Geografía: Socios por producto.
- Canal propuesto: Demanda externa desvío comercial y precio neto. Rezago económico a investigar: 0-24 meses.
- Fuente: fuente normativa primaria por país todavía pendiente. Estado: Pendiente descubrir fuente normativa primaria por socio; WEO no es fuente normativa.


## 5. Doce casos de uso con diseño operativo

| Caso | Usuario y decisión | Variables de entrada y resultado | Diseño inicial y salvaguarda |
|---|---|---|---|
| 1. Presupuesto de importador | Tesorería decide costo de reposición y calendario de pagos | Cambio efectivo, comisión, SOFR y divisas de proveedor; resultado costo BOB y margen | Escenarios de fecha de pago, sin sumar doblemente comisión incluida en cambio |
| 2. Inflación importada | Analista de precios explica presión por división IPC | Divisas de socios, inflación externa, contenido importado y precios de insumos de otros anexos; resultado IPC | Rezagos distribuidos y pesos previos; separar bienes importados de servicios locales |
| 3. Vulnerabilidad externa | Planificación evalúa capacidad de absorber menores exportaciones | Reservas líquidas, servicio de deuda, remesas, desembolsos y cuenta corriente | Puente de flujos por moneda; separar valorización del oro y flujo de caja |
| 4. Transmisión fiscal territorial | Gobierno local o proveedor estima sensibilidad del gasto | Ingreso hidrocarburífero, transferencias disponibles, inversión y deuda; resultado contratación o actividad local | Perímetros consistentes; presupuesto aprobado nunca sustituye ejecución |
| 5. Estrés de cartera productiva | Riesgo bancario identifica sectores expuestos | Cartera sectorial, divisas, tasas, demanda externa y costos; resultado mora y reprogramaciones | Cohortes si existen; matriz exposición-sensibilidad; no atribuir causalidad al stock rezagado por sí solo |
| 6. Fragilidad de microempresa | Desarrollo productivo define población con poca capacidad de absorción | Microcrédito, ingresos, horas, informalidad y precios; resultado actividad o atraso | Diseño muestral y heterogeneidad; no asignar datos agregados a personas |
| 7. Remesas y consumo | Comercio analiza demanda regional | Desempleo del país emisor y divisa de origen; resultado remesas por plaza y consumo | Pesos del origen rezagados; separar shock externo de decisión compensatoria del migrante |
| 8. Costo de financiamiento | Empresa compara escenarios de inversión | SOFR, curva del Tesoro, tasas activas y acceso a crédito; resultado servicio y valor presente | Aplicar tasa contractual moneda y duración correctas; escenarios ilustrativos, no recomendación de inversión |
| 9. Ahorro institucional | Analista examina vínculos pensiones-fisco-banca | Carteras previsionales, fondos, deuda interna, retornos y depósitos | Mapa de tenencias con consolidación; no inferir riesgo de impago de concentración por sí sola |
| 10. Protección ante pérdidas | Seguros y sector productivo evalúan brechas | Primas, siniestros, reaseguro y shocks climáticos del anexo sectorial | Separar exposición asegurada de exposición económica total; identificar eventos de gran severidad |
| 11. Impacto de norma | Empresa o analista revisa regulación por sector | Evento legal, fecha anuncio/vigencia, actividad afectada y resultados | Ventana de evento; anticipación y medidas simultáneas; contrafactual solo con diseño defendible |
| 12. Señales para actividad | Observatorio produce seguimiento de corto plazo | Factores globales, condiciones financieras y domésticas; resultado PIB sectorial | Modelo puente o frecuencia mixta comparado con baseline estacional; calendario de publicación real |

### Tres productos derivados calculables cuando existan insumos

1. **Exposición a monedas de proveedores**: promedio ponderado de variación de divisas, con ponderadores de importaciones del año previo. Publicar pesos, cobertura y contribución por socio. La moneda de facturación puede diferir de la de origen: documentar esta limitación y sustituir pesos cuando existan contratos.
2. **Escenario de servicio de deuda**: separar tasa fija y variable, calendario de amortización y moneda; aplicar shocks explícitos a tasa de referencia y divisa. Si no se dispone de estructura contractual, mostrar únicamente sensibilidad estilizada y abstenerse de presentarla como proyección de caja real.
3. **Mapa de exposición sectorial**: vincular importación de insumos, ventas externas, crédito, empleo e ingresos públicos a cada actividad con coeficientes de referencia. Publicar componentes antes de un índice compuesto; evitar un puntaje opaco que oculte carencias de datos.

No se fija aquí un “índice de riesgo total” con pesos arbitrarios. Una agregación futura deberá justificar normalización, signo, ponderadores, estabilidad fuera de muestra y tratamiento de ausencia.

## 6. Medición, identificación y control de calidad

### Tiempo y vintages

Guardar periodo observado, fecha y hora de publicación, fecha de captura, versión del archivo, fuente y revisión. Un dato anual WEO publicado en abril no es información conocida en enero. Conservar edición y bandera observado/estimado/proyectado. Una previsión no sustituye una realización aunque comparta periodo.

Para una decisión tomada el día t, solo usar observaciones publicadas a más tardar en t. Los datos con fecha posterior al corte deben quedar fuera del conjunto de evaluación. La sesión usa corte 2026-10-04; cualquier registro local fechado 2026-10-05 requiere investigar zona horaria, calendario y significado del campo antes de mostrarlo como observación actual.

Separar promedio de periodo, fin de periodo, acumulado del año y flujo del periodo. Para obtener flujos mensuales de acumulados, comprobar reinicio anual y revisiones. No sumar tasas, índices ni stocks; no promediar flujos. No propagar una tasa de encaje anterior más allá de su vigencia conocida.

### Precios, moneda y unidades

Documentar si el cambio es moneda local por USD o la inversa, compra/venta, mayorista/minorista y mercado. Para derivar retorno, convertir consistentemente antes de ponderar. Una variación en BOB de deuda expresada en USD puede reflejar valoración, no nuevo financiamiento.

Una prima basada en USDT, tarjeta o una transferencia no es automáticamente la prima de billete físico. Cualquier medición privada necesita un protocolo de muestra, liquidez, monto mínimo, costo neto, hora, dispersión y cobertura; una observación de pantalla no valida un mercado. No se propone recolectar identidades o transacciones privadas de personas.

El rendimiento real debe usar fórmula compuesta compatible: (1 + retorno nominal)/(1 + inflación) - 1. Para tasas anualizadas, convertir primero a la misma duración. Una diferencia nominal menos inflación puede mostrarse como aproximación si se etiqueta.

### Cobertura, cambios y reconciliación

El INE dispone de una sección de cambio de año de referencia a 2017; las tablas propuestas deben registrar base, método de encadenamiento y revisiones. No empalmar niveles reales de bases distintas mediante concatenación. La cobertura urbana de la ECE no se convierte automáticamente en nacional, y dominios pequeños requieren evaluar errores muestrales. [INE, referencia de cuentas nacionales](https://www.ine.gob.bo/referencia2017/indice_2.html) y [boletines ECE](https://www.ine.gob.bo/index.php/boletines-estadisticos-ece/).

ASFI presenta distintas clases de entidades y fórmulas de indicadores. Un agregado de bancos múltiples no representa todo el sistema financiero; cambios de clasificación pueden crear saltos. Las definiciones de mora, reprogramación y cobertura deben tomarse de la fórmula vigente. [Boletines ASFI](https://www.asfi.gob.bo/pb/boletines-estadisticos).

La página de deuda interna TGN del MEFP declara una exclusión de deuda intrasector con el BCB. La suma con financiamiento del BCB requiere revisar consolidación y no puede denominarse deuda pública total sin definición adicional. [Deuda interna TGN](https://economiayfinanzas.gob.bo/viceministerios/vtcp/deuda-interna-tgn).

Comparar BCB, INE y otras fuentes en tabla de conciliación: concepto, moneda, perímetro, fecha, revisión y diferencia. No sustituir silenciosamente una fuente por otra cuando divergen. Para reservas y balanza de pagos, usar puentes separados de transacciones, valoración y otros cambios.

### Riesgos de inferencia

- Evitar regresiones con niveles no estacionarios sin pruebas y fundamento de cointegración.
- No incluir al mismo tiempo múltiples transformaciones casi equivalentes de dólar, tasa y crédito sin controlar colinealidad.
- No seleccionar docenas de rezagos y mostrar solo el significativo; preregistrar rangos y controlar multiplicidad.
- Modelar respuestas heterogéneas: una depreciación puede beneficiar a un exportador con insumos locales y perjudicar a uno endeudado o dependiente de insumos importados.
- No controlar automáticamente un mediador, como crédito doméstico, si se intenta medir el efecto total del shock externo.
- Tratar anuncios de política doméstica como respuestas potencialmente endógenas a la crisis.
- Separar faltante, cero, dato reservado, no aplicable y no publicado.
- No confundir nuevas cuentas bancarias con inclusión de nuevas personas ni pólizas con personas cubiertas.
- No utilizar un conteo de noticias como medida de riesgo político sin protocolo de cobertura, sesgo editorial, duplicados y validación.

## 7. Hoja de ruta especializada, alineable al plan maestro

| Etapa | Entregable | Trabajo y responsabilidad funcional | Condición de cierre |
|---|---|---|---|
| Semanas 1-2 | Matriz fuente-variable y deduplicación | Curaduría macro y data engineer revisan las 88 familias, divisas ya existentes, códigos, responsables y derechos | Cada P0 tiene fuente exacta o bloqueo explícito; equivalencias registradas |
| Semanas 3-4 | Contratos de datos de tasas, FX y BCB | Engineer prueba Fed, NY Fed, BCB y bancos de socios; economista revisa unidades y calendario | Muestra histórica reproducible, fecha publicación, unidad y agregación validadas |
| Semanas 5-6 | Sector externo y exposición | Curaduría define reservas líquidas, deuda, remesas y pesos de socios; contabilidad concilia stocks/flujos | Sin doble conteo; no disponibles visibles; vintage conservado |
| Semanas 7-8 | Fiscal y financiero P0 | Equipo obtiene cuadros MEFP/ASFI, mapas de entidad y actividad, pruebas de reconciliación | Comparación con publicaciones fuente; rupturas y exclusiones documentadas |
| Semanas 9-10 | Hogares e inflación | Especialista de encuestas valida dominios, ponderadores e intervalos; precios revisa base IPC | Resultados reproducibles con cobertura y error muestral cuando proceda |
| Semanas 11-12 | Seguro, pensiones y fondos | Curaduría obtiene cuadros APS y ASFI; valida emisor, instrumento y periodos | Catálogo P1 con estado de acceso y sin inferir tenencias faltantes |
| Semanas 13-16 | Evaluación de 4 casos prioritarios | Econometría y analista sectorial evalúan inflación, importación, cartera y remesas | Backtest temporal frente a baseline; resultados útiles o descarte documentado |
| Semanas 17-20 | Eventos regulatorios y brechas difíciles | Curaduría legal registra normas; investigación diseña muestra cambiaria si se justifica | Texto fuente, vigencia, codificación revisada y sin hechos legales inferidos |
| Semanas 21-24 | Producto y mantenimiento | Producto publica vistas por decisión; datos define calendario, incidentes y owners | Trazabilidad hasta fuente, alertas de antigüedad y revisión metodológica completadas |

La duración es estimación de planificación, no compromiso de disponibilidad externa. Las familias bloqueadas por licencias, granularidad inexistente o falta de fuente no deben frenar los bloques con evidencia suficiente.

### Backlog inicial de aceptación

Para cada familia P0: identificar cuadro/serie exacta; obtener al menos dos archivos o vintages para revisar cambios; registrar primera/última observación; medir huecos; probar signo y unidad; definir política de agregación; capturar última fecha publicable; comprobar descarga autorizada y atribución; asignar owner; explicar ausencia si falla. Una respuesta HTTP exitosa no constituye validación.

Para derivados: guardar fórmula versionada y linaje a observaciones. Para modelos: registrar ventana de entrenamiento, población objetivo, horizonte, baseline, disponibilidad de datos por fecha, métrica y limitaciones. Aceptar un modelo solo si añade utilidad medible o interpretabilidad útil frente a alternativas simples; no se promete un umbral de precisión sin observar los datos.

## 8. Registro de fuentes y nivel de verificación

Se efectuó búsqueda o apertura de páginas primarias durante esta investigación. **No se ejecutaron descargas completas, pruebas de API, validaciones de historial ni revisión exhaustiva de licencias**.

| Fuente | Evidencia observada | Trabajo pendiente |
|---|---|---|
| [BCB sector externo](https://www.bcb.gob.bo/?q=content%2Fsector-externo-0) | Índice de cuadros de reservas, remesas, tipo real y sector externo | Archivos, fechas, desgloses, derecho de redistribución |
| [BCB sector monetario](https://www.bcb.gob.bo/?q=node%2F237525) | Índice de agregados, base y balances | Cuadro concreto para cada tasa, encaje y crédito |
| [ASFI históricos](https://www.asfi.gob.bo/pb/series-historicas-depositos-del-publico-y-cartera-creditos) | Página temática localizada | Inspección del contenido embebido y descarga |
| [ASFI tarifarios](https://asfi.gob.bo/la/tarifarios) | Publicación de tarifas por productos y transferencias | Tasas efectivas realizadas y límites operativos no probados |
| [ASFI fondos](https://www.asfi.gob.bo/la/reportes-dinamicos) | Descripción de reportes de fondos | Acceso reproducible, granularidad y cobertura |
| [MEFP deuda interna](https://economiayfinanzas.gob.bo/viceministerios/vtcp/deuda-interna-tgn) | Listado de archivos y exclusión contable explícita | Parseo y conciliación |
| [MEFP boletín TGN 2022](https://www.economiayfinanzas.gob.bo/sites/default/files/2023-12/BOLETIN%20TGN%202022.pdf) | Documento histórico localizado | No acredita actualidad de series fiscales ni todos los cuadros candidatos |
| [Fed H.10](https://www.federalreserve.gov/releases/h10/) y [H.15](https://www.federalreserve.gov/releases/h15/) | Páginas de cotizaciones y tasas abiertas | Códigos exactos, descargas y agregación |
| [NY Fed SOFR](https://www.newyorkfed.org/markets/reference-rates/sofr) | Definición, frecuencia de publicación y enlace API visibles | Endpoint probado y términos específicos |
| [BIS LBS](https://data.bis.org/topics/LBS) y [GLI](https://data.bis.org/topics/GLI?m=213) | Metadatos de conjuntos y frecuencia trimestral | Dimensión Bolivia, códigos, cortes y condiciones de uso |
| [BIS descargas](https://data.bis.org/bulkdownload) | Catálogo de formatos CSV y SDMX localizado | Ningún ZIP descargado en esta investigación |
| [FMI WEO](https://data.imf.org/en/datasets/IMF.RES%3AWEO) | Conjunto y vintages localizados mediante búsqueda primaria | Series por país, códigos y corte observado/proyectado |
| [INE ECE](https://www.ine.gob.bo/index.php/boletines-estadisticos-ece/) | Índice de boletines y cuadros | Dominios, ponderadores, acceso a microdatos y precisión |
| [ILOSTAT](https://ilostat.ilo.org/es/data/?cat_mode=subject) | Catálogo de indicadores y distintas definiciones de informalidad | Cobertura específica de Bolivia y empalme de normas |
| [INE referencia 2017](https://www.ine.gob.bo/referencia2017/indice_2.html) | Sección de cuentas nacionales con nueva referencia localizada | Puentes y series compatibles; cuadros de insumo importado |
| [APS](https://www.aps.gob.bo/) | Sitio abierto; boletín trimestral de seguros localizado | Cuadros previsionales exactos, profundidad histórica y condiciones |
| [BCRA catálogo](https://www.bcra.gob.ar/catalogo_de_datos/principales-variables-monetarias-y-financieras/) | Catálogo de variables y acceso API localizado | Versión vigente y códigos; no reutilizar endpoint antiguo sin verificar |
| [Banco Central de Chile](https://www.bcentral.cl/es/web/banco-central/areas/estadisticas/tipos-de-cambios-y-paridades) | Página de tipos de cambio y paridades localizada | Serie exacta, credenciales si exige servicio y licencia |
| [BCRP diarias](https://estadisticas.bcrp.gob.pe/estadisticas/series/diarias) | Catálogo con series de tipo de cambio localizado | Seleccionar compra/venta/mercado y probar descarga |
| [Gaceta Oficial](https://www.gacetaoficialdebolivia.gob.bo/) | Intento de apertura sin éxito por timeout | No se verificó norma alguna; resolver acceso y localizar textos |
| [Cboe VIX](https://www.cboe.com/tradable_products/vix/vix_historical_data/) | Intento de apertura sin éxito por timeout | Serie, acceso y derechos pendientes |

La ruta genérica antigua de WEO consultada devolvió 404; se reemplazó como referencia por el conjunto del portal de datos del FMI. El catálogo BCRA muestra evolución de versiones; el plan exige verificar versión vigente antes de implementar. No se toma un enlace antiguo encontrado en terceros como endpoint validado.

## 9. Resultado esperado

Al completar estas etapas, cada sector del Observatorio podrá conectarse con condiciones de demanda, divisas, liquidez, financiamiento, hogares y regulación mediante relaciones explícitas y verificables. La diversidad se medirá por nuevos mecanismos y decisiones cubiertas, además del conteo de familias. Una serie reutilizada del módulo cambiario con un nuevo vínculo analítico añade utilidad sin inflar el número de datos nuevos.
