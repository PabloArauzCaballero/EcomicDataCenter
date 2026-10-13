# Plan de revisión de publicaciones de 300 personalidades de Bolivia

Fecha de preparación: 8 de octubre de 2026. Estado: ejecución iniciada, con evidencia parcial y dependencias de acceso pendientes. La revisión histórica de cinco años no está terminada. Consultar el [avance real de la corrida](../../../artifacts/people-history/2026-10-08/AVANCE.md) y el [runbook de ejecución](../../runbooks/people-history.md).

El objetivo es inventariar y revisar individualmente todas las publicaciones recuperables de las cuentas públicas verificadas de las 300 personas del padrón, durante cinco años. Cada conclusión debe poder abrirse hasta la publicación y el fragmento que la sustenta. El resultado debe declarar los periodos y contenidos que no pudieron recuperarse. La cantidad de filas, por sí sola, no acredita exhaustividad.

El alcance inicial comprende Facebook, Instagram, TikTok, YouTube, X y LinkedIn. Se incorporarán otras redes cuando se identifiquen cuentas oficiales: Threads, canales públicos de Telegram y otras superficies públicas pertinentes. X requiere un conector nuevo: no figura entre los cinco lectores actuales. El padrón existente es un marco de investigación, no un ranking demostrado de las 300 personas más importantes del país.

**1. Qué sabemos del punto de partida**

La inspección de archivos locales del 8 de octubre encontró lo siguiente. Estos datos describen los archivos indicados, no el estado actual de servidores ni redes sociales.

| Evidencia | Resultado observado | Consecuencia |
|---|---|---|
| [Padrón existente](../../../../_publish_people_core/scripts/social/people/research-300.json) | 300 personas y 300 identificadores únicos | Mantener esos identificadores como base; no reconstruir una lista arbitraria |
| Mismo padrón | 100 empresarios, 65 deportistas, 54 figuras políticas, 33 de medios, 16 de cultura, 15 de ciencia, 13 cívicas y 4 sin clasificar | Revisar sesgos sectoriales y resolver las cuatro categorías pendientes |
| Mismo padrón | 300 estados pendientes de identidad, edad y verificación de cuentas | No confundir inclusión en el padrón con identidad o cuenta confirmadas |
| Mismo padrón | 130 pistas de cuentas para 94 personas; 206 sin pistas registradas | Verificar pistas existentes y descubrir cuentas faltantes |
| `pilot-3.json`, en el mismo directorio | 3 canales: Albertina Sacaca, Daniel Dueñas y Elias Ayaviri; 73 posts, 854 comentarios capturados y 610 clasificados en español | Piloto de un año; no satisface cinco años ni 300 personas |
| `reviewed-pilot-accounts.json` | Tres revisiones separadas del padrón | Reconciliar las revisiones sin promover automáticamente las otras 297 fichas |
| `src/database/seeds/boot/company-social.json`, copia de EcomicDataCenter | 473 perfiles y 11.330 posts | Es una instantánea local; otras sesiones describen cortes diferentes |

El lector base de YouTube tiene `TOP_VIDEOS = 6`, `COMMENTS_PER_VIDEO = 150` y `WINDOW_DAYS = 90`. La pasada profunda tiene valores predeterminados de 100 entradas listadas, 8 detalles y 15 posts de buscador; el runbook describe corridas de unos 120 videos por canal. También existen topes de scroll. Ninguno de esos mecanismos acredita lectura individual de cinco años.

El recolector de personas reutiliza los lectores de empresas y considera terminada una cuenta por la presencia de su `slug` en el archivo de corrida. Para este trabajo, la unidad de reanudación debe incluir cuenta, intervalo, página y post. Haber intentado una cuenta no equivale a haberla terminado.

Referencias locales: [runbook de empresas](../../runbooks/company-social.md), [ADR de empresas](../../decisions/0027-company-accounts-are-read-on-their-profile.md), [consulta y antecedentes de Claude](consulta-claude.md), [inspección reproducible](preparar_plan.py), [línea base](baseline.json).

**2. Qué significa cinco años y qué publicaciones entran**

Se fija el intervalo semiabierto `2021-10-08T00:00:00-04:00 <= published_at < 2026-10-08T00:00:00-04:00`, zona `America/La_Paz`. Corresponde al 8 de octubre de 2021 hasta el 7 de octubre de 2026 inclusive: cinco años anteriores al día de preparación, evitando un último día incompleto. Sus límites UTC son las 04:00 de las mismas fechas. Si se quiere incorporar el día 8, se hará una extensión identificada, sin mover silenciosamente el corte original.

La planificación divide el periodo en 60 ventanas consecutivas del día 8 al día 8. Para informes por mes calendario se intersectan con 61 meses, con octubre de 2021 y octubre de 2026 parciales. No deben confundirse 60 ventanas operativas con 60 meses calendario completos.

Se incluyen textos, fotografías, cada elemento de carrusel, reels, videos cortos y largos, transmisiones archivadas, publicaciones de comunidad, encuestas cuando sean visibles, hilos, citas, reposts y respuestas escritas por la propia personalidad. Original, cita, respuesta y republicación tienen tipos separados. Las publicaciones fijadas se asignan por fecha real, no por posición en el perfil.

Se registran todas las cuentas verificadas, incluidas antiguas, secundarias y profesionales. Una cuenta de institución o equipo de prensa se distingue de una cuenta personal; no se atribuye automáticamente todo su contenido a una persona. Los cambios de usuario y de titularidad llevan fechas de vigencia. Una fecha de creación conocida puede justificar `NOT_APPLICABLE` antes de la existencia de la cuenta.

Las historias solo pueden incluirse si siguen disponibles como destacados, archivo autorizado o copia histórica verificable. Un directo no archivado, un post borrado sin copia o una cuenta privada no pueden reconstruirse por inferencia. Una noticia que cita un post es evidencia secundaria, no una captura íntegra del original.

Por defecto se propone contenido completo y métricas de las publicaciones, con comentarios de terceros analizados sin identificadores y presentados de forma agregada. La profundidad de comentarios se mantiene explícita como supuesto hasta la respuesta del usuario. Noticias, entrevistas y menciones externas sirven como contexto y descubrimiento; no se suman al número de posts propios.

**3. Directorio verificable de personas y cuentas**

Para cada persona, conservar identificador, nombre público, alias documentados, sector, fuente de inclusión y evidencias de vinculación con Bolivia. Revisar homónimos y la actividad pública atribuida. La prioridad de trabajo puede variar, pero ninguna prioridad elimina personas del universo de 300.

Para cada cuenta, registrar red, identificador estable de plataforma, URL canónica, usuarios anteriores, tipo de titularidad, fechas de vigencia y pruebas de atribución. Buscar primero enlaces desde sitios oficiales o perfiles ya corroborados; después, referencias públicas independientes y buscadores. Nombre, foto y una insignia aislados no bastan para resolver un homónimo.

Cada atribución tendrá evidencia directa y, cuando sea necesaria para resolver ambigüedad, corroboración independiente; registrar el razonamiento y el revisor. Estados: `LEAD`, `VERIFIED`, `REJECTED`, `AMBIGUOUS`, `NOT_FOUND_AFTER_SEARCH`. Ausencia en un buscador significa ausencia de hallazgo, no prueba de inexistencia.

Conservar la revisión de mayoría de edad prevista en el proyecto antes de publicar análisis de audiencia. No recopilar datos familiares, domicilios, contactos privados ni atributos sensibles inferidos. Para publicaciones del periodo en que una figura era menor, resolver el tratamiento específico antes de incorporarlas a análisis individualizados. El objeto de estudio es su comunicación pública documentada.

Entregable: 300 fichas revisadas y un directorio de cuentas de cardinalidad variable. Las 1.800 combinaciones persona/red de la plantilla son tareas de descubrimiento, no 1.800 cuentas cuya existencia esté confirmada.

**4. Acceso y estrategia por plataforma**

| Red | Ruta de recuperación propuesta | Cómo cerrar el inventario | Límite que debe quedar visible |
|---|---|---|---|
| YouTube | Resolver canal; recorrer uploads mediante API; obtener detalles de cada ID; contrastar Videos, Shorts y Directos; tratar Comunidad por separado | Guardar cada `nextPageToken`, páginas y IDs; agotar recorrido válido y reconciliar superficies | La API de videos no debe confundirse con cobertura de Comunidad; privados, eliminados y subtítulos pueden faltar |
| X | Búsqueda de archivo completo por cuenta y rango; conservar respuestas, citas y reposts con sus tipos | Paginar todos los resultados y subdividir ventanas saturadas; contrastar publicaciones conocidas | Se requiere acceso habilitado a archivo histórico; búsqueda reciente no alcanza cinco años |
| Facebook | Elegir acceso oficial disponible o lectura pública/autorizada; recorrer publicaciones, fotos, reels y videos | Enumeración cronológica verificable por superficie, contraste de IDs y registro de cortes | El muro visible sin sesión no acredita el archivo; los límites del acceso pueden impedir cerrar intervalos |
| Instagram | Determinar tipo de cuenta y acceso disponible; recorrer publicaciones, reels y carruseles | Paginar, abrir cada publicación y cada elemento; registrar destacados aparte | Las capacidades para cuentas profesionales no se extienden automáticamente a cuentas personales |
| TikTok | Verificar primero elegibilidad y disponibilidad de una ruta oficial; si no, inventario público y búsquedas complementarias con cobertura parcial | Consultas acotadas, todos los cursores y detalles individuales; tratar búsquedas indexadas como conjunto parcial | Una cuenta de desarrollador no garantiza acceso de investigación; no dar por disponible esa API para una entidad en Bolivia |
| LinkedIn | Perfiles y publicaciones públicas, archivos aportados por titulares o acceso efectivamente autorizado | Recorrido con evidencia hasta límite temporal y contraste de enlaces conocidos | Los extractos de buscadores y cifras de seguidores no son un inventario de publicaciones |

La API de YouTube documenta páginas de hasta 50 entradas y continuación mediante tokens. Se usará ese mecanismo para enumerar, sin un tope total de 100 o 120 videos. [Referencia oficial de YouTube](https://developers.google.com/youtube/v3/docs/playlistItems/list).

X distingue búsqueda reciente de siete días y búsqueda de archivo completo, disponible con acceso de pago por uso o Enterprise. El plan histórico depende de la segunda o de otra fuente histórica verificable; los precios y permisos efectivos se comprobarán antes de contratar. [Referencia oficial de X](https://docs.x.com/x-api/posts/search/introduction).

TikTok documenta ventanas de consulta de hasta 30 días. Sus criterios públicos de investigación incluyen restricciones regionales e institucionales y no listan Bolivia como región de elegibilidad directa. Las ventanas operativas de 31 días se subdividirán según las reglas reales del conector. No se presupone acceso ni se simula una afiliación. [Consulta de videos](https://developers.tiktok.com/docs/en/research-api-specs-query-videos), [elegibilidad oficial](https://developers.tiktok.com/products/research-api/).

Meta ofrece herramientas de investigación con acceso controlado; deben comprobarse elegibilidad, permisos, superficies y profundidad en un piloto. Su colección oficial de Instagram distingue cuentas profesionales de cuentas de consumidor. Las páginas directas de documentación de Meta dieron error durante esta revisión; no se dio por verificado el acceso efectivo a ningún producto. [Descripción de Meta](https://about.fb.com/news/2023/11/new-tools-to-support-independent-research/), [colección oficial de Instagram](https://www.postman.com/meta/instagram/folder/u4g5a2a/instagram-api-with-facebook-login).

El orden de preferencia será fuente oficial suficiente, exportación autorizada del titular, archivo o proveedor cuya cobertura se pueda probar y lectura pública verificable. Se conserva la preferencia del trabajo anterior por accesos existentes y sin APIs pagas; las rutas comerciales son alternativas condicionadas, no una decisión de gasto. Los buscadores complementan el inventario; no acreditan exhaustividad. Antes de elegir un proveedor, exigir una prueba con cuentas y fechas del piloto, conteos reproducibles, procedencia, exportación de IDs y limitaciones; no basta una promesa de “datos históricos”.

No se compran accesos ni se contacta a las 300 personas como parte de este plan. Cuando una ruta dependa de acceso todavía inexistente, se registra esa dependencia y se avanza con las demás. La lectura con sesión se limita a abrir contenido; se detiene ante captcha o verificación y conserva credenciales fuera de archivos de investigación.

**5. Protocolo de recolección que evita truncamientos silenciosos**

1. Resolver identidad y vigencia de la cuenta. Fijar red, superficie, ventana y mecanismo de acceso.
2. Enumerar IDs y URLs antes del análisis. Guardar petición o navegación, cursor inicial/final, hora, respuesta, cantidad, versión del lector y huella de evidencia.
3. Paginar hasta agotamiento comprobado. Si aparece un límite, subdividir por semana, día u hora según capacidades. Dividir una consulta no repara por sí solo un índice que omite contenido: contrastar fuentes.
4. Abrir cada ID. Expandir texto, hilos y carruseles; recuperar detalle y multimedia. Una tarjeta o snippet queda `DISCOVERED_ONLY` hasta obtener contenido suficiente.
5. Validar autoría y fecha. Si solo existe “hace dos años”, guardar precisión aproximada y fecha de observación. Un post que podría caer a ambos lados del corte queda con pertenencia temporal incierta; no se fuerza dentro o fuera.
6. Deduplicar por red e ID estable. Si falta ID, usar URL normalizada y una clave provisional documentada. Guardar versiones cuando cambia texto; separar nuevas capturas de nuevos posts.
7. Reconciliar el listado con el detalle. Cada ID debe tener contenido recuperado o una incidencia explícita. Una respuesta 200 o una lista vacía no bastan para marcar éxito.
8. Revisar el contenido individual, incluidas las modalidades aplicables. Guardar una ficha por publicación y evidencia de cada etiqueta.
9. Segunda pasada de huecos: revisar cambios de usuario, superficies omitidas, meses con saltos y URLs halladas por otra vía. No rellenar ausencias con estimaciones.
10. Cerrar exclusivamente la unidad que cuenta con evidencia suficiente. Producir balance de descubiertos, capturados, revisados y no recuperables.

Las pausas por cuota, memoria o duración crean puntos de reanudación, no cierres de cuenta. Los reintentos tienen causa, contador y próxima acción. Una respuesta 429 respeta el tiempo indicado; ante bloqueo persistente se suspende esa ruta y se evalúa otra fuente. No se repite indefinidamente una lectura que solo devuelve los mismos primeros posts.

Una segunda búsqueda que no agrega resultados aumenta confianza, pero no prueba completitud universal. `ENUMERATION_EXHAUSTED` significa agotado el mecanismo identificado, no que todos los posts que alguna vez existieron estén recuperados.

**6. Ficha de cada publicación**

| Grupo | Campos requeridos o explícitamente nulos | Regla |
|---|---|---|
| Identidad | `person_id`, `account_id`, `platform`, `platform_post_id`, `canonical_url`, `authorship_type` | Ningún post atribuido sin cuenta y evidencia |
| Fechas | `published_at`, `published_at_raw`, `date_precision`, `edited_at`, `first_seen_at`, `retrieved_at`, `window_membership` | Distinguir publicación, modificación y captura |
| Relaciones | `post_type`, `parent_id`, `thread_id`, `quoted_post_id`, `repost_of_id`, `crosspost_cluster_id` | No fusionar un repost con su original |
| Texto | título, cuerpo íntegro accesible, idioma, hashtags, menciones públicas relevantes, enlaces, condición de truncamiento | Texto vacío legítimo y texto no obtenido son distintos |
| Multimedia | tipo, posición, cantidad esperada/recuperada, duración, URL de referencia, huella del archivo permitido, estado de acceso | Un carrusel de diez imágenes exige diez registros |
| Transcripción | segmentos de audio con inicio/fin, texto original, traducción separada, idioma, método, calidad, tramos inaudibles | Preservar incertidumbre y no inventar lo no audible |
| Lectura de imagen | texto OCR con ubicación, descripción observable, evidencia visual y confianza | No identificar desconocidos por reconocimiento facial |
| Métricas | likes, reacciones por tipo, comentarios, compartidos, citas, reposts, reproducciones, guardados, alcance, impresiones | Solo valores visibles/autorizados; campo ausente es nulo |
| Procedencia métrica | valor original mostrado, valor normalizado, exacto/aproximado, unidad, hora de observación, fuente | “1,2 mil” no se convierte en cifra exacta de 1.200 |
| Análisis | resumen factual individual, temas y subtemas, entidades explícitas, lugares mencionados, afirmaciones públicas, eventos, CTA, patrocinio explícito | Separar lo dicho de lo verificado y de lo inferido |
| Calidad | cobertura de texto/audio/imagen/video, estado, limitaciones, evidencia, modelo/versión, revisor y fecha | La ficha debe mostrar qué falta |

`save_count`, alcance e impresiones serán frecuentemente desconocidos. No derivarlos de likes o vistas. Una ubicación mencionada es tema del contenido, no ubicación física comprobada del autor. Una coincidencia de marca no demuestra patrocinio: usar `EXPLICIT`, `POSSIBLE` o `UNKNOWN` y reservar la primera etiqueta a evidencia expresa.

La transcripción completa y los materiales de trabajo quedan en almacenamiento controlado cuando la fuente y el acceso lo permitan. El producto público puede mostrar resumen, fragmentos breves, métricas y enlace a la publicación; no se publica automáticamente una réplica masiva de contenidos o comentarios.

**7. Qué significa revisar cada post, imagen y video**

Cada post recuperado recibirá una lectura individual por el sistema analítico, incluso si tiene poca interacción o repite temas. Se conservará `review_method = AI | HUMAN | MIXED`; una revisión automática no se presentará como revisión humana. Los revisores humanos resolverán identidad, ambigüedades, casos señalados y auditorías de calidad. Si se exige además lectura humana del 100 %, se dimensionará como una tarea adicional explícita.

En texto: leer cuerpo completo, contexto del hilo y enlaces cuando sean indispensables para entender una afirmación. En imagen: revisar todas las piezas, extraer texto y describir elementos pertinentes. En video: recuperar audio completo accesible, transcribir por segmentos y revisar toda la línea temporal mediante segmentos audiovisuales consecutivos, con solapamiento para evitar cortes de frases y escenas. Mantener intervalos efectivamente procesados.

Los fotogramas representativos o miniaturas sirven para una lectura parcial. No permiten afirmar que se revisó todo el video. Si el método solo admite fotogramas, marcar `VISUAL_SAMPLED` y mantener pendiente la revisión audiovisual completa. El 100 % de duración transcrita tampoco prueba revisión del contenido visual.

Un archivo con audio inaudible, música sin habla, idioma no soportado o video no disponible tendrá su estado específico. Para español boliviano, quechua, aymara, guaraní y mezclas, conservar texto original y usar revisión lingüística cuando el modelo no sea suficiente. No forzar todos los contenidos a un clasificador entrenado en español.

Toda afirmación del análisis enlaza a `post_id` y a un fragmento: rango de caracteres, imagen/caja OCR o segundos de video. Una acusación publicada se registra como afirmación atribuida; su veracidad requiere contraste independiente y no se deduce de haber encontrado el post.

**8. Taxonomía y profundidad analítica**

Se propone una taxonomía jerárquica versionada, multietiqueta y extensible. El objetivo es detalle útil, no inflar el número de categorías. El piloto deberá descubrir sinónimos locales, separar temas frecuentes y probar las reglas con ejemplos positivos y negativos.

| Familia | Subtemas iniciales propuestos |
|---|---|
| Economía | inflación, precios, empleo, salarios, tipo de cambio, divisas, crédito, impuestos, inversión, comercio exterior, informalidad |
| Producción | agro, ganadería, minería, hidrocarburos, litio, industria, energía, transporte, turismo, tecnología |
| Gestión pública | propuestas, ejecución, presupuesto, infraestructura, servicios, rendición de cuentas, legislación, justicia |
| Vida política pública | campañas, debates, nombramientos, organizaciones declaradas, alianzas expresas, movilizaciones, declaraciones oficiales |
| Empresas | productos, lanzamientos, aperturas, resultados publicados, exportación, premios, empleo, responsabilidad social, atención al cliente |
| Cultura | música, cine, literatura, patrimonio, gastronomía, festividades, arte, formación y eventos |
| Deporte | disciplina, competición, preparación, resultados, convocatorias, lesiones públicamente comunicadas y patrocinios explícitos |
| Ciencia y educación | publicaciones, divulgación, docencia, becas, universidades, innovación y transferencia |
| Ambiente y sociedad | agua, incendios, residuos, conservación, ayuda pública, voluntariado, comunidad y derechos discutidos en el post |
| Comunicación cotidiana | agenda pública, saludos, humor, opinión, historias personales divulgadas y colaboraciones |

Cada etiqueta tendrá definición, inclusiones, exclusiones, idioma, ejemplos y versión. Separar tema de tono, emoción de valoración y mención de adhesión. Publicar una declaración política explícita como tal es distinto de inferir ideología privada a partir de likes, contactos o apariencia; estas inferencias no forman parte del estudio.

Se podrán analizar frecuencia de temas, cambios de agenda, hechos anunciados, respuestas públicas, colaboración explícita entre figuras y reutilización de contenido. Los vínculos describirán menciones o colaboraciones observables, sin convertir coapariciones en relaciones personales supuestas. No se inferirá representatividad nacional del conjunto elegido.

**9. Comentarios y reacción de audiencia**

Comentarios constituyen un universo separado y potencialmente mucho mayor. Por post, registrar conteo mostrado, comentarios recuperados, respuestas recuperadas, modo de ordenación, páginas/cursor, fecha de captura y cierre o limitación. Cuando se habilite recuperación exhaustiva, paginar comentarios principales y respuestas de cada hilo; no declarar completo un hilo por haber obtenido solo el primer nivel.

No guardar en las tablas analíticas nombres, handles, avatares o URLs de perfiles de comentaristas. La deduplicación operativa puede usar referencias restringidas o derivadas con clave, con retención limitada y sin exportarlas. El resultado público conserva agregados por post, periodo, tema e idioma.

Analizar polaridad dirigida a un objeto explícito, ironía, preguntas, quejas, apoyo, desacuerdo y temas. Un comentario positivo hacia una noticia negativa no implica apoyo a la personalidad. Separar mensajes repetidos, spam e idioma no clasificable; no llamar bots a cuentas por repetición textual.

Validar los modelos existentes de ONNX sobre un conjunto local anotado. Informar soporte por clase, acuerdo entre revisores, precisión/recall por etiqueta y errores frecuentes. La meta de aceptación se fijará antes de evaluar el conjunto reservado; no se elegirá mirando el resultado. Emoción, ironía y polaridad siguen siendo dimensiones distintas.

Todos los porcentajes mostrarán denominador: capturados, clasificables y excluidos. No presentar estos comentarios como opinión de Bolivia ni como encuesta. Una captura de comentarios destacados produce una muestra seleccionada por la plataforma; aun con miles de textos, el sesgo permanece.

**10. Cobertura y criterios de cierre**

La matriz inicial contiene `300 personas × 6 redes × 60 ventanas = 108.000` unidades planificadas. Son casillas pendientes, no publicaciones ni cuentas confirmadas. Cuando una persona tenga más de una cuenta en una red, cada casilla se desdobla por cuenta y superficie. La matriz base conserva la responsabilidad de investigar todas las combinaciones.

Estados de acceso: `PENDING`, `ACCESSIBLE`, `LOGIN_REQUIRED`, `RESTRICTED`, `RATE_LIMITED`, `BLOCKED`, `NOT_FOUND_AFTER_SEARCH`, `ERROR`. Estados de enumeración: `NOT_STARTED`, `IN_PROGRESS`, `EXHAUSTED_FOR_SOURCE`, `PARTIAL`, `UNKNOWN`, `NOT_APPLICABLE`. Estados de detalle: `DISCOVERED_ONLY`, `CAPTURED`, `PARTIAL_CONTENT`, `UNAVAILABLE_CONFIRMED`. Estados de revisión: `PENDING`, `TEXT_REVIEWED`, `MULTIMODAL_PARTIAL`, `REVIEWED`, `NEEDS_ADJUDICATION`.

| Indicador | Definición | Interpretación |
|---|---|---|
| Identidad revisada | Personas con revisión documentada / 300 | Separar confirmadas, ambiguas y excluidas con causa |
| Directorio resuelto | Combinaciones persona/red con búsqueda documentada / 1.800 | No equivale a cuentas existentes |
| Inventario temporal cerrado | Ventanas con enumeración demostrada para la fuente / ventanas aplicables | Publicar aparte inaccesibles y desconocidas |
| Detalle recuperado | IDs con detalle suficiente / IDs únicos descubiertos | Solo describe el inventario encontrado |
| Revisión individual | Posts `REVIEWED` / posts capturados dentro del periodo | No llamar cobertura histórica a este cociente |
| Integridad multimedia | Piezas recuperadas y revisadas / piezas enumeradas | Reportar cada modalidad por separado |
| Cobertura audiovisual | Duración de unión de intervalos revisados / duración conocida | No sumar solapamientos dos veces |
| Comentarios | Capturados y revisados frente al conteo mostrado compatible | Si difieren alcance/fecha, no calcular porcentaje engañoso |
| Completitud real del universo | Recuperados / total real publicado | Nula/desconocida si no hay denominador verificable |

Cuando el denominador sea cero o desconocido, el indicador será `N/A` o desconocido, nunca 100 % automático. Para declarar una ventana sin publicaciones debe existir evidencia de enumeración completa para una fuente suficiente; búsqueda vacía es `UNKNOWN`. La ausencia por restricción no es cero actividad.

Una cuenta se entrega con inventario, posts revisados, evidencia, incidencias, fuentes usadas y límites. El estudio puede terminar administrativamente con vacíos documentados, pero solo puede llamarse revisión completa de cinco años cuando las cuentas y superficies aplicables estén inventariadas y todos sus posts recuperables hayan pasado revisión. Cerrar una incidencia como inaccesible no la convierte en contenido revisado.

**11. Modelo de datos y arquitectura propuesta**

Se proponen entidades `people`, `person_accounts`, `account_evidence`, `collection_runs`, `collection_tasks`, `coverage_windows`, `post_versions`, `media_assets`, `transcript_segments`, `metric_observations`, `post_annotations`, `comment_aggregates`, `evidence_objects` y `quality_issues`. Estos son nombres de diseño; no son tablas o endpoints ya implementados.

Clave de post: `(platform, platform_post_id)`; versiones y observaciones de métricas tienen su propia fecha. La asociación persona/cuenta es temporal. Los datos crudos se conservan en particiones por corrida/red/cuenta/fecha, con manifiestos y huellas. Una corrección agrega revisión. La retención y las eliminaciones exigidas por el acceso se resuelven mediante política explícita y auditoría; “inmutable” no debe convertirse en conservar indefinidamente todo material.

Aplicar el stack actual: lectores TypeScript, análisis Python/ONNX cuando sirva, validación de contratos y PostgreSQL para consultas. Archivos pesados fuera de Git y fuera de semillas monolíticas; referencias y manifiestos dentro del sistema. No añadir Redis, brokers ni un ORM nuevo para ejecutar este plan. Un ejecutor reanudable con trabajos persistidos puede comenzar como CLI sobre el almacenamiento existente; la implementación definirá el mecanismo compatible con las ADR.

Separar extracción de interpretación. El clasificador no puede crear IDs ni métricas ausentes; responde con un esquema validado, referencias a evidencia y posibilidad de abstenerse. El texto de redes es contenido no confiable, nunca instrucciones para el recolector o el agente.

La ADR 0027 nació para empresas y dice que no lee cuentas de personas. El pedido actual y el flujo de personas ya existente justifican documentar una decisión específica que delimite comunicación pública, atribución y minimización; no corresponde ampliar en silencio el significado de la ADR empresarial. Esa tarea documental forma parte de la implementación, no bloquea preparar el plan.

**12. Secuencia de ejecución y entregables**

| Fase | Trabajo | Entregable verificable | Condición de salida |
|---|---|---|---|
| 0. Congelar alcance | Padrón versionado, fechas, modalidades, comentarios y criterios | Manifiesto, supuestos y matriz inicial | 300 IDs únicos y partición temporal exacta |
| 1. Resolver directorio | Revisar 130 pistas; investigar 206 personas sin pistas y redes faltantes | Directorio con evidencia y vigencia | Las 1.800 combinaciones tienen resultado de búsqueda o pendiente explícito |
| 2. Piloto de acceso | 12 personas de sectores, volúmenes y dificultades diferentes; cubrir las 6 redes | Prueba de enumeración, detalle y multimedia, con tiempos y costes | Al menos una prueba por ruta propuesta, incluyendo casos antiguos y bloqueados |
| 3. Diseñar contratos | Post, versión, evidencia, tarea, cobertura y anotación | Esquemas, fixtures reales mínimos y pruebas de invariantes | No hay pérdida silenciosa ni confusión entre post/captura |
| 4. Inventario histórico | Todas las cuentas verificadas; todas las ventanas y superficies | IDs, URLs, fechas, cursores y manifiestos | Inventario y vacíos trazables por cuenta/ventana |
| 5. Captura individual | Abrir cada post y todas sus piezas | Contenido, multimedia, métricas observadas e incidencias | Cada ID tiene detalle o motivo de ausencia |
| 6. Revisión individual | Analizar todos los posts capturados y cada modalidad aplicable | Fichas con evidencia, taxonomía y estado | 100 % de capturados resueltos como revisados o limitados con causa |
| 7. Control independiente | Verificar identidad, fechas, huecos, duplicados, modelos y multimedia | Informe de errores y correcciones versionadas | Ningún error crítico de atribución o integridad abierto |
| 8. Entrega | 300 expedientes, explorador, exportaciones y cobertura | Resultado navegable de agregado a evidencia | Se pueden reconstruir conteos y abrir fuentes |

El piloto no sustituye el censo. Para probar el extremo antiguo, se elegirán cuentas con actividad comprobada en 2021; para probar profundidad, cuentas de alta frecuencia; para probar identidad, homónimos y cambios de usuario. Incluir los tres canales ya revisados ayuda a detectar regresiones, pero no representa los otros sectores.

Tras el piloto, organizar lotes de 25 personas, 12 lotes en total. Distribuir sectores y dificultades para evitar que las últimas personas reciban menor profundidad. El orden de lotes no altera criterios de cierre. Publicar avances por ventanas resueltas, IDs inventariados, posts revisados y huecos, no solo por número de perfiles visitados.

Primero mantener un solo navegador activo en esta máquina y separar procesamiento de video de navegación pesada, siguiendo el aprendizaje local sobre memoria. Aumentar concurrencia únicamente después de medir RAM, cuota, fallos y latencia. Los límites de recursos condicionan duración, no reducen silenciosamente el alcance.

**13. Dimensionamiento sin promesas inventadas**

La ventana contiene 1.826 días. El volumen real se conocerá al enumerar; no debe fijarse como objetivo artificial “un millón de filas”. Para ilustrar escala, estos supuestos usan publicaciones promedio por persona y día sumadas entre todas sus cuentas, no por red:

| Escenario ilustrativo | Supuesto | Posts calculados | Revisión humana a 2 minutos por post |
|---|---|---:|---:|
| Bajo | 1 post/persona/día | 547.800 | 18.260 horas |
| Medio | 3 posts/persona/día | 1.643.400 | 54.780 horas |
| Alto | 8 posts/persona/día | 4.382.400 | 146.080 horas |

No son pronósticos: incluyen supuestos no medidos sobre actividad y no descuentan cuentas inexistentes o periodos sin actividad. Dos minutos tampoco bastan para revisar un video largo. Estos escenarios muestran por qué debe distinguirse revisión automatizada de cada post de revisión humana integral.

En el piloto se medirán segundos por página/post, llamadas por 1.000 posts, reintentos, proporción de video, minutos por video, velocidad de transcripción, tamaño almacenado, tokens analíticos y minutos de revisión humana. Estimar medianas y percentiles altos por red y formato, no una velocidad universal.

Fórmulas de presupuesto: coste de API = unidades facturables × precio comprobado; coste de análisis = tokens de entrada/salida × tarifa efectiva; horas de audio = suma de duración / 3.600; almacenamiento = bytes de texto/evidencia + multimedia retenida + respaldo; horas humanas = cantidad revisada × tiempo medido / 3.600. Las cotizaciones deben mostrar impuestos y moneda cuando apliquen, y separar pago único de mantenimiento.

Duración de captura ≈ posts × segundos medidos / (3.600 × concurrencia efectiva), más cuotas y esperas. La concurrencia efectiva no puede superar límites de plataforma o recursos. Para video, calcular por duración total y capacidad audiovisual, no por número de posts.

Como orientación organizativa, reservar una primera semana para directorio prioritario, pruebas de acceso y medición, y una segunda para estabilizar contratos y estimar el censo. No se promete terminar 300 historiales en esas dos semanas. El cronograma total se fija después del piloto y queda condicionado a acceso, volumen audiovisual y revisión humana. Si una plataforma no permite el historial, ese bloqueo puede impedir la completitud aun con más tiempo.

**14. Calidad y pruebas que sí importan**

| Riesgo | Verificación | Acción si falla |
|---|---|---|
| Persona equivocada | Contraste de evidencia y revisión de homónimos | Cuarentena de la atribución y todos sus posts |
| Paginación truncada | Cursores sin ciclos, fin demostrable, ventanas subdivididas y reconciliación de IDs | Mantener ventana parcial y reintentar fuente |
| Reinicio duplica contenido | Repetir un tramo y comparar claves/huellas | Corregir idempotencia antes de ampliar |
| Corte temporal erróneo | Fechas en límites, zona, fechas relativas y ediciones | Corregir asignación sin inventar precisión |
| Detalle insuficiente | Carruseles, “ver más”, hilos y videos contrastados | `PARTIAL_CONTENT`; nueva captura |
| Métricas incompatibles | Nulos, aproximaciones y fecha de observación | Separar series y corregir etiquetas |
| IA alucina etiquetas o citas | Cada salida debe enlazar a evidencia existente | Rechazar anotación y revisar |
| Sentimiento falla por idioma/ironía | Evaluación anotada por clase, idioma y red | Abstención, revisión o modelo adecuado |
| Muestreo se presenta como censo | Auditoría de denominadores, límites y estados | Corregir el informe antes de entregar |

Auditar el 100 % de atribuciones de cuenta, incidencias críticas y afirmaciones delicadas usadas en conclusiones. Además, seleccionar con semilla reproducible una muestra estratificada de posts revisados automáticamente, incluyendo cada red, año y formato. El tamaño se ajustará a la tasa de error aceptable y a los resultados del piloto; no se elegirá una muestra cómoda y se la declarará suficiente sin justificación. Si aparece un error sistemático, reabrir el estrato afectado.

La muestra corresponde al control de calidad, no al universo de posts que debe recibir revisión individual. Las pruebas de build, contratos e integración se ejecutarán cuando se implemente; este documento no afirma que esos desarrollos existan o hayan pasado pruebas.

**15. Producto final que permitirá inspeccionar el trabajo**

Cada una de las 300 personas tendrá expediente con identidad y fuentes, cuentas verificadas e históricas, cronología de cinco años, publicaciones consultables una a una, métricas con fecha, temas, evolución y faltantes. Los comentarios tendrán su panel de cobertura y agregados, separado del contenido de la personalidad.

El explorador permitirá filtrar persona, red, cuenta, fecha, formato, tema, idioma, tipo de autoría y estado de revisión. Cada fila abrirá URL original, evidencia conservada, texto y multimedia disponibles, segmentos de transcripción, métricas y limitaciones. Incluirá orden por fecha y búsqueda de texto, no solo ranking por interacción.

Los informes incluirán frecuencias por día/semana/mes/año, distribución temática, continuidad de publicación, formatos y patrones documentados. Comparar interacciones dentro de la misma plataforma y condiciones compatibles; no sumar vistas de plataformas diferentes como personas únicas. Para contenido repetido, ofrecer número de publicaciones y número de piezas distintas como medidas separadas.

No calcular crecimiento histórico de seguidores sin observaciones históricas. No dividir likes actuales de un post antiguo por seguidores actuales y presentarlo como engagement de la fecha de publicación. Una serie de posts por fecha sí puede ser histórica; una serie de sus métricas actuales agrupadas por esa fecha debe decirlo expresamente.

Exportaciones: padrón y directorio CSV; posts y anotaciones JSONL/Parquet o formato tabular documentado; observaciones de métricas separadas; matriz de cobertura; incidencias; diccionario; manifiestos y versión de taxonomía/modelos. El tablero debe poder descargar el conjunto que produjo cada gráfico. El diseño detallado de UI se aborda después de cerrar los contratos de datos.

**16. Material preparado ahora y próximos pasos concretos**

Se preparan con este plan `roster.csv`, `account-leads.csv`, `discovery-tasks.csv`, `windows.csv`, `coverage-initial.csv.gz`, `scope.json`, `baseline.json` y `validation.json`. Las filas de cobertura permanecen `PENDING`, los conteos desconocidos vacíos y el avance de recolección nuevo en cero. `preparar_plan.py` permite reproducirlos desde los archivos originales y comprobar límites, claves y cardinalidades. [El cuaderno de verificación](verificacion.ipynb) permite inspeccionar línea base, integridad y estados sin consultar servicios externos. Para leer la matriz comprimida, usar un lector CSV con gzip o descomprimir una copia; no hace falta cargarla en una base de datos.

Comando reproducible desde la raíz del workspace:

```powershell
python EcomicDataCenter/docs/research/personalidades-300-cinco-anos/preparar_plan.py
```

Este comando regenera exclusivamente los artefactos de planificación de esta carpeta. No debe usarse sobre una matriz que se haya empezado a completar: la ejecución real trabajará sobre otra corrida con su propio manifiesto. Los archivos de esta carpeta son la línea base pendiente.

El primer paso de ejecución será reconciliar las tres revisiones existentes, verificar las 130 pistas, elegir el piloto de 12 personas y comprobar accesos. Después se implementarán enumeración temporal y ficha por post, sustituyendo los topes actuales como criterio de finalización. Los accesos pagos y capacidades no disponibles se presupuestarán con datos del piloto antes de comprometer recursos.

Supuestos pendientes: confirmación de profundidad de comentarios; accesos y cuotas disponibles; exigencia o no de revisión humana del 100 %; tratamiento de historias/archivos aportados; presupuesto y capacidad de almacenamiento. Ninguno autoriza a sustituir silenciosamente el objetivo por unos pocos posts populares. La meta permanece: todas las publicaciones recuperables de todas las cuentas verificadas durante el intervalo fijado, con revisión individual y límites demostrables.
