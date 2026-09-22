# ADR 0025 — El registro lee comercio, no plataformas

- **Estado**: aceptada
- **Fecha**: 2026-09-01
- **Reemplaza a**: ADR 0022 parcialmente — retira los asuntos `AUDIENCE`, `TOPIC` y `EMOTION`;
  conserva `COMMERCE`, el grado de evidencia, el digest de registro y la prohibición de que una
  lectura alcance una serie
- **Relacionada con**: ADR 0016 (entrada no confiable), ADR 0020 (materializar los modelos de
  lectura), ADR 0023 (el comercio se lee por su forma de hacer negocio)

## Contexto

ADR 0022 abrió un solo registro para cuatro asuntos: audiencia declarada, temas, emoción y
comercio. Tres describían plataformas; el cuarto describe mercados. ADR 0023 ya había ampliado ese
cuarto hasta cubrir ferias, mercados tradicionales, tiendas de barrio, catálogo, contrabando y
trabajo por cuenta propia — las formas por las que pasa la mayor parte del comercio boliviano.

El uso mostró el desbalance. De 101 lecturas del catálogo, 57 eran de comercio y 44 de analítica de
plataformas. Las 44 no se podían recolectar, no se podían actualizar y no respondían ninguna
pregunta económica:

1. **No hay vía de recolección, y ADR 0022 ya lo decía.** La Meta Content Library exige institución
   académica calificada y comité de ética; la TikTok Research API no cubre Bolivia. El catálogo se
   mantenía a mano y envejecía sin avisar.

2. **La cifra central no cuenta personas.** TikTok declara 9,43 millones de adultos alcanzables en
   un país de 12,6 millones de habitantes: 115 % de la población adulta. `social_platform_audience`
   existía únicamente para marcar esa distorsión en SQL. Retirar las lecturas retira la necesidad
   de la advertencia.

3. **El registro emocional no tenía de dónde derivarse.** `emotional_register` clasificaba
   reacciones monitoreadas —`MIEDO`, `INDIGNACION`, `BURLA`, `RESIGNACION`— sobre un corpus de un
   mes de un conflicto. Un panel de hogares no le da nada que leer.

4. **El costo no era de cómputo, era de atención.** No hay recolector ni tarea programada, así que
   la analítica no consumía nada en ejecución. Consumía superficie: un lector que abre el registro
   y ve alcance declarado junto a cuotas de canal tiene delante dos cosas de peso probatorio
   distinto presentadas igual.

## Drivers

- Que el registro responda por forma de hacer negocio y no por plataforma.
- Que no quede en el modelo una cifra que nadie puede actualizar ni verificar.
- Que retirar una lectura no borre lo que el sistema recibió.
- Que volver a admitir analítica de plataformas cueste una decisión, no un commit.

## Decisión

### 1. El asunto se cierra en `COMMERCE`

`socialReadingsSchema` admite un solo valor de `subject`. No es una lista que quedó corta: es un
conjunto cerrado de uno, y ampliarlo es la decisión que este ADR quiere que cueste otro ADR. Las 44
lecturas de audiencia, tema y emoción salen del catálogo de arranque.

### 2. El nivel `SOCIAL` desaparece del registro de fuentes

`VerifiedSourceTier` vuelve a `OFFICIAL | MARKET | SECTOR | PRESS`, y los ocho dominios de
plataforma dejan de estar registrados. La función `establishesAuthor` se retira con ellos.

El razonamiento de ADR 0022 §1 se mantiene y se lleva a su conclusión: un dominio de plataforma es
la única dirección que no establece autoría, porque sirve lo que publicó una cuenta y una cuenta se
llama como quiera —el 39 % de las cuentas difusoras del conflicto de mayo de 2026 se presentaba
como medio sin serlo—. Registrarlo obligaba a advertir sobre él en cada consumidor. No registrarlo
hace que una URL servida desde una plataforma no resuelva a ningún publicador, que es la propiedad
que se buscaba.

`datareportal.com` e `internetbolivia.org` salen del registro por quedarse sin lecturas.
`kantar.com`, `ipdrs.org`, `inesad.edu.bo` y `cecasem.com` siguen como `SECTOR`: compilan comercio.

### 3. La migración avanza; no reescribe

Las migraciones 0062 a 0068 ya estaban aplicadas. La corrección es la migración 0069, que
reconstruye `read_models.social_reading` admitiendo solo `COMMERCE` y sin `emotional_register`,
elimina `read_models.social_platform_audience` y vuelve a montar sobre el registro estrechado las
cuatro vistas de comercio de 0065, cuya definición no cambia y por eso se importa del snapshot de
esa migración en vez de copiarse.

### 4. Lo retirado se deja de servir, no se borra

Las 44 lecturas siguen en `intelligence.raw_observation`, `intelligence.fact_claim` y su evidencia.
Los datos crudos y la auditoría son inmutables en este sistema: una corrección estrecha lo que se
sirve, y el registro de lo que se recibió sobrevive. El filtro por asunto vive en la vista, que es
donde se puede leer y discutir.

### 5. Los nombres de los objetos no cambian

`read_models.social_reading`, `social_reading_snapshot` y `social_commerce` conservan su nombre
aunque ya no sirvan nada social. El tablero es otro repositorio y los lee por ese nombre;
renombrarlos aquí lo rompería en silencio y sin que esta decisión pueda verificarlo. El renombrado
es un cambio coordinado aparte, y queda pendiente.

## Consecuencias

**A favor**

- El registro contiene solo lecturas que responden cómo compra y cómo vende el país.
- Ninguna cifra que nadie puede actualizar queda presentada junto a una que sí.
- Una URL de plataforma no resuelve a publicador en ninguna parte del sistema.
- El panel de comercio informal de ADR 0023 queda intacto: filtraba `COMMERCE` desde el principio.

**En contra, y asumido**

- **Se pierde el contraste que ADR 0022 §5 llamaba el indicador**: la distancia entre lo que las
  redes esperaban y lo que la serie midió. Se asume porque ese contraste nunca llegó a construirse
  y su insumo social no era actualizable.
- **Los nombres quedan mintiendo un tiempo.** Un objeto llamado `social_reading` que solo sirve
  comercio es deuda declarada, no un descuido; está escrita aquí para que el renombrado se haga
  cuando el tablero pueda acompañarlo.
- **Si el tablero tiene una pestaña de redes, se queda sin datos.** Es consecuencia buscada, pero
  ocurre en otro repositorio y no la cubre ninguna prueba de este.

## Alternativas descartadas

- **Borrar las filas retiradas.** Rechazada: viola la inmutabilidad de datos crudos y auditoría que
  el resto del sistema sostiene, y perdería la evidencia de lo que el observatorio sí recibió.
- **Reescribir las migraciones 0062 y 0063 en sitio.** Rechazada: ya estaban aplicadas, y editarlas
  dejaría el historial registrado describiendo un esquema que no existe.
- **Eliminar el registro completo, comercio incluido.** Rechazada: son 57 lecturas sobre ferias,
  contrabando y cuenta propia, y el Censo 2024 da 51,8 % de ocupados por cuenta propia. Es la
  estructura del comercio boliviano, no un residuo de la analítica.
- **Conservar las lecturas y solo dejar de exponerlas.** Rechazada: un catálogo cargado que ninguna
  vista sirve es exactamente el tipo de cosa que vuelve por descuido.
- **Marcar las afirmaciones retiradas como `SUPERSEDED`.** Rechazada: no las reemplaza ninguna otra
  afirmación, y ese estado significa otra cosa en este modelo.

## Evidencia

Migración `src/database/migrations/0069-retire-platform-analytics.ts` con su SQL en
`src/database/migration-sql/0069-retire-platform-analytics.view.ts`. Catálogo estrechado en
`src/database/seeds/boot/social-readings.json` (101 → 57 lecturas). Pruebas
`src/database/seeds/tests/social-readings.spec.ts`,
`src/modules/intelligence/tests/social-reading-sources.spec.ts` y
`src/modules/intelligence/tests/verified-source-registry.spec.ts`.
