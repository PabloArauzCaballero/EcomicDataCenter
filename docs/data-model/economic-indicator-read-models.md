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

## Limitaciones

- Solo cubren tipo de cambio oficial, UFV y dólar paralelo. Bonos soberanos, macro y noticias
  empresariales dependen de la investigación con IA y hoy no producen mediciones estructuradas.
- El tipo de cambio oficial y la UFV **no** tienen carga histórica: su serie empieza cuando empezó
  a funcionar el colector. Solo el paralelo se remonta a enero.
- Son vistas, no tablas materializadas. Con el volumen actual —unas pocas lecturas al día— se
  resuelven de inmediato; si la historia crece hasta hacerlas lentas, la decisión de materializar
  debe medirse antes, no anticiparse.
