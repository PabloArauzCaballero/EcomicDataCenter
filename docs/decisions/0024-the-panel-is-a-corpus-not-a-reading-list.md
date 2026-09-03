# ADR 0024 — El panel mundial entra completo, no como lista de lectura

- **Estado**: aceptada
- **Fecha**: 2026-08-29
- **Reemplaza a**: ninguna
- **Relacionada con**: ADR 0007 (proyecciones de lectura), ADR 0017 (recolección determinista),
  ADR 0020 (materializar los modelos de lectura)

## Contexto

El observatorio cargaba **117 series anuales** del Banco Mundial para Bolivia, elegidas a mano.
Eso no es un corpus: es una lista de lectura. Quién decidió que esas ciento diecisiete valían la
pena lo hizo una vez, y **toda pregunta fuera de la lista se quedaba sin datos** —no porque el
publicador no los tuviera, sino porque nadie los había pedido.

Tres hechos condicionan esta decisión:

1. **La colección completa existe y es pública.** Los World Development Indicators tienen 1.498
   series con las mismas definiciones para todos los países, servidas por la misma API sin clave.

2. **Una cifra boliviana sola no se puede leer.** Un ratio que parece alarmante suele ser la norma
   regional, o al revés, que importa más. El Banco Mundial publica cada indicador con la misma
   definición para los vecinos y los socios comerciales, así que la comparación no cuesta un
   método nuevo: cuesta pedir más países en la misma llamada.

3. **La vía de ingesta existente no aguanta el volumen.** Cada cargador crea observación, claim y
   evidencia de a una fila. Es claro y correcto con mil filas; con un millón son tres millones de
   viajes de ida y vuelta, que contra una base en otro continente son días.

## Drivers

- Que el observatorio deje de responder solo lo que alguien anticipó preguntar.
- Que cada cifra boliviana se pueda leer contra la región y contra sus socios.
- Que la procedencia siga siendo por serie y verificable, no por corpus.
- Que cargar un millón de filas sea cuestión de minutos y no de días.

## Decisión

### 1. Entra la colección completa, no una selección

`yarn macro:panel` recorre las 1.498 series del catálogo y pide cada una para **30 economías**:
Sudamérica completa, Centroamérica, México y el Caribe, y los seis socios grandes que compran lo
que la región vende. Resultado: **1.279.691 observaciones** en 1.489 series (9 indicadores no
tienen dato para ninguna de las 30).

Los países no son un adorno comparativo: son la mitad de la lectura. Sin ellos, «Bolivia tiene 62 %
de empleo vulnerable» es un número sin escala.

### 2. La procedencia es por serie, nunca por corpus

Cada serie guarda **su propia dirección y su propio digest** sobre los bytes que devolvió esa
llamada. Un digest sobre el panel entero no probaría nada sobre ninguna serie dentro de él: lo que
hace comprobable una cifra es que un lector pueda pedir la misma URL y obtener el mismo hash.

La evidencia de cada observación es **la cifra misma con su país y su año**. El Banco Mundial sirve
un número, no una oración; escribir un extracto más largo sería inventar prosa que el publicador
nunca escribió.

### 3. El archivo guarda tripletas, no objetos

El corpus se escribe como `[ISO3, año, valor]`. Expandido a un objeto por observación, este mismo
corpus son **cien megabytes de claves repetidas**; como tripletas son 33 MB. La forma que quiere un
cargador y la forma que debe tener un archivo no son la misma cosa a un millón de filas.

### 4. El cargador agrupa, y esa es la única diferencia

`boot-seed.worldbank-panel.ts` inserta de a mil filas por sentencia en las tres tablas. Las filas
son **las mismas filas**: mismo payload, mismo digest, mismo claim, misma evidencia apuntando a la
misma dirección. Lo único que cambia es cuántas viajan juntas.

Sigue siendo una sola transacción, como todo catálogo de arranque: o está el corpus entero o no
está ninguno. Reejecutar es barato porque cada payload lleva digest y lo ya presente se salta sin
escribir.

### 5. El panel se lee aparte de las series medidas de Bolivia

`read_models.world_panel_reading` queda separado de `economic_indicator_reading`, y no por prolijidad:

- Este corpus es cien veces más grande. Un consumidor de las series bolivianas que barriera el
  modelo viejo empezaría a barrer un millón de filas que nunca pidió.
- Es un panel: **cada fila lleva país**, dimensión que ningún lector del modelo viejo espera ni
  filtra.

`read_models.world_panel_catalogue` es el índice de 1.489 filas que un lector necesita antes de
poder elegir algo, materializado porque agrupar un millón de filas en cada visita es exactamente la
falla que los modelos de prensa ya aprendieron.

`bolivia_years` va al lado de `observations` a propósito: un indicador con sesenta años de datos
chilenos y ninguno boliviano **no es una serie boliviana**, y un catálogo ordenado por conteo de
filas lo pondría primero.

## Consecuencias

**A favor**

- El observatorio pasa de 117 a 1.489 series y de 63 mil a más de 1,3 millones de observaciones.
- Toda cifra boliviana se puede leer contra 29 economías con la misma definición.
- La vía de ingesta masiva queda escrita y probada para el próximo corpus grande.

**En contra, y asumido**

- **33 MB de seeds nuevos.** El repositorio crece a la mitad otra vez. Es el precio de que el
  corpus sea reproducible desde el árbol y no desde la memoria de quien lo recolectó.
- **La carga tarda.** Minutos contra la base local, más contra Neon. Es una carga de arranque, no
  una operación de cada día.
- **Las unidades no se normalizan.** Cada serie queda en la unidad que el publicador usó —un
  ratio, un conteo, un total en dólares constantes— porque convertirlas aquí sería inventar una
  equivalencia que el Banco Mundial no publicó. Un lector que sume dos indicadores sin mirar la
  unidad obtendrá basura, y el modelo no puede impedírselo.
- **Comparar países no es comparar realidades.** Que la definición sea la misma no garantiza que
  la medición lo sea: dos oficinas de estadística con capacidades distintas producen series
  distintas bajo el mismo código. El panel expone la comparación; no la avala.

## Alternativas descartadas

- **Ampliar la lista a mano hasta 300 o 400 series.** Rechazada: mueve el problema sin resolverlo.
  La lista seguiría siendo la respuesta de alguien a preguntas que anticipó.
- **Cargar solo Bolivia y pedir los comparadores al vuelo.** Rechazada: una lectura que depende de
  una llamada externa en el momento de servirla no es reproducible ni auditable, y contradice el
  modelo de evidencia del resto del sistema.
- **Guardar el corpus fuera del repositorio.** Rechazada: los seeds de arranque son parte del árbol
  y ya llegan a 17 MB en un solo archivo. Un corpus que solo existe en la máquina que lo recolectó
  no es reproducible.
- **UN Comtrade a nivel de producto y socio.** Descartada por ahora, no por diseño: el endpoint
  público corta en 500 filas por llamada y el detalle completo exige clave de suscripción. Es la
  fuente natural del próximo millón cuando esa clave exista.
- **Insertar con COPY en vez de lotes.** Rechazada: obligaría a escribir el SQL a mano por tabla y
  a saltarse los modelos, perdiendo las validaciones y los defaults que el resto de la ingesta
  respeta. Los lotes de mil ya bajan la carga de días a minutos.

## Evidencia

Recolector `scripts/macro/collect-worldbank-panel.ts` (1.279.691 observaciones, 1.489 series, 25
archivos, 0 fallos), esquema `worldbank-panel.schema.ts`, cargador
`boot-seed.worldbank-panel.ts`, migración `0067-read-the-world-panel`, y el catálogo cargado en la
base remota.
