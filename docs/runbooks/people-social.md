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
