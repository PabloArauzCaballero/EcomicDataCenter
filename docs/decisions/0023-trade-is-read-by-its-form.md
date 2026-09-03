# ADR 0023 — El comercio se lee por su forma de hacer negocio, no por la plataforma

- **Estado**: aceptada
- **Fecha**: 2026-08-28
- **Reemplaza a**: ninguna
- **Relacionada con**: ADR 0016 (entrada no confiable), ADR 0020 (materializar los modelos de
  lectura), ADR 0022 (las lecturas sociales entran como expectativa, nunca como medición)

## Contexto

ADR 0022 abrió el registro de lecturas sociales con cuatro asuntos: audiencia, tema, emoción y
comercio. El asunto `COMMERCE` quedó siendo el más pobre de los cuatro —doce lecturas, y la mitad
de un solo panel de hogares— y a la vez el único que responde la pregunta económica que el
observatorio existe para responder: **cómo compra y cómo vende este país**.

La revisión externa fue explícita: la analítica de redes describía plataformas, no mercados. Con
ese registro se podía decir cuánta audiencia declara TikTok y qué emoción dominó un conflicto, y no
se podía decir por dónde pasa el comercio real de Bolivia. Cuatro hechos del propio catálogo
muestran el tamaño del hueco:

1. **El comercio boliviano es mayoritariamente informal, y esa es su estructura, no su anomalía.**
   El Censo 2024 registra 51,8 % de ocupados por cuenta propia contra 37,5 % de obreros y
   empleados. Ninguna lectura del registro distinguía una feria de un centro comercial.

2. **Los canales no se reparten un mercado: se superponen.** El 71 % de los hogares compra ropa en
   ferias populares, el 37 % en mercados tradicionales y el 24 % en centros comerciales. La suma
   pasa de 155 %, porque el mismo hogar compra en varios canales. Sumar esas cifras como si fueran
   cuotas de mercado es el error más probable que puede cometerse con este registro.

3. **La venta se descubre en una plataforma y se liquida a mano.** El 31 % de las compras hechas
   por redes sociales se paga físicamente al recibir el producto, y el 32 % de quienes compran por
   internet no concreta el pago en línea. Clasificar esas ventas como comercio electrónico
   describe la vitrina y pierde la operación.

4. **La misma cifra puede ser penetración, gasto o valor.** «71 % de hogares» y «26,5 % del gasto
   del shopper» son ambas porcentajes sobre canales, y sumarlas produce un número que no significa
   nada.

## Drivers

- Que la analítica responda por forma de hacer negocio y no por plataforma.
- Que el peso de lo informal sea una columna, no una interpretación del lector.
- Que un hueco de cobertura aparezca como fila y no como ausencia.
- Que ninguna cifra social siga pudiendo alcanzar una serie medida.

## Decisión

### 1. `COMMERCE` deja de significar «compras en plataformas» y pasa a significar «formas de comerciar»

El asunto se amplía deliberadamente. Una lectura de comercio social no significa nada sin los
canales no digitales con los que compite: el 16 % que llega por Marketplace solo se entiende junto
al 71 % que compra en ferias. Entran por tanto en el registro las lecturas sobre ferias, mercados,
tiendas de barrio, catálogo, contrabando y trabajo por cuenta propia, siempre bajo la misma regla
que ADR 0022 fijó: **compilador de tercero identificable, nunca una medición oficial disfrazada de
lectura**. Las cifras medidas del Estado siguen entrando por el camino de indicadores, donde el
control de publicación exige `OFFICIAL`.

### 2. La forma de hacer negocio se deriva en SQL, desde la etiqueta

`read_models.social_commerce` deriva ocho dimensiones en expresiones visibles y discutibles:

- **`business_form`** — `FERIA_POPULAR`, `MERCADO_TRADICIONAL`, `TIENDA_BARRIO`, `SUPERMERCADO`,
  `CENTRO_COMERCIAL`, `BOUTIQUE`, `VENTA_CATALOGO`, `COMERCIO_SOCIAL`, `COMERCIO_ELECTRONICO`,
  `CONTRABANDO`, `CUENTA_PROPIA`, `NINGUNA`.
- **`market_regime`** — `INFORMAL`, `MIXTO`, `FORMAL`, derivado de la forma y nunca anotado a mano.
- **`trade_side`** — `DEMANDA`, `OFERTA`, `INFRAESTRUCTURA`, `FRICCION`. Una penetración de hogares
  y la facturación semanal de una feria no se promedian.
- **`settlement_means`** — `QR`, `BILLETERA_MOVIL`, `TARJETA`, `TRANSFERENCIA`, `PASARELA`,
  `CONTRA_ENTREGA`, `EFECTIVO`.
- **`goods_class`** — `ROPA`, `ALIMENTOS`, `TECNOLOGIA`, `SERVICIOS`, `TRANSVERSAL`.
- **`measure_kind`** — `PENETRACION`, `ESTRUCTURA`, `VARIACION`, `VALOR`, `CONTEO`, `FRECUENCIA`,
  `PERSONAS`. Es la guarda del hecho 4: solo `PENETRACION` se suma.
- **`population_scope`** — `TOTAL` o `SEGMENTO`, para que el 43 % de estratos altos no se sume al
  24 % del total de hogares.
- **`territory`** — departamento o ciudad cuando la etiqueta lo nombra, `URBANO`, `RURAL` o
  `NACIONAL`. El comercio informal de El Alto no es el de Santa Cruz.

Se deriva de la **etiqueta** y no del enunciado, al revés que el `official_counterpart` de ADR
0022. La razón es la contraria y simétrica: el enunciado de una lectura de canal nombra todos los
canales contra los que se midió, de modo que emparejar sobre él archivaría una lectura de ferias
bajo el supermercado con el que se la comparó.

### 3. La suma de canales se publica con el nombre de lo que es

`read_models.informal_trade_channel_mix` expone `penetration_sum` (que pasa de 100 y debe pasarlo),
`channels_per_household` —1,55 canales por hogar para ropa en 2025— e `informal_share_of_visits`,
que es participación **de visitas y no de dinero**: un tique de centro comercial y uno de feria no
son del mismo tamaño y el registro no tiene lectura de ninguno de los dos. Para ropa en 2025 el
69,7 % de esas visitas ocurre en canales informales.

Los tres números solo se publican cuando el grupo tiene **una lectura por forma de comercio**, lo
que declara `one_reading_per_form`. El estudio de comercio social lo obliga: hace seis preguntas
distintas —quién cierra por WhatsApp, quién llega por Marketplace, quién vio un anuncio— y las seis
respuestas caen en `COMERCIO_SOCIAL`. Sumadas dan 194 y no significan nada, porque son seis
lecturas de un canal y no seis canales. La fila se publica igual, con sus conteos; los cocientes
quedan nulos.

### 4. Los huecos son filas

`read_models.informal_trade_coverage` escribe el vocabulario completo como filas y marca `unread`
la forma que nadie midió. Un panel que solo muestre lo que existe presenta el silencio como
ausencia; la cobertura del comercio informal es desigual por naturaleza y tiene que verse.

### 5. La distancia contra la serie medida es el indicador, también aquí

`read_models.informal_trade_gap` enfrenta la lectura con la serie anual medida del mismo año, y lo
hace con **dos emparejamientos y ninguno más**, porque un emparejamiento no conmensurable es peor
que ninguno:

- La proporción censal de ocupados por cuenta propia contra la serie modelada de empleo vulnerable
  (`VULNERABLE_EMPLOYMENT_PCT`). Cuentan a la misma gente en la misma unidad y aun así difieren:
  51,8 % del Censo 2024 contra 62,93 % de la serie, once puntos que se explican porque una suma a
  los trabajadores familiares no remunerados y la otra no. Esa diferencia es la lectura.
- Una tasa contra una tasa: la caída de volumen de la canasta contra la inflación medida del año
  (`CPI_INFLATION_ANNUAL_PCT`).

La columna se llama `distance_points` y nunca `error`: son dos mediciones distintas de una misma
economía, hechas por casas distintas con métodos distintos. La primera versión de esta vista
emparejaba por `official_counterpart` y llegó a reportar que el 71 % de hogares que compra ropa en
ferias está 47 puntos por debajo del consumo de los hogares sobre el PIB, que no es un hallazgo
sino un error de categoría impreso como número.

`PAGOS` queda sin contraparte a propósito, porque la serie medida de pagos —el Informe de
Vigilancia del Sistema de Pagos del BCB— todavía no está cargada en el registro de indicadores, y
mapearla a cajeros o sucursales inventaría una comparación que nadie hizo.

## Consecuencias

**A favor**

- La analítica responde por forma de hacer negocio, con régimen, lado del mostrador, medio de pago,
  canasta y territorio, y no por plataforma.
- El peso de lo informal es una columna calculada, no una lectura del analista.
- Los huecos de cobertura se reportan solos en cada corrida de `yarn social:trade`.

**En contra, y asumido**

- **La clasificación depende de cómo esté escrita la etiqueta.** Una lectura mal redactada cae en
  `NINGUNA` y desaparece de los paneles sin que nada falle. Se mitiga con la prueba
  `informal-trade-readings.spec.ts`, que corre el mismo vocabulario sin base de datos y exige que
  las cinco formas informales tengan al menos una lectura.
- **El catálogo sigue creciendo a mano.** ADR 0022 lo asumió y aquí pesa más: no hay recolector
  para ferias ni para contrabando, y no puede haberlo.
- **Hay lecturas viejas.** La única cifra cuantificada de una feria popular es de 2017. Entra con
  su período declarado y grado bajo, porque el modelo no rellena huecos con estimaciones.
- **`COMERCIO_SOCIAL` es `MIXTO` y es discutible.** Una venta ofrecida en Marketplace, acordada por
  WhatsApp y pagada en efectivo en la puerta es informal en todo menos en su vitrina. Queda entre
  los dos regímenes, en una expresión que se puede discutir y corregir.

## Alternativas descartadas

- **Persistir la forma de negocio al ingerir.** Rechazada por la misma razón que ADR 0020 y 0022:
  cambiar la regla obligaría a reescribir datos crudos, que son inmutables.
- **Un registro nuevo, separado del social.** Rechazada: duplicaría runner, esquema, pruebas y
  procedencia para las mismas lecturas de terceros, y separaría la venta por Marketplace de la
  venta en feria justo cuando el hallazgo es que son el mismo comercio.
- **Cargar las cifras del BCB y del INE en este registro para llenar el panel.** Rechazada: son
  mediciones oficiales y este registro es de expectativa y lectura de terceros. Entrarían por el
  camino de indicadores o no entran.
- **Sumar los canales y publicar la participación de cada uno.** Rechazada: son respuestas
  múltiples. Publicar «feria 46 % del mercado» sería inventar una cuota que nadie midió.
- **Estimar el comercio informal faltante con un modelo.** Rechazada: el observatorio registra lo
  que alguien publicó y con qué método, no lo que falta.

## Evidencia

Migración `0065-read-trade-by-form`, vocabulario en
`src/database/migration-sql/0065-read-trade-by-form.lexicon.ts`, catálogo ampliado en
`src/database/seeds/boot/social-readings.json` (101 lecturas, 45 nuevas), prueba
`src/database/seeds/tests/informal-trade-readings.spec.ts` y reporte `yarn social:trade`.
