# Ventas en vivo de TikTok: captura nocturna

Decisión: ADR 0030. Se corre a mano, de noche, desde la laptop (conexión residencial en Bolivia). Las IP de
GitHub Actions y de Contabo son de centro de datos y TikTok las bloquea antes.

## Una vez por máquina

Usa el mismo entorno que las redes de empresas (`docs/runbooks/company-social.md`), más voz y pantalla:

```bash
~/.observatorio-social/venv/Scripts/python -m pip install faster-whisper rapidocr-onnxruntime pytest
# GPU NVIDIA: las DLL de CUDA que pide CTranslate2
~/.observatorio-social/venv/Scripts/python -m pip install nvidia-cublas-cu12 "nvidia-cudnn-cu12>=9,<10"
```

- **Chrome instalado** (no el Chromium de Playwright): con el Chromium el live muestra un captcha.
- **PyAV 19** no es compatible con el `decode_audio` de faster-whisper (`metadata_errors`); `live_media.py`
  decodifica el audio por su cuenta. No hace falta `ffmpeg`: PyAV trae sus librerías.
- La primera transcripción en una GPU nueva (RTX 50xx) tarda ~40 s porque compila los kernels; después, 30 s
  de audio en menos de 1 s.

## Cada noche (3 por semana, rotando los días)

```bash
# 19:00–00:30 de La Paz. RAM libre > 2,5 GB (cerrar WSL ayuda: `wsl --shutdown`).
node node_modules/tsx/dist/cli.mjs scripts/social/live/collect-live.ts --minutes=300 --rooms=2 --room-minutes=20
```

- `--rooms`: salas abiertas a la vez. Cada una pesa ~1,3 GB en Chrome; la segunda solo se abre si hay RAM.
- `--room-minutes`: cuánto se queda en cada live antes de rotar a otro (diversidad).
- `--weekly-cap=2`: un mismo vendedor no se captura más de dos veces por semana.
- La noche se nombra por la fecha de La Paz menos 6 h: lo de la madrugada cuenta en la noche anterior. Se
  reanuda con `--run=AAAA-MM-DD`.

Todo queda en `artifacts/live-raw/<noche>/` (fuera de Git): `rooms.jsonl`, `chat/`, `events/`, `stats/`,
`speech/`, `screen/`, `candidates.jsonl`, `night.jsonl`, `media.jsonl`.

**Señales de que algo anda mal:** `room-blocked` repetido o `cooldown` (muros); `chat-read-error` (cambió el DOM del
chat); `audio-error` sostenido en `media.jsonl`; chat con nombres en vez de mensajes (cambió el selector del
cuerpo: borrar la noche y corregir `live-chat.ts`).

## Cada semana (lunes)

```bash
~/.observatorio-social/venv/Scripts/python -I scripts/social/live/analyze_live_commerce.py
~/.observatorio-social/venv/Scripts/python -m pytest -q scripts/social/live/test_live_lexicon.py
node node_modules/jest/bin/jest.js --config jest.config.cjs src/database/seeds/tests/tiktok-live.spec.ts
```

El análisis imprime la cobertura: lives, de venta, sin rubro, mensajes, con señal, **residuo %**, aptos para
emoción, precios y frases. Si el residuo sube, mirar los mensajes sin señal antes de ampliar el léxico.

## Validar (conjunto de oro)

```bash
~/.observatorio-social/venv/Scripts/python -I scripts/social/live/gold_sample.py sample --size=300
# Etiquetar a mano artifacts/live-raw/gold/muestra-<fecha>.csv: columna humano_senales con las
# señales separadas por «|» (COMPRA|PRECIO|VARIANTE|ENVIO|PAGO|REGATEO|...) o «-» si no hay ninguna.
~/.observatorio-social/venv/Scripts/python -I scripts/social/live/gold_sample.py score artifacts/live-raw/gold/muestra-<fecha>.csv
```

Mínimos para publicar una señal: compra con precisión ≥ 0,85 y recuperación ≥ 0,70; preguntas con
precisión ≥ 0,80. Lo que no pase se corrige en `live_lexicon.py` (con su prueba) o se retira del tablero.

## Publicar

La semilla `src/database/seeds/boot/tiktok-live.json` se commitea a `dev` y se lleva a `test` con el mismo
runner y esquema (si difieren, `seeds-to-test` la retiene). Cada servidor la siembra al arrancar.

```bash
curl -s https://test.datosbolivia.com/api/ventas-en-vivo | jq '.board.analyzedAt, (.board.rooms | length)'
```

## Lo que se sabe de TikTok LIVE sin sesión (6-oct-2026)

- `api-live/user/room/?aid=1988&sourceType=54&uniqueId=<cuenta>`: sin sesión ni navegador. `liveRoom.status` 2 =
  en vivo, 4 = apagado; `liveRoomStats.userCount` (espectadores) y `enterCount` (entradas); `user.signature`
  (biografía); `streamData.pull_data.stream_data` con las calidades `hd` y `ao` (solo audio) en FLV firmado.
- El feed `tiktok.com/live` lista cuentas en vivo según la IP: desde Bolivia, vendedores bolivianos.
- La página del live pinta el chat sin sesión; cada línea es `[data-index]` con `[data-e2e="chat-message"]`, el
  autor en `[data-e2e="message-owner-name"]` (atributo `title`) y el texto en `div.w-full.break-words`. Los
  regalos, seguidores y entradas son líneas sin `chat-message`.
- Dentro de `page.evaluate` no puede haber funciones con nombre: tsx les agrega `__name(...)`, la evaluación
  falla y el chat sale vacío sin error a la vista.
