# Redes sociales de las empresas: corrida semanal

Decisión: ADR 0027. Se corre a mano, una vez por semana, desde una conexión residencial. Las IP de
GitHub Actions y de Contabo son de centro de datos y las redes las bloquean antes.

## Una vez por máquina

```bash
python -m venv ~/.observatorio-social/venv
~/.observatorio-social/venv/Scripts/python -m pip install -r scripts/social/company/requirements.txt
~/.observatorio-social/venv/Scripts/python scripts/social/company/download_models.py
```

No se usa `pip install pysentimiento`, porque importa PyTorch. En una Windows con Control de
aplicaciones, la DLL de PyTorch (`shm.dll`) queda bloqueada. `download_models.py` deja los tres
modelos en ONNX:

- **Polaridad:** baja la conversión publicada (Xenova).
- **Emoción e ironía:** solo existen en PyTorch. Baja sus pesos y los convierte sin PyTorch:
  `robertuito_numpy.py` lee el `pytorch_model.bin` y `export_robertuito_onnx.py` escribe el grafo
  en float32. La conversión solo se acepta si coincide con la cuenta de numpy.

## Cada semana

```bash
# 1. Directorio de cuentas: la web de cada empresa primero, Bing para lo que falte.
yarn social:accounts                     # las 257; unos 90 minutos
yarn social:accounts --fewer-than=3      # repasa las que quedaron con menos de 3 redes
# Revisar a mano las cuentas LOW de scripts/social/company/company-accounts.json
# y marcar reviewed: true las confirmadas (o corregir la url).

# 2. Recolección: cinco redes en paralelo, de a una cuenta, con pausas. Se reanuda con --run.
yarn social:collect --run=AAAA-MM-DD     # 4 a 6 horas; --parallel=2 si hay poca memoria

# 3. Análisis: sentimiento y términos; escribe src/database/seeds/boot/company-social.json
~/.observatorio-social/venv/Scripts/python scripts/social/company/analyze_company_social.py --run=AAAA-MM-DD
```

Al terminar, el recolector imprime la cobertura por red: cuántas cuentas quedaron `OK`, `RESTRICTED`,
`BLOCKED`, `NOT_FOUND` o `ERROR`. Si una red supera el 50 % de bloqueos, no se publica esa corrida
sin mirar antes el HTML guardado en `artifacts/social-raw/<corrida>/html/<red>/`.

## Segunda pasada de profundidad

Después de la recolección, `collect-deep.ts` vuelve sobre las cuentas leídas `OK` y baja más. Escribe en
`artifacts/social-raw/<corrida>-deep/` y el análisis une las dos lecturas por cuenta (la cifra que alguna
trajo, el texto más largo, los comentarios sin repetir); una lectura profunda fallida no borra la primera.

```bash
yarn tsx scripts/social/company/collect-deep.ts --run=AAAA-MM-DD --platforms=youtube --budget-minutes=6 --details=6
```

- **YouTube:** lista hasta 120 videos del canal (vistas y fecha de cada tarjeta) y abre los más vistos y los
  más nuevos para leer likes y comentarios. Las cuentas grandes primero. Pasado el canal 100 el aumento es
  marginal (de 84 a ~15 videos nuevos por canal).
- **Facebook:** sin sesión no pasa de unos 6 posts por página (el muro corta); no vale la pena repetirlo.
- **TikTok e Instagram:** buscan más publicaciones de la cuenta en Bing y las abren sueltas (`--platforms=tiktok|instagram`).
- **LinkedIn:** el lector prueba la dirección del directorio, `bo.linkedin.com` y los otros tipos de página, cada
  una en un contexto limpio; si el muro sigue, toma los seguidores del extracto de Bing (sin posts, con nota).

Un solo Chromium a la vez, tramos de unos 6 minutos y RAM libre sobre 3,5 GB: el sistema mata los procesos en
segundo plano cuando la laptop se queda sin memoria.

## Publicar

La semilla se commitea a `dev` y se lleva a `test` (cherry-pick). Cada servidor la siembra al
arrancar (`company-social` en `seeds/manifest.ts`). Hay que verificar en las dos bases:

```bash
curl -s https://test.datosbolivia.com/api/redes-empresas | jq '.board.readingDate, (.board.companies | length)'
```

## Lo que se sabe de cada red sin sesión

- **Facebook**: la página se pinta detrás de un aviso que se cierra. Trae seguidores, «personas
  hablando» y los primeros posts. Las páginas de alcohol responden «contenido no disponible».
- **Instagram**: `og:description` trae seguidores, seguidos y publicaciones, y cada post abierto sus
  likes, comentarios, fecha y texto. Los comentarios no se ven. Los perfiles de alcohol piden 18+.
- **TikTok**: el perfil trae seguidores, corazones y videos. La grilla termina en captcha, y **no se
  resuelve**: los videos se buscan en Bing y se abren sueltos. La lista de comentarios vuelve vacía
  sin sesión.
- **YouTube**: lo trae todo, incluidos los comentarios.
- **LinkedIn**: seguidores y unas diez tarjetas de posts. Pide sesión seguido; eso queda `BLOCKED`.

## Sesión opcional

`yarn social:collect --session=<storageState.json>` usa una sesión guardada. Se genera abriendo un
Chromium visible, iniciando sesión a mano y guardando `context.storageState()`. Hay que hacerlo
**fuera del repositorio** y con una cuenta secundaria, nunca la personal. Las contraseñas no pasan
por ningún script ni chat.
