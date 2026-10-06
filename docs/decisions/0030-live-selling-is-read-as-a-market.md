# ADR 0030 — Las ventas en vivo se leen como mercado, no como personas

- **Estado**: aceptada
- **Fecha**: 2026-10-06
- **Reemplaza a**: ninguna (acota la ADR 0022 §«Alternativas descartadas», como las ADR 0027 y 0029)
- **Relacionada con**: ADR 0022 (lecturas sociales), ADR 0023 (el comercio se lee por su forma),
  ADR 0025 (el registro lee comercio), ADR 0027 (cuentas de empresas), ADR 0029 (figuras públicas)

## Contexto

Se pidió analizar el mercado de los lives de venta de TikTok en Bolivia: qué se vende, qué prefieren los
compradores, con qué emociones reaccionan y cuáles son los comentarios principales. Es comercio social
(`COMERCIO_SOCIAL`, régimen `MIXTO` en la ADR 0023): TikTok Shop no opera en el país, así que el producto y el
precio no vienen como datos; se dicen en voz, se muestran en pantalla o se escriben en el chat, y el pago se
cierra fuera de la plataforma.

Quien vende en un live es casi siempre una persona o un microemprendimiento. La ADR 0027 prohíbe leer cuentas de
personas y la ADR 0029 solo abre la puerta a figuras públicas corroboradas. Esta decisión abre un tercer flujo,
separado de los dos.

Lo que se midió antes de decidir (6 de octubre de 2026, conexión residencial en Bolivia, sin sesión):

| Qué | Resultado |
|---|---|
| Feed `tiktok.com/live` | Se ve sin sesión; 66 cuentas en vivo en 3 minutos, casi todas vendedores bolivianos |
| Estado de la sala (`api-live/user/room`) | Responde sin sesión ni navegador: estado, título, espectadores, entradas, biografía, URL del stream |
| Chat | Se lee de la página **solo con el Chrome instalado y sin bloquear recursos**; bloquear imágenes, video o el stream dispara un captcha («Selecciona 2 objetos de la misma forma») |
| Voz | La calidad `ao` del stream es solo audio y se abre con PyAV sin navegador |
| Transcripción | faster-whisper (CTranslate2, sin PyTorch) corre en la GPU de la laptop: 30 s de audio en ~0,7 s |
| Texto en pantalla | RapidOCR (ONNX) lee los nombres de producto de las cajas y los carteles |
| Memoria | Una sala abierta en Chrome pesa ~1,3 GB; pausar el video no la baja |

## Decisión

1. **La unidad de análisis es el mercado.** Lo que se publica son rubros, productos, precios, ciudades, horas,
   señales del chat y emociones agregadas. El tablero no muestra vendedores ni compradores, ni ordena personas.
2. **El vendedor queda solo para trazabilidad.** Su cuenta se guarda en `artifacts/live-raw/sellers.json`, fuera
   de Git. A la semilla y a la base llega un seudónimo estable (`HMAC-SHA256` con la clave
   `~/.observatorio-social/live-key`, fuera del repositorio): con la clave el operador puede volver de una cifra a
   la cuenta; sin ella, nadie.
3. **De quien comenta no queda nada.** El nombre se convierte en un seudónimo con la sal de la corrida al leerlo y
   no se escribe nunca; la sal sirve para contar personas distintas y se descarta. El texto crudo del chat vive en
   `artifacts/` (fuera de Git) para poder reanalizar; a la semilla llegan conteos.
4. **«Comentarios principales» son frases repetidas, no citas.** Una frase se publica si la dijeron al menos cinco
   personas distintas en al menos tres lives, sin teléfono, arroba ni enlace. El esquema de la semilla lo exige.
5. **Voz y pantalla con granularidad máxima, en memoria.** Se transcribe todo el audio de cada live observado y
   se lee un fotograma cada 10 s. Ni el audio ni la imagen se guardan; queda el texto con su hora en `artifacts/`.
6. **Sin sesión, sin captchas, despacio.** Como en la ADR 0027: Chrome de escritorio, sin iniciar sesión, sin
   resolver captchas ni esquivar muros. Una sala con muro queda registrada y no suma ceros. Tres muros seguidos
   detienen la apertura diez minutos.
7. **Las cifras no alimentan ninguna serie.** Las observaciones no llevan `measures` y viven en sus propias vistas
   (`read_models.live_commerce_*`), fuera de `economic_indicator_*`.
8. **Intención no es venta.** Un «mío» en el chat se informa como intención declarada. El tablero no habla de
   ventas ni de facturación, ni convierte regalos de TikTok en dinero.

## Consecuencias

- La muestra es lo que el feed mostró desde una conexión de la casa, en las noches capturadas. El tablero lo dice
  junto a cada cifra, con la cobertura y el residuo sin clasificar a la vista.
- La captura es manual y nocturna, desde la laptop: las IP de centros de datos se bloquean antes (ADR 0027) y la
  memoria limita a dos salas a la vez.
- El chat de un live es corto («mío», «precio?»). La intención se lee con léxico, que funciona con una palabra; el
  modelo de emoción (RoBERTuito) solo se aplica a mensajes de tres palabras o más, o solo emojis con valor claro.
  😂 queda ambiguo (risa o burla) y no suma a ninguna emoción.
- Los menores no pueden emitir lives en TikTok; si una sala lo sugiere, se descarta entera.

## Alternativas descartadas

- **Usar una librería del protocolo `webcast` con servicio de firmas externo.** Rechazada: es un servicio de
  terceros con clave y cuota, y el usuario rechazó APIs y servicios pagos para este trabajo.
- **Bloquear el video para ahorrar memoria.** Rechazada por medición: dispara el captcha.
- **Citas textuales de comentarios.** Rechazada: identifican a quien escribió y responden peor la pregunta («qué
  dice la gente», no «qué dijo una persona»).
- **Ranking de vendedores.** Rechazada: la unidad es el mercado; el vendedor queda solo para trazabilidad.

## Evidencia

Plan: `PLAN-TIKTOK-LIVES.md` (fuera del repo). Runbook: `docs/runbooks/tiktok-live.md`. Código:
`scripts/social/live/`. Semilla `src/database/seeds/boot/tiktok-live.json`, esquema `tiktok-live.schema.ts`,
cargador `boot-seed.tiktok-live.ts`, vistas de la migración `0104-read-the-live-commerce` (0101 en `dev`), pruebas
`src/database/seeds/tests/tiktok-live.spec.ts` y `scripts/social/live/test_live_lexicon.py`.
