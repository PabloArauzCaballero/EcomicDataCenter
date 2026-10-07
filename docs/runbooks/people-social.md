# Investigación de personalidades públicas de Bolivia

Este flujo mantiene dos productos separados: (1) el padrón de 300 personas como marco de descubrimiento, no ordenado por importancia, y (2) el ranking final medido para 2025, basado en la pregunta y resultados publicados por Ipsos CIESMORI. El padrón no sustituye al ranking y las cuentas halladas por buscador, directorio o Wikidata siguen siendo pistas hasta corroborar identidad y mayoría de edad. El ranking y sus límites se documentan en `docs/research/ranking-figuras-impacto-bolivia-2025.md`.

## Preparar el entorno

Desde la raíz del core, instalar las dependencias de `scripts/social/people/requirements.txt` en Python y las dependencias de Node con `yarn install --frozen-lockfile`. El modelo de sentimiento usa los archivos ONNX descritos en `docs/runbooks/company-social.md`.

## Actualizar las fuentes y el padrón

```powershell
python scripts/social/people/build_candidates.py
python scripts/social/people/select_shortlist.py
python scripts/social/people/collect_news_relevance.py
python scripts/social/people/discover_youtube.py
python scripts/social/people/assemble_research_300.py
python -m unittest scripts/social/people/test_candidate_quality.py
```

`collect_news_relevance.py` y `discover_youtube.py` guardan avances y se pueden ejecutar otra vez. Google News RSS devuelve como máximo 100 resultados por consulta y los homónimos pueden contaminar la búsqueda. El archivo `research-300.json` marca las cuentas como pendientes, no atribuye sus cifras a nadie y no otorga puestos.

## Ordenar las 300 por atención medible

```powershell
python scripts/social/people/measure_attention.py   # Wikidata + visitas a Wikipedia (es/en, 12 meses)
python scripts/social/people/measure_social.py      # TikTok y YouTube de cuentas con identidad respaldada
python scripts/social/people/rank_people.py         # escribe ranking-top300.json
python -m unittest scripts/social/people/test_candidate_quality.py
```

El índice es 55 % visitas a Wikipedia, 25 % audiencia verificada y 20 % puesto en Merco Líderes, en escala
logarítmica. Una cuenta solo suma si Wikidata la declara oficial, TikTok la verifica con el nombre de la persona,
o su usuario coincide con una cuenta declarada en Wikidata y el nombre mostrado coincide. Instagram, X y Facebook no
entregan cifras sin sesión. La prensa se publica pero no puntúa (homónimos). Para publicar, copiar
`ranking-top300.json` a `src/data/people-top300.json` del dashboard.

## Leer un canal para un piloto privado

```powershell
yarn tsx scripts/social/people/collect-person-social.ts --run=AAAA-MM-DD --platforms=youtube --pilot-youtube-leads --only=P_ALBERTINA_SACACA
python scripts/social/people/analyze_person_social.py --run=AAAA-MM-DD
```

La opción `--pilot-youtube-leads` acepta solo canales cuyo nombre coincide exactamente con la ficha y guarda la lectura en `artifacts/people-social-raw/`. Esa coincidencia permite investigar; no es una verificación de propiedad. No se usa una sesión ni se resuelven captchas. El análisis guarda un archivo privado `artifacts/people-social-pilot.json` sin autores ni texto de comentarios.

## Revisar y publicar agregados

Antes de agregar un canal a `reviewed-pilot-accounts.json`, comprobar manualmente que el contenido corresponde a la persona, que una fuente independiente respalda su actividad y que es adulta. Registrar las fuentes y la razón de la revisión. Entonces ejecutar:

```powershell
python scripts/social/people/publish_pilot.py
python -m unittest scripts/social/people/test_candidate_quality.py
```

`publish_pilot.py` comprueba que la URL leída coincide con la revisada, exige al menos 30 comentarios clasificables y publica solo cifras, títulos y enlaces de videos de la propia persona, sentimiento agregado y términos frecuentes. La interfaz del dashboard lee copias de `research-300.json` y `pilot-3.json`. Cada actualización requiere copiar ambos archivos al dashboard, compilarlo y desplegarlo.
