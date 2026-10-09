# Collectores de factores económicos

Desde la raíz de `EcomicDataCenter`:

```text
npx tsx scripts/exogenous/factors/collect-factors.ts
npx tsx scripts/exogenous/factors/verify-evidence.ts
npx jest --roots scripts/exogenous/factors --runInBand --runTestsByPath scripts/exogenous/factors/factor-parsers.spec.ts
```

El colector escribe únicamente `src/database/seeds/boot/exogenous-factors.json` y evidencia local bajo `artifacts/exogenous-factors`. No conecta a la base de datos, no carga variables de entorno y no altera los colectores macro existentes. La API exporta `collectFactors` y `main`; las opciones de ruta y transporte permiten pruebas aisladas.

La selección vigente tiene 39 referencias: 37 WDI anuales adaptadas al contrato de factores, ONI mensual y EFFR diario. WDI ya existe como fuente en el módulo macro: estas referencias aportan clasificación, semántica y trazabilidad temporal, no fuentes independientes ni 37 variables económicas descubiertas. `sourceSeriesKey` identifica país e indicador y evita confundir adaptaciones con fuentes adicionales.

Los tipos de medida incluyen cantidad, conteo, flujo, tasa, proporción e índice. Las relaciones con familias y secciones CIIU expresan relevancia documentada; no implican cobertura integral de cada industria. Los valores bolivianos suelen ser resultados, exposiciones o condicionantes, no causas exógenas. Todas las referencias WDI se etiquetan como aproximaciones respecto al alcance más específico del plan: las notas distinguen estadística nacional, datos de municipio, ratios, cantidades y estimaciones.

## Fuentes y permisos revisados el 4 de octubre de 2026

| Fuente            | Ruta                                                                                                             | Estado                                                                                                                                                                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WDI, fuente 2     | `https://api.worldbank.org/v2/country/{ISO3}/indicator/{id}?format=json&per_page=1000&date=2000:{year}&source=2` | `PUBLIC_REUSE_ALLOWED`: la [ficha de WDI](https://datacatalog.worldbank.org/search/dataset/0037712/world-development-indicators) identifica CC BY 4.0. Conservar atribución y notas del indicador                                                     |
| NOAA CPC ONI      | [Respuesta original](https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt)                                   | `PUBLIC_REUSE_ALLOWED`: [política NOAA/NWS](https://www.weather.gov/disclaimer), atribución y prohibición de implicar respaldo                                                                                                                        |
| New York Fed EFFR | `https://markets.newyorkfed.org/api/rates/unsecured/effr/search.json?startDate=2000-01-01&endDate={date}`        | `PENDING_REVIEW` para publicación: los [términos](https://www.newyorkfed.org/privacy/termsofuse.html) permiten uso/distribución bajo condiciones, pero exigen avisos específicos en la presentación; faltan en el producto al momento de esta captura |

El acceso anónimo no se usa como prueba de licencia. EFFR se conserva para investigación e integración, con su restricción visible. No cambiar a público hasta incluir los avisos requeridos en las presentaciones y exportaciones. Las tasas activas, pasivas y reales WDI ofrecen referencias financieras anuales publicables dentro de sus términos.

No hay observaciones bolivianas en las consultas realizadas de agua/saneamiento gestionados de forma segura (`SH.H2O.SMDW.ZS`, `SH.STA.SMSS.ZS`). No se fabricaron series vacías: el catálogo operativo selecciona los indicadores existentes de servicios básicos y lo explica en las notas. Riego presenta un histórico muy escaso; no se interpoló. `freshnessDays` es una tolerancia operacional del esquema, no edad del último dato: se deja nulo porque no se ha verificado un SLA por serie.

## Evidencia y tiempo

- `raw/{sha256}.raw`: bytes originales de cada respuesta, sin modificación. Los hashes existentes se verifican y nunca se sobrescriben.
- `status.json`: resultado por conector/serie; diferencia `UPDATED`, `FAILED_KEPT` y `FAILED_EMPTY`.
- `metrics.json`: conteos de series, valores, faltantes y fallos de la corrida.
- `manifest-summary.json`: códigos, familias, secciones, claves de fuente, licencias, motivo de bloqueo y SHA-256 del archivo de semilla.
- `revisions.jsonl`: revisiones semánticas capturadas localmente. Cada registro nuevo, versión 2, conserva metadatos y puntos modificados de los estados anterior y actual antes de reemplazar la semilla. Los registros anteriores de versión 1 no se transforman ni se presentan como si conservaran esos metadatos completos.

`publishedAt` permanece nulo: ni el período estadístico, ni `lastupdated` del dataset, ni la fecha de vigencia EFFR demuestran la publicación de esa revisión. `firstSeenAt` corresponde a la captura real; se conserva únicamente si coinciden la definición semántica de la serie y el valor, estado y extracto de la fila. Cambios de unidad, geografía, frecuencia, clasificación, fuente, nota, objetivo u otros metadatos crean una revisión con el tiempo de captura nuevo aunque el valor siga igual. Reordenar familias o sectores no crea una revisión; tampoco cambiar sólo la ventana de consulta de la misma ruta de fuente. A → B → A recibe un nuevo tiempo aunque regrese al valor original. Un cambio de hash global que no altera la fila ni la definición conserva su primera observación. Nunca se retrofecha el conocimiento a enero de un dato anual.

ONI es una media móvil de tres meses etiquetada por mes central; no es una observación de lluvia local. No se añaden fines de semana a EFFR. Los nulos publicados por WDI se preservan como `MISSING`; ceros y negativos se conservan como valores. Los parsers rechazan identidad equivocada, páginas parciales, períodos duplicados, filas malformadas y pronósticos sin clasificación.

Hay como máximo dos intentos por descarga para fallos transitorios, cada uno con timeout de 25 segundos. La pausa NOAA es de 60 segundos por su política; las demás son de 1,5 segundos. Un error permanente o de validación no provoca reintentos. Cada fuente fallida conserva la última serie válida completa y su fecha de captura. Una corrida parcial escribe estado explícito y sale con código 2; si no existe ninguna serie válida, no reemplaza la semilla y termina con error.

`verify-evidence.ts` reproduce sin red los parsers sobre los bytes capturados y compara todos los puntos con la semilla. Los archivos de evidencia son locales; para trasladar el verificador a otro equipo deben trasladarse también esos snapshots. El repositorio no debe afirmar que validó originales ausentes.
