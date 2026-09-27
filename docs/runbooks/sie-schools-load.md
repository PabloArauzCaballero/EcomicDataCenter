# Carga de unidades educativas del SIE

Cómo se descarga y se construye la siembra de unidades educativas del
Sistema de Información Educativa (SIE, Ministerio de Educación), y qué
se descarta y por qué. Entra en `NATIONAL_POI` (migración 0073), familias
`COLEGIO_ESCUELA` y `CENTRO_EDUCACION_ALTERNATIVA_ESPECIAL`.

## Cómo se descarga

El SIE no publica una API documentada: la lista completa se obtiene
enviando el formulario público del reporte con `codigo=0&rol=0` (que
selecciona «todas las actividades» y «todos los departamentos») y una
sesión con cookie, porque el sitio exige una cookie de sesión antes de
aceptar el POST.

```sh
curl -k -c cookies -b cookies -o /dev/null \
  https://reportes.sie.gob.bo/reporteestadistico/informacion/general/regular/unidad/educativa
curl -k -c cookies -b cookies \
  -e https://reportes.sie.gob.bo/reporteestadistico/informacion/general/regular/unidad/educativa \
  -d 'codigo=0&rol=0&gestion=2026' \
  -o sie_unidad_lista_0.xls \
  https://reportes.sie.gob.bo/reporteestadistico/informacion/general/regular/unidad/educativa/lista/print/xls
```

El archivo que descarga (`.xls`) es en realidad SpreadsheetML (Excel 2003
XML), no un binario `.xls`: `read-sie-delivery.mjs` lo lee como texto y
respeta `ss:Index` y `ss:MergeAcross` de cada celda, porque ignorarlos
desplaza cada columna posterior a un hueco.

Verificado el 2026-09-23: 17.502 filas, huella
`3cb88bb0607a7549cf9187bbad47b0bafd65b3b39a335b8e3ae3bf3be95bcd9d`, y la
misma huella al pedir la lista completa (`codigo=0&rol=0`) o al pedir el
departamento 1 por separado (`codigo=1&rol=7`) y sumar los nueve
restantes: es la misma tabla, filtrada distinto en el propio servidor.

## Qué trae

R.U.E. (identificador único), subsistema (Regular / Alternativa y
Especial), dependencia (Fiscal / Convenio / Privada), turno, nivel
autorizado, nombre, zona, dirección, nombre del director y una
coordenada que el propio ministerio publica. No trae matrícula por
unidad: el SIE la publica solo agregada, y ninguna se inventa aquí.

## Qué se descarta

| Motivo | Filas |
| --- | --- |
| Sin R.U.E. o sin nombre | 0 |
| Sin coordenada o `0,0` (el ministerio no la tiene) | 96 |
| A más de 25 km de la mediana de su propio municipio | 2.898 |
| Subsistema sin familia definida | 0 |

El director no entra: nombra a una persona, y el corpus lo lee un
informe público. Una dirección que nombra «al lado de la vivienda de
don Filemon Herrera» se retira y queda el aviso
`direccion_retirada_nombra_una_vivienda`, con el mismo criterio que
usa el lector del registro mercantil.

## Cómo se reconstruye

```sh
node scripts/places/build-sie-poi-seed.mjs \
  --lista sie_unidad_lista_0.xls \
  --catalogue scripts/places/catalogue/bolivia-place-families.json \
  --out src/database/seeds/boot/bolivia-sie-poi \
  --retrieved 2026-09-23T11:22:46Z \
  --expected-sha256 3cb88bb0607a7549cf9187bbad47b0bafd65b3b39a335b8e3ae3bf3be95bcd9d
```

`--schools` de los otros dos constructores (ANH, cajeros) apunta a esta
misma siembra: es la referencia territorial que usan para cotejar el
departamento que declaran.
