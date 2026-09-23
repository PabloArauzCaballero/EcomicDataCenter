# Comercio exterior por socio y por producto

Cómo se descarga y se construye la siembra del comercio exterior
desglosado, y qué preguntas contesta y cuáles no. Paquete
`foreign-trade-detail` (`historical`), sembrador
`reconcileForeignTradeDetail`.

## Por qué existe

`collect-comtrade-trade.ts` ya trae el total nacional de exportaciones
e importaciones declarado ante Naciones Unidas, pero un solo número por
año no contesta «qué exporta Bolivia» ni «a quién». El registro que
produce ese total viene, en el propio registro, desglosado por socio
comercial y por capítulo del Sistema Armonizado (dos dígitos). Este
colector pide esos dos desgloses.

## Lo que sí contesta, y lo que no

**Sí**: qué vende y qué compra Bolivia por país socio y por tipo de
producto (capítulo arancelario), en dólares corrientes, un valor por
año, de 2020 al último año cerrado.

**No — y no es un defecto de este colector, es del dato público**:

- **No hay exportaciones por empresa en dólares.** La declaración
  individual está amparada por reserva legal en Bolivia; comprobado
  contra el INE, la Aduana Nacional, el portal comex y el Anuario de
  Minería (ver `bolivia-por-departamento-y-por-empresa` en la memoria
  del proyecto). Ningún registro público lo tiene, y este tampoco.
- **No hay granularidad mensual.** El nivel «preview» (sin clave) del
  registro de Naciones Unidas sólo sirve frecuencia anual (`A`) para
  Bolivia; pedir `M` en la ruta lo rechaza.
- **No hay cruce completo producto × país.** Se publican dos desgloses
  separados —por socio y por producto—, cada uno agregando sobre la
  otra dimensión. El cruce completo multiplicaría las peticiones por
  el número de socios (cientos) para una tabla que nadie lee entera.
- **Sólo el top 20 por flujo, no todos los declarados.** El registro
  devuelve 100-200 socios y ~90-97 capítulos por año; la mayoría son
  unos pocos dólares. Se publican los 20 de mayor valor acumulado
  2020-último año por flujo, muy por encima del piso de 10-15 que
  pidió el encargo.
- **Es la moneda del propio registro.** Todo el corpus está en dólares
  corrientes (`unit: 'USD'`), igual que `foreign-trade.json` y que el
  INE. No es una dimensión que falte, es cómo lo publica la fuente.

## Cómo se descarga

```sh
yarn trade-detail:collect
```

Corre `scripts/macro/collect-comtrade-trade-detail.ts`. Por año y por
flujo (`X`, `M`) hace **una** petición para socios (sin fijar
`partnerCode`, el registro devuelve todos los socios del año) y
**una** para productos (`cmdCode=AG2`, todos los capítulos de dos
dígitos en una respuesta), más dos peticiones de referencia (nombres
de socios y de capítulos) que no dependen del año. Para 2020-2025 eso
es 26 peticiones en total, con 1,5 s de pausa entre cada una — el
mismo margen que ya usa `collect-comtrade-trade.ts` contra el límite
de frecuencia del nivel gratuito.

**El tope de 500 filas.** La primera corrida (2026-09-23) escribió una
siembra incompleta sin ningún error: el nivel «preview» corta cada
respuesta en 500 filas y sólo lo dice en el campo `count`. Sin acotar
más la consulta, 2024 y 2025 superan esas 500 filas —hay una fila por
cada combinación de socio con modo de transporte y procedimiento
aduanero, no una por socio— y las importaciones por socio de 2025
quedaron con 3 de los 20 socios esperados, los grandes ausentes.
Fijar `motCode=0&customsCode=C00` en la propia petición pide
directamente la fila agregada que el colector iba a quedarse de todos
modos (`isAggregateRow`), y deja cada respuesta entre 114 y 374 filas
en el peor año. El colector además revienta si `count` llega a 500 de
todos modos, para no repetir el silencio si las combinaciones vuelven
a crecer.

Escribe:

- `src/database/seeds/boot/foreign-trade-partners.json`
- `src/database/seeds/boot/foreign-trade-products.json`

Cada punto lleva su propia URL, huella SHA-256 y fecha de descarga:
el registro responde un año por petición, así que la procedencia va en
el punto y no en la serie (igual que `foreign-trade.json` y que
`mineral-trade.json`).

## Cómo se valida

```sh
yarn quality:seeds
npx jest src/database/seeds/tests/foreign-trade-detail.spec.ts
```

Los esquemas (`foreign-trade-detail.schema.ts`) exigen que cada cifra
aparezca, carácter por carácter, en el fragmento del registro citado
como evidencia (`ungroundedMeasures`), que ningún socio ni capítulo se
repita dentro de un mismo flujo, y que el socio «Mundo»
(`partnerCode=0`, que ya cubre `foreign-trade.json`) nunca se publique
como si fuera un país.

## Corrida verificada

2026-09-23, tras el ajuste del tope de 500 filas: 2020-2025 completo,
40 series de socios (20 por flujo) y 40 de productos (20 capítulos por
flujo), las 80 con sus 6 años — ningún año faltante en ninguna serie.

En 2025: exportó sobre todo a China (1.854 M USD), Brasil
(1.247 M USD) e India (823 M USD); importó sobre todo de China
(2.422 M USD), Brasil (1.429 M USD) y Argentina (829 M USD). Exportó
sobre todo el capítulo 26 «Ores, slag and ash» —minerales metalíferos—
(3.597 M USD), el 71 —piedras y metales preciosos, incluido el oro—
(1.676 M USD) y el 27 —combustibles minerales— (1.127 M USD); importó
sobre todo el capítulo 27 —combustibles— (2.989 M USD), el 84
—maquinaria— (1.087 M USD) y el 87 —vehículos— (716 M USD).

## Qué falta para verse en el tablero

Esta siembra carga la base; ningún componente de `observatorio-dashboard`
lee todavía `COMTRADE_PARTNER_*` ni `COMTRADE_PRODUCT_*`. Construir esa
vista es trabajo aparte, fuera de este repositorio.
