# Carga del sector salud (`bolivia-health-poi`)

Cómo se llenó el hueco que el corpus de lugares tenía en salud: farmacias,
hospitales, postas, clínicas, laboratorios, bancos de sangre, cajas de salud y
consultorios que ninguna entrega anterior traía. Entra en la misma categoría
de dato que el resto de `NATIONAL_POI` (migración 0073) y en el mismo paquete
de siembra `bolivia-national-poi` del `manifest.ts`.

## Antes de tocar nada

Antes de esta entrega el catálogo ya tenía nueve familias de salud cargadas —
`HOSPITAL`, `FARMACIA`, `FARMACIA_VETERINARIA`, `LABORATORIO_FARMACEUTICO`,
`CENTRO_SALUD`, `CLINICA`, `CONSULTORIO_MEDICO`, `LABORATORIO_CLINICO`,
`CENTRO_DIALISIS`, `BANCO_SANGRE`, `PSICOLOGIA_SALUD_MENTAL`,
`CENTRO_ADULTO_MAYOR`, `ODONTOLOGIA`, más de 200 familias `OV_*` — y una
cantidad ya cargada de farmacias por AGEMED (5.011, entrega de
establecimientos del 2026-09-21). El pedido que originó esta carga («falta una
lista completa de farmacias, hospitales, postas médicas y otros elementos del
sector salud») nombraba diez familias; cuatro de ellas ya existían con otro
nombre exacto y no se duplicaron:

| Pedida | Ya existía como | Se usó |
| --- | --- | --- |
| `CENTRO_DE_SALUD` | `CENTRO_SALUD` | la existente |
| `LABORATORIO_CLINICO` | `LABORATORIO_CLINICO` | la existente, idéntica |
| `CENTRO_DE_DIALISIS` | `CENTRO_DIALISIS` | la existente |
| `BANCO_DE_SANGRE` | `BANCO_SANGRE` | la existente |

Las seis que ningún catálogo definía sí se anotaron:
`POSTA_SANITARIA`, `PUESTO_DE_SALUD`, `CLINICA_PRIVADA`, `POLICONSULTORIO`,
`CAJA_DE_SALUD`, `CONSULTORIO_ODONTOLOGICO`.

## 1. Fuentes oficiales intentadas y su estado

- **SNIS-VE / Ministerio de Salud (RUES)** — `snis.minsalud.gob.bo` responde y
  publica, mes a mes, un «Actualizador de Estructura de Establecimientos»
  (57 versiones entre 2021 y 2026-09-14, catalogadas). Se descargó y se abrió
  la más reciente: es un instalador Windows de Setup Factory 9 que despliega
  una base Microsoft Access (`.mdb`) con las tablas `t_estblmto`,
  `t_estructura`, `t_catestab`, `t_municipio`, entre otras — software de
  escritorio para el operador del SNIS-VE, no una descarga de datos abiertos.
  Extraer las filas exigiría ejecutar o desempaquetar en profundidad un
  binario propietario del ministerio sin términos de licencia declarados
  para redistribuir el contenido, lo que esta carga no hace. **Bloqueada**,
  documentada y no forzada.
  - `rues.minsalud.gob.bo` y `reportes-rues.minsalud.gob.bo` (los reportes
    dinámicos en vivo) no conectaron desde este entorno (red inalcanzable).
  - `datos.gob.bo` no lista un dataset de establecimientos de salud.
- **AGEMED** — ya cargada por la entrega de establecimientos del
  2026-09-21 (`bolivia-establishments-registry-poi`, 5.011 farmacias con
  resolución). No es un hueco de esta microtarea; se deja intacta.
- **Cajas de salud (CNS, CPS, Caja Petrolera)** — no se encontró un listado
  público descargable de sus propios centros en el tiempo de esta carga. Se
  cubre parcialmente por OpenStreetMap, donde una fracción de sus sedes está
  mapeada y se identifica por el nombre del operador (ver más abajo).

## 2. OpenStreetMap, y por qué no es Overpass en vivo

El pedido señalaba `overpass-api.de/api/interpreter`. Los seis espejos
alcanzables desde este entorno fallaron: `overpass-api.de`,
`overpass.kumi.systems`, `lz4.overpass-api.de`, `z.overpass-api.de` y
`overpass.private.coffee` rechazaron la conexión o expiraron; el único que
respondió, `maps.mail.ru`, devolvió un timeout del servidor en esta consulta.
`download.geofabrik.de` sí es alcanzable y republica la misma base de
OpenStreetMap como un extracto firmado y fechado
(`bolivia-260922.osm.pbf`, snapshot 2026-09-22, SHA-256 verificado contra el
`.md5` que el propio Geofabrik publica). Se leyó ese extracto en su lugar:
cambia cómo se obtuvo el dato, no lo que dice — es la misma base bajo la
misma licencia (ODbL-1.0), y a diferencia de una respuesta Overpass en vivo,
este extracto tiene un archivo y una huella propios que citar.

```sh
python scripts/places/extract_health_osm.py bolivia-260922.osm.pbf health-osm-extract.json
```

Filtra `amenity=hospital|clinic|doctors|pharmacy|dentist|laboratory|
blood_donation|nursing_home` y cualquier `healthcare=*`, en nodos y en vías
cerradas (centroide). Solo entra lo que tiene nombre.

## 3. Clasificación: por qué esta entrega sí la hace

Toda entrega anterior a ésta llegaba ya clasificada por un catálogo o un
regulador; ninguna herramienta de este directorio decide una familia por sí
misma. Ésta sí, porque nadie entregó salud pre-clasificada. La reglas viven en
`scripts/places/read-health-osm.mjs`, en este orden:

1. **La propiedad manda sobre la forma.** Un operador que nombra una caja de
   salud de corto plazo (`Caja Nacional de Salud`, `Caja Petrolera`, `CNS`,
   `CPS`) se archiva bajo `CAJA_DE_SALUD` aunque también traiga
   `amenity=hospital`. El pedido quiere la red de la aseguradora visible como
   su propia familia, y preguntar primero por el `amenity` la habría
   escondido bajo `HOSPITAL`.
2. `amenity=hospital` → `HOSPITAL`; `amenity=pharmacy` → `FARMACIA`;
   `amenity=laboratory` o `healthcare=laboratory` → `LABORATORIO_CLINICO`;
   `amenity=blood_donation` → `BANCO_SANGRE`; `amenity=nursing_home` →
   `CENTRO_ADULTO_MAYOR`; `healthcare=dialysis` → `CENTRO_DIALISIS`.
3. `amenity=doctors` → `CONSULTORIO_ODONTOLOGICO` si trae
   `healthcare=dentist`, si no `CONSULTORIO_MEDICO`. `amenity=dentist` →
   `CONSULTORIO_ODONTOLOGICO` siempre.
4. `amenity=clinic` (o `healthcare=centre|clinic`) se reparte por el nombre y
   el operador: `posta` → `POSTA_SANITARIA`; `puesto de salud` →
   `PUESTO_DE_SALUD`; `policonsultorio` → `POLICONSULTORIO`; operador público
   (ministerio, SEDES, municipal, alcaldía) o nombre «centro de salud» →
   `CENTRO_SALUD`; **sin ninguna señal, por defecto `CLINICA_PRIVADA`**,
   marcado en `warnings` con `clasificacion_por_defecto_sin_senal_de_propiedad`
   porque es una suposición y se declara como tal.

### Lo que no se carga, a propósito

- **Un nombre que es solo una persona.** `amenity=doctors` o `dentist` cuyo
  nombre es un honorífico más un nombre propio y nada que nombre un local
  (`Dr. Juan Perez Mamani`, sin «consultorio», «clínica», «centro»…) se
  descarta y se cuenta en `rejected.personName`. Publicarlo pondría en un
  mapa público dónde trabaja una persona identificada, sin que la etiqueta de
  OpenStreetMap distinga un consultorio propio de una casa.
- **El contacto de un consultorio unipersonal.** Un `doctors` o `dentist` que
  sí pasa el filtro anterior igual pierde teléfono, correo, sitio y redes:
  la etiqueta de contacto de una ficha de un solo profesional es mucho más
  probablemente una línea personal que una centralita, y nada aquí puede
  distinguir las dos. El nombre, la dirección y la coordenada sí entran.
  Marcado en `warnings` con `contacto_omitido_posible_dato_personal`.
- **Lo que no trae nombre.** El extractor de Python ya lo descarta: un nodo
  sin `name` ni `name:es` ni `official_name` no es un lugar publicable.

## 4. Cruce contra lo ya guardado

Antes de escribir, el constructor lee **todos** los directorios `*-poi` que ya
existen en el repositorio (igual que `build-establishments-poi-seed.mjs`) y
descarta por identificador lo que ya está — que es la mayoría: la entrega
nacional y la de establecimientos ya cargaron una parte grande de la
cartografía de salud de OpenStreetMap bajo sus propios códigos. Lo que
sobrevive es lo genuinamente nuevo. Lo que se parece por nombre y distancia
(<40 m, la mitad de las palabras compartidas) a un lugar ya guardado se marca
en `resemblesHeldPlace` y no se funde, con la misma razón que el resto del
corpus: podría ser una segunda sucursal real.

## 5. Construir y cargar

```sh
node scripts/places/build-health-poi-seed.mjs \
  --extract   health-osm-extract.json \
  --catalogue scripts/places/catalogue/bolivia-place-families.json \
  --out       src/database/seeds/boot/bolivia-health-poi

yarn db:seed:boot --only=bolivia-national-poi
```

La siembra queda dentro del paquete `bolivia-national-poi` ya existente
(`manifest.ts`, versión `1.2.0`) y del mismo cargador
(`boot-seed.bolivia-national-poi.ts`, que ahora también lee
`boot/bolivia-health-poi`). No es un paquete nuevo: es un directorio más del
que ya había.

## 6. El catálogo, extendido a mano

`build-family-catalogue.mjs` fusiona el anexo de 201 familias con el catálogo
de 2.330; ninguno de los dos define las seis familias que esta carga
necesitaba. Se añadió un tercer insumo, `--manual`, que solo puede anotar un
código que ninguno de los otros dos ya decidiera — intentar reclasificar uno
que sí decidieron es un error del script, no una opción:

```sh
node scripts/places/build-family-catalogue.mjs \
  --anexo-a anexo-A-catalogo-actual-201-familias.csv \
  --v3      catalogo_subcategorias_lugares_bolivia.json \
  --manual  scripts/places/catalogue/bolivia-health-families-manual.json \
  --out     scripts/places/catalogue/bolivia-place-families.json
```

Las seis familias quedan marcadas `decided_by: anotacion_manual_salud_2026-09-23`.
`is_regulated` es `true` en las seis: el Ministerio de Salud / SEDES habilita
todo establecimiento de salud por su normativa de caracterización (RUES), y
`CAJA_DE_SALUD` cae bajo INASES como entidad aseguradora de corto plazo. El
razonamiento completo de cada una está en el propio archivo manual.
