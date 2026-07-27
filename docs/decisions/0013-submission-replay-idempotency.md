# ADR-0013: idempotencia de replay para la submission de agentes

- Estado: propuesto; bloqueado por evidencia de integración/concurrencia
- Fecha: 2026-07-21
- Responsables: arquitectura backend
- Relacionado: ADR-0005 (idempotencia por identidades del dominio), ADR-0009 (transacciones serializables)

## Contexto

`SubmissionService.submit` procesa un lote de ≤200 ítems de un `agentRunId` en **una sola transacción
serializable**. Un conflicto de serialización (40001) reintenta el lote completo, y `attachToCluster`
mantiene bloqueos sobre `document_cluster` durante todo el lote (hallazgo de rendimiento PERF-1/HD-032).

Fragmentar en bloques que confirman por separado —como ya hace `BatchImportService`— reduciría el
alcance del replay y la duración de los bloqueos. Pero introduce un problema de **contabilidad de
agregados del run**: los contadores (`recordsReceived/Accepted/Rejected/Quarantined`) se actualizan por
incremento del delta de la petición. Con confirmación por bloques, un fallo parcial deja ítems
confirmados; el reintento del agente los ve como `DUPLICATE` (idempotencia por `(agentRunId,
payloadHash)`), de modo que `recordsAccepted` **subcontaría** frente a las claims realmente
persistidas. Los ítems `REJECTED` no persisten ninguna fila (rollback de savepoint), así que tampoco
pueden derivarse del estado.

La submission actual **no** tiene clave de idempotencia a nivel de comando: `submissionCode` no se
usa para replay. ADR-0005 evita deliberadamente una tabla genérica de `Idempotency-Key`.

## Opciones

1. **Fragmentar sin replay** (rechazada): rompe la contabilidad del run bajo fallo parcial.
2. **Contadores derivados del estado persistido** (rechazada): los `REJECTED` no dejan rastro, y
   `recordsReceived` incluiría duplicados de reintentos; no reconstruible con exactitud.
3. **Replay a nivel submission** (elegida): persistir el resultado determinista de la submission
   con clave `(agentRunId, submissionCode)` + huella del payload, análogo al `resultJson` de
   `data_entry_batch`. El reintento de una submission completada devuelve el resultado almacenado;
   una incompleta reanuda por bloques idempotentes. Los contadores se fijan una vez, en la
   finalización, desde el resultado canónico.

## Decisión

Extender ADR-0005 con una identidad de dominio para el **comando de submission**: una fila
`agent_submission` con `(ai_agent_run_id, submission_code)` único, `request_fingerprint` y
`result_json`. `SubmissionService` reclama la submission, procesa por bloques (savepoint por ítem, ya
presente), y finaliza fijando contadores y `result_json` en una transacción final. El reintento con
misma huella se reproduce; con huella distinta se rechaza con `ConflictError`.

## Consecuencias

- Requiere migración aditiva (`agent_submission`), regeneración del catálogo de modelo físico y del
  modelo Sequelize (`scripts/sync_model_catalog.py`, `generate_models.py`; gate `quality:physical-model`).
- Alcance **feature** (backend-production), no de hardening. La duración de bloqueos y la tasa de 40001
  deben medirse antes/después con `yarn soak` (regla `50-performance`).
- Preserva la exactitud de los contadores del run bajo reintentos y fallos parciales.

## Validación

Pruebas de integración y concurrencia: submissions simultáneas con la misma `submissionCode`
(sin duplicados, respuesta consistente), reintento tras fallo parcial (contadores exactos), y
ejecutabilidad del SQL. Comparación de p95 y tasa de reintentos por mitades en `yarn soak`.
