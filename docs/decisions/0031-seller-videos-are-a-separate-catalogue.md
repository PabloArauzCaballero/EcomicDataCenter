# ADR 0031 — Los videos de los vendedores son un catálogo aparte de los lives

- **Estado**: aceptada
- **Fecha**: 2026-10-06
- **Relacionada con**: ADR 0027 (cuentas de empresas), ADR 0030 (ventas en vivo como mercado)

## Contexto

Se pidió la historia de los últimos cinco años, día a día. Un live de TikTok no queda guardado: al
terminar, su chat y su voz desaparecen para todos (la repetición es privada del creador, 30 días). Se
revisaron los archivos de terceros que graban lives (streamarchive.io, LiveRec, TikRec): solo tienen lo
que alguien les pidió grabar, desde hace poco, y ninguno tiene a los vendedores bolivianos.

Lo que sí es real, observado y antiguo son los **videos** que publican esos mismos vendedores: la fecha
exacta de cada uno está en su identificador, la descripción dice producto y precio, y las cifras de vistas,
me gusta, comentarios y compartidos son las de TikTok. El perfil, además, sugiere cuentas parecidas, que
es como se encuentra a otros vendedores que apuntan al mismo público.

Se midió el 6 de octubre de 2026, sin sesión: la API de la grilla (`api/post/item_list`) entrega una o dos
páginas, unos 16 a 35 videos, y después el perfil pide iniciar sesión. Para un vendedor que publica poco
eso llega a 2021; para uno que publica a diario, a unas semanas. Se evaluó una sesión de cuenta secundaria
y se descartó por decisión del responsable: se sigue sin sesión, como el resto.

## Decisión

1. **Catálogo aparte.** Los videos se guardan en su propia semilla (`boot/tiktok-videos.json`), sus propias
   observaciones (`TIKTOK_VIDEO_*`) y sus propias vistas (`read_models.tiktok_video*`). Ninguna cifra de un
   video entra a las vistas de lives ni al revés: un video no es un live.
2. **Quiénes.** Las cuentas vistas en un live de venta, gastronomía o entretenimiento, y las que sus perfiles
   sugieren. Una cuenta entra solo si tiene señal de Bolivia (biografía, ciudades, Bs, +591, 🇧🇴) y vende o
   entretiene; las demás se excluyen y se cuentan por motivo.
3. **Qué.** Por video: fecha y hora de La Paz, rubro, producto, precios dichos en la descripción, cifras y
   marcas de cómo vende (precio, envío, contacto, promoción, anuncio de live, sorteo, mayoreo, stock nuevo,
   desembalaje, pedidos). Nunca la descripción, el nombre de la cuenta ni el identificador real: cuenta y
   video van en seudónimo con la clave fuera del repositorio (ADR 0030 §2).
4. **El sesgo se dice.** Sin sesión la serie larga está cargada hacia lo reciente; la cobertura publica los
   videos por año y el tablero lo advierte junto a la serie diaria.
5. **Las cifras de un video son las del día de lectura.** Las vistas se acumulan: la serie diaria cuenta
   videos publicados por día y suma las cifras que tenían cuando se leyeron.

## Consecuencias

- La historia de cinco años existe día a día para la publicación de videos, no para el chat de los lives.
  Los lives con chat se capturan desde el 5 de octubre de 2026 y crecen noche a noche.
- La corrida es semanal y automática desde la laptop (IP residencial), junto con la de lives.

## Evidencia

Recolector `scripts/social/live/collect-videos.ts`, análisis `analyze_videos.py`, esquema
`tiktok-videos.schema.ts`, cargador `boot-seed.tiktok-videos.ts`, vistas de la migración
`read-the-live-videos` (0102 en `dev`, 0105 en `test`), prueba `tiktok-videos.spec.ts`.
