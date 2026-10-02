# ADR 0028 — Los dueños se leen en documentos públicos, y su fortuna se calcula al dibujar

- **Estado**: aceptada
- **Fecha**: 2026-10-01
- **Reemplaza a**: la exclusión de personas de `scripts/macro/corporate-sources.ts` (ránking de líderes de Merco), sólo para este fin
- **Relacionada con**: ADR 0027 (las cuentas oficiales de las empresas se leen en su perfil)

## Contexto

El usuario pidió, el 2026-10-01, «los principales empresarios del país año a año y sus fortunas
estimadas» en una página de «Empresas», y eligió expresamente una **estimación propia** además de las
cifras publicadas. Tres hechos condicionan cómo se hace:

1. **Nadie publica las fortunas de los empresarios que viven en Bolivia.** Se consultó la lista de
   multimillonarios de Forbes de cada año desde 2005: ninguna persona con ciudadanía boliviana aparece
   nunca. Sólo dos nacidos en Bolivia, con otra ciudadanía —Miguel Krigsner desde 2014 y Marcelo
   Claure desde 2023—. Forbes nunca publicó una lista de «los más ricos de Bolivia», y las cifras de
   prensa sobre otros empresarios son precios de una transacción o rumores, no patrimonios.
2. **Sus dos insumos sí son públicos.** Quién es dueño de qué: los bancos publican sus accionistas en
   la memoria anual (lo exige ASFI) y los emisores de la Bolsa Boliviana de Valores su composición
   accionaria en prospectos y memorias. Cuánto vale en libros cada empresa: esos mismos documentos
   traen el balance auditado. «Las 500 empresas más grandes de Bolivia» publica el patrimonio de
   quinientas, pero su única edición gratuita (2024) trae las tablas como imagen y no se transcribe.
3. **El corpus no guarda cifras que no tengan celda.** El sembrador detiene la corrida si una cifra
   no aparece en el extracto que la sostiene, y la regla del capítulo departamental ya lo dijo: una
   suma se calcula al dibujar, no al sembrar.

La exclusión de personas que dejó `corporate-sources.ts` («añade datos personales a un corpus que no
los necesita») era correcta para el ránking de líderes de Merco, que es una encuesta de percepción
sobre personas. Aquí el corpus sí los necesita, y lo que se guarda no es una opinión sobre nadie sino
lo que un documento oficial declara.

## Decisión

### 1. Quién entra

Sólo una persona o sociedad que un **documento público** —memoria anual de un banco o aseguradora,
prospecto o memoria de un emisor de la BBV, registro del mercado de valores de ASFI, Forbes— nombra
como accionista con **al menos el 10 %** de una empresa de la lista de las más grandes (las cien que
más impuestos pagan, «Las 500» o los emisores de la bolsa). Nada de prensa, nada de familiares que el
documento no nombre, ningún dato personal además del nombre, la participación, la empresa y el
documento.

### 2. Qué entra al corpus

Los insumos, cada uno con su celda: la participación (`OWNER_STAKE_<titular>_<empresa>`, por año de
corte del documento), el patrimonio de cada empresa tal como lo declara el balance auditado del mismo
documento (`OWNER_EQUITY_<empresa>`; `LARGEST_EQUITY_<empresa>` de «Las 500» cuando se consiga una
edición legible), las cifras de Forbes
(`WEALTH_FORBES_NETWORTH_<persona>`), la razón precio/valor en libros de cada industria en mercados
emergentes de Damodaran (`WEALTH_PBV_EM_<industria>`) y los agregados sin nombres: el Impuesto a las
Grandes Fortunas y los millonarios que cuenta UBS. **La fortuna estimada no entra.**

### 3. Cómo se calcula, en el tablero (`business-owners-board.ts`)

1. **Participación efectiva**, directa o por cadenas de sociedades (se multiplican los tramos y se
   suman los caminos, hasta cuatro niveles). Para un año se usa el documento más reciente hasta ese
   año; si no hay ninguno anterior, el primero publicado hasta dos años después.
2. **Piso contable** = participación efectiva × patrimonio de la empresa ese año; manda el balance
   auditado (`OWNER_EQUITY_`) sobre «Las 500» cuando hay los dos. Una sociedad que sólo
   tiene acciones de otras de la lista no se cuenta aparte, para no contar dos veces a la misma
   empresa.
3. **Referencia de mercado** = piso × P/VL de su industria en mercados emergentes ese año.
4. Bolivianos a dólares a 6,96, el tipo al que las empresas llevan su contabilidad.

### 4. Cómo se presenta

Cada cifra lleva su rótulo —«Forbes» o «Estimación del Observatorio»— y la estimación lleva siempre
la frase «cota inferior: no incluye inmuebles, cuentas, empresas fuera de la lista ni activos fuera de
Bolivia». La ficha de cada persona abre la estimación empresa por empresa con el año del documento,
el patrimonio, el múltiplo y la vía cuando la participación pasa por otra sociedad.

## Consecuencias

- La estimación es tan buena como la cobertura de documentos: una persona cuyo patrimonio está en
  empresas que no publican accionistas no aparece, y la página muestra cuántas empresas tienen dueños
  documentados frente a cuántas tienen patrimonio publicado.
- Un error en un documento se corrige en su colector y la estimación cambia sola, porque no se guarda.
- Si algún día se usa «Las 500», mezcla estados auditados y sin auditar; el balance de la propia
  empresa manda sobre ella.
