# Ampliación de lugares por rubros desde OpenStreetMap

Cómo se descarga, se construye y se carga `bolivia-osm-expansion-poi`: los lugares de
los rubros que el corpus casi no tenía —agro, industria, minería, oficinas financieras,
telecomunicaciones, gobierno, turismo, cultura, religión, deporte y mercados—. Es la
primera carga que no entregó nadie: la descarga el propio observatorio.

Datos © OpenStreetMap contributors, bajo ODbL-1.0. Cada fila lleva su licencia.

## Lo que hay que saber antes de tocar nada

| Hecho medido (2026-09-23) | Cifra |
| --- | --- |
| Objetos con nombre descargados, nueve departamentos | 15.881 |
| Ya estaban en el corpus por identificador | 9.584 |
| Ya estaban por mismo nombre a menos de 100 m | 353 |
| Parcelas de catastro numeradas, descartadas | 1.103 |
| **Lugares nuevos** | **4.823** |
| Se parecen a un lugar ya guardado (`resemblesHeldPlace`) | 256 |
| Cruzan un límite departamental (sin departamento) | 7 |
| Familias nuevas en el catálogo / usadas en esta carga | 31 / 16 |

- **Otras ramas cargan educación, salud, transporte, bancos y cajeros, y surtidores.**
  La consulta no los pide y la tabla de familias no los clasifica: `industrial=warehouse`
  o `depot` se descartan aunque OpenStreetMap los llame industria.
- **Lo que el corpus ya tiene no vuelve a entrar.** Por identificador (también los 8.200
  de Geofabrik, que no dicen si eran nodo o vía: se descarta todo objeto con ese número)
  y por nombre idéntico a menos de 100 m. Un nombre parecido no se descarta: se marca y
  entra, porque fundirlo podría borrar una segunda sede real.
- **Un área no es un local.** Cultivos, canteras, predios industriales y estancias son
  polígonos: la coordenada es el centro de su caja (`positionMethod`) y la fila lleva
  `area_de_uso_de_suelo_no_es_un_local`. Minas históricas y ruinas llevan
  `puede_no_estar_en_actividad`.
- **El departamento es pertenencia a un área de OpenStreetMap**, no frontera oficial
  (`geofenceMethod: osm_administrative_area`). Un objeto que cae en dos queda sin
  departamento y con `cruza_limite_departamental`: el Salar de Uyuni está en las dos áreas.

## Procedimiento

### 1. Descargar

```sh
node scripts/places/fetch-osm-expansion.mjs --out-dir <carpeta de crudos>
```

Un JSON por departamento y un `manifiesto.json` con la huella, el intérprete que
respondió, la consulta exacta y la hora del snapshot. Los intérpretes públicos cortan
(La Paz y Tarija dieron 504): el script pausa 30 s entre consultas, reintenta y **se
reanuda** —un departamento ya descargado ese día no se vuelve a pedir—. Otros agentes
usan los mismos espejos; no lanzar dos descargas a la vez.

La descarga del 2026-09-23 vive en `%TEMP%/wt-familias-datos/crudo/`, toda del espejo
de mail.ru con snapshot de ese día. Manifiesto SHA-256 `38573db2…71f657`; huella de
los nueve crudos `26cb939c…913fd5`.

### 2. Regenerar el catálogo (solo si cambian las familias)

```sh
node scripts/places/build-family-catalogue.mjs \
  --anexo-a ~/Downloads/anexo-A-catalogo-actual-201-familias.csv \
  --v3      <entrega>/06_catalogo/catalogo_subcategorias_lugares_bolivia.json \
  --out     scripts/places/catalogue/bolivia-place-families.json \
  --additions scripts/places/catalogue/osm-expansion-families.json \
  --hierarchy scripts/places/catalogue/family-hierarchy.json
```

El generador **ordena por código**. Si otra rama añadió familias, se regenera con todas
las entradas en vez de fusionar el JSON a mano. Una alta que redefine una familia
existente, o que dice estar regulada sin nombrar regulador, detiene la construcción.

`parent_family` sale de `family-hierarchy.json` (reglas por sufijo y grupo, más aristas
explícitas) y es metadato puro: el cargador no lee el catálogo y los constructores solo
copian `group`, `commercial_role`, `is_regulated` y `official_validation_source`.
Comprobado al regenerar: 0 familias cambiadas y 0 desaparecidas fuera del campo nuevo.

### 3. Construir la siembra

```sh
node scripts/places/build-osm-expansion-poi-seed.mjs \
  --crudos    <carpeta de crudos> \
  --catalogue scripts/places/catalogue/bolivia-place-families.json
```

Verifica cada crudo contra el manifiesto, compara con **todas** las siembras de lugares
del disco salvo la propia y escribe piezas de 1.200 ordenadas por identificador: dos
construcciones desde los mismos crudos dan los mismos bytes (comprobado). Deja la
medición en `artifacts/osm-expansion-poi-report.json`. No escribe nada si la tabla usa
una familia que el catálogo no define.

### 4. Cargar

```sh
yarn db:seed:boot --only=bolivia-national-poi
```

La carpeta está en `PLACE_DIRECTORIES` y en el paquete `bolivia-national-poi`, que sube
a 1.2.0. Las filas ya cargadas no cambian: el cargador es idempotente por huella y esta
carga solo añade. **`db:*` apunta a Neon por `.env`.**

## Lo que cambia en el tablero

Rubros del paquete nacional (72.124 lugares) con el reparto de `place-sectors.ts`:

| Rubro | Hoy | Entran | Total |
| --- | ---: | ---: | ---: |
| Cultura, ocio y deporte | 3.087 | 2.323 | 5.410 |
| Hospedaje y turismo | 4.596 | 824 | 5.420 |
| Público y comunidad | 5.815 | 456 | 6.271 |
| Industria | 889 | 400 | 1.289 |
| Agro | 47 | 646 | 693 |
| Minería | — | 165 | 165 |

Agro y minería solo suben si el tablero mapea los grupos nuevos
(`PRODUCCION_AGROPECUARIA` → Agro, `MINERIA` → rubro nuevo, `HIDROCARBUROS` →
Industria). Sin ese mapeo, 800 de las 4.823 caen en «Sin clasificar».

## Lo que esta carga no dice

- Que algo esté abierto. OpenStreetMap no lo publica; el snapshot es de su fecha.
- Que un regulador haya licenciado ese lugar. `is_regulated` dice que la actividad la
  licencia un regulador boliviano (AJAM, SENASAG, ANH), no que este lugar tenga licencia.
- Que las oficinas financieras, telecomunicaciones y gobierno estén cubiertos: casi todo
  lo que OpenStreetMap tiene de eso ya había llegado en la entrega nacional. Lo nuevo son
  sobre todo áreas —canchas, cultivos, canteras, predios— y atractivos turísticos.
