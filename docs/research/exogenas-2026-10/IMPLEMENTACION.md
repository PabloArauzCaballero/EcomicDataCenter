# Implementación de variables exógenas: estado y operación

Estado documentado el 4 de octubre de 2026. Se implementaron el contrato de datos, la persistencia, la captura, el catálogo y la consulta del primer incremento del plan. **El plan completo de 287 familias no está terminado:** el producto permite distinguir las familias que ya tienen series vinculadas de las que continúan en investigación.

No se aplicaron estos cambios a una base de producción ni se realizó un despliegue. Las verificaciones de PostgreSQL utilizaron una instancia aislada. Los comandos de migración y siembra que aparecen más abajo son instrucciones operativas; su presencia en esta guía no significa que se hayan ejecutado sobre la base del usuario.

## 1. Qué está disponible

| Medida | Resultado de esta implementación | Interpretación |
|---|---|---|
| Familias del plan incorporadas al catálogo | 287 | Inventario de investigación, no 287 series funcionando |
| Familias con alguna serie pública vinculada en el snapshot final de la API | 44 | Vinculación parcial; no demuestra cobertura de todos los componentes de cada familia |
| Familias sin serie pública vinculada | 243 | Permanecen visibles como investigación |
| Series públicas presentadas por la API en ese snapshot | 208 | 170 series heredadas y 38 referencias del nuevo contrato |
| Referencias capturadas por el nuevo colector | 39 | 37 adaptaciones anuales de WDI, ONI mensual y EFFR diario |
| Puntos de la semilla de factores | 7.879 | 7.787 valores y 92 faltantes explícitos |
| Referencias nuevas del contrato con reutilización pública habilitada | 38 | 37 WDI y ONI |
| Referencia capturada con publicación pendiente | EFFR | Sus 6.597 observaciones están en la semilla de investigación; quedan excluidas del snapshot público |
| Frecuencias nativas de las 39 referencias | 37 anuales, 1 mensual y 1 diaria | No se interpolaron anuales ni se rellenaron fines de semana |
| Familias y secciones vinculadas por el colector nuevo | 22 familias; 10 secciones | A, D, E, G, J, K, L, P, Q y T. No se atribuyó cobertura artificial de las 21 secciones |

Los indicadores WDI ya pertenecían a las fuentes usadas por el módulo macroeconómico. Este trabajo los adapta al contrato de factores, añade correspondencia con el plan, clasificación económica y temporalidad verificable. **No son 37 fuentes independientes ni 37 variables completamente nuevas.** La clave `sourceSeriesKey` identifica país e indicador y ayuda a reconocer esta reutilización.

Los conteos de la API corresponden al snapshot final validado en esta entrega. Una base con otro estado de siembra puede producir conteos diferentes; una ejecución futura del colector puede ampliar o revisar observaciones. La existencia de una serie vinculada no demuestra causalidad ni exogeneidad respecto de cualquier resultado.

## 2. Componentes implementados

| Capa | Implementación | Alcance actual |
|---|---|---|
| Contrato de datos | [Esquema de factores](../../../src/database/seeds/schemas/exogenous-factors.schema.ts) | Tipos de medida, frecuencia, unidad, geografía, rol, objetivo, licencia, estado y tiempos por observación |
| Captura | [Colector y conectores](../../../scripts/exogenous/factors/collect-factors.ts) | WDI, NOAA ONI y New York Fed EFFR; timeout, reintento acotado, evidencia y conservación de últimos datos válidos |
| Semilla | [exogenous-factors.json](../../../src/database/seeds/boot/exogenous-factors.json) | 39 referencias; un estado actual por período, con procedencia y tiempo de primera captura de esa revisión |
| Persistencia | [Runner de factores](../../../src/database/seeds/runners/boot-seed.exogenous-factors.ts) | Inserción e idempotencia de observaciones, evidencias y afirmaciones conforme al contrato |
| Lectura de revisiones | [Migración 0101](../../../src/database/migrations/0101-read-exogenous-factor-versions.ts) | Vistas `read_models.exogenous_factor_version` y `read_models.exogenous_legacy_version`, índice y permisos de lectura contemplados por la migración |
| Catálogo y snapshots | [Sincronizador](../../../scripts/exogenous/build-factor-catalogue.mjs) | Exporta familias, snapshot público de factores y snapshot de series heredadas al dashboard |
| API de catálogo | `GET /api/exogenas/catalogo` | Familias, series vinculadas, búsqueda, filtros y paginación |
| API de historia | `GET /api/exogenas/factores` | Detalle histórico, paginación, consulta `asOf` y CSV |
| Interfaz | Modo “Factores por sector” dentro del módulo de exógenas | Búsqueda, sectores, familias, disponibilidad, fuentes, historia, fecha de corte y comparación de dos series de la misma familia; se conserva el modo de precios existente |
| Asistente | Integración con el catálogo y consulta de factores | Acceso a información trazable; no motor causal ni recomendación basada en modelos calibrados |
| Automatización | Lote `factores` de [daily-source-batches.yml](../../../.github/workflows/daily-source-batches.yml) | Captura, validación de semilla, artefactos y advertencia ante fallos parciales |

El dashboard puede consultar las vistas de la base o recurrir a los snapshots cuando faltan las vistas (`42P01`) o hay un problema de conectividad, mostrando las advertencias correspondientes. Un error de permisos (`42501`) no debe ocultarse con un fallback. Esta recuperación permite revisar la funcionalidad sin afirmar que la migración o la siembra de la base productiva ya ocurrieron. Tampoco reconstruye revisiones que nunca fueron capturadas.

## 3. Fuentes, permisos y límites concretos

**WDI:** la ficha del [World Development Indicators](https://datacatalog.worldbank.org/search/dataset/0037712/world-development-indicators) identifica licencia CC BY 4.0. La semilla conserva atribución y URL. Incluye salud, educación, demografía, conectividad, remesas, energía, agricultura, agua, crecimiento de socios y tasas financieras anuales. Se muestran como estadística nacional o aproximaciones al objetivo específico del plan; no como datos municipales o por empresa.

**NOAA ONI:** se capturó la [respuesta original de CPC](https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt). ONI es una media móvil de tres meses etiquetada por su mes central; no una observación de lluvia boliviana ni un trimestre calendario. La [política NOAA/NWS](https://www.weather.gov/disclaimer) permite reutilización con condiciones de atribución y sin sugerir respaldo oficial.

**EFFR:** la fuente es la API pública del Federal Reserve Bank of New York. Sus [términos de uso](https://www.newyorkfed.org/privacy/termsofuse.html) incluyen condiciones y avisos específicos para presentar o redistribuir tasas de referencia. Se mantiene `PENDING_REVIEW` porque esos avisos aún no están integrados en todas las presentaciones y exportaciones del producto. El acceso público a una API no equivale a permiso incondicional. Las tasas activa, pasiva y real WDI están disponibles como referencias financieras anuales; no sustituyen la frecuencia ni el significado de EFFR.

Las consultas bolivianas de agua y saneamiento gestionados de forma segura no devolvieron observaciones utilizables. Se reutilizaron los indicadores de servicios básicos, dejando explícita la diferencia. La serie de superficie agrícola irrigada tiene cobertura escasa. Los vacíos no se rellenaron con cero ni con interpolaciones.

## 4. Temporalidad y significado de `asOf`

- `period` identifica cuándo se refiere la medición.
- `publishedAt` se conserva nulo cuando no hay evidencia de la publicación de esa revisión. No se usa `lastupdated` de WDI ni la fecha del período para inventarlo.
- `firstSeenAt` identifica la primera captura real de la revisión actual. No se retrofecha al año de una observación histórica.
- `retrievedAt` registra la recuperación de los datos; descargar otra vez no vuelve nuevo un valor sin cambios.
- A → B → A recibe un nuevo tiempo de conocimiento al regresar a A. Un cambio de hash del archivo global que deja intactas la fila y su definición no cambia su primera captura semántica.
- Una corrección de unidad, geografía, frecuencia, clasificación, fuente, nota, objetivo u otros metadatos semánticos recibe el tiempo de captura nuevo aunque el valor siga igual. Reordenar listas de familias o sectores y cambiar sólo la ventana de consulta de la misma ruta no crea una revisión.
- `freshnessDays` es una tolerancia operacional del contrato, no la edad calculada del dato. Se deja nula en estas referencias porque no hay un SLA verificado por serie.

Las vistas y consultas seleccionan la revisión disponible a la fecha de corte. Si una observación de 2000 se capturó por primera vez en octubre de 2026 y no hay fecha de publicación comprobada, no se presenta como conocida por el sistema en 2000. Por eso un corte anterior a la primera captura puede devolver una historia vacía: es un límite explícito del conocimiento documentado.

El snapshot contiene el estado actual capturado. La base puede conservar las revisiones que efectivamente recibió en sucesivas siembras. Los registros nuevos de `revisions.jsonl`, versión 2, guardan los metadatos y los puntos modificados de los estados anterior y actual antes de reemplazar la semilla; los registros históricos de versión 1 no se presentan como si incluyeran esos metadatos completos. **Todavía falta importar de manera durable todas las revisiones intermedias capturadas localmente antes de la siembra.** Si hubo A → B → C entre dos cargas a base y sólo se siembra la semilla final, B permanece en el registro local de captura pero no queda automáticamente incorporada a la historia SQL.

La autorización pública se evalúa también sobre el estado actual de licencia. Una referencia que pase a `PENDING_REVIEW` o `RESTRICTED` deja de exponer su historia pública, incluso al consultar un corte anterior. Una revisión antigua que llegue tarde no restaura ese permiso.

## 5. Operación local

Los comandos de este apartado se ejecutan desde `EcomicDataCenter`, salvo que se indique otro directorio. No requieren cambiar archivos de entorno para capturar fuentes públicas.

### Capturar, validar y sincronizar el producto

```powershell
yarn exogenous:factors
yarn db:seed:validate
npx tsx scripts/exogenous/factors/verify-evidence.ts
yarn exogenous:catalogue
```

`exogenous:factors` escribe la semilla y evidencia local. `db:seed:validate` valida los archivos de semillas configurados, por lo que un fallo puede provenir de otro catálogo. `verify-evidence.ts` reproduce los parsers sin red contra los bytes originales capturados. `exogenous:catalogue` sincroniza catálogo y snapshots hacia `observatorio-dashboard/src/data`; filtra las referencias que no tienen reutilización pública habilitada.

La captura hace como máximo dos intentos por descarga transitoria, con timeout de 25 segundos por intento. NOAA exige una pausa de 60 segundos ante errores; los demás conectores usan 1,5 segundos. Errores permanentes y respuestas inválidas no se ocultan mediante reintentos ilimitados.

| Resultado del colector | Semilla y estado |
|---|---|
| Todas las fuentes válidas | Actualiza, registra métricas y termina con código 0 |
| Alguna fuente falla y existe versión válida anterior | Conserva esa serie completa y sus tiempos; informa `FAILED_KEPT` y salida 2 |
| Fuente sin datos previos y fallida | Informa `FAILED_EMPTY`; no crea observaciones ficticias |
| Ninguna fuente válida y ninguna semilla anterior | No reemplaza la semilla y termina con error |

Consultar `artifacts/exogenous-factors/status.json`, `metrics.json` y `manifest-summary.json` después de cada ejecución. El último archivo lista códigos, familias, secciones, claves de fuente, estado de licencia y SHA-256 de la semilla. `raw/{sha256}.raw` conserva las respuestas originales; `revisions.jsonl` registra revisiones capturadas. Trasladar sólo la semilla a otra máquina no traslada automáticamente estos originales.

### Migración y siembra de una base elegida para operación

Estos comandos **no se ejecutaron contra producción en esta entrega**. Actúan sobre la base que ya tenga configurada el entorno desde el que se lancen:

```powershell
yarn db:migrate
yarn db:seed:boot --only=exogenous-factors
```

`db:migrate` aplica las migraciones pendientes del proyecto, no exclusivamente la 0101. La siembra selectiva carga el catálogo de factores; no sustituye las siembras previas de precios, aduana o monedas. La opción `--only=exogenous-factors` permite evitar una recarga general de catálogos.

No ejecutar estos comandos para “probar la interfaz” si sólo se necesita el snapshot local. El estado de la base debe comprobarse por sus migraciones y conteos reales; el éxito del build no lo demuestra.

### Consultar la API

Con el dashboard local en ejecución, las siguientes rutas ilustran consultas de lectura:

```text
/api/exogenas/catalogo?sector=A&availability=available&page=1&pageSize=24
/api/exogenas/catalogo?q=agua&availability=research
/api/exogenas/factores?series=EXF_NOAA_ONI&from=2000&to=2026&asOf=2026-10-04
/api/exogenas/factores?series=EXF_WDI_BOL_FR_INR_LEND&from=2000&to=2026&format=csv
```

El catálogo admite búsqueda, sector, mecanismo, prioridad, rol y disponibilidad. La historia admite serie, años, corte y cursor; el tamaño máximo de página es 2.000 puntos. La exportación CSV tiene límite de 20.000 puntos por consulta y conserva metadatos y advertencias. Un corte escrito como fecha se interpreta al final de ese día UTC, limitado por el momento actual. Fechas futuras o calendarios inválidos se rechazan.

### Comparar dos series

La interfaz permite elegir dos series de la misma familia y aplica el mismo corte temporal a ambas. Recupera todas las páginas hasta un máximo de 20.000 puntos por serie; muestra las unidades y permite volver a los valores originales. Los niveles requieren unidades y tipos de medida compatibles. La base 100 utiliza un período común con valores positivos; se rechaza para anomalías como ONI. Para tasas y proporciones se ofrece cambio absoluto en su unidad, por ejemplo puntos porcentuales cuando la unidad original es porcentaje. Estas transformaciones no demuestran causalidad ni convierten frecuencias diferentes en mediciones equivalentes.

## 6. Verificaciones realizadas

| Componente | Resultado confirmado | Límite de la evidencia |
|---|---|---|
| Backend: contrato, runner y parsers (`test:exogenous`) | 47 pruebas aprobadas | Incluyen las 26 del colector indicadas abajo; no deben sumarse otra vez ni equivalen a una carga en producción |
| Vistas e integración SQL | 9 pruebas aprobadas en PostgreSQL aislado | Incluyen control de licencia actual, revisiones y llegadas tardías; no modifican la base operativa del usuario |
| Colector | 26 pruebas aprobadas | Identidad, nulos, negativos, temporadas, revisión A → B → A, cambios de metadatos sin retrofecha, orden de listas, registro anterior/actual, hash global, reintentos y conservación ante fallos |
| Evidencia de captura | 7.879 puntos reproducidos contra bytes originales | Los originales se conservan localmente; requieren archivo durable para retención prolongada |
| Captura final | 39 referencias actualizadas; cero fallos finales | Una captura futura puede fallar o revisar valores; el estado debe consultarse cada vez |
| Backend: build | Aprobado | No demuestra despliegue ni migración aplicada |
| Dashboard: pruebas enfocadas (`test:exogenous`) | 31 pruebas aprobadas | Incluyen comparaciones y utilidades temporales; no son una auditoría completa de toda la aplicación |
| Dashboard: conjunto unitario (`test:unit`) | 110 pruebas aprobadas | Incluye las 31 enfocadas; no deben sumarse otra vez ni sustituye pruebas integrales de todos los flujos |
| Navegador y accesibilidad | Smoke del flujo y comparación: valores originales, base 100, cambio absoluto de tasas y recuperación tras error; axe reportó cero incidencias en el alcance probado | No constituye certificación universal de accesibilidad |
| Responsive | Flujo revisado a 390 y 1.280 píxeles | No cubre todas las combinaciones de navegador y dispositivo |
| Dashboard: build de producción | Aprobado; servidor standalone local y consultas HTTP de catálogo, historia y CSV comprobados | No demuestra despliegue; se observaron advertencias ajenas a este cambio |

Las capturas del flujo están en `observatorio-dashboard/output/playwright/exogenous-factor-mobile.png` y `exogenous-factor-desktop.png`. Los resultados anteriores fueron comprobados por el equipo durante esta implementación; no deben reinterpretarse como pruebas ejecutadas en producción.

También se comprobó el servidor local generado por el build de producción: comparación Brent/WTI de 321 puntos por serie, base común en enero de 2000, vista móvil de 390 píxeles sin desbordamiento ni errores de ejecución o consola. Las capturas están en `observatorio-dashboard/output/playwright/exogenous-production-comparison-mobile*.png`. Ejecutar este build localmente no equivale a desplegarlo en un servicio de producción.

Comandos de verificación relevantes:

```powershell
# En EcomicDataCenter
yarn test:exogenous
npx tsx scripts/exogenous/factors/verify-evidence.ts
yarn typecheck
yarn build

# En observatorio-dashboard
npm run test:exogenous
npm run test:unit
npm run typecheck
npm run build
```

Las pruebas SQL usan Docker con una instancia aislada e ignoran la configuración de la base operativa. Se activan explícitamente desde `EcomicDataCenter`:

```powershell
$env:RUN_EXOGENOUS_DOCKER_TEST = '1'
yarn jest --config test/jest-integration.json --runInBand test/integration/exogenous-factors.integration-spec.ts
```

## 7. Automatización y conservación de evidencia

El workflow incorpora el lote `factores`, disponible por programación y selección manual. Ejecuta las pruebas antes de la captura y valida la semilla; conserva una semilla válida aunque una fuente falle y publica una advertencia de fallo parcial. Se configuraron artefactos de semilla por 14 días y de evidencia por **90 días**. La captura fallida no habilita inventar datos ni borra los anteriores. La sincronización de las copias incluidas en el dashboard es un paso separado: `yarn exogenous:catalogue`, mediante `tsx`, requiere ambos repositorios en la disposición local descrita. El workflow del backend no publica cambios en el repositorio del dashboard; las actualizaciones operativas se leen de la base una vez sembradas.

La configuración del workflow está implementada, pero esta entrega no afirma que se haya lanzado una ejecución remota de GitHub Actions. El archivo local de evidencia y la retención temporal de Actions **no son todavía un archivo permanente de vintages**. Falta conectar almacenamiento durable con integridad verificable, política de retención, referencias estables e importación de revisiones intermedias a la base.

## 8. Trabajo pendiente respecto del plan completo

| Frente | Pendiente concreto | Criterio de terminación |
|---|---|---|
| Cobertura de las 287 familias | Investigar y conectar el resto; completar las familias vinculadas parcialmente | Fuente, identidad, licencia, unidad, geografía, frecuencia, evidencia y objetivo verificados por serie |
| Comparación de factores | Ampliar la comparación ya implementada de dos series de la misma familia cuando exista un caso de uso y compatibilidad documentada | Nuevos modos probados con unidades y escalas explícitas y posibilidad de volver al dato original |
| Modelos y backtesting | Pronósticos por caso de uso, bases de comparación, validación temporal y aporte incremental de grupos de drivers | Resultados fuera de muestra con revisiones disponibles en cada fecha y límites expuestos |
| Escenarios y mecanismos | Costos técnicos, recetas, shocks compuestos, eventos, mediación y propagación sectorial | Supuestos calibrados, unidades coherentes, sensibilidad y ausencia de falsa causalidad |
| Exposición territorial | Pesos anteriores al shock, cuencas, cultivos, redes, plantas y dependencias de insumos | Cobertura espacial auditada y versionada, sin simular precisión municipal |
| Licencias | Avisos de EFFR y revisión específica de otras candidatas, incluidos datos de terceros | Permisos y atribución implementados en pantalla, API y exportaciones |
| Clasificación económica | Crosswalk formal hacia CIIU Rev. 5 y revisión de correspondencias sectoriales | Tabla versionada y auditada; las correspondencias editoriales Rev. 4 actuales no se hacen pasar por codificación oficial |
| Historia durable | Archivo permanente de originales y recuperación de todas las revisiones capturadas antes de la siembra | Replay completo desde almacenamiento durable y conciliación captura → base por revisión |
| Operación | Verificar migración, siembra y monitoreo en el entorno que corresponda | Conteos y permisos de esa base comprobados; no basta el fallback de snapshots |
| Entrega | Revisión y eventual publicación por el flujo del proyecto | Builds ya aprobados; despliegue documentado sólo cuando ocurra |

Este incremento hace revisable y operable la primera parte del plan: separa investigación de datos vinculados, conserva procedencia, permite cortes temporales y abre consulta sectorial. La disponibilidad de 208 series públicas no sustituye el trabajo pendiente de completar fuentes, exposiciones, modelos y decisiones por cada cadena.
