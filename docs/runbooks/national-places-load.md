# Carga del registro nacional de lugares

Cómo se construye y se carga el corpus de lugares de toda Bolivia (`NATIONAL_POI`),
entregado el 2026-09-11 como nueve partes ZIP firmadas con 80 lotes de candidatos.

El corpus de tres ciudades (`CITY_POI`, 26.671 lugares, migración 0070) **no se toca**.
Éste entra en su propia categoría de dato y lo lee su propio modelo (migración 0073).

## Lo que hay que saber antes de tocar nada

| Hecho medido | Cifra |
| --- | --- |
| Registros candidatos en la entrega | 76.412 |
| De ellos, ya presentes en la base | 24.563 |
| Realmente nuevos | 51.849 |
| Familias que la entrega usa | 731 |
| Familias distintas entre los 51.849 nuevos | 567 |
| De ésas, definidas por el catálogo de 201 | 143 |
| Sin definir (7.773 registros) | 424 |

**Los 24.563 repetidos no los detecta el cargador.** Es idempotente por huella del
payload, y el payload nacional tiene otra forma que el de tres ciudades, así que la
misma farmacia hashea distinto y entraría dos veces. Quien los quita es el
constructor de la siembra, cruzando el identificador de Overture. Por eso la
siembra se construye con este script y no a mano.

## Procedimiento

### 1. Verificar la entrega

```sh
cd bolivia_nacional_completo
# las nueve partes contra metadatos/manifest_partes_sha256.json
# y, dentro de cada parte, manifest_sha256.json contra sus lotes
```

Verificado el 2026-09-11: las nueve partes y los 98 archivos internos coinciden.

### 2. Descomprimir

```sh
mkdir -p /ruta/entrega
for z in partes/*.zip; do unzip -oq "$z" -d /ruta/entrega; done
```

Queda `/ruta/entrega/parte_01..09/candidatos/*.json`. El constructor lee de ahí y
nunca abre los ZIP, para que el paso que comprueba las firmas siga a la vista.

### 3. Construir la siembra

```sh
node scripts/places/build-national-poi-seed.mjs \
  --delivery  /ruta/entrega \
  --metadata  bolivia_nacional_completo/metadatos \
  --catalogue <catálogo de familias, CSV o JSON>
```

**No escribe nada si el catálogo no define todas las familias de la entrega.** Deja
en su lugar `artifacts/national-poi-missing-families.json` con los códigos que
faltan, cuántos registros afecta cada uno y de qué categorías del publicador vienen.
Eso es el encargo del catálogo, no un error del script: `is_regulated` dice si un
regulador boliviano licencia la actividad, y adivinarlo publicaría un estado de
licencia inventado sobre lugares que nadie comprobó.

### 4. Cargar

```sh
yarn db:seed:boot --only=bolivia-national-poi
```

Recordatorio de `CLAUDE.md`: **`db:*` apunta a Neon por `.env`**. Para una base local,
pasa las `DATABASE_*_URL` en la misma línea. No se ejecuta contra producción sin plan,
respaldo y aprobación.

### 5. Leer

Migración 0073, en `read_models`:

- `national_place` — una fila por lugar.
- `national_place_family` — cuántos lugares por familia, cuántos regulados, cuántos
  con familia refinada, cuántos situados en una localidad y cuántos de cada publicador.

## Segunda entrega: ampliación de Cochabamba y La Paz

Recibida el 2026-09-12 como `altas.json` (5.721 filas, SHA-256
`156aadc7…dc15d0d`, verificado). Lee OpenStreetMap en vivo, no un extracto
distribuido, así que no nombra archivo de origen: trae el enlace permanente de
cada objeto y la hora del snapshot. A cambio resuelve **municipio y
departamento**, que la entrega nacional no resuelve.

| Hecho medido | Cifra |
| --- | --- |
| Altas entregadas | 5.721 |
| Identidades repetidas contra el paquete de 76.412 | 0 (verificado) |
| Identidades repetidas contra las 35.101 observaciones auxiliares | 0 (verificado) |
| Familias en el catálogo de 201, todas ya refinadas | 3.404 |
| Familias `OV_*` sin definir | 2.317 en 11 familias |
| **Se parecen a un lugar ya guardado** | **95** |

```sh
node scripts/places/build-expansion-poi-seed.mjs   --altas <altas.json>   --catalogue <catálogo de familias>   --expected-sha256 156aadc76da871b02c8d2a9d3cb95dc137ea676fe3bcc5683d2f90622dc15d0d   --partial
```

La huella se comprueba antes de leer nada: si el archivo no es el que la entrega
declara, el script para. `--partial` escribe sólo lo que el catálogo cubre, y
aquí es defendible porque **ninguna de esas 3.404 filas es de familia genérica**:
un catálogo posterior no tiene qué reclasificar, así que no habrá que superarlas.
No vale como permiso general — en la entrega nacional dos tercios sí son
genéricas y por eso allí no se escribe nada a medias.

**Los 95 parecidos no se funden.** Los dos corpus no pueden chocar por
identificador —uno es Overture, el otro OpenStreetMap— así que nada aguas arriba
podía ver que «Heladería Dumbo» y «Dumbo», a cinco metros, son la misma
heladería. Se marcan con `resembles_held_place_id` y su distancia, y quien cuenta
decide si los descuenta. Fundirlos borraría una segunda sucursal real en la misma
manzana.

## Lo que el corpus no dice

- **No hay ciudad ni departamento.** La entrega no los publica: `region` viene vacío
  en 36.991 de los 37.278 registros de Overture y trae `S`, `L` o `H` en casi todo el
  resto, y la mitad de OpenStreetMap no trae localidad alguna. Lo que sí se conserva
  es `locality`, el nombre de población que Overture escribió en la dirección. No es
  un municipio. Derivar el departamento exigiría polígonos que no están en la entrega.
- **La mitad no trae confianza.** OpenStreetMap no publica ese número. `confidence`
  es nulo en 39.134 filas y eso no es una confianza baja.
- **8.132 coordenadas son centroides**, no puertas: el rasgo original era un polígono.
  Lo dice `position_method`.
- **Nada está verificado en campo.** La entrega lo declara: `operacion_actual_verificada`
  y `existencia_actual_verificada_en_campo` son falsos en los 76.412 registros.
- **La ampliación sitúa por pertenencia a un área de OpenStreetMap**, no por
  frontera oficial: la propia entrega lo llama `no_limite_certificado`. El
  departamento de `national_place` se lee con esa reserva.
- **Dos licencias.** Overture llega bajo CDLA-Permissive-2.0 y OpenStreetMap bajo
  ODbL-1.0. La segunda obliga a atribuir; cada fila lleva la suya en `licence`.

## El catálogo de familias, unido (2026-09-21)

Hasta hoy el corpus se clasificaba con el anexo de 201 familias, y 40.482 filas ya
construidas esperaban a un catálogo que definiera las 435 familias restantes. Ese
catálogo llegó dentro de la entrega de establecimientos:
`06_catalogo/catalogo_subcategorias_lugares_bolivia.json`, 2.330 familias, todas con
`group`, `commercial_role`, `is_regulated` y `official_validation_source`. Cubre las 424
que faltaban en la entrega nacional y las 11 de la ampliación, sin dejar ninguna fuera.

Los dos catálogos **no dicen lo mismo**. Donde ambos definen una familia coinciden en
`group` y en `commercial_role` —201 de 201, comprobado, y el constructor para si alguna
vez dejan de coincidir— y discrepan en `is_regulated` en 63 de ellas. El nuevo dice falso
donde el viejo decía verdadero (hospital, universidad, colegio, cajero, aeropuerto…), y
explica en sus propias notas qué significa ese falso: «ausencia de una exigencia sectorial
suficientemente documentada en esta entrega, no exención legal ni actividad desregulada».
No es una corrección: es una afirmación más débil bajo una regla de prueba más estricta.

**Manda el anexo en las familias que el anexo define**, y por una razón que no tiene que
ver con cuál es mejor: esas filas ya están cargadas, el corpus es inmutable y el cargador
es idempotente por huella del payload. Reclasificar una familia no cambiaría la fila que
está en la base — añadiría una segunda al lado, y el informe contaría dos veces cada uno
de esos lugares. El catálogo nuevo rellena lo que nadie había clasificado y no toca nada
que alguien ya hubiera respondido.

```sh
node scripts/places/build-family-catalogue.mjs \
  --anexo-a ~/Downloads/anexo-A-catalogo-actual-201-familias.csv \
  --v3      <entrega>/06_catalogo/catalogo_subcategorias_lugares_bolivia.json \
  --out     scripts/places/catalogue/bolivia-place-families.json
```

El archivo resultante se versiona, lleva la huella de sus dos fuentes y marca cada familia
con `decided_by`, para que quien lea un `is_regulated` sepa cuál de los dos lo decidió. Las
70 familias donde el anexo afirma más que el catálogo nuevo se listan enteras en su
cabecera, bajo `keptFromAnnexDespiteNewerClaim`.

### Lo que desbloqueó, medido antes y después

| Siembra | Antes | Después | Entran |
| --- | --- | --- | --- |
| `bolivia-national-poi` | 15.679 | 51.849 | 36.170 |
| `bolivia-expansion-poi` | 3.404 | 5.721 | 2.317 |
| `bolivia-capitals-poi` | 2.155 | 4.150 | 1.995 |

**Cero filas cambiadas y cero desaparecidas** en las tres, comprobado campo a campo contra
la siembra anterior: toda fila ya cargada sale con el mismo payload, que es la única
condición que impide duplicarlas. Los tres registros mercantiles —`bolivia-registry-poi` y
`bolivia-registry-additional-poi`— **no se reconstruyen**: su lector archiva todo bajo
`OTRA_ENTIDAD` sin mirar el catálogo, así que pasarles el nuevo sí cambiaría filas ya
cargadas.

### El enlace de la ampliación dejó de resolver

El consolidado de Cochabamba y La Paz vivía en `files.catbox.moe`, que no promete
permanencia, y ya no se descarga. Las mismas 5.721 filas viajan en los siete lotes del ZIP
de la entrega, cada uno con su huella en `metadatos/manifest_sha256.json`, así que
`--altas` acepta también ese directorio: verifica los siete contra el manifiesto y firma la
lectura con la huella de las huellas, igual que la entrega nacional. La procedencia pasa a
nombrar el ZIP en vez del enlace muerto.

```sh
node scripts/places/build-expansion-poi-seed.mjs \
  --altas <entrega>/ampliacion_cochabamba_lapaz/altas_propuestas \
  --catalogue scripts/places/catalogue/bolivia-place-families.json \
  --out src/database/seeds/boot/bolivia-expansion-poi \
  --source https://files.catbox.moe/xbghbi.zip --release 2026-09-12 \
  --report <entrega>/ampliacion_cochabamba_lapaz/metadatos/reporte_validacion.json
```

## Quinta entrega, 2026-09-21: establecimientos recuperados (6.783)

Un solo archivo con tres formas dentro, y ninguna de ellas investigada ese día: son las
altas que las tres rondas anteriores propusieron, recuperadas y reempaquetadas. Las 28
huellas del `MANIFIESTO_SHA256.json` coinciden, y no hay ningún archivo fuera de él.

| Tanda | Filas | Qué es |
| --- | --- | --- |
| `granularidad_osm` | 1.738 | OpenStreetMap, ODbL, con sus etiquetas |
| `agemed` | 5.011 | farmacias habilitadas, 18 hojas del regulador |
| `rondas_50` | 34 | sedes que una entidad publica de sí misma |

Se escriben **6.584** en dos directorios, porque llegan bajo dos licencias:

```sh
node scripts/places/build-establishments-poi-seed.mjs \
  --registros <entrega>/01_establecimientos/establecimientos_6783.json \
  --catalogue scripts/places/catalogue/bolivia-place-families.json \
  --out src/database/seeds/boot/bolivia-establishments-poi \
  --out-restricted src/database/seeds/boot/bolivia-establishments-registry-poi \
  --expected-sha256 8b48a33f9126693780fc5966759235eb0bd149301411534d3188f928b95d2143
```

- `bolivia-establishments-poi` — 1.738 de OpenStreetMap, ODbL-1.0, con sus contactos.
- `bolivia-establishments-registry-poi` — 4.846 sin licencia abierta declarada. Retirarlas
  es borrar esa carpeta y volver a desplegar.

**199 farmacias no entran.** Están a más de 25 km de la mediana de su propio municipio —una
de ellas a 592 km, una dirección de Santa Cruz cayendo en otro departamento—. Cuando la
coordenada y el municipio se contradicen, uno de los dos está mal y nada aquí puede decir
cuál. El municipio se agrupa con su departamento delante: hay un San Ignacio en Beni y otro
en Santa Cruz, y juntarlos pondría el centro del municipio entre los dos.

**Los teléfonos de AGEMED no viajan**, los 4.360. Es la misma regla que con SEPREC: el
corpus guarda contactos cuando la fuente es un directorio de negocios **y** su licencia es
abierta, y la hoja del regulador es lo primero y no lo segundo. El nombre, la dirección
declarada, la resolución que habilitó la farmacia y su fecha entran enteros. Los teléfonos
de las 34 sedes sí entran: ahí la centralita la publica la propia entidad de su sucursal.

**Lo que ninguna de estas filas dice.** Una habilitación de 1972 no dice que la farmacia
siga abierta; el regulador lo advierte y la fila lo repite en `warnings`. 3.371 de las
5.011 coordenadas traen doce decimales o más: nadie declara nanómetros, así que salieron de
un cálculo que la hoja no explica, y eso viaja con la fila. Las 34 sedes las publica el
propio sujeto del dato, que es la procedencia más débil del corpus: se nombra a cada
entidad una por una en vez de esconderlas bajo «directorio corporativo».

**153 de las 6.584 se parecen a un lugar ya guardado** por nombre y distancia. No se funden
nunca, por lo mismo que las 95 de la ampliación: fundirlas borraría una sucursal real.

### Lo que la entrega trae y no se carga

- `02_enriquecimientos/` — 3.775 bloques sobre 3.758 identificadores. **No son altas**: son
  propuestas sobre filas existentes, y aquí los datos son inmutables, así que aplicarlas es
  crear revisiones, no editar. Requieren revisar conflictos y evidencia antes de nada.
- `03_servicios_no_sumar_a_establecimientos/` — 278 cajeros y 1.322 corresponsales. Son
  puntos de acceso financiero, no establecimientos, y la entrega pide expresamente no
  sumarlos al principal.
- `04_revision_no_importar/` y `05_referencias_no_son_altas/` — coincidencias, fallos,
  cabeceras SEPREC pendientes y el índice anterior de 90.175. Nada de eso es un alta.

## Sexta entrega, 2026-09-23: tres fuentes oficiales propias

Tres sitios que el observatorio descargó él mismo, no una entrega firmada por
terceros: el registro de unidades educativas del Ministerio de Educación
(SIE), la lista de estaciones de servicio licenciadas por la ANH y un
directorio privado de cajeros de Santa Cruz. Cada una tiene su propio runbook
— [sie-schools-load.md](sie-schools-load.md),
[anh-fuel-stations-load.md](anh-fuel-stations-load.md),
[cajeros-santa-cruz-load.md](cajeros-santa-cruz-load.md) — porque cada una se
descarga distinto y descarta por su propia regla.

| Siembra | Leídas | Escritas | Descartadas, motivo principal |
| --- | --- | --- | --- |
| `bolivia-sie-poi` | 17.502 | 14.508 | 2.898 a más de 25 km de su municipio |
| `bolivia-anh-poi` | 515 | 508 | 6 en un departamento que sus escuelas cercanas contradicen |
| `bolivia-cajeros-poi` | 673 | 671 | 1 punto mal ubicado en otro departamento (verificado con la fila gemela del propio archivo) |

Familia nueva en el catálogo: `CENTRO_EDUCACION_ALTERNATIVA_ESPECIAL`
(`EDUCACION`, regulada por el Ministerio de Educación), para los 1.089 centros
de educación alternativa y especial que el SIE lista junto a los colegios y
que ningún catálogo anterior definía. Se añadió con
`build-family-catalogue.mjs --observatorio`, que solo puede sumar una familia:
para si el código ya lo define cualquiera de los dos catálogos entregados.

La ANH y los cajeros no declaran municipio, solo departamento (la ANH) o nada
(los cajeros, que solo afirman ser de Santa Cruz). Sin polígonos municipales
en el repositorio, el cotejo de las dos usa las 14.508 escuelas del SIE como
referencia territorial: el departamento que votan las cinco escuelas más
cercanas dentro de 60 km. Por eso las dos siembras exigen construir primero
la del SIE (`--schools`).

Ninguna de las tres trae contacto de particulares: la ANH no publica el
teléfono declarado (misma regla que SEPREC y AGEMED) y el SIE no publica el
nombre del director. Los cajeros no traen ningún contacto en origen.

La cuarta fuente pedida, `soysantacruz.com.bo`, no generó siembra: su guía de
surtidores trae siete filas sin coordenadas, y el esquema no admite un lugar
sin posición. El detalle está en `cajeros-santa-cruz-load.md`.
