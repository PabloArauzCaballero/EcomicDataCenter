# Modelos de lectura para el tablero de indicadores

Tres vistas en el esquema `read_models` sostienen el análisis de los indicadores medidos. Se
consumen conectando directamente a la base con un rol de solo lectura; no requieren pasar por la
API.

Las crea la migración `0031-create-economic-indicator-read-models.ts` y las redefine
`0032-expose-indicator-aggregation.ts`. La creación es idempotente:
cada vista se elimina antes de recrearse y los `GRANT` están guardados por existencia del rol, de
modo que relanzar el conjunto de migraciones sobre una base nueva —o sobre una que ya tenga parte
de esto— converge al mismo estado.

## De dónde sale el valor

El recolector diario envía, junto a la afirmación en prosa, la medición estructurada en
`raw_observation.payload_json -> 'measures'`:

```json
"measures": [
  { "indicatorCode": "FX_PARALLEL_USD_BOB", "priceSide": "BUY",  "value": "11.68", "unit": "BOB/USD" },
  { "indicatorCode": "FX_PARALLEL_USD_BOB", "priceSide": "SELL", "value": "11.51", "unit": "BOB/USD" }
]
```

El valor viaja como texto, exactamente como lo escribe la fuente, para que nunca pase por un
redondeo de coma flotante; las vistas lo convierten a `numeric`. Toda medición está sujeta a la
misma regla que la afirmación: **si la cifra no aparece en el excerpt conservado como evidencia, la
lectura se rechaza entera**. Una afirmación de investigación sin parser detrás no lleva mediciones,
así que nunca aparece en estas vistas.

## De dónde sale la historia

La serie del dólar paralelo **desde el 1 de enero de 2026** no la recogió el colector: se cargó del
export histórico de su editor, conservado en `src/database/seeds/boot/fx-parallel-history.json` con
su procedencia (URL con el rango exacto, instante de obtención y sha256 del payload). Se reconcilia
en cada arranque de la aplicación de forma idempotente, bajo la identidad
`FX_PARALLEL_HISTORY_BACKFILL` y con `trigger_type = 'BACKFILL'`, de modo que una lectura recogida
siempre se distingue de una cargada de archivo. Detalle en `docs/decisions/0018`.

## Promedio diario frente a lectura puntual

El histórico se publica como **promedio diario** de las cotizaciones intradía; el colector registra
el precio **en el momento** en que miró. Son estadísticos distintos y la columna `aggregation` los
separa:

| `aggregation` | Qué es | Origen |
| --- | --- | --- |
| `DAILY_AVERAGE` | El día reducido a un número | Carga histórica |
| `POINT_IN_TIME` | El precio en el instante de la lectura | Colector diario |

`economic_indicator_daily` agrupa por ese campo, así que un día cubierto por ambos produce **dos
filas**, una por estadístico, en vez de un número que no es ninguno. `exchange_rate_gap` prefiere la
lectura observada cuando existe e informa en `official_aggregation` y `parallel_aggregation` cuál
usó. Un gráfico que quiera una sola línea debe elegir: filtrar por `aggregation`, o mostrar la
costura explícitamente.

## Códigos de indicador

Son un contrato: renombrar uno rompe en silencio cualquier panel ya construido sobre él.

| `indicator_code` | Qué mide | `price_side` | Unidad |
| --- | --- | --- | --- |
| `FX_OFFICIAL_USD_BOB` | Tipo de cambio oficial del BCB | `OFFICIAL` | `BOB/USD` |
| `FX_PARALLEL_USD_BOB` | Dólar paralelo cotizado en plazas de mercado | `BUY`, `SELL` | `BOB/USD` |
| `UFV_BOB` | Unidad de Fomento de Vivienda | `NULL` | `BOB/UFV` |

La UFV se remonta al **7 de diciembre de 2001**, el día en que se creó valiendo exactamente
`1.000000`. La serie no la recogió el colector de portada —el BCB publica la tabla del día y ningún
archivo— sino el endpoint que alimenta su propio gráfico, un año por petición, cada uno con su
digest. Se carga como `DAILY_AVERAGE`: el banco calcula un valor por día calendario y lo publica
como el valor de ese día, que no es el mismo estadístico que un precio observado en un instante.

Dos cosas que la serie tiene y que no son defectos. **Baja en deflación**: la UFV se calcula del
IPC, así que retrocede cuando los precios retroceden, y hay dos tramos así —agosto y septiembre de
2002, y diciembre de 2020 a enero de 2021—. Y **se adelanta a hoy**: el banco publica unos quince
días por delante para que un contrato que liquida la semana próxima sepa la unidad ahora.

El paralelo se cotiza en `BOB/USDT` en algunas plazas. La unidad se unifica en `BOB/USD` porque en
este mercado la stablecoin es el sustituto del dólar, y separar la serie por instrumento dejaría a
cada plaza sola en su grupo e impediría la mediana entre plazas. El instrumento real se conserva en
la columna `instrument`, de modo que la sustitución queda a la vista y no supuesta.

## `read_models.economic_indicator_reading`

Grano: **un valor medido**. Una cotización de mercado lleva dos precios, así que una afirmación se
expande en una fila por lado en vez de colapsarse en una.

Trae la procedencia completa en cada fila —`source_url`, `evidence_sha256`,
`evidence_storage_uri`, `publisher`, `publisher_verified`— porque una cifra cuya fuente no se puede
volver a abrir no es reportable. Incluye `status` y `superseded` sin filtrar: sirve para auditar y
para mostrar qué hay pendiente de revisión.

## `read_models.economic_indicator_daily`

Grano: **un punto de serie por día**, por indicador y lado. Solo lecturas `PUBLISHED` y no
sustituidas.

El paralelo lo cotizan varias plazas a la vez, así que el valor del día es su **mediana discreta**:
resiste que una plaza se desvíe, cosa que un promedio no hace, y devuelve un precio que alguien
cotizó de verdad en lugar de un valor a medio camino entre dos. La dispersión viaja al lado
(`value_min`, `value_max`, `value_spread`, `venue_count`) porque un diferencial que se abre entre
plazas es en sí mismo la señal, y una mediana sobre una plaza no es la misma afirmación que una
mediana sobre tres. `venue_count` es `NULL`, no `0`, cuando el indicador no tiene mercado detrás.

Incluye la variación respecto al día anterior: `previous_value_median`, `change_absolute` y
`change_percent`.

## `read_models.exchange_rate_gap`

Grano: **un día**. La brecha cambiaria: cuánto se aparta el precio de mercado del dólar del precio
administrado. En Bolivia este único número carga con la mayor parte de la historia sobre presión
externa, así que se sirve listo para graficar en lugar de que cada consumidor lo derive a su manera.

Se exponen **los dos lados** en vez de elegir uno, porque cuál responde a «cuánto cuesta un dólar»
depende de si lo estás comprando o vendiendo; el punto medio queda disponible para una sola serie
de titular. `venue_count` viaja con la fila para que una brecha calculada sobre una plaza no se
confunda nunca con una de mercado.

## Acceso

`backend_reader` y `backup_operator` reciben `SELECT` sobre las tres vistas. Una vista resuelve sus
lecturas con los privilegios de su propietario, así que una conexión de reportería a la que solo se
le concedan estas tres puede graficar las series sin llegar a tener `SELECT` sobre `intelligence`.

## Consultas de partida

```sql
-- Titular: brecha cambiaria de los últimos 30 días.
SELECT event_date, official_rate, parallel_mid, gap_mid_percent
FROM read_models.exchange_rate_gap
WHERE event_date >= current_date - 30
ORDER BY event_date;

-- Serie del paralelo con su dispersión entre plazas.
SELECT event_date, price_side, value_median, value_spread, venue_count
FROM read_models.economic_indicator_daily
WHERE indicator_code = 'FX_PARALLEL_USD_BOB'
ORDER BY event_date, price_side;

-- Trazabilidad de un dato concreto hasta su evidencia.
SELECT event_date, venue, price_side, value, source_url, evidence_sha256, evidence_storage_uri
FROM read_models.economic_indicator_reading
WHERE indicator_code = 'FX_PARALLEL_USD_BOB' AND event_date = current_date;
```

## `read_models.macro_indicator_annual`

Grano: **un indicador por año**. Clasifica cada serie anual bajo el sector en que un analista la
buscaría. Desde `0055` el antiguo `MONETARIO` está partido en dos, porque eran dos preguntas
distintas metidas en la misma caja:

| `sector` | Qué responde | Series |
| --- | --- | --- |
| `MONETARIO` | Cuánto cuesta el dinero y cuánto hay | 12 |
| `FINANCIERO` | Si el sistema financiero aguanta y hasta dónde llega | 24 |
| `SOCIAL` | Cómo vive la gente | 32 |
| `INSTITUCIONAL` | Si las reglas se sostienen | 12 |

`FINANCIERO` incluye lo que «cobertura bancaria» de verdad nombra —previsiones sobre cartera en
mora (`PROVISIONS_TO_NONPERFORMING_LOANS_PCT`) y capital regulatorio sobre activos ponderados por
riesgo (`BANK_REGULATORY_CAPITAL_PCT_RWA`)— más rentabilidad, liquidez, concentración, profundidad
y alcance físico (sucursales y cajeros por cada cien mil adultos).

`SOCIAL` pasó de una docena de conteos a mortalidad infantil y materna, escolarización,
alfabetización, agua, saneamiento, electricidad, brecha de pobreza, reparto del ingreso, homicidios,
empleo vulnerable y jóvenes que ni estudian ni trabajan, más el **Índice de Desarrollo Humano**
(`HUMAN_DEVELOPMENT_INDEX`, PNUD, 1990-2023).

`INSTITUCIONAL` es nuevo. Reúne las seis estimaciones de gobernanza del Banco Mundial —estado de
derecho, calidad regulatoria, control de la corrupción, efectividad gubernamental, estabilidad
política, voz y rendición de cuentas, todas 1996-2024— con el Índice de Percepción de la Corrupción
de Transparency International y los índices de V-Dem. **Es lo más cerca que el observatorio puede
estar de «libertad económica»**: los índices que llevan ese nombre son de Heritage y del Fraser
Institute, ambos tras protección anti-bot y licencia, y hacer pasar uno de estos por aquel sería
peor que la ausencia.

Las estimaciones de gobernanza van en unidad `SCORE`, no `PERCENT`: corren de −2,5 a +2,5 y un eje
que las dibuje como porcentaje miente. Bolivia cierra 2024 en −1,27 de estado de derecho y −1,25 de
calidad regulatoria.

La columna `statistic` separa tres cosas que no se pueden promediar juntas:

| `statistic` | Qué es |
| --- | --- |
| `PUBLISHED_ANNUAL` | Una cifra que el compilador publica ya como anual |
| `YEAR_END` | El cierre de un año terminado, derivado de una serie diaria |
| `YEAR_TO_DATE` | La última lectura del año en curso, que no es un cierre |

Hoy solo la UFV produce las dos últimas. Su cierre excluye los días que el BCB publica por
adelantado —un cierre hecho de días que no han ocurrido es una proyección disfrazada de lectura— y
el año corriente se etiqueta aparte para que nadie lo compare contra veinticuatro cierres reales
como si fuera uno más.

## `read_models.sovereign_yield_curve`

Grano: **un rendimiento**, es decir una combinación de sesión, instrumento, emisor, moneda, lado
del mercado y banda de plazo. Sale de la tabla de tasas de rendimiento que la Bolsa Boliviana de
Valores cierra cada sesión.

Vive aparte de los indicadores medidos por aritmética, no por gusto: `economic_indicator_daily`
agrupa por indicador y lado, así que un rendimiento admitido ahí se fundiría con todos los demás
del día en una mediana que representaría al Tesoro a tres años y a un depósito a treinta días a la
vez. Nadie cotizó ese número. Por eso los payloads de la curva **no llevan `measures`**, que es la
clave por la que la vista de lecturas los recogería.

`is_sovereign` se computa: `TGN` es el Tesoro General de la Nación y `BCB` el banco central, y
ambos son el Estado endeudándose. Los bancos y las empresas que cotizan al lado se conservan
porque son lo que hace legible al soberano.

```sql
-- Curva soberana de la última sesión, del tramo corto al largo.
SELECT instrument, issuer, currency, tenor_bucket, yield_percent
FROM read_models.sovereign_yield_curve
WHERE is_sovereign AND operation = 'COMPRAVENTA'
  AND event_date = (SELECT max(event_date) FROM read_models.sovereign_yield_curve)
ORDER BY currency, tenor_days_from;
```

## Limitaciones

- El **riesgo país (EMBI)** sigue sin cubrirse. No existe fuente pública legible por máquina para
  Bolivia: JP Morgan lo licencia y el BCB lo reproduce en PDF. `RISK_PREMIUM_ON_LENDING_PCT` es la
  prima de riesgo sobre créditos del Banco Mundial y **no** es el EMBI; no la sustituyas por él.
- Los **bonos soberanos internacionales** (emisiones 2028 y 2030) se negocian fuera de bolsa y no
  aparecen en la curva de la BBV. Lo que hay es el mercado doméstico: BTS del TGN, LRS del BCB y
  cupones.
- La curva de la BBV **no tiene historia**: la bolsa sirve la sesión de cierre y su propio filtro de
  fechas está comentado en la página, así que la serie empieza el día en que corrió el colector y
  crece hacia adelante.
- El tipo de cambio oficial **no** tiene carga histórica diaria: su serie empieza cuando empezó a
  funcionar el colector. El paralelo se remonta a enero y la UFV a 2001.
- Las series de solidez bancaria del compilador multilateral llegan hasta 2015 o 2021 según el
  indicador; para el dato corriente hace falta ASFI, que publica en PDF y XLS y todavía no tiene
  colector.
- **La libertad económica como índice no se cubre.** Heritage y Fraser están tras Cloudflare y una
  licencia; sortear esa protección no es una opción. `INSTITUCIONAL` mide las cosas por las que se
  leen esos índices —cumplimiento de contratos, previsibilidad regulatoria, captura del cargo
  público— pero no es ninguno de los dos y no debe citarse como si lo fuera.
- Los índices compuestos son **construcciones, no conteos**. Cada uno viaja con la institución que
  lo elabora, y ese nombre es parte de la cifra: «28» no dice nada hasta que dice «28 según
  Transparency International». Our World in Data es el archivo del que se descargan, no su autor, y
  el seed guarda los dos por separado.
- La serie de pobreza y desigualdad del compilador se recalcula hacia atrás cuando cambia la línea
  de pobreza internacional; una carga nueva puede mover años ya cargados. Se resuelve por digest:
  la cifra vieja y la nueva conviven como lecturas distintas de artefactos distintos.
- Son vistas, no tablas materializadas. Con el volumen actual —unas pocas lecturas al día— se
  resuelven de inmediato; si la historia crece hasta hacerlas lentas, la decisión de materializar
  debe medirse antes, no anticiparse.
