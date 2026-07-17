# Revisión documental y fundamentos

## Dictamen

La estructura final es compatible conceptualmente con los estándares y prácticas revisados, sin intentar reproducir toda su complejidad.

## Fuentes principales

### SDMX 3.1

La versión 3.1 fue publicada en mayo de 2025. El estándar define estructuras de datos mediante conceptos asociados a dimensiones, medidas y atributos de un cubo estadístico.

- Página de especificaciones: https://sdmx.org/standards-2/
- Lanzamiento SDMX 3.1: https://sdmx.org/news/launching-the-new-sdmx-3-1-standard/
- Section 1 Framework: https://sdmx.org/wp-content/uploads/SDMX_3-1-0_SECTION_1_FINAL.pdf
- Section 2 Information Model: https://sdmx.org/wp-content/uploads/SDMX_3-1-0_SECTION_2_FINAL.pdf

### GSIM 2.0

GSIM es un marco de referencia para objetos de información estadística. Se utilizó como control conceptual para evitar silos temáticos, pero no se replicaron sus numerosas clases.

- https://unece.org/sites/default/files/2025-03/GSIM%20User%20Guide.pdf

### UN-NQAF

El marco de Naciones Unidas trata la calidad como un sistema integral y multidimensional. Esto respalda la separación entre dimensión, regla, evaluación e incidencia.

- Página oficial: https://unstats.un.org/UNSDWebsite/data-quality
- Manual en español: https://unstats.un.org/UNSDWebsite/nqaf/NQAF-Manual-Spanish.pdf

### INE Bolivia

El INE establece que los metadatos proporcionan el contexto necesario para interpretar una operación estadística y mantiene el catálogo ANDA.

- Metadatos y microdatos: https://www.ine.gob.bo/index.php/metadatos-y-microdatos/
- Catálogo ANDA: https://anda.ine.gob.bo/index.php/home
- CAEB 2022: https://www.ine.gob.bo/index.php/publicaciones/clasificacion-de-actividades-economicas-de-bolivia-caeb-2022/

### Marco jurídico boliviano

La Ley 1405 regula la producción de estadísticas oficiales y reconoce al INE como autoridad rectora. Por eso el modelo distingue explícitamente la naturaleza oficial, administrativa, académica y derivada.

- Ley 1405: https://www.ine.gob.bo/index.php/descarga/725/normativa/60619/ley-1405.pdf
- Marco normativo INE: https://www.ine.gob.bo/index.php/transparencia/normativa-general/

### DDI Lifecycle

Se revisó como referencia para documentación de operaciones y futuros microdatos. No se incluye un modelo de microdatos en esta fase.

- https://ddialliance.org/ddi-lifecycle

## Decisiones derivadas de la investigación

| Evidencia | Decisión en el modelo |
|---|---|
| SDMX separa dimensiones, medidas y atributos | Tablas independientes para cada concepto. |
| SDMX permite estructuras complejas y múltiples medidas | `observation_measure` admite varias medidas por revisión. |
| Las estructuras y clasificaciones evolucionan | Versionado independiente. |
| UN-NQAF trata la calidad como multidimensional | Dimensión, regla, evaluación e incidencia. |
| INE exige contexto metodológico | Operación, metodología y versiones son obligatorias. |
| Ley 1405 diferencia estadística oficial | `data_nature` evita equiparar estimaciones académicas con cifras oficiales. |
| ANDA documenta operaciones y variables | Metadatos preceden a la carga de observaciones. |

## Elementos deliberadamente no adoptados

- Dataflows y constraints completos de SDMX.
- Todo el modelo GSIM.
- Cuestionarios, variables y unidades de microdatos DDI.
- Flujos de certificación jurídica completos.
- Infraestructura, seguridad y publicación.

No son necesarios para los dos casos de uso centrales de esta fase.
