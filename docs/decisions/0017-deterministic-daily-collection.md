# ADR-0017: recolección diaria determinista y publicación de lecturas de indicador

- Estado: aceptado
- Fecha: 2026-08-22
- Responsables: arquitectura y datos

## Contexto

El flujo `daily-economic-research` falló **todas** sus ejecuciones desde su puesta en marcha.
Evidencia descargada de GitHub Actions (informes `daily-economic-report.json` de las ejecuciones
32534656445, 32555124632, 32568635877, 32585909981 y 32603468494):

- `aiError` presente en todas: `429 rate_limit_exceeded` del proveedor (límite de 30 000 tokens por
  minuto, la petición sola reclamaba 16 512) y en una ocasión `413 Request Entity Too Large`. La
  investigación con IA nunca llegó a ejecutarse.
- `publishedCount: 0` y `pendingReviewCount: 2` en todas: las dos únicas lecturas que sobrevivían
  —tipo de cambio oficial y UFV, recogidas directamente del BCB— se degradaban a confianza `LOW`
  por `SOURCE_METADATA_UNAVAILABLE` y quedaban bajo el umbral de publicación automática.
- `missingRequiredCategories: ["SOVEREIGN_BONDS"]` en todas, incluidos sábados y domingos.
- Ninguna categoría cubría el dólar paralelo, que es la variable de mayor demanda del observatorio.

El resultado neto: el núcleo recogía dos datos al día, no publicaba ninguno, y marcaba cada
ejecución en rojo. Un flujo que siempre falla no distingue el fallo real del ruido.

## Drivers

- Que el dato garantizado del día se publique sin intervención humana cuando su evidencia es
  verificable, sin relajar la frontera de contenido no confiable del ADR-0016.
- Que la investigación con IA deje de ser punto único de fallo de la cobertura diaria.
- Que el rojo del planificador signifique algo.

## Decisiones

### 1. La identidad del editor puede establecerla el dominio descargado

`verified-source-registry.ts` registra dominios institucionales (`bcb.gob.bo`, `ine.gob.bo`,
`asfi.gob.bo`, `economiayfinanzas.gob.bo`, `bbv.com.bo`, `udape.gob.bo`) y de mercado
(`dolarbluebolivia.click`). El host **no** es autodeclarado: la guardia SSRF lo resolvió y los bytes
verificados se descargaron de él, de modo que quien haya descubierto la URL —un parser determinista
o el modelo de investigación— no puede falsificarlo. Se exige `https`, se aceptan subdominios y se
rechaza el sufijo impostor (`bcb.gob.bo.atacante.example`).

Una tabla oficial de cotizaciones vigente declara su fecha de vigencia en el cuerpo y ninguna fecha
de publicación. `undatedOfficialIndicator` acepta esa ausencia **solo** para `DAILY_INDICATOR` de
dominio `OFFICIAL` cuyo candidato tampoco declara fecha: no hay nada que un modelo pudiera haber
inventado. Noticias, datos de mercado y candidatos que sí declaran fecha mantienen la exigencia.

`json-source-metadata.ts` extrae el instante declarado por una fuente JSON, de modo que un dato de
mercado se verifica contra la marca de tiempo que la propia fuente publica.

### 2. El impacto deja de bloquear una lectura de indicador

`routeClaim` enviaba a revisión humana todo lo de impacto `HIGH` o `CRITICAL`. Como solo `FACT` e
`INDICATOR_READING` son publicables automáticamente, la puerta únicamente mordía sobre el dato
objetivo y verificable: cuanto más importante era una cifra, menos podía publicarse.

El impacto expresa qué tan significativa es una cifra, no qué tan bien está evidenciada, y no cambia
si el número se copió correctamente de su fuente. `INDICATOR_READING` queda exento de la puerta de
impacto. Siguen aplicándose sin excepción: cuarentena por inyección, umbral de confianza, anclaje
léxico y cuantitativo al excerpt citado, verificación de editor y fecha, y revisión obligatoria ante
conflicto con una afirmación ya publicada. `FACT` conserva la puerta: ahí el impacto sí decide
cuánto cuesta un error.

### 3. Cobertura garantizada frente a cobertura deseable

Requeridas (las produce un colector determinista cualquier día del calendario):
`FX_OFFICIAL`, `FX_PARALLEL`, `UFV`. Su ausencia marca la ejecución como fallida.

Deseables: `SOVEREIGN_BONDS`, `MACRO_DAILY`, `COMPANY_NEWS`. Dependen de una publicación que no
existe en fin de semana ni feriado. Se registran en `coverage.missingDesiredCategories` y nunca
fallan la ejecución. Un fallo de la IA o de una fuente concreta se registra como advertencia, no
como fallo del planificador.

### 4. El dólar paralelo se observa donde se cotiza

Bolivia no publica una cotización paralela oficial. Se leen tres plazas de forma independiente
(`eldorado`, `saldoar`, `takenos`) vía `api.dolarbluebolivia.click`, cada una como afirmación propia
con su propia evidencia: tres plazas que coinciden se corroboran entre sí y una que se desvía queda
visible en lugar de diluirse en un promedio. El excerpt se recorta del texto de la respuesta, nunca
se reconstruye a partir de los valores parseados, de modo que la cita está garantizada en los bytes
que se hashean y almacenan.

Se evaluó Binance P2P como fuente primaria y se descartó: su endpoint solo responde a `POST`, y una
evidencia que no puede volver a obtenerse con la sola URL no es reauditable, que es justamente lo
que el modelo de procedencia de este núcleo exige.

### 5. El presupuesto de tokens es parte del contrato con el proveedor

El cuerpo de la petición serializaba el JSON Schema completo de la respuesta, que costaba más
tokens que las propias instrucciones. El proveedor factura prompt, bucle de búsqueda y compleción
reservada contra la misma ventana por minuto, así que cada intento se rechazaba antes de investigar
nada. Ahora se envía la lista de campos, no el esquema; el resultado se valida igualmente contra el
esquema real al llegar. Tope de resultados 20 → 12, compleción reservada 6 000 → 3 000 tokens, un
reintento adicional. Una prueba fija el tamaño máximo de las instrucciones para que no vuelva a
crecer.

## Consecuencias

- El tipo de cambio oficial, la UFV y el dólar paralelo se publican automáticamente cuando su
  evidencia es verificable; dejan de acumular tareas de revisión idénticas tres veces al día.
- La cobertura diaria garantizada ya no depende del proveedor de IA.
- Una ejecución en rojo vuelve a significar que falta un dato garantizado.
- Ampliar el registro de dominios es una decisión de gobernanza: añadir un dominio equivale a
  aceptar que su operador es un editor verificable.
- `FX_PARALLEL` depende de un agregador de terceros. Si cambia su contrato, la categoría requerida
  falla y la ejecución se marca en rojo, que es el comportamiento buscado.
