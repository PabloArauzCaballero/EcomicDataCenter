# Ejecución del historial de personalidades

La corrida del 8 de octubre de 2026 ejecuta el [plan de 300 personas](../research/personalidades-300-cinco-anos/README.md), con el intervalo fijado del 8 de octubre de 2021 al 8 de octubre de 2026, extremo final excluido, en America/La_Paz. Su estado es **INCOMPLETO**. El [informe de avance local](../../artifacts/people-history/2026-10-08/AVANCE.md) y `progress.json` contienen los conteos regenerados. El [ADR 0028](../decisions/0028-public-figures-history-is-a-traceable-corpus.md) define atribución y evidencia.

Los siguientes comandos se ejecutan desde la raíz `ObservatorioEconomico`, no desde `EcomicDataCenter`. Los datos no se suben a Git. No es necesario iniciar el backend ni conectarse a una base de datos.

**Dependencias y estado**

Se usaron Python 3.14.2, requests, beautifulsoup4 y yt-dlp 2026.8.19. El intérprete con yt-dlp disponible está en `C:/Users/Usuario/.observatorio-social/venv/Scripts/python.exe`. El navegador se maneja mediante Playwright CLI y Node/npx. La revisión de esta corrida es automática y explícitamente limitada al texto cuando no se pudo abrir el audiovisual.

Cada corrida vive en `EcomicDataCenter/artifacts/people-history/<run>/`. `scope.json` y `people.json` congelan alcance y padrón. Los JSONL conservan eventos; `evidence/*.gz` conserva bytes identificados por SHA-256. `exports/` es regenerable. `integrity-audit.json` contiene hashes de los entregables. Un hash acredita estabilidad del archivo, no veracidad de la publicación.

**Descubrimiento y cuentas**

Las búsquedas de esta corrida se hicieron individualmente mediante el buscador web disponible, guardando consulta, persona, fecha, títulos y URLs en `web-discovery-*.json`. Una búsqueda inicial por nombre no completa las seis búsquedas específicas por red ni resuelve homónimos. Las pistas se importan así:

```powershell
python EcomicDataCenter/scripts/social/people-history/probe_accounts.py --run=2026-10-08 --import-only
```

`account-reviews.jsonl` conserva corroboraciones razonadas; `lead-reviews.jsonl` conserva rechazos. `account_key` es un identificador local derivado de la URL, no siempre el ID nativo de plataforma. Dos URLs o cambios de usuario requieren reconciliación explícita. Ninguna coincidencia de nombre se promueve automáticamente a identidad confirmada.

La ruta experimental de búsqueda directa con Bing produjo resultados ajenos a las consultas y se detuvo. No reiniciar `discover_accounts.py` como fuente válida de identidad sin corregir y comprobar esa ruta. Los resultados rechazados permanecen documentados.

**Captura pública y restricciones**

`probe_accounts.py` solo lee metadatos de perfiles y conserva restricciones entre pasadas. No acredita historiales. `youtube_history.py --action=inventory` enumera videos, cortos y directos de los tres canales previamente corroborados, sin un tope de los primeros N videos. Una superficie ausente hoy no demuestra que nunca existió. Las fechas no se inventan a partir del orden del canal.

La ruta de detalle de YouTube encontró HTTP 429 y captcha en navegador. Instagram exigió sesión al abrir un post; Facebook la exigió después de cinco publicaciones visibles. No repetir esas rutas sin resolver la dependencia. No borrar los incidentes para forzar una reanudación. Las restricciones de un perfil se reportan como observadas en ese perfil, sin declararlas prueba de ausencia de contenido de las otras 299 personas.

TikTok permitió enumerar 25 enlaces de una cuenta candidata, pero la apertura de un video activó un captcha de puzle. El scroll se había detenido sin acreditar el fin del historial. Una prueba de perfil de X falló con `ERR_HTTP_RESPONSE_CODE_FAILURE`; LinkedIn rechazó la lectura HTTP. `access-incidents.jsonl`, `account-probes.jsonl` y `enumeration-attempts.jsonl` conservan los detalles. `tiktok_public.py` usa el navegador CLI ya abierto; no resuelve captcha ni confirma identidad.

Tras consultar otra vez la sesión histórica de Claude, se probó la superficie pública `/embed/captioned/` de Instagram sobre doce URLs ya visibles del perfil corroborado. `instagram_embed.py` conserva el HTML con hash y las leyendas que mostró el embed. No enumera publicaciones adicionales y no permite afirmar que se vio el video o la fecha. Es una mejora de contenido disponible dentro del historial parcial.

Los feeds oficiales son una fuente pública independiente de metadatos recientes, sin cobertura de cinco años:

```powershell
python EcomicDataCenter/scripts/social/people-history/public_feeds.py --run=2026-10-08
```

Este lector omite canales ya intentados. Las observaciones de canales sin corroborar permanecen sin atribuir; no se agregan a resultados personales confirmados. `rating_count` no se interpreta como likes. Vistas y seguidores son observaciones al capturar, no series históricas.

`facebook_public.py` y su archivo JavaScript leen publicaciones propias visibles de una sesión CLI ya abierta y una cuenta corroborada. Retiran comentarios anidados. Los límites operativos, el estancamiento del scroll y un diálogo producen estado parcial; nunca estado completo. Los otros lectores públicos mantienen el mismo principio.

**Revisión y fechas**

`import_prior.py` recuperó 90 publicaciones anteriores de los tres canales. Sus fechas heredadas no tienen precisión acreditada: el recolector anterior convertía edades relativas en fechas aparentes. `prior-text-annotations.json` contiene 90 anotaciones individuales y `current-text-annotations.json` las nuevas. No se generan conclusiones copiando una plantilla de tema a cada post.

`reconcile_reviews.py` adjunta evidencia a las primeras anotaciones. `reconcile_current.py` vincula las anotaciones nuevas y fechas exactas de los feeds. Reejecutar el reconciliador anterior puede anexar incidencias de calidad repetidas; la tabla de revisiones evita duplicados. Texto revisado, audio transcrito, imagen inspeccionada y publicación completa revisada son estados diferentes.

**Regenerar y verificar entregables**

```powershell
python EcomicDataCenter/scripts/social/people-history/report_progress.py --run=2026-10-08
python EcomicDataCenter/scripts/social/people-history/audit_run.py --run=2026-10-08
python -m unittest discover -s EcomicDataCenter/scripts/social/people-history -p test_history.py -v
```

Se exportan fichas de avance de las 300 personas, cuentas, inventarios, observaciones recientes, revisiones individuales y 108.000 celdas persona/red/ventana. Los totales desconocidos quedan vacíos. El auditor comprueba unicidad, referencias y hashes; no certifica completitud histórica.

**Trabajo pendiente para terminar**

Falta corroborar las personas y cuentas restantes, resolver acceso a historiales con sesiones manuales o fuentes históricas autorizadas, enumerar cada periodo, recuperar todos los elementos de cada publicación y revisar el audiovisual, además de auditar cobertura y conclusiones. Las exportaciones locales que aporte el usuario deberán conservar su manifiesto, origen y fecha. Nunca enviar contraseñas o tokens por chat.

La corrida no ha publicado ni desplegado estos resultados. No presentar las 300 fichas, los miles de IDs o una auditoría de integridad aprobada como revisión terminada de las 300 personas.
