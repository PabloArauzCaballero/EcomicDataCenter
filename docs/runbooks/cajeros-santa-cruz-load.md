# Carga de cajeros automáticos de Santa Cruz

Cómo se descarga y se construye la siembra de cajeros automáticos de
`cajerosensantacruz.tel.bo`, y qué se descarta y por qué. Entra en
`NATIONAL_POI` (migración 0073), familia `CAJERO_ATM`.

Tel.bo **no es un regulador**: ASFI supervisa a los bancos, no a este
sitio, y nada aquí dice que un banco respalde el punto que un
webmaster privado puso en un mapa. Cada lugar sale con el aviso
`directorio_privado_no_lo_respalda_el_banco_ni_el_supervisor` y con
`officialValidationSource` en `ASFI` heredado de la familia
`CAJERO_ATM` del catálogo — que dice quién licencia la actividad
bancaria, no que este directorio esté verificado por ese supervisor.

## Cómo se descarga

El mapa está en un `<iframe>` de la portada; los marcadores viven en la
página que carga ese iframe, con Google Maps JavaScript y un
`InfoWindow` por cajero:

```sh
curl -k -o cajeros_todos.php.html \
  https://cajerosensantacruz.tel.bo/coordenadas/todos.php
```

Verificado el 2026-09-23: 673 marcadores, huella
`da55ef677af57b88f9f28478c184c5a9684b33397aee6613ff9a2fbf453518f8`.
No hay paginación ni bloqueo: es un único archivo HTML con el script
entero.

## Qué trae

Banco, nombre de sucursal, dirección en texto libre y un horario que
es «24» en 370 de los 673 (y «-» —sin publicar— en 36). No trae
teléfono ni identificador propio: el identificador que se guarda es
una huella del contenido (banco, sucursal, coordenada), para que el
mismo marcador leído dos veces hashee igual.

## Qué se descarta

| Motivo | Filas |
| --- | --- |
| Banco no reconocido (nombre distinto de los catorce que lista el sitio) | 0 |
| Fuera de Bolivia | 0 |
| Repetido en la propia página (mismo banco, sucursal y punto) | 1 |
| El departamento no coincide con el de las escuelas más cercanas | 1 |

El sitio no declara municipio por fila, solo su propio título («todos
los bancos en Santa Cruz de la Sierra»). Los marcadores llegan más
lejos que la ciudad —Camiri, Puerto Suárez, San Ignacio de Velasco— y
los tres siguen siendo municipios del departamento de Santa Cruz, así
que el departamento se afirma `Santa Cruz` para todo el archivo y se
cotejó contra las escuelas del SIE más cercanas. El cotejo encontró un
caso real: «Banco de Crédito - Delizia» con coordenada
`-16.548701,-68.208798`, que cae en La Paz — la misma sucursal aparece
también con una dirección de Santa Cruz y otra coordenada correcta en
el resto del archivo, así que esta fila es un punto mal escrito en la
página de origen, no un dato nuevo. Requiere construir primero la
siembra del SIE.

## Cómo se reconstruye

```sh
node scripts/places/build-cajeros-poi-seed.mjs \
  --pagina cajeros_todos.php.html \
  --catalogue scripts/places/catalogue/bolivia-place-families.json \
  --schools src/database/seeds/boot/bolivia-sie-poi \
  --out src/database/seeds/boot/bolivia-cajeros-poi \
  --retrieved 2026-09-23T11:22:00Z \
  --expected-sha256 da55ef677af57b88f9f28478c184c5a9684b33397aee6613ff9a2fbf453518f8
```

## La cuarta fuente pedida no se cargó

`soysantacruz.com.bo` publica una «Guía de Surtidores» de Santa Cruz
(`SSCB_Contenidos.php?...CualSubOpcAux=CP-01_Surtidores.`) con **siete**
surtidores: nombre comercial, teléfono de centralita y una dirección de
una línea («Av. Roca y Coronado / 3er. Anillo»), sin coordenadas y sin
ningún identificador propio. No está bloqueada — responde 200 con una
cookie de sesión previa — pero no trae qué construir una siembra
geográfica: sin coordenada no hay `latitude`/`longitude` que el
esquema exige, y el esquema no admite un lugar sin posición
(`geocoded: false` no existe en `bolivia-national-poi.schema.ts`). Los
siete nombres se solapan con la ANH por razón social o por zona
(Biopetrol, Genex, Guayacán, La Cañada, La Cima, Rivero, Santos Dumont
Nogales), así que no aportan un surtidor que la ANH no liste ya, y la
ANH sí trae coordenada porque es quien licencia la actividad. Queda
sin siembra propia; el extracto de la página descargada vive en
`C:/Users/Usuario/AppData/Local/Temp/wt-fuentes-datos/sscb_Surtidores.html`
como prueba de qué se descartó y por qué.
