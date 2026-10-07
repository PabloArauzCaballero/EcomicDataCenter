# Personalidades de Bolivia: plan por carriles para completar el Top 300

**Fecha:** 7 de octubre de 2026 · **Para:** Codex (ejecución por carriles) · **Dueño:** Pablo · **Prioridad:** `test` (Contabo). `dev` no importa por ahora.

Este documento es la orden de trabajo completa. Cada carril es independiente salvo donde diga «depende de». Cada uno trae: objetivo, por qué, entradas,
pasos, salidas exactas, criterios de aceptación **medibles** y qué NO hacer. Lee primero las secciones 0 a 3; son comunes a todos.

---

## 0. Qué se le pidió al sistema y qué hay hoy

**Pedido original del usuario** (varias sesiones, 4–7 de octubre): investigar «las personalidades más importantes» de Bolivia, con 300 personas,
**seguidores por plataforma y sentimiento de lo que se dice**, todo **subido y visible en test**, sin pendientes, y con fuentes de calidad.

**Estado real (verificado el 7-oct en https://test.datosbolivia.com/?pestana=personalidades):**

| Pieza | Estado | Dónde |
| --- | --- | --- |
| Top 5 de impacto percibido 2025 (Ipsos CIESMORI: Paz 24 %, Lara 20 %, Quiroga 8 %, Arce 7 %, Dunn 5 %) | Publicado y leído del PDF por Codex el 6-oct. **El PDF hoy da 404.** | `scripts/social/people/ranking-impacto-2025.json` |
| Padrón de 300 fichas (descubrimiento) | Publicado. **No es una selección de «los más importantes»**: Wikidata 148, Merco 100, estudio IPDRS 30, OEP 17, directorios 15, ciencia 11. | `research-300.json` + `padron-additions.json` (Jaime Dunn) |
| Índice de atención medible (55 % visitas Wikipedia + 25 % audiencia verificada + 20 % puesto Merco; escala logarítmica) | Publicado para 298 personas; 273 con alguna medición | `ranking-top300.json` |
| Audiencia verificada | **80 de 298** personas tienen una cuenta verificada (TikTok, YouTube, Instagram, Facebook). **218 no.** X no se mide. | `social-audience.json` |
| Sentimiento de comentarios de YouTube sobre la persona | **23 de 250 leídas** publicables (≥30 comentarios en español, ≥2 videos con ≥5). 8 personas nuevas sin analizar. | `conversation-sentiment.json` |
| Panel «Calidad de las fuentes» en la pestaña | Publicado | `observatorio-dashboard/src/components/people-section.tsx` |

**Lo que NO existe y es el objetivo de este plan:** (1) un padrón curado de los 300 más relevantes de verdad; (2) cuenta verificada para la mayoría;
(3) sentimiento publicable para la mayoría; (4) cifras de X y de Instagram exactas; (5) una pantalla con filtros cruzados; (6) una verificación
independiente de la fuente Ipsos.

---

## 1. Repos, ramas y cómo se publica (leer antes de tocar nada)

- **Core:** `PabloArauzCaballero/EcomicDataCenter` · carpeta local `ObservatorioEconomico/EcomicDataCenter` · scripts en `scripts/social/people/`, runbook `docs/runbooks/people-social.md`.
- **Tablero:** `PabloArauzCaballero/observatorio-dashboard` · componente `src/components/people-section.tsx`, API `src/app/api/personalidades/route.ts`, datos `src/data/people-*.json`.
- **Rama de trabajo y destino: `test`.** El checkout principal está en `dev` con cambios de otras sesiones: **no cambies su HEAD ni uses `git add -A`/`git commit -a`.**
  Trabaja en un worktree aparte desde `origin/test`:
  ```
  git worktree add --detach <scratch>/test-wt origin/test
  # ... trabajar, commitear SOLO tus rutas ...
  git fetch origin && git rebase origin/test && git push origin HEAD:test
  git worktree remove --force <scratch>/test-wt
  ```
  `origin/test` también recibe commits del bot («Llevar a test las lecturas del dia»): siempre `fetch` + `rebase` antes de empujar.
- **Despliegue en Contabo:** webhook de GitHub → Coolify, sin GitHub Actions. No se da por desplegado un push sin comprobar el commit en Coolify:
  `ssh -i ~/.ssh/id_ed25519_contabo root@161.97.85.216 'curl -s -H "Authorization: Bearer $(cat /root/.coolify_token)" "http://localhost:8000/api/v1/deployments/applications/skkuw5d3qyjfykbm1pummqe5?take=1"'`
  → `commit` = tu hash y `status: finished`. Si falla en `npm ci` (pasó una vez, intermitente): `POST /api/v1/deploy?uuid=skkuw5d3qyjfykbm1pummqe5` y repetir.
  Luego prueba real contra `https://test.datosbolivia.com` (API + pestaña con navegador). `http://161.97.85.216:3050` por IP cruda no respondía desde la PC del usuario el 7-oct; usa el dominio.
- **Los datos del tablero son archivos JSON copiados** al dashboard (`src/data/people-top300.json`, `people-conversation.json`, `people-research-300.json`, `people-impact-ranking-2025.json`):
  regenerar en el core **no** actualiza el tablero hasta copiar y desplegar. Núcleo y tablero se publican en pares.
- **Pestañas del tablero** son enlaces `?pestana=personalidades`, no `role=tab`.

## 2. Reglas duras (aplican a todos los carriles)

1. **Nada inventado.** Cada cifra lleva fuente, fecha y método. Si no se pudo medir, es `null` y se dice por qué. Prohibido rellenar con estimaciones sin etiqueta.
2. **Identidad antes que cifra.** Una cuenta suma solo si: Wikidata la declara oficial, o TikTok la verifica con el nombre de la persona, o una fuente oficial/prensa seria la enlaza (URL de evidencia guardada), o su usuario coincide con una cuenta declarada Y está verificada o tiene ≥5.000 seguidores. «Mismo nombre» no basta. Hubo un TikTok de 4 seguidores que se hacía pasar por Marcelo Moreno.
3. **Sin sesión, sin captcha, sin saltarse protecciones.** Solo páginas públicas. Prohibido iniciar sesión, resolver captchas o usar cuentas del usuario. Si una plataforma bloquea, se documenta y se deja `null`.
4. **Menores y privacidad.** No analizar comentarios de personas sin mayoría de edad comprobada (nacimiento en Wikidata, o cargo político/empresarial). Ningún autor ni texto de comentario sale en datos públicos: solo porcentajes, palabras frecuentes y títulos de videos. Los textos crudos viven en `artifacts/` (fuera de Git) y se borran tras clasificar.
5. **Las APIs fallan en silencio.** Wikipedia y Wikidata devuelven `None` por límite de tasa (Eva Copa salió con 0 visitas). Todo script que consulte APIs debe distinguir «404 real» de «fallo», reintentar y contar los huecos. Usa `measure_attention.py --retry-views` y `--retry-unmatched`.
6. **Los números llegan en formatos traicioneros.** `225.262` es miles, no decimal (Facebook salía 225). Instagram redondea (`93K`, `1M`); pide la página con `Accept-Language: en-US` y UA `facebookexternalhit/1.1`. Hay pruebas unitarias de esto: no las rompas.
7. **Memoria.** La laptop del usuario tiene 16 GB y el 7-oct llegó a 0,5 GB libres con el sentimiento corriendo; el sistema mató un comando. El análisis de sentimiento (ONNX, venv `~/.observatorio-social`) necesita ~1–2 GB: **no lo lances si hay menos de 3 GB libres**, límitalo con lotes, y ejecútalo de a un proceso. Node: `node --max-old-space-size=…` y `node node_modules/tsx/dist/cli.mjs` (npx falla). No dejes `next dev` ni Chromium abiertos.
8. **Cupo de búsqueda web.** `WebSearch` tiene un tope compartido (200 por sesión); diez agentes en paralelo lo agotaron a mitad de tarea y casi no devuelve nombres de usuario. Úsalo solo para confirmar, no para descubrir. Para descubrir usa sitios oficiales, enlaces de Wikipedia/Wikidata, Linktree, bios públicas de TikTok/YouTube y páginas institucionales.
9. **Verificar en vivo, no en verde.** «Mergeado» y «la API devuelve el dato» no prueban que el tablero lo muestre. Toda entrega termina con una captura o lectura del texto renderizado en `test.datosbolivia.com` (ver carril H).
10. **Commits.** Solo rutas propias. Mensajes en español, cortos, con la línea `Co-Authored-By` que corresponda. No amends. No `--no-verify`.
11. **Cuando algo sea decisión del usuario, pregunta una vez y avanza con lo reversible.** No frenes por cosas que se pueden deshacer.

## 3. Mapa de archivos (`scripts/social/people/`)

| Archivo | Para qué |
| --- | --- |
| `build_candidates.py`, `select_shortlist.py`, `collect_news_relevance.py`, `discover_youtube.py`, `assemble_research_300.py` | Pipeline de Codex que arma `research-300.json` (padrón de descubrimiento). |
| `source_lists.py` | Lee Merco (usa UA `ObservatorioEconomico/1.0`; con otro UA da bucle de redirecciones), OEP, Hafi, HypeAuditor. |
| `people_io.py` | `load_people()` = padrón + `padron-additions.json`. **Todos los scripts nuevos deben cargar por aquí.** |
| `measure_attention.py` | Wikidata + visitas de Wikipedia (es/en, 12 meses). Modos `--retry-views`, `--retry-unmatched`, y con slugs completa el archivo. |
| `discover_from_sites.py` | Redes enlazadas desde el sitio oficial (P856) y los enlaces externos de Wikipedia. |
| `discovery/input-NN.json` / `output-NN.json` / `output-site.json` | Entradas y resultados de la búsqueda de cuentas por lotes (formato en carril A). |
| `measure_social.py` | Lee seguidores de TikTok, YouTube, Instagram, Facebook y asigna el nivel de verificación. |
| `audit_identity.py` + `identity-overrides.json` | Marca coincidencias de Wikidata sospechosas; las decisiones manuales mandan. |
| `rank_people.py` | Calcula el índice y escribe `ranking-top300.json` (incluye `method.quality`). |
| `yt_comments.py`, `collect_conversation.py`, `analyze_conversation.py`, `conversation-overrides.json` | Comentarios de YouTube sobre la persona y su sentimiento. |
| `test_candidate_quality.py` | 11 pruebas de integridad. `python -m unittest scripts/social/people/test_candidate_quality.py`. |

Estados de verificación de cuenta (en `social-audience.json`): `WIKIDATA_DECLARED`, `PLATFORM_VERIFIED`, `SOURCE_LINKED`, `HANDLE_MATCHES_WIKIDATA` suman;
`HANDLE_UNCONFIRMED_SMALL`, `IMPLAUSIBLY_SMALL`, `NAME_MATCH`, `NAME_MISMATCH` no suman.

## 4. Orden y dependencias

```
Carril J (fuentes de verdad) ──┐
Carril B (padrón curado) ──────┼─► Carril A (cuentas) ─► Carril E (plataformas) ─┐
                               │                                                ├─► Carril C (índice) ─► Carril F (pantalla) ─► Carril H (despliegue)
                               └─► Carril D (sentimiento) ──────────────────────┘
Carril G (calidad/pruebas) corre en paralelo y bloquea cada entrega.   Carril I (documentación) cierra.
```

B y J pueden arrancar ya. A y D esperan a que B fije el padrón final (si no, se mide gente que luego sale). C espera a A, D y E. F espera a C.
G y H aplican a cada entrega.

---

## Carril J: fuentes de verdad externas

**Objetivo:** que las tres fuentes que sostienen lo publicado puedan volver a contrastarse.

**J1. Ipsos CIESMORI (Top 5 de impacto 2025).** El PDF citado, `https://ipsosciesmori.com/wp-content/uploads/2025/12/ICM-25-DIC-PRES-ANUARIO_vf.pdf`, devuelve 404 desde el 7-oct. La lectura del 6-oct está en el transcript de Codex
(`~/.codex/sessions/2026/10/05/rollout-2026-10-05T22-02-35-…jsonl`, línea ~2852 y ~2861: gráfico 24/20/8/7/5, pregunta, muestra 600, ±2,83 %, 15–30 nov 2025, La Paz, El Alto, Cochabamba, Santa Cruz).
Pasos: (a) buscar el documento en la página `https://www.ipsosciesmori.com/radiografia-boliviana-los-datos-el-drama-y-la-esperanza-de-2025/` (hoy solo tiene texto sin el gráfico), en el sitemap y en Wayback Machine (probar `web.archive.org/web/2026*/…`, con pausas: da 429); (b) si aparece, guardar copia en `docs/research/fuentes/` con hash SHA-256 y fecha de captura; (c) si no aparece, conservar el extracto del transcript como evidencia en `docs/research/fuentes/ipsos-top5-extracto-2026-10-06.md` y mantener la nota `accessNote` que ya está en `ranking-impacto-2025.json`.
**Aceptación:** una copia verificable del documento o un extracto fechado con su procedencia; el tablero dice cuál de las dos es.

**J2. Merco Líderes 2025/26.** Reproducible con `source_lists.merco()` (100 posiciones; coinciden con el padrón). Falta: guardar una **instantánea** (`docs/research/fuentes/merco-lideres-2025-26.json` con fecha y hash de la respuesta) porque la página usa redirecciones que pueden romperse. Además registrar a qué empresa pertenece cada líder (el campo `organization` ya existe y no se publica).
**Aceptación:** instantánea versionada + prueba que compara los 100 puestos con el padrón.

**J3. Monitor de Opinión Pública de Ipsos CIESMORI.** El informe de septiembre de 2026 (`/direccion-del-pais-evaluacion-de-autoridades-y-lideres-de-oposicion-septiembre-2026/`) mide aprobación de autoridades y líderes de oposición. Es una segunda medición independiente de politicos (aprobación ≠ impacto). Extraer sus cifras con fuente y fecha y guardarlas como `scripts/social/people/ipsos-mop-2026-09.json`. Se usará en el carril C como **verificación** del índice, no como componente.
**Aceptación:** tabla persona → aprobación/desaprobación con página del informe.

**J4. Wikidata/Wikipedia.** Registrar la fecha de consulta y la versión (`revid`) de cada artículo usado para las visitas. Ya se guarda el título; agregar `revid` y `fetchedAt` por persona en `attention.json`.

---

## Carril B: padrón curado (dejar de ser «descubrimiento»)

**Objetivo:** que «Top 300» signifique los 300 más relevantes con criterio explícito, y no «300 fichas que salieron de listas».

**Problema medido:** el padrón tiene 148 entradas solo de Wikidata (muchos futbolistas retirados, obispos), 100 de Merco (empresarios con casi nulo rastro público), 30 creadores, 17 candidatos OEP. Faltaba el quinto del Top 5 de Ipsos (Jaime Dunn). El índice resultante pone a empresarios abajo por falta de fuentes, no por irrelevancia.

**Pasos**
1. Definir por escrito el **criterio de inclusión** (ADR corto en `docs/decisions/`): relevancia pública vigente en 2025–2026 en alguno de los sectores (política, empresas, deporte, cultura, ciencia, medios/creadores, sociedad civil). Excluir fallecidos y retirados sin vigencia pública (salvo expresidentes y figuras históricas con visitas sostenidas, que se etiquetan «histórica»).
2. Ampliar el universo de candidatos a ~600 con fuentes trazables: gabinete y autoridades electas 2025–2026 (Gobierno, Asamblea, gobernaciones, alcaldías de capitales y El Alto), cúpula judicial, jefes militares y policiales vigentes, presidentes de las cámaras empresariales (CAINCO, CNC, CAMEX…), rectores, dirigentes sociales (COB, CONAMAQ, etc.), plantel de la selección y de los clubes de la primera división vigente, medios (directores, conductores), top creadores por cuentas verificadas, premios nacionales 2024–2026, rankings sectoriales publicados (Forbes, Merco empresas y responsabilidad, etc.).
3. Para cada candidato: entidad Wikidata (si existe), sector, **motivo de inclusión con URL**, vigencia (cargo/actividad 2025–2026), y marca de «histórica».
4. Deduplicar con `audit_identity.py` + la lógica de nombre (hay duplicados reales: «Samuel Doria Medina Monje» = «Samuel Doria Medina»; «Andrónico Rodríguez Ledezma»). Registrar en `identity-overrides.json`.
5. Corregir sectores mal asignados por mapeo de ocupación (ya corregidos: Laredo, Aduviri, Mamani Laura, Melgar, Borja, Rivera Cusicanqui).
6. Escribir el padrón final en `padron-v2.json` (o reemplazar `research-300.json` con un `assemble` reproducible) y actualizar `people_io.load_people()`.
7. Quedarse con 300 por **puntaje del carril C**, pero con **cuotas mínimas por sector** para que el Top 300 no sea 70 % política y deporte (propuesta: política ≥60, empresas ≥45, deporte ≥40, cultura ≥30, medios/creadores ≥40, ciencia ≥20, sociedad civil ≥25; el resto libre).

**Salidas:** `padron-v2.json` con ≥600 candidatos y el motivo de cada uno; ADR del criterio; lista final de 300 reproducible con un solo comando.
**Aceptación:** (a) toda ficha tiene motivo con URL; (b) cero duplicados (`audit_identity.py` sin repeticiones); (c) los 5 de Ipsos están dentro; (d) un revisor puede reconstruir la lista corriendo el comando; (e) prueba unitaria que impide fichas sin motivo.
**No hacer:** no elegir a mano «a dedo» sin dejar el criterio escrito; no incluir menores sin necesidad.

---

## Carril A: cuentas verificadas (218 de 298 sin cuenta)

**Objetivo:** subir de 80 a **≥200** personas con al menos una cuenta verificada, priorizando por rango del índice y por sector (empezar por las 100 más relevantes).

**Entradas:** `discovery/input-NN.json` (30 personas por lote, orden de ranking), `social-audience.json`, `identity-overrides.json`.
**Lo que ya se intentó y no funcionó:** diez agentes con búsqueda web agotaron el cupo; devolvieron cuentas para ~60 personas; los ejecutivos de Merco casi no tienen cuentas personales públicas. **«No encontrada» ≠ «no tiene».**

**Métodos, en orden de confiabilidad (usar todos, anotar cuál respaldó cada cuenta):**
1. Enlaces de **Wikidata** (P2002 X, P2003 Instagram, P2397 YouTube, P2013 Facebook, P7085 TikTok) → `WIKIDATA_DECLARED`.
2. **Sitio oficial** (P856) y página personal: leer HTML y menús/pies (ya hecho en `discover_from_sites.py`: 23 personas). Ampliar: probar `/contacto`, `/prensa`, `/about`, `sitemap.xml`; seguir enlaces a Linktree/Beacons/Bio.link.
3. **Páginas institucionales** (gobierno, Asamblea, club, federación, universidad, empresa) que listan cuentas personales del cargo.
4. **Enlaces cruzados desde una cuenta ya confirmada** (la bio de un TikTok verificado enlaza el Instagram; el canal de YouTube enlaza redes). Las páginas públicas de TikTok y YouTube exponen estos enlaces sin sesión.
5. **Prensa seria que cita el usuario como oficial** (evidencia = URL de la nota).
6. **Verificación de plataforma**: insignia en TikTok (`user.verified`), canal verificado en YouTube.
Rechazar: coincidencia solo por nombre, fan pages, cuentas con <1.000 seguidores para figuras con >20.000 visitas/mes, homónimos (hay ejemplos reales: «Michelle Andrade» sí es boliviana nacida en Cochabamba; «Pablo Javier Pérez» es argentino; «Luis Arce» tiene decenas de homónimos).

**Formato de salida por lote:** `discovery/output-NN.json` = lista de `{"slug","accounts":{"instagram","facebook","tiktok","youtube","twitter"},"evidence":[url…],"note":"una línea"}`. `measure_social.py` los fusiona automáticamente (une cuentas y evidencia de todos los archivos).
**Lotes:** 30 personas c/u, por rangos de ranking: 1–30, 31–60, … y bloques sectoriales (políticos locales, deportistas, ejecutivos, artistas, creadores, científicos, obispos). Trabajar un lote por carril secundario (A1…A10) sin pisarse los archivos.
**Después de cada lote:** `python scripts/social/people/measure_social.py` (≈15 min; relee todo) o `measure_social.py <slug> <slug>` para solo las nuevas; `python scripts/social/people/rank_people.py`; `python -m unittest scripts/social/people/test_candidate_quality.py`.

**Aceptación:** (a) ≥200 de 298 con cuenta verificada, o un informe por persona sin cuenta con los métodos intentados; (b) cada cuenta contada tiene `verification` y, si es `SOURCE_LINKED`, al menos una URL de evidencia; (c) 0 cuentas contadas con nombre que no coincida (audit: lista de `NAME_MISMATCH` revisada); (d) 0 cuentas contadas con <1.000 seguidores en figuras con ≥20.000 visitas; (e) muestra aleatoria de 30 cuentas contadas revisadas a mano por una segunda pasada, con ≥95 % correctas (registrar el resultado en `docs/research/auditoria-cuentas-AAAA-MM-DD.md`).

---

## Carril E: plataformas y cifras

**Objetivo:** mejorar la **calidad de las cifras de audiencia** y cubrir X.

**E1. Instagram (hoy redondeado: `93K`, `1M`).** La página pública solo da el valor redondeado. Probar sin sesión: (a) JSON de la propia página (`window._sharedData`/`PolarisQueryPage`), (b) `og:description` ya usado, (c) endpoints públicos de embed. Si no hay forma legítima de obtener el entero, **conservar el redondeo y etiquetarlo** («≈», «≥1 M»). Para cuentas con `1M`, no usar `1.000.000` exacto en sumas: guardar `followersIsLowerBound: true`.
**E2. X (Twitter).** Hoy no suma. Opciones públicas: perfiles sin sesión (suelen redirigir a login), endpoints de sindicación, Nitter públicos (inestables). Probar con 20 cuentas conocidas; si ≥80 % devuelve el conteo con estabilidad en dos días distintos, implementar; si no, **dejar documentado que X no se mide**. Prohibido usar sesión o cuentas del usuario.
**E3. Facebook.** Ya se lee `og:description` («1.592.835 seguidores»). Distinguir **página** de **perfil personal** (los perfiles personales muestran «amigos/seguidores» distinto): guardar `kind`.
**E4. YouTube.** Suscriptores vienen redondeados («5.78 K»). Anotar `rounded: true`.
**E5. TikTok.** `followerCount` es exacto; guardar además `heartCount` y `videoCount`.
**E6. Solapamiento.** Hoy se suma el máximo por plataforma entre plataformas, con solapamiento entre audiencias. Cambiar a `max` entre plataformas **y** `sum` etiquetadas por separado, y en el índice usar una versión conservadora (p. ej. máximo + 25 % del resto) documentada en el ADR del índice. Mostrar siempre la cifra por plataforma, no solo la suma.
**E7. Historial.** Guardar cada lectura con fecha en `social-audience-history.jsonl` para poder mostrar tendencia después. Re-leer cada semana.

**Aceptación:** cada cifra publicada trae plataforma, fecha de lectura y marca de redondeo; X resuelto (medido o documentado como no medible); prueba unitaria de `parse_count` con los casos `225.262`, `5.78 K`, `1.592.832`, `93K`, `1,434`, `3.1M`, `20.745`, `8.057`.

---

## Carril D: sentimiento (hoy 23 personas publicables)

**Objetivo:** pasar de 23 a **≥120** personas con sentimiento publicable, **sin bajar la calidad**, y separar mejor «qué se dice de la persona» de «cómo reaccionan a un video».

**Lo medido:** los comentarios de un video de noticias reaccionan al tema (la detención de Arce) tanto como a la persona. Un solo video mide ese video. Los homónimos contaminan (Carlos Paz = Villa Carlos Paz, Argentina). Hoy se publica con ≥30 comentarios en español clasificables y ≥2 videos con ≥5 cada uno.

**Pasos**
1. **Más videos por persona** (hasta 25 en los últimos 12 meses) y más comentarios por video (hasta 400, ordenados por «más relevantes» y por «recientes»). `yt_comments.py` ya pagina; ajustar tope y respetar pausas (hubo 429 con tres hilos; mantener ≤2 hilos).
2. **Relevancia de video más estricta:** el título debe contener el nombre contiguo (`names_person`), y descartar videos cuyo canal sea de música/entretenimiento cuando la persona no lo es (p. ej. «Jiyawa & Albertina Sacaca – Veneno» es una canción, no una opinión sobre ella). Guardar `channel` y `categoria` del video.
3. **Anti-homónimo:** lista negra en `conversation-overrides.json` + regla: para nombres de dos palabras comunes («Carlos Paz», «Luis Arce», «Juan Carlos Arce»), exigir además una palabra de contexto en el título (`Bolivia`, el cargo, el club) o aparecer en un canal de noticias bolivianas.
4. **Segunda fuente de «lo que se dice»:** titulares de prensa (Google News RSS ya recolectado en `news-relevance.json` para 118 fichas) clasificados con el mismo modelo → «tono de la cobertura». Publicarlo **separado** del de comentarios, con su propia muestra mínima (≥15 titulares de ≥4 medios).
5. **TikTok/Facebook/Instagram comentarios:** solo si se obtienen sin sesión ni captcha (probar el comentarios públicos de TikTok con navegador sin cookies; si salta captcha, parar y documentar). No insistir.
6. **Modelo:** `robertuito` ONNX (sentimiento, emoción, ironía). Validar sobre 200 comentarios etiquetados a mano por Codex (guardar los ejemplos sin autor en `docs/research/validacion-sentimiento.md`) y reportar precisión/recall por clase. Si la precisión de «negativo» < 70 %, avisar y no publicar porcentajes.
7. **Presentación:** en la ficha, mostrar **por video** el saldo (positivos − negativos) y qué proporción del total aporta cada video, para que se vea si una persona depende de un solo video.
8. **Memoria:** correr el análisis en lotes de ≤40 personas y liberar el modelo entre lotes; no lanzar con <3 GB libres.

**Salidas:** `conversation-sentiment.json` v2 + `press-tone.json`; informe `docs/research/validacion-sentimiento.md`.
**Aceptación:** (a) ≥120 personas con sentimiento publicado o informe de por qué no; (b) 0 videos de homónimos en una revisión manual de los títulos de 40 personas al azar; (c) precisión de validación documentada; (d) ninguna persona sin mayoría de edad comprobada; (e) ningún texto ni autor en los JSON públicos (la prueba `test_conversation_sentiment_publishes_only_aggregates` debe seguir pasando y ampliarse).
**No hacer:** no presentar el sentimiento de un video de noticias como «opinión de Bolivia»; no mezclar prensa con comentarios en un solo número.

---

## Carril C: el índice y su validación

**Objetivo:** que el orden sea defendible, estable y validado contra mediciones independientes.

**Hoy:** índice = 55 % visitas Wikipedia (log) + 25 % audiencia verificada (log, suma de plataformas) + 20 % puesto Merco; prensa se publica pero no puntúa (homónimos). Problemas conocidos: (a) el puesto Merco de empresarios infla a quien aparece en dos listas (Doria Medina quedó #1 sobre Rodrigo Paz al fusionar su ficha de Merco con la de político); (b) sectores con pocas fuentes quedan abajo; (c) la suma de plataformas sobrecuenta.

**Pasos**
1. **ADR del índice** (`docs/decisions/…`): qué mide («atención pública observable», no importancia ni mérito), componentes, pesos, escala, tratamiento de datos faltantes.
2. **Validación externa:** calcular correlación de rangos (Spearman) del índice contra (i) el Top 5 de Ipsos (impacto) y (ii) la aprobación del Monitor de Opinión Pública (carril J3) **solo para políticos**. Meta: Paz, Lara, Quiroga, Arce entre los 10 primeros del índice general (hoy: 2, 7, 9, 5). Registrar la tabla.
3. **Análisis de sensibilidad:** recalcular con pesos ±10 puntos y con/sin Merco; reportar cuántas posiciones se mueven en el Top 20 y Top 50. Si Merco domina el Top 10, bajar su peso o limitarlo a su sector.
4. **Índice por sector** (percentil dentro del sector) además del general, y mostrar ambos. El general es para comparar atención entre sectores; el sectorial para ordenar dentro de cada uno.
5. **Nuevos componentes candidatos** (agregar solo si pasan la validación): sitelinks de Wikidata, visitas de Wikipedia en más idiomas, tendencia (cambio de visitas 12 vs 3 meses), engagement (likes por seguidor en TikTok), menciones de prensa **con control de homónimos** (conteo por nombre completo + palabra de contexto).
6. **Intervalos o bandas**: en vez de un único puesto exacto, agrupar en tramos («1–10», «11–30»…) cuando la diferencia de índice sea menor que la incertidumbre estimada (sensibilidad del paso 3). Mostrar el puesto exacto pero con aviso.
7. **Reproducibilidad:** `rank_people.py` determinista; mismo input → mismo `ranking-top300.json` (byte a byte salvo `generatedAt`).

**Aceptación:** ADR + tabla de validación + sensibilidad publicadas en `docs/research/`; Top 5 de Ipsos con Spearman ≥0,6 sobre las cinco posiciones; prueba de reproducibilidad; el panel «Calidad» muestra sensibilidad resumida.

---

## Carril F: pantalla (tablero)

**Objetivo:** que la pestaña sea usable y honesta; el usuario pidió dos veces **filtros estilo PowerBI** (controles interactivos que se crucen) y no tablas fijas.

**Hoy:** Top 5 de Ipsos arriba, tarjetas de totales, panel «Calidad», lista ordenada con buscador y filtro de sector, ficha con «Cómo se midió», sentimiento y videos.

**Pasos**
1. **Filtros cruzados:** sector, plataforma con cuenta verificada, rango de índice, «solo con sentimiento», «solo Top 5 Ipsos», «tipo de fuente» (Merco/Wikidata/creadores…), búsqueda. Todos combinables y reflejados en la URL (`?pestana=personalidades&sector=…`).
2. **Gráficos, no solo lista** (el usuario marcó como defecto recurrente las tablas que podían ser gráficos): (a) barras horizontales Top 20 con desglose por componente (apiladas: Wikipedia/audiencia/Merco), (b) dispersión audiencia vs visitas con color por sector y tooltip, (c) sentimiento por persona (barras 100 % apiladas positivo/neutro/negativo) para quienes lo tienen, (d) evolución de visitas mensuales (12 meses) de las personas elegidas. Tabla a un clic con `ViewToggle`.
3. **Reglas de gráficos del proyecto:** el título dice la unidad; toda figura lleva leyenda aunque tenga una serie; colores validados con el script de paleta (`paleta-de-graficos-validada`); más de 8 series → gris + resaltado; paneles ≥24 rem y 3 por fila solo si caben (medir con `cramped.mjs`); usar el componente `Panel` y los botones de descarga PNG/SVG/CSV/Excel ya existentes.
4. **Ficha:** cuentas por plataforma con cifra, fecha y tipo de verificación (hoy aparecen, pero el texto de verificación es largo); evidencias como enlaces; badge «Top 5 Ipsos»; sentimiento por video; aviso si la persona depende de un solo video.
5. **Estados:** cargando, vacío («ninguna persona cumple los filtros»), error de red, datos parciales, y la bandera «sin medición» para quien no tiene datos.
6. **Móvil:** probar a 390 px: la lista y la ficha en una columna, filtros en un panel desplegable, gráficos sin desbordar. Capturas por viewport (escritorio 1400, tablet 820, móvil 390) y tema claro/oscuro.
7. **Rendimiento:** la API devuelve ~420 KB; recortar campos no usados (`research.people` ya no se usa en el cliente) y paginar la lista si pasa de 300 filas.
8. **Texto:** español claro, sin jerga («HANDLE_MATCHES_WIKIDATA» nunca en pantalla), el panel «Calidad» honesto sobre límites, el PDF de Ipsos con su aviso de 404.

**Aceptación:** capturas (6) guardadas en `docs/research/capturas/`; consola sin errores; los filtros se combinan (probar con Playwright: sector=Deporte + con sentimiento + índice>50); `tsc --noEmit` limpio; las 180+ pruebas del dashboard siguen verdes; revisión visual con las skills `visual-proof` y `ui-quality-review`.

---

## Carril G: calidad, pruebas y auditoría continua

**Objetivo:** que los errores encontrados el 7-oct no vuelvan.

**Errores históricos que deben tener prueba de regresión:**
1. `parse_count('225.262') == 225262` (y el resto de formatos).
2. Una cuenta con el mismo usuario que otra declarada, no verificada y <5.000 seguidores, **no suma**.
3. Una figura con ≥20.000 visitas y una cuenta <1.000 seguidores, **no suma**.
4. Coincidencia de Wikidata con descripción de otra nacionalidad o sector que no encaja → aparece en `audit_identity.py` hasta que `identity-overrides.json` la resuelva.
5. Entidad repetida en dos fichas → falla.
6. `views`/`viewsEs`/`viewsEn` en `None` con título existente → falla («huecos de API»).
7. Sentimiento publicado con <30 comentarios o <2 videos sólidos → falla.
8. Video de homónimo en la lista negra → no aparece.
9. Los 5 de Ipsos están en el ranking.
10. El JSON público no contiene `author`, `text`, `comment` ni nombres de comentaristas.

**Pasos:** (a) ampliar `test_candidate_quality.py` o dividir en `test_identity.py`, `test_social.py`, `test_conversation.py`, `test_ranking.py`; (b) esquema JSON (`jsonschema`) para `ranking-top300.json`, `conversation-sentiment.json`, `social-audience.json`; (c) un script `scripts/social/people/audit_all.py` que corra todo y devuelva un informe `docs/research/auditoria-AAAA-MM-DD.md` (conteos, hallazgos, qué cambió desde la última); (d) **muestreo humano**: cada entrega incluye 30 fichas al azar con captura y veredicto; (e) agregar el workflow `.github/workflows` solo si Actions está operativo (hoy el CI de GitHub puede estar bloqueado por facturación: CI rojo en 3 s con aviso de saldo = pago, no código); (f) Prettier: el dashboard **no** lo tiene instalado y los archivos originales ya fallaban con su `.prettierrc`; no reformatear todo. Decidir con el usuario si se instala y se formatea aparte.

**Aceptación:** `audit_all.py` en verde; informe de auditoría publicado; cada hallazgo corregido tiene su prueba.

---

## Carril H: despliegue y verificación en test

**Para cada entrega (core + dashboard en par):**
1. `git worktree` desde `origin/test`; cambios; `git add <rutas propias>`; commit; `fetch` + `rebase`; `push origin HEAD:test`.
2. Esperar el despliegue de **Contabo**: comprobar en Coolify `commit` = el tuyo y `finished` (ver sección 1). Si falla en `npm ci`, relanzar una vez.
3. Verificar en vivo con `playwright-core` (Chromium ya instalado en `%LOCALAPPDATA%\ms-playwright\chromium-1243\chrome-win64\chrome.exe`; `npm i playwright-core` en el scratchpad): abrir `https://test.datosbolivia.com/?pestana=personalidades`, leer el texto renderizado, comprobar el panel «Calidad», una ficha con cuentas, una con sentimiento, la búsqueda y los filtros; revisar `pageerror`.
4. Comparar el JSON de `/api/personalidades` con el archivo del core (mismo `generatedAt` y mismos conteos).
5. Reportar en una línea: commit, `status`, URL, qué se comprobó y qué no.

**Si algo se rompe:** revertir con un commit nuevo (no force-push), volver a desplegar y avisar.
**`dev`:** no tocar salvo que el usuario lo pida. Recordar que `dev` no contiene esta pestaña.
**Aceptación:** captura en vivo de cada entrega y el hash de commit desplegado.

---

## Carril I: documentación y decisiones

- ADR de criterio de inclusión del padrón (carril B), ADR del índice y su validación (carril C), ADR de verificación de cuentas (reglas de la sección 2 y niveles de `verification`).
- `docs/runbooks/people-social.md` al día: comandos en orden, tiempos, memoria, qué falla en silencio, cómo regenerar y publicar.
- `docs/research/fuentes/` con instantáneas fechadas (Merco, Ipsos o su extracto, MOP).
- Registro de «cosas que parecen fallos y no lo son»: «No encontrada» ≠ «no tiene cuentas»; el índice no es importancia; Instagram redondea; el PDF de Ipsos da 404.
- Nota de privacidad: qué se guarda, qué no, cómo se borran los textos crudos.

---

## 5. Entregables por hito

| Hito | Contenido | Criterio de cierre |
| --- | --- | --- |
| **H1** (primero) | J1–J4, B1–B6 (criterio + candidatos + duplicados), G regresiones 1–10 | ADR + `padron-v2.json` + `audit_all.py` verde |
| **H2** | A (cuentas ≥200), E1–E6, D1–D3 | auditoría de cuentas ≥95 % correcto; cifras con fecha y redondeo |
| **H3** | D4–D8 (≥120 con sentimiento), C1–C7 (índice validado) | validación documentada + Spearman ≥0,6 |
| **H4** | F (pantalla con filtros cruzados y gráficos) + H (despliegue) | capturas en vivo, filtros combinados, sin errores de consola |
| **H5** | I (documentación) + informe final | runbook reproducible de punta a punta |

Cada hito se publica en `test` y se verifica en vivo antes de pasar al siguiente. No acumular un solo despliegue grande.

## 6. Condiciones de parada y de consulta

**Detenerse y consultar al usuario si:** (1) una fuente exige sesión, captcha o pago; (2) hay que instalar un servicio nuevo en Contabo; (3) el índice cambia de manera que el Top 10 cambie por completo; (4) se van a incluir menores; (5) se quiere llevar algo a `dev`; (6) la memoria de la laptop baja de 1,5 GB libres; (7) se agotan los cupos de búsqueda y no hay otro método de descubrimiento.
**Seguir sin preguntar:** correr scripts, reintentar APIs, regenerar datos, commitear a `test`, relanzar un despliegue fallido una vez, escribir pruebas y documentación.

## 7. Definición de «terminado»

La pestaña `https://test.datosbolivia.com/?pestana=personalidades`, en escritorio y móvil, muestra un Top 300 con criterio escrito, ≥200 personas con cuenta verificada y cifra con fecha, sentimiento publicado para ≥120 con método validado, el Top 5 de Ipsos con su procedencia verificable, filtros que se cruzan, panel de calidad honesto, y existe un comando único (`audit_all.py`) que reproduce y audita todo con las pruebas en verde. Todo está en `test` (core y tablero), desplegado y verificado en vivo con captura.
