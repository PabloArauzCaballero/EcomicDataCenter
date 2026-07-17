# Modelo de datos final
## Core del Data Center Económico de Bolivia

## 1. Resultado de la revisión final

El modelo final contiene **40 entidades lógicas**. La ampliación respecto de versiones anteriores no agrega casos de uso innecesarios: corrige vacíos estructurales que afectarían la interpretación y trazabilidad del dato.

### Cambios decisivos

1. **SDMX 3.1 como referencia actual:** se separan dimensiones, medidas y atributos.
2. **Medidas múltiples:** el valor no reside directamente en `observation`; reside en `observation_measure`.
3. **Revisiones históricas:** `observation_revision` conserva cada publicación o corrección.
4. **Versionado completo:** clasificaciones, metodologías, datasets e indicadores tienen versiones propias.
5. **Lotes y artefactos:** se separa la operación de ingreso del archivo o respuesta original.
6. **Clasificaciones comparables:** `classification_mapping` permite relacionar versiones sin fingir equivalencia exacta.
7. **Calidad verificable:** las reglas producen evaluaciones e incidencias.
8. **Linaje explícito:** los datos derivados conservan insumos y fórmula.
9. **Rupturas de serie:** la comparabilidad se registra formalmente.
10. **Naturaleza del dato:** se distingue estadística oficial, registro administrativo, cálculo del observatorio, estimación académica, experimental, pronóstico y escenario.

## 2. Núcleo obligatorio y extensión institucional

### 32 entidades obligatorias

Son necesarias para registrar y consultar cifras correctamente:

- procedencia;
- semántica y catálogos;
- metadatos;
- estructura multidimensional;
- indicadores;
- series;
- observaciones;
- revisiones;
- medidas y atributos.

### 8 entidades institucionales

Son necesarias para operar frente a expertos y organismos públicos:

- `classification_mapping`;
- `quality_dimension`;
- `quality_rule`;
- `quality_assessment`;
- `data_issue`;
- `lineage_relation`;
- `indicator_relation`;
- `series_break`.

## 3. Catálogo de entidades

| N.º | Grupo | Entidad | Responsabilidad |
|---:|---|---|---|
| 1 | Procedencia | `organization` | Institución productora, propietaria, aportante o participante. |
| 2 | Procedencia | `source` | Fuente concreta publicada o administrada por una institución. |
| 3 | Procedencia | `source_artifact` | Archivo, respuesta API, XML, PDF u objeto original inmutable. |
| 4 | Procedencia | `data_entry_batch` | Operación individual o masiva mediante la que ingresan datos. |
| 5 | Semántica | `statistical_domain` | Jerarquía temática económica y social. |
| 6 | Semántica | `concept` | Definición reutilizable de conceptos estadísticos. |
| 7 | Semántica | `code_list` | Lista controlada y versionada de códigos. |
| 8 | Semántica | `code_item` | Valor permitido dentro de una lista. |
| 9 | Semántica | `classification` | Familia de clasificación estadística. |
| 10 | Semántica | `classification_version` | Edición o versión temporal de una clasificación. |
| 11 | Semántica | `classification_item` | Categoría jerárquica de una versión. |
| 12 | Semántica | `classification_mapping` | Correspondencia entre categorías de versiones o sistemas. |
| 13 | Semántica | `geographic_unit` | Territorio jerárquico y temporalmente válido. |
| 14 | Semántica | `unit_measure` | Unidad, símbolo, multiplicador y tipo de valor. |
| 15 | Semántica | `frequency` | Frecuencia temporal normalizada. |
| 16 | Metadatos | `statistical_operation` | Encuesta, censo, registro, índice o compilación que origina datos. |
| 17 | Metadatos | `methodology` | Identidad estable de una metodología. |
| 18 | Metadatos | `methodology_version` | Versión documentada y vigente de la metodología. |
| 19 | Metadatos | `dataset` | Producto estadístico estable. |
| 20 | Metadatos | `dataset_version` | Versión metodológica o estructural del producto. |
| 21 | Metadatos | `data_structure` | Definición de componentes de un cubo estadístico. |
| 22 | Metadatos | `dimension_definition` | Dimensión identificadora o temporal. |
| 23 | Metadatos | `measure_definition` | Medida reportada: valor, límite, error, muestra, etc. |
| 24 | Metadatos | `attribute_definition` | Atributo calificativo: estado, confidencialidad, ajuste, etc. |
| 25 | Estadística | `indicator` | Identidad conceptual del indicador. |
| 26 | Estadística | `indicator_version` | Definición, fórmula, unidad y frecuencia vigentes. |
| 27 | Estadística | `dataset_indicator` | Indicadores contenidos en una versión de dataset. |
| 28 | Estadística | `series` | Combinación única de dimensiones no temporales. |
| 29 | Estadística | `series_dimension_value` | Valor de cada dimensión de una serie. |
| 30 | Estadística | `observation` | Identidad de la observación para un periodo. |
| 31 | Estadística | `observation_revision` | Publicación, corrección o vintage de una observación. |
| 32 | Estadística | `observation_measure` | Valores medidos de una revisión. |
| 33 | Estadística | `observation_attribute_value` | Atributos aplicados a una revisión. |
| 34 | Calidad | `quality_dimension` | Dimensión de calidad, por ejemplo coherencia u oportunidad. |
| 35 | Calidad | `quality_rule` | Regla automática o verificable. |
| 36 | Calidad | `quality_assessment` | Resultado de aplicar una regla. |
| 37 | Calidad | `data_issue` | Incidencia investigable y resoluble. |
| 38 | Linaje | `lineage_relation` | Relación de procedencia o transformación entre objetos. |
| 39 | Comparabilidad | `indicator_relation` | Dependencia conceptual o matemática entre indicadores. |
| 40 | Comparabilidad | `series_break` | Ruptura metodológica o estructural de una serie. |

## 4. Reglas de integridad indispensables

### Identidad de serie

```text
UNIQUE(dataset_version_id, series_key_hash)
```

La clave se calcula a partir de los valores dimensionales en el orden definido por `dimension_definition.position_no`.

### Identidad de observación

```text
UNIQUE(series_id, period_start, period_end)
```

Una observación identifica un periodo; sus publicaciones se almacenan como revisiones.

### Revisión actual

```text
UNIQUE(observation_id) WHERE is_current = true
```

Debe implementarse mediante índice parcial PostgreSQL.

### Valor dimensional exclusivo

En `series_dimension_value` debe existir exactamente uno entre:

- `code_item_id`;
- `classification_item_id`;
- `geographic_unit_id`;
- `text_value`;
- `numeric_value`;
- `date_value`.

### Valor de medida exclusivo

En `observation_measure` debe existir exactamente uno entre:

- `numeric_value`;
- `text_value`;
- `boolean_value`.

### Vigencia temporal

En todas las entidades versionadas:

```text
valid_to IS NULL OR valid_to >= valid_from
```

### Clasificación

Un ítem padre debe pertenecer a la misma `classification_version`.

### Revisión

La numeración debe ser única y creciente por observación:

```text
UNIQUE(observation_id, revision_number)
```

### Artefacto

`sha256` identifica contenido binario exacto. Un archivo corregido genera un nuevo artefacto.

## 5. Índices principales

| Tabla | Índice recomendado |
|---|---|
| `series` | `(dataset_version_id, series_key_hash)` único |
| `observation` | `(series_id, period_start, period_end)` único |
| `observation_revision` | `(observation_id, revision_number)` único |
| `observation_revision` | índice parcial por `is_current=true` |
| `observation_revision` | `(vintage_date, observation_id)` |
| `series_dimension_value` | `(dimension_definition_id, code_item_id)` |
| `series_dimension_value` | `(dimension_definition_id, classification_item_id)` |
| `series_dimension_value` | `(dimension_definition_id, geographic_unit_id)` |
| `classification_item` | `(classification_version_id, code)` único |
| `source_artifact` | `sha256` único |
| `quality_assessment` | `(target_entity_type, target_entity_id, assessed_at)` |
| `lineage_relation` | `(target_entity_type, target_entity_id)` y `(source_entity_type, source_entity_id)` |

## 6. Ejemplo lógico

```text
Dataset:
  IPC Bolivia

DatasetVersion:
  Base 2016, metodología vigente

DataStructure:
  GEO, ITEM, FREQUENCY, UNIT, TIME_PERIOD
  Measure: OBS_VALUE
  Attributes: OBS_STATUS, CONF_STATUS

Series:
  GEO=SCZ, ITEM=ALIMENTOS, FREQ=M, UNIT=INDEX_2016_100

Observation:
  2026-06

ObservationRevision 1:
  provisional, vintage 2026-07-03

ObservationMeasure:
  OBS_VALUE=...

ObservationAttributeValue:
  OBS_STATUS=P
```

## 7. Datos oficiales y resultados académicos

La entidad `dataset.data_nature` y el equivalente en `indicator` deben aceptar al menos:

- `OFFICIAL_STATISTIC`;
- `ADMINISTRATIVE_RECORD`;
- `OFFICIAL_EXTERNAL`;
- `OBSERVATORY_DERIVED`;
- `ACADEMIC_ESTIMATE`;
- `EXPERIMENTAL`;
- `FORECAST`;
- `SCENARIO`.

La publicación o consulta debe mostrar esta naturaleza de forma visible.

## 8. Límites de esta fase

El modelo no autoriza almacenar microdatos personales ni confidenciales. Para microdatos se requiere:

- zona segregada;
- modelo de acceso;
- evaluación jurídica;
- protección estadística;
- documentación DDI;
- reglas de anonimización o acceso seguro.

## 9. Dictamen

El modelo es suficiente para congelar el **modelo lógico preliminar** del core. No debe congelarse todavía como esquema físico definitivo hasta que el comité valide:

- catálogos oficiales;
- estados permitidos;
- políticas de revisión;
- clasificación territorial;
- responsabilidades institucionales;
- reglas de certificación y publicación.
