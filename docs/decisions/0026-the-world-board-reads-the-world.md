# ADR 0026 — El tablero mundial lee el mundo, no a los vecinos

- **Estado**: aceptada
- **Fecha**: 2026-09-10
- **Reemplaza a**: ninguna
- **Relacionada con**: ADR 0024 (el panel mundial entra completo)

## Contexto

El panel de la ADR 0024 carga los World Development Indicators para **30 economías**: Sudamérica,
Centroamérica, México y el Caribe, y seis socios grandes. Responde bien una pregunta —cómo se
compara Bolivia con sus vecinos— y deja sin responder la que el tablero necesitaba: **cómo está el
mundo**. El panel no tiene ninguna cifra del mundo ni de sus regiones, porque nunca las pidió.

Tres hechos condicionan la decisión:

1. **El Banco Mundial publica los agregados** —el mundo y cada región— con la misma definición que
   cada cifra nacional, por la misma API y la misma forma de dirección. No hay que calcular nada.

2. **Los grupos de ingreso no traen código ISO3.** La API los sirve con `countryiso3code` vacío, y
   el esquema de las semillas —como todo lector del panel— identifica cada punto por ese código.

3. **La dirección de origen forma parte del digest de cada payload.** `payloadFor` incluye `url`, y
   la URL del panel nombra a sus treinta economías. Volver a recolectar el panel con ocho códigos
   más cambiaría la dirección de las 1.489 series y le entregaría al cargador **1,28 millones de
   payloads que nunca vio**: registraría cada cifra por segunda vez.

## Decisión

### 1. Se recolectan agregados para los indicadores del tablero, nunca para el panel entero

`yarn macro:world` pide **26 indicadores** para **8 agregados**: `WLD` (mundo), `LCN` (América
Latina y el Caribe), `NAC`, `ECS`, `EAS`, `SAS`, `MEA` y `SSF`. Una llamada por indicador, con su
propia dirección y su propio digest, igual que el panel.

Los 26 son los que tienen cifra mundial. La deuda del gobierno central, la deuda externa y la
cuenta corriente eran candidatos y no la tienen: una tarjeta con la cifra de Bolivia y sin la del
mundo es justo la comparación que el tablero existe para hacer, ausente.

### 2. Un archivo aparte, en el mismo directorio y con el mismo esquema

`world-000.json` vive junto a los cortes del panel y tiene su forma exacta. El cargador no cambia:
lee todos los archivos del directorio en orden de nombre y salta todo payload que ya tiene. Los
agregados entran una vez, en el próximo despliegue, y nada de lo cargado se toca.

El colector nuevo es un archivo propio y **no modifica `collect-worldbank-panel.ts`**. Cualquier
cambio en cómo aquel arma su dirección se volvería, en la próxima recolección, un millón de filas
duplicadas, y no hay forma barata de probar que la dirección quedó idéntica byte a byte.

### 3. Bolivia no se pide de nuevo

El panel ya la trae. Pedirla otra vez desde esta dirección registraría cada cifra boliviana dos
veces, bajo dos fuentes distintas.

## Consecuencias

**A favor**

- El tablero puede decir cómo está el mundo con cifras del publicador, sin inventar un promedio.
- La carga es aditiva y pequeña: 10.173 observaciones en un archivo de 303 KB.
- El cargador, el esquema, las vistas y los índices de la migración 0067 no cambian.

**En contra, y asumido**

- **La lista de agregados queda fija en la dirección.** Volver a correr `macro:world` con otra
  lista cambia la URL de las 26 series y registra de nuevo lo ya cargado. Sumar un agregado exige
  aceptar ese costo o recolectarlo en un archivo propio.
- **El catálogo del panel cuenta hasta ocho lugares más** en esos 26 indicadores. El buscador del
  panel los muestra por su código.
- **Un agregado no es una economía.** La cifra mundial la construye el Banco Mundial con su propio
  método de agregación; el tablero la expone tal como se publica y no la avala.

## Alternativas descartadas

- **Recolectar el panel entero con los agregados.** Rechazada: duplica 1,28 millones de filas por el
  digest de la dirección.
- **Calcular el «mundo» con las 30 economías del panel.** Rechazada: treinta economías no son el
  mundo, y la ponderación sería una que el publicador no publicó.
- **Pedir los agregados en el momento de servir la página.** Rechazada por la misma razón que en la
  ADR 0024: una lectura que depende de una llamada externa al servirse no es reproducible ni
  auditable.
- **Incluir los grupos de ingreso con otro identificador.** Rechazada: exigiría cambiar el esquema
  y a cada lector del panel por cuatro series que el tablero no necesita.

## Evidencia

`yarn macro:world`: 10.173 puntos, 26 series, 8 agregados, 0 indicadores sin datos. El archivo
valida contra `worldbank-panel.schema.ts`. Colector `scripts/macro/collect-worldbank-world.ts`,
listas en `scripts/macro/worldbank-panel-sources.ts`.
