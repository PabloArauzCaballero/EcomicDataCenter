# Carga de estaciones de servicio de la ANH

Cómo se descarga y se construye la siembra de estaciones de servicio
licenciadas por la Agencia Nacional de Hidrocarburos (ANH), y qué se
descarta y por qué. Entra en `NATIONAL_POI` (migración 0073), familia
`SURTIDOR`.

## Cómo se descarga

La página de la ANH no pagina ni exige sesión: cada departamento es una
consulta GET distinta, y `D=0` es el listado nacional completo (no
`D=1..9` sumados; medido el 2026-09-23: la lista departamental de un
departamento omite su primera fila frente al listado nacional filtrado
por ese mismo departamento, así que este lector lee siempre `D=0`).

```sh
curl -k -o anh_nacional.html \
  'https://www.anh.gob.bo/w2019/contenido.php?s=40&R=1&D=0'
```

Verificado el 2026-09-23: 515 operadores, huella
`d625ac7bcbb8f4dfd5dd6b520e878a6eef44863b2ea28952ca4af3b41cd08d76`.

## Qué trae

Razón social, dirección y teléfono declarados, código de licencia
(`ANH01986-CLES01-LIC09/2026`), productos que comercializa y el
departamento. La coordenada viaja en el botón «Mostrar Ubicación»
(`setMark(lat, lon, nombre)`) de cada fila, no en una columna.

El identificador que se guarda es el código de operador y de
establecimiento (`ANH01986-CLES01`), no la licencia completa: la
licencia se renueva cada año (`LIC09/2026`) y la estación sigue siendo
la misma.

## Qué se descarta

| Motivo | Filas |
| --- | --- |
| Sin código de licencia reconocible | 0 |
| Sin coordenada o fuera de Bolivia | 1 |
| El departamento declarado no coincide con el de las escuelas más cercanas | 6 |

La ANH publica departamento y no municipio, así que la comprobación de
25 km de los otros lectores no se le puede aplicar. En su lugar se
compara contra el departamento que declaran las escuelas del SIE más
cercanas (mayoría de las cinco dentro de 60 km): un desacuerdo dice
que la coordenada y el departamento declarado no pueden ser los dos
correctos, y nada aquí puede decidir cuál lo es. Requiere construir
primero la siembra del SIE.

El teléfono declarado no entra: la página no concede licencia de
redistribución, y muchos son números móviles del propio operador.

## Cómo se reconstruye

```sh
node scripts/places/build-anh-poi-seed.mjs \
  --lista anh_nacional.html \
  --catalogue scripts/places/catalogue/bolivia-place-families.json \
  --schools src/database/seeds/boot/bolivia-sie-poi \
  --out src/database/seeds/boot/bolivia-anh-poi \
  --retrieved 2026-09-23T11:25:23Z \
  --expected-sha256 d625ac7bcbb8f4dfd5dd6b520e878a6eef44863b2ea28952ca4af3b41cd08d76
```

## Lo que la ANH no publica aquí

Solo la actividad «comercialización de combustibles líquidos en
estación de servicio» (`R=1`) entra en esta siembra. La misma página
lista más de cuarenta actividades reguladas —GNV, GLP a granel,
transporte, almacenaje— que no son estaciones de servicio y no se
cargan con este constructor.
