# ABI: noticias y menciones de emisores BBV

Implementación y corte inicial: 4 de octubre de 2026. ABI es una fuente periodística adicional; sus declaraciones no modifican estados financieros ni hechos relevantes de la BBV.

## Cobertura comprobada

| Conjunto | Resultado al corte |
| --- | ---: |
| Publicaciones de WordPress descargadas | 8.681 |
| URLs de noticias en los sitemaps | 8.681 |
| URLs del sitemap sin publicación descargada | 0 |
| Publicaciones rechazadas al normalizar | 0 |
| Publicaciones históricas completas | 1.080 |
| URLs históricas inventariadas | 1.080 |
| Total de publicaciones normalizadas | 9.761 |
| Publicaciones con autor o cuenta editorial indicada | 9.761 |
| Publicaciones con imagen catalogada | 8.675 |
| Publicaciones con menciones de emisores | 457 |
| Códigos de emisores encontrados | 44 |
| Fechas locales/GMT incompatibles en la fuente | 85 |

El sitio actual está reconciliado con sus sitemaps al corte. Las 1.080 fichas históricas descubiertas tienen cuerpo descargado. **La hemeroteca histórica todavía no está completa:** continúa la paginación de categorías y el descubrimiento de rutas por alias. `legacy-coverage.json` informa los documentos descargados, los pendientes entre los ya descubiertos y las categorías cuya paginación falta terminar. Los pendientes descubiertos no equivalen al tamaño total de la hemeroteca.

## Radiografía técnica

- Actual: WordPress, API pública `https://abi.bo/wp-json/wp/v2/posts`, páginas de hasta 100 publicaciones, cabeceras `X-WP-Total` y `X-WP-TotalPages`. Se consulta contenido completo y metadatos, no solamente el RSS. La selección `_fields` incluye `_links` y `_embedded` para que WordPress entregue el autor y la imagen destacada; el recolector aborta si faltan las relaciones solicitadas.
- Taxonomías: endpoints `categories` y `tags`, con paginación completa. Se preservan identificador, nombre y slug normalizados; las respuestas originales conservan además descripciones, padres y enlaces.
- Descubrimiento alternativo: `https://abi.bo/sitemap_index.xml` y sus nueve sitemaps de publicaciones en el corte inicial. RSS `https://abi.bo/feed/` como evidencia adicional de actualidad.
- Histórico: Joomla en `https://historico.abi.bo`, índice público de categorías y fichas de artículos. Se leen `articleBody`, `datePublished`, firma y categoría.
- Hallazgo importante: Joomla acepta `limit=1000` y devuelve paginación con saltos de 1000, pero el HTML visible contiene solamente diez enlaces. El recolector usa `limit=10` y verifica diez enlaces antes de avanzar una página no final. Los primeros ensayos con límite 1000 se conservaron como evidencia, pero se descartaron del inventario válido.
- El índice inicial cubre Gobierno, Política, Economía, Sociedad, Seguridad, Culturas, Internacional, Deportes, Escritores y Galería. Rutas por alias como Reportajes/Columnistas requieren completar su descubrimiento antes de declarar exhaustividad global.
- Se consultan `robots.txt`, se permiten exclusivamente hosts ABI por HTTPS y se rechazan redirecciones inesperadas. Pausa mínima de 700 ms entre solicitudes, cuatro intentos y límite de respuesta de 30 MB.

## Datos granulares

Cada publicación conserva identidad estable (`abi:wp:id` o `abi:legacy:id`), URL original y canónica, título, resumen, HTML y texto, disponibilidad del cuerpo, fecha declarada/local/GMT, fecha de modificación, categorías, etiquetas, autor, imágenes con texto alternativo, enlaces y documentos referenciados, lugar/fecha del encabezamiento, temas, cantidades textuales con contexto, menciones de empresas con posición y fragmento, versión del parser, fecha de consulta y huellas SHA-256.

El campo `autor` reproduce el usuario editorial o la firma que la propia ABI expone. Por ejemplo, el usuario `admin` de WordPress no identifica por sí mismo a la persona que redactó una noticia. No debe presentarse como atribución periodística verificada.

Las cantidades permanecen como expresiones de la fuente; no se convierten automáticamente en indicadores económicos verificados. Las imágenes y documentos se catalogan por URL; no se han descargado todos los archivos binarios enlazados ni realizado OCR. El HTML original se conserva para futuros extractores.

## Atribución a empresas

El catálogo parte de 135 códigos presentes en el archivo de hechos relevantes BBV existente y sus nombres históricos, más alias explícitos. No constituye un certificado de vigencia bursátil actual.

- Coincidencia exacta por nombre/alias, con límites de palabra y normalización de acentos.
- `HEADLINE`: nombre presente en el título. `MENTION`: nombre encontrado en el cuerpo. Son posiciones de la mención, no roles jurídicos o comerciales inferidos.
- Nunca se asigna una filial por una mención genérica a YPFB o ENDE.
- Apellidos solos, como Ovando, no se convierten automáticamente en nombres de empresas.
- Temas por reglas léxicas: financiamiento, inversión, resultados, gestión, operaciones, regulación, conflictos y acuerdos. Son etiquetas orientativas; no son un modelo de impacto bursátil ni sentimiento validado.
- Las republicaciones con identificadores diferentes se conservan. No se debe interpretar su número como cantidad de eventos económicos independientes. Falta una consolidación semántica de eventos entre ambas ediciones.

## Ejecución

Desde la raíz del núcleo:

```sh
yarn test:abi
yarn press:abi --full           # Primera captura o reconciliación completa
yarn press:abi                  # Ventana incremental con tres días de solapamiento
yarn press:abi --offline        # Reconstrucción con evidencia ya descargada
yarn press:abi:historical --max-pages=200 --max-details=500
yarn press:abi --offline
yarn db:migrate
yarn db:seed:boot --only=abi-news
```

El histórico guarda su avance después de cada listado y cada veinte fichas. `--max-pages=0` permite completar cuerpos del inventario existente sin buscar más listados. `--issuer-only` limita cuerpos a titulares con coincidencia; el modo predeterminado descarga todos los cuerpos de la tanda, priorizando esos titulares. La captura exhaustiva necesita sucesivas tandas, revisar alias de categorías y reconciliar cambios en la paginación.

La recolección incremental actual guarda `pending-wordpress.json`. Si la fuente cambia el total durante una ventana, se detiene explícitamente; antes de reiniciar desde cero, conservar ese checkpoint como evidencia y retirar solamente su estado de continuación. No borrar el directorio de evidencias. La desaparición de una noticia de la fuente se registra como diferencia de inventarios: no elimina automáticamente evidencia anterior.

## Persistencia y consulta

- `src/database/seeds/boot/abi-news/evidence/*.gz`: respuestas públicas originales comprimidas; huella calculada sobre los bytes descomprimidos.
- `articles/*.json`: fragmentos mensuales, máximo 1.000 publicaciones. `manifest.json` contiene la lista autoritativa de archivos cargables.
- `wordpress.json`, `taxonomy.json`, `sitemaps.json`, `rss.json`: inventarios de capturas.
- `legacy-inventory.json`, `legacy-coverage.json`, `legacy-articles/`: continuación y cobertura histórica.
- Migración TEST **0103**: `abi_article`, `abi_article_snapshot`, `abi_company_mention`, índices y función de actualización con permisos controlados.
- Ingesta en `raw_observation`, `fact_claim`, `claim_evidence` y `source_artifact`; huella del contenido independiente de la hora de descarga. Cambios publican una nueva versión y marcan la anterior como sustituida. Una restauración de contenido anterior reactiva su evidencia original.
- La carga ABI actualiza su snapshot inmediatamente, antes de otros catálogos lentos. La actualización de prensa general puede tardar varios minutos adicionales.
- Incluido en el manifiesto de semillas, carga de arranque, administración y activos del build Nest; las evidencias gzip viajan en la imagen.

Tablero: **Empresas → Bolsa de valores (BBV) → Noticias ABI**. También existe el botón «Noticias ABI del emisor» en cada hecho relevante con código. Filtros por emisor, palabras, fechas, tema, edición y posición de mención, paginación y exportación CSV/JSON de la selección. Límite de exportación: 10.000 resultados; una selección mayor devuelve un error explícito.

API: `/api/noticias-empresas?emisor=BUN&desde=2026-01-01&hasta=2026-10-04&rol=HEADLINE`. Parámetros opcionales: `q`, `tema`, `edicion`, `pagina`, `formato=csv|json`. SQL parametrizado, validación de fechas reales y protección de fórmulas en CSV. HTML editorial no se ejecuta en el navegador.

## Automatización y comprobaciones

El lote `abi` queda incorporado a `daily-source-batches.yml`, separado del lote general de prensa. Conserva el último corpus si falla la captura. Ese workflow existente opera sobre `dev`; publicar únicamente en TEST no activa por sí solo el cron de la rama por defecto. La captura histórica se ejecuta por tandas explícitas.

Verificaciones realizadas antes de publicar: seis pruebas del núcleo (atribución, límites de palabra, fechas, cantidades, parser histórico y metadatos embebidos), tres pruebas de filtros/exportación, TypeScript del núcleo y tablero, build del núcleo con evidencias gzip, migraciones y carga en PostgreSQL 17 aislado, recarga sin duplicados. La carga final local confirmó 9.761 artículos, 457 con empresas, 9.761 con autor/cuenta y 8.675 con imagen. Los resultados del despliegue y pruebas de navegador se consignan en la entrega.

Para comprobar la base tras cargar:

```sql
SELECT count(*) FROM read_models.abi_article_snapshot;
SELECT count(DISTINCT article_key), count(DISTINCT filer_code)
FROM read_models.abi_company_mention;
SELECT article ->> 'dateQuality', count(*)
FROM read_models.abi_article_snapshot GROUP BY 1;
```

No confundir servicio saludable con corpus cargado: verificar además el endpoint con un emisor, el número de artículos, su procedencia y una exportación.
