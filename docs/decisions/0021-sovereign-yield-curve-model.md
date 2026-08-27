# ADR 0021 — La curva de rendimientos vive fuera de las lecturas medidas

- **Estado**: aceptada
- **Fecha**: 2026-08-27
- **Reemplaza a**: ninguna
- **Relacionada con**: ADR 0007 (separación lectura/escritura), ADR 0017 (recolección diaria determinista)

## Contexto

El observatorio no podía responder qué paga la deuda del país. Lo único que
tenía sobre bonos soberanos era `SOVEREIGN_BOND_NET_FLOWS_USD`, un agregado
anual de balanza de pagos del compilador multilateral: un flujo, no un precio.
`ECONOMIC_DATACENTER_PRODUCTION_READINESS.md` ya lo marcaba como hueco abierto.

La Bolsa Boliviana de Valores sí publica el dato, en su tabla de tasas de
rendimiento: una tasa por instrumento, emisor, moneda, lado del mercado y banda
de plazo, para la sesión que acaba de cerrar. Entre los emisores están el Tesoro
General de la Nación y el Banco Central.

El problema no era conseguir el dato sino dónde ponerlo.

## El conflicto

Todo lo medido en este sistema entra por `raw_observation.payload_json ->
'measures'`, y de ahí lo recoge `read_models.economic_indicator_reading`.
`economic_indicator_daily`, construida encima, agrupa **por indicador y por
lado**, y devuelve la mediana del día.

Un rendimiento no sobrevive a esa agrupación. Sólo significa algo junto con las
cinco cosas que lo acompañan; un rendimiento admitido en esas vistas se fundiría
con todos los demás del día en una sola mediana que representaría al Tesoro a
tres años y a un depósito bancario a treinta días a la vez. Ese número no lo
cotizó nadie y nadie puede operar sobre él.

Cabían tres salidas:

1. **Meter las dimensiones en el `indicator_code`**
   (`BBV_YIELD_BTS_TGN_BOB_541_720`). Evita la mediana falsa, pero convierte un
   contrato estable en una explosión combinatoria: cincuenta y seis códigos
   nuevos por sesión, ninguno reutilizable, y la promesa de que renombrar un
   código rompe paneles deja de poder sostenerse.
2. **Ampliar `economic_indicator_reading`** con moneda, plazo, emisor y
   operación. Ensancha el grano de la vista que sostiene el tipo de cambio y la
   UFV, donde cuatro de esas cinco columnas serían siempre nulas, para acomodar
   un solo productor.
3. **Un modelo propio.**

## Decisión

Se elige la tercera. La curva entra con `recordType = 'YIELD_CURVE_POINT'` y sus
payloads **no llevan la clave `measures`**, que es exactamente lo que los
mantiene fuera de `economic_indicator_reading`, y se sirve por
`read_models.sovereign_yield_curve` con sus dimensiones intactas.

La ausencia de `measures` es la parte que hay que entender antes de tocar este
código: no es un olvido, es el mecanismo. Añadir esa clave a un payload de curva
volvería a meter los rendimientos en la mediana diaria sin que ninguna prueba
falle en el acto.

La procedencia no cambia: `fact_claim`, `claim_evidence` y `source_artifact`
funcionan igual para estos registros que para cualquier otro, porque esa cadena
nunca dependió de `measures`.

`is_sovereign` se computa en la vista a partir del emisor —`TGN` y `BCB`— en vez
de recolectarse. Es una propiedad de quién emite, no de la sesión. Los emisores
bancarios y corporativos se conservan: el rendimiento soberano sólo es legible
contra lo que cotiza a su lado.

## Consecuencias

- Un tablero que quiera la curva consulta una vista distinta de la que usa para
  el tipo de cambio. Es el precio de no publicar una mediana sin sentido.
- La serie **no tiene historia**. La bolsa sirve la sesión de cierre y su propio
  filtro de fechas está comentado en la página, así que el colector es
  acumulativo: empieza el día que corrió y crece hacia adelante, como las
  cotizaciones del BCB.
- Cubre el **mercado doméstico**. Las emisiones internacionales de 2028 y 2030 se
  negocian fuera de bolsa y no aparecen aquí.
- **El riesgo país sigue descubierto.** El EMBI lo licencia JP Morgan y el BCB lo
  reproduce en PDF; no hay fuente pública legible por máquina para Bolivia.
  `RISK_PREMIUM_ON_LENDING_PCT` es la prima de riesgo sobre créditos del Banco
  Mundial y no es un sustituto: mide otra cosa. Cerrar ese hueco exige una
  decisión de licenciamiento que no está tomada.
