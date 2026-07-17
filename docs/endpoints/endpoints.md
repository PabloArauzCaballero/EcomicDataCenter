# Endpoints del core estadístico

## Convenciones

- Base: `/api/v1`.
- Autenticación: bearer JWT RS256 validado por JWKS, `issuer` y `audience`; `AUTH_MODE=disabled` solo es admisible en desarrollo y pruebas.
- Roles: `DATA_OFFICER`, `ANALYST`, `METHODOLOGY_STEWARD`.
- Errores: sobre común `{ error: { code, message, details? }, requestId }`.
- Paginación: `page` desde 1 y `pageSize` máximo 200.
- El contrato detallado y los esquemas están en `openapi.yaml`.

## Operación

| Método | Ruta | Propósito | Acceso |
|---|---|---|---|
| GET | `/health` | Liveness del proceso | Público |
| GET | `/ready` | Readiness de writer y reader | Público |
| GET | `/metrics` | Métricas Prometheus cuando están habilitadas | Público solo en red interna |

## Procedencia

| Método | Ruta | operationId | Rol |
|---|---|---|---|
| POST | `/api/v1/provenance/organizations` | `createOrganization` | METHODOLOGY_STEWARD |
| GET | `/api/v1/provenance/organizations` | `listOrganizations` | ANALYST, METHODOLOGY_STEWARD |
| POST | `/api/v1/provenance/sources` | `createSource` | METHODOLOGY_STEWARD |
| GET | `/api/v1/provenance/sources` | `listSources` | ANALYST, METHODOLOGY_STEWARD |
| POST | `/api/v1/provenance/artifacts` | `registerSourceArtifact` | DATA_OFFICER |
| GET | `/api/v1/provenance/artifacts/{id}` | `getSourceArtifact` | DATA_OFFICER, METHODOLOGY_STEWARD |

Los artefactos son inmutables. Un SHA-256 existente devuelve el registro existente en vez de duplicarlo.

## Gobierno semántico y de metadatos

Todos requieren `METHODOLOGY_STEWARD`.

| Método | Ruta | operationId |
|---|---|---|
| POST | `/api/v1/governance/domains` | `createStatisticalDomain` |
| POST | `/api/v1/governance/concepts` | `createConcept` |
| POST | `/api/v1/governance/frequencies` | `createFrequency` |
| POST | `/api/v1/governance/units` | `createUnitMeasure` |
| POST | `/api/v1/governance/geographies` | `createGeographicUnit` |
| POST | `/api/v1/governance/code-lists` | `createCodeList` |
| POST | `/api/v1/governance/classifications` | `createClassification` |
| POST | `/api/v1/governance/classification-mappings` | `createClassificationMapping` |
| POST | `/api/v1/governance/statistical-operations` | `createStatisticalOperation` |
| POST | `/api/v1/governance/methodologies` | `createMethodology` |
| POST | `/api/v1/governance/methodologies/{id}/versions` | `createMethodologyVersion` |
| POST | `/api/v1/governance/methodology-versions/{id}/transitions` | `transitionMethodologyVersion` |
| POST | `/api/v1/governance/data-structures` | `createDataStructure` |
| POST | `/api/v1/governance/datasets` | `createDataset` |
| POST | `/api/v1/governance/datasets/{id}/versions` | `createDatasetVersion` |
| POST | `/api/v1/governance/dataset-versions/{id}/transitions` | `transitionDatasetVersion` |
| POST | `/api/v1/governance/indicators` | `createIndicator` |

La publicación de un dataset exige metodología publicada, estructura activa y fecha de publicación. Publicar una versión suplanta de forma transaccional a la versión corriente previa.

## Ingestión y revisión

| Método | Ruta | operationId | Rol |
|---|---|---|---|
| POST | `/api/v1/data/observations` | `registerObservation` | DATA_OFFICER |
| POST | `/api/v1/data/observation-batches` | `importObservationBatch` | DATA_OFFICER |

### Flujo interno de registro

1. Verifica actor y organización UUID.
2. Calcula fingerprint SHA-256 del request y reclama `batchCode`.
3. Si el mismo `batchCode` ya terminó con el mismo fingerprint, reproduce la respuesta persistida.
4. Si el fingerprint cambia, devuelve `409 CONFLICT`.
5. Verifica artefacto, organización, propiedad de la fuente y pertenencia al dataset.
6. Valida definiciones, representaciones y referencias semánticas.
7. Resuelve la identidad canónica de la serie.
8. Bloquea la observación y su revisión corriente.
9. Devuelve `UNCHANGED` cuando el hash normalizado coincide.
10. Crea revisión `DRAFT`, ejecuta calidad y la rechaza ante fallo crítico.
11. Publica la nueva revisión y suplanta la anterior en la misma transacción.
12. Persiste el resultado final del lote para replay idempotente.

El lote admite hasta 500 registros. Usa un `SAVEPOINT` por registro, por lo que un error local produce resultado parcial sin invalidar los registros correctos.

## Consulta

| Método | Ruta | operationId | Rol |
|---|---|---|---|
| POST | `/api/v1/data/query` | `queryObservations` | ANALYST, METHODOLOGY_STEWARD |
| GET | `/api/v1/data/observations/{observationId}/revisions/{revisionId}/trace` | `getObservationTrace` | ANALYST, METHODOLOGY_STEWARD |

Sin `vintageDate`, la consulta devuelve la revisión publicada corriente. Con `vintageDate`, selecciona la revisión que estaba vigente al cierre de esa fecha. Los filtros de dimensión y orden son parametrizados y no aceptan SQL, columnas ni joins enviados por el cliente.

## Calidad y linaje

| Método | Ruta | operationId | Rol |
|---|---|---|---|
| POST | `/api/v1/quality/dimensions` | `createQualityDimension` | METHODOLOGY_STEWARD |
| POST | `/api/v1/quality/rules` | `createQualityRule` | METHODOLOGY_STEWARD |
| POST | `/api/v1/quality/lineage-relations` | `createLineageRelation` | METHODOLOGY_STEWARD |
| POST | `/api/v1/quality/indicator-relations` | `createIndicatorRelation` | METHODOLOGY_STEWARD |
| POST | `/api/v1/quality/series-breaks` | `createSeriesBreak` | METHODOLOGY_STEWARD |
| GET | `/api/v1/quality/issues` | `listDataIssues` | Todos los roles funcionales |
| POST | `/api/v1/quality/issues/{id}/transitions` | `transitionDataIssue` | DATA_OFFICER, METHODOLOGY_STEWARD |

## Transacciones, idempotencia y límites

- Artefactos: idempotencia por SHA-256.
- Registro individual: `batchCode` + fingerprint del payload; reintento idéntico reproduce la respuesta y un payload distinto devuelve conflicto.
- Lotes: la misma regla se aplica al lote completo; el resultado parcial se conserva en `result_json`.
- Revisiones: un payload estadístico normalizado idéntico no crea otra revisión.
- Versiones y publicación: transacciones con bloqueo de fila.
- Ingestión: aislamiento serializable con reintentos limitados solo para conflictos transitorios.
- No existe una clave genérica de idempotencia HTTP porque los tres comandos reintentables ya tienen identidad de dominio explícita.
