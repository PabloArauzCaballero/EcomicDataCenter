# ADR 0022 — Las lecturas sociales entran como expectativa, nunca como medición

- **Estado**: aceptada
- **Fecha**: 2026-08-27
- **Reemplaza a**: ninguna
- **Relacionada con**: ADR 0016 (entrada no confiable), ADR 0019 (cobertura de prensa),
  ADR 0020 (materializar los modelos de lectura)

## Contexto

El observatorio lee hoy cuatro clases de publicador: instituciones (`OFFICIAL`), plazas de
mercado (`MARKET`), gremios que compilan sus propias cifras (`SECTOR`) y medios (`PRESS`). Falta
lo que ocurre en redes sociales, y falta por una razón que el modelo tiene que hacer explícita
antes de escribir una línea de ingesta.

Se levantó una radiografía documental de temas, emociones y comportamiento de compra en las redes
bolivianas. Cuatro hallazgos condicionan este diseño:

1. **Las plataformas declaran audiencias que exceden a la población.** TikTok reporta 9,43
   millones de adultos alcanzables en Bolivia: el 115,2 % de la población adulta y el 104,9 % de
   los internautas. Esa cifra no cuenta personas; cuenta cuentas, duplicados y atribución
   geográfica imprecisa. Además coincide dígito por dígito —y en el reparto por género— con el
   total país de «identidades en redes sociales» que publica el mismo compilador, lo que sugiere
   que el titular está anclado a la plataforma que más declara.

2. **La identidad del emisor no es verificable.** En el monitoreo de 362 contenidos del conflicto
   de mayo de 2026, el 39 % de las cuentas difusoras se presentaba como medio sin serlo, imitando
   a Red Uno, Unitel, El Deber, Bolivisión y ATB. En prensa, el dominio descargado establece quién
   publicó; en una plataforma no hay equivalente.

3. **El tono social no es polaridad.** En ese mismo corpus, las publicaciones sobre muertos en el
   conflicto recibieron mayoritariamente la reacción «me divierte». La burla marca pertenencia de
   bando, no diversión, y un clasificador de polaridad simple la leería como afecto positivo. El
   léxico de tono vigente clasifica titulares de prensa, donde ese registro es raro.

4. **No hay vía de recolección legítima.** La Meta Content Library exige institución académica o
   sin fines de lucro calificada, postulación vía ICPSR y aprobación de comité de ética. La
   TikTok Research API está limitada a EE. UU., EEE, Reino Unido, Suiza, organizaciones sin fines
   de lucro registradas en la UE, e investigadores de Brasil sobre seguridad juvenil: **Bolivia no
   está cubierta**. El scraping de perfiles viola términos de uso y no produce procedencia
   verificable.

## Drivers

- Que el observatorio pueda registrar lo que el país espera, además de lo que el país mide.
- Que ninguna cifra de origen social alcance jamás una serie.
- Que la ausencia de acceso primario quede escrita en el modelo, no disimulada por él.
- Que agregar una lectura social no obligue a agregar un recolector nuevo al servicio.

## Decisión

### 1. Se agrega el nivel `SOCIAL`, y su significado es lo contrario de una credencial

`VerifiedSourceTier` gana `SOCIAL`. A diferencia de los otros cuatro, este nivel **no establece un
publicador**: establece únicamente la plataforma sobre la que un contenido estuvo, y afirma que su
autor es desconocido. `facebook.com` registra que algo estuvo en Facebook; no registra que lo haya
escrito quien dice haberlo escrito.

La función `establishesAuthor` lo hace verificable en código: devuelve `false` para `SOCIAL` y
`true` para todo lo demás. Los dos controles que admiten una cifra al camino de publicación
automática —`documentStatedPublication` y `undatedOfficialIndicator`— ya exigen `OFFICIAL`, de modo
que el nuevo nivel no puede alimentar una serie por construcción, y una prueba lo fija.

### 2. Lo que se ingiere es la lectura publicada, no la plataforma

El observatorio no recolecta redes: recolecta **lo que terceros publicaron sobre las redes**. Cada
registro es una lectura con su compilador, su fecha, su método declarado y su grado de evidencia.
La afirmación es deliberadamente estrecha, como en prensa: *«DataReportal publicó el 2025-11-01:
TikTok declara 9,43 millones de adultos alcanzables en Bolivia»*. Que esa cifra describa personas
no es algo que el observatorio pueda establecer, y el registro no lo pretende.

Los compiladores de investigación —DataReportal, Kantar, IPDRS, Internet Bolivia— se registran
bajo `SECTOR`, cuyo significado se amplía de «gremio» a «compilador privado que publica sus
propias cifras bajo su propio método». La lógica ya estaba escrita para los gremios y es la misma:
atribución, nunca entrada automática a una serie.

### 3. El grado de evidencia viaja con la cifra

Cada lectura declara `HIGH`, `MEDIUM` o `LOW`:

- `HIGH` — fuente identificable, método declarado, cifra reproducible.
- `MEDIUM` — fuente seria con método parcial, o cifra de un solo estudio.
- `LOW` — proveedor comercial sin método publicado; indicativa, no citable.

El grado determina la confianza del `fact_claim` (`MEDIUM` para `HIGH`, `LOW` para el resto) y
queda expuesto como columna, de modo que un lector pueda excluir el grado bajo sin recompilar
nada. Un ranking comercial de creadores que ordena por «engagement auténtico» y coloca en el mismo
podio cuentas de 18 millones y de 4 mil seguidores entra como `LOW` o no entra.

### 4. El digest identifica el registro, no la publicación

En prensa, el `sha256` del artefacto es el digest del listado efectivamente descargado. Aquí no
hay descarga: un informe de industria se lee, se cita y se registra. El digest se calcula sobre el
descriptor canónico de la publicación —compilador, dirección, fecha, título— y **identifica el
registro que el observatorio hizo de ella, no una copia byte a byte del documento**. La dirección
se conserva como localizador para que un lector abra el original. Escribirlo de otro modo
atribuiría al artefacto una recuperación que no ocurrió.

### 5. La clasificación se deriva en SQL, como en prensa

`read_models.social_reading` deriva dos cosas en una expresión visible y discutible:

- **`emotional_register`** — `MIEDO`, `INDIGNACION`, `BURLA`, `RESIGNACION` o `NINGUNO`. Cuatro
  registros y no tres polaridades, por el hallazgo 3. `BURLA` existe precisamente porque un
  clasificador de polaridad la contaría como afecto positivo.
- **`official_counterpart`** — la serie oficial contra la cual una lectura social puede
  contrastarse (`PRECIOS`, `CAMBIARIO`, `PAGOS`, `NINGUNO`). Es la operación que da valor a la
  serie: en 2025 las redes anticiparon hiperinflación mientras el dato cerró en 20,8 %, y **la
  distancia entre ambas es el indicador**, no el nivel social por sí solo.

`read_models.social_platform_audience` aplica en SQL la corrección del hallazgo 1: marca
`reach_exceeds_population` cuando el alcance declarado supera a la población de referencia, para
que ninguna lectura del país tome un techo comercial por penetración.

## Consecuencias

**A favor**

- El observatorio registra expectativa y ánimo con la misma trazabilidad que una serie medida, y
  sin poder confundirse con ella.
- La imposibilidad de acceso primario queda documentada en el modelo y en este ADR, no en la
  memoria de quien lo construyó.
- Agregar una lectura es agregar una fila a un catálogo, no un recolector nuevo.

**En contra, y asumido**

- **El catálogo se mantiene a mano.** No hay recolector automático porque no hay vía legítima para
  uno. Cada lectura entra cuando alguien la lee y la registra. Es lento y es visible; una ingesta
  automática que no puede existir sería peor.
- **Las cifras envejecen sin avisar.** Un estudio anual queda viejo y nada en el sistema lo
  detecta. Se mitiga con `referencePeriod` obligatorio: una lectura sin período no entra.
- **La cobertura es desigual.** Hay mucha audiencia, poca emoción medida y casi ninguna serie de
  comportamiento de compra con método publicado. El modelo no rellena ese hueco con estimaciones.

## Alternativas descartadas

- **Recolectar perfiles públicos con navegador.** Rechazada: viola términos de uso, los perfiles
  devuelven muros de sesión, y un conteo sin procedencia verificable rompe el modelo de evidencia
  que el resto del sistema sostiene.
- **Persistir tema y registro emocional al ingerir.** Rechazada por la misma razón que en ADR
  0020: cambiar una regla obligaría a reescribir datos crudos, que son inmutables.
- **Colgar las lecturas sociales de las series de indicadores.** Rechazada: es exactamente la
  contaminación que `PRESS` existe para impedir, y una expectativa no es una medición aunque se
  exprese en la misma unidad.
- **Un nivel `RESEARCH` aparte para los compiladores.** Rechazada: `SECTOR` ya significa
  «compilador con interés propio, atribución sin entrada automática». Un nivel más con la misma
  semántica agrega superficie sin agregar distinción.
- **Esperar acceso a la Meta Content Library.** Rechazada como bloqueante: la postulación puede
  intentarse en paralelo, pero el observatorio no puede quedarse sin registro social mientras
  tanto.

## Evidencia

La radiografía documental que fundamenta los cuatro hallazgos, con las fuentes de cada cifra y su
grado de evidencia, quedó registrada antes de esta decisión. El catálogo inicial que se carga es
`src/database/seeds/boot/social-readings.json`.
