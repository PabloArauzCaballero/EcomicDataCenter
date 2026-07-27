# Plan de mejora de hardening — Julio 2026

Análisis dimensional del backend (seguridad, observabilidad, rendimiento, integridad/clean-code)
sobre la rama `HARDENING`, complementando `findings.md` y `ECONOMIC_DATACENTER_PRODUCTION_READINESS.md`.
No re-registra hallazgos ya `Resuelto` en `findings.md`.

## Baseline verificado (2026-07-21)

`yarn typecheck` ✓ · `yarn lint` ✓ · `yarn test:unit` 174/174 ✓ · `yarn security:audit` 0 vulnerabilidades (253 paquetes).
CI cubre 18+ validadores, migraciones, matriz de privilegios, contratos y flujo Docker completo.

## Matriz de hallazgos

| ID | Sev. | Área | Archivo | Hallazgo | Fase |
|---|---|---|---|---|---|
| SEC-1 | Media | AuthZ (BOLA/BFLA) | `intelligence/review.service.ts:126` | `completeRun` no valida aislamiento institucional; un agente puede cerrar/sobrescribir el run de otra organización. El sibling `submission.service.ts:42` sí lo valida. | 2 |
| SEC-2 | Baja | AuthZ (lectura) | `intelligence/agent-registry.service.ts:114` | `getAgentRun.status` devuelve stats de cualquier run por ID sin scoping por organización para `INGESTION_AGENT`. | 2 |
| INT-1 | Alta | Integridad/idempotencia | `ingestion/batch-import.service.ts:66` | Ventana in-flight: batch existente pero incompleto no verifica fingerprint ni marca conflicto → doble procesamiento y provenance corrupta (contrato ADR-0005). | 2 |
| OBS-1 | Media | Correlación | `main.ts` / `request-context.interceptor.ts` | El `x-request-id` nunca se devuelve al cliente en ninguna respuesta; imposible mapear reporte externo a log. | 2 |
| OBS-3 | Baja | Métricas | `intelligence/domain-metrics.collector.ts:36` | Gauges de dominio reportan 0 falso durante ~60s tras cada arranque (sin `collect()` inicial). | 2 |
| PERF-3 | Media | Consulta | `query/data-query.repository.ts:135` | Dos subqueries `COUNT` sobre `quality_assessment` por fila difieren solo en `status='FAIL'`; colapsables a `COUNT(*) FILTER`. | 2 |
| OBS-2 | Media | Métricas USE | `common/observability` | Sin gauges de saturación de pools reader/writer (utilización/espera); punto ciego de estancamiento en producción. | 3 |
| INT-3 | Baja-Media | Contrato de error | `provenance/provenance.service.ts:20` | Create check-then-create sin transacción → carrera devuelve 500 (`UniqueConstraintError`) en vez de 409 `ConflictError`. | 3 |
| INT-2 | Media | Ciclo de vida | `intelligence/reprocessing.service.ts:94` | Resultado `REQUEUED` (estado `RECEIVED`) sin consumidor; `sweepAbandoned` lo termina en dead-letter con motivo engañoso. Rama `REJECTED` inalcanzable. | 3 |
| PERF-2 | Alta/Media | Consulta | `ingestion/observation-registration.service.ts:110`, `quality-evaluator.service.ts:38` | Re-fetch por registro de datos constantes del lote (estructura de dataset + reglas activas) → ~2000+ consultas redundantes por lote de 500. | 3 |
| PERF-1 | Alta | Transacción | `intelligence/submission.service.ts:39` | Lote completo (≤200) en una sola transacción serializable; un 40001 reintenta 200 ítems. `batch-import` fragmenta en bloques de 50. | 3 |
| OBS-4/5 | Baja | Redacción | `app.module.ts:40`, `http-exception.filter.ts:114` | Query-string sin redactar en logs; wildcards de redacción solo un nivel. Defensa en profundidad. | 3 |
| PERF-4 | Baja | Índice | `query/data-query.plan.ts:71` | Cursor keyset abarca dos tablas; ningún índice único lo sirve. **Diferido** (cambio de esquema). | — |
| INT-4 | Baja | Clean-code | `submission.service.ts:112` | Sentinela mágico `rawObservationId:'0'`; duplicación menor de assert-fingerprint. Oportunista. | 3 |

## Fases de ejecución

- **Fase 1 — Baseline (hecho):** gates verdes registrados arriba.
- **Fase 2 (Corrida 2) — Seguridad + integridad crítica + quick wins (RESUELTA):** SEC-1, SEC-2, INT-1
  (+2 unit tests), OBS-1, OBS-3, PERF-3. Verificado: typecheck ✓, format ✓, lint ✓, 176 unit tests ✓,
  gates `quality:{clean-code,architecture,persistence,security,naming,files,use-cases,imports,async-scope}` ✓.
- **Fase 3 (Corrida 3) — Resto + verificación final:** OBS-2, INT-3, INT-2, PERF-2, PERF-1, OBS-4/5, INT-4. Verificación completa: build, typecheck, lint, format, unit tests, `quality:all`; actualización de `findings.md`.

## Estado final de ejecución

**Aplicados y verificados (9 hallazgos):** SEC-1, SEC-2, INT-1 (+2 unit tests), INT-3, OBS-1, OBS-2,
OBS-3, OBS-4/5, PERF-3. Verificación ejecutada: typecheck ✓, build ✓, format ✓, lint ✓, unit tests ✓,
`quality:all` 17/17 ✓ (sin drift de contrato; `quality:{security,architecture,persistence,async-scope,physical-model}` verdes).

**PERF-2 aplicado (corrida 4, 2026-07-21):** caché perezosa batch-constante
(`batch-registration-cache.ts`) que carga estructura publicada y reglas activas una vez por lote y las
reutiliza entre chunks. Diseño que **preserva exactamente** el comportamiento previo: con caché vacía
cada consumidor carga igual que antes, manteniendo la semántica de error por registro. Verificado:
typecheck, build, lint, format, 176 unit tests, `quality:all` 17/17. La confirmación cuantitativa
(statements/lote) y de integración sigue pendiente de base desechable.

**No aplicados — bloqueo técnico concreto (no omisión):**

| ID | Bloqueo concreto | Qué requiere |
|---|---|---|
| PERF-1 | Fragmentar la submission rompe el conteo de agregados del run bajo fallo parcial: si el 1er intento confirma N ítems y falla, el reintento los ve como DUPLICATE y `finalize` subcontaría `recordsAccepted` frente a las claims realmente persistidas. El diseño atómico actual lo evita. | Idempotencia de replay a nivel submission (análoga al `resultJson` de `batch-import`) o conteo derivado del estado persistido; con tests de integración y concurrencia. Feature, no refactor. |
| INT-2 | Sin consumidor de `RECEIVED` (ADR-0003) y el claim estructurado del ítem QUARANTINED no se persiste (solo el `rawPayload`), la re-ejecución síncrona en `reprocess` es imposible sin re-parser. Todo cambio es cosmético o arquitectónico. Confirmado: ningún código asigna `processingStatus='REJECTED'`. | ADR que decida consumidor diferido vs. persistir el claim estructurado para re-ejecución. |
| INT-4 | `rawObservationId:'0'` alimenta el tipo de respuesta de submission; volverlo opcional puede derivar en drift de contrato OpenAPI (gate `quality:openapi`/`quality:routes`). Ganancia cosmética. | Decisión de contrato si se desea exponer `null`. No bloquea producción. |
| PERF-4 | Requiere cambio de esquema (denormalizar `series_key` o índice compuesto multi-tabla). | Que el volumen real de lectura lo justifique; umbral en `data-lifecycle-and-partitioning.md`. |

## Restricciones respetadas

Sin tocar Neon/producción, sin secretos, sin `git push`, sin operaciones destructivas ni DDL. Los
diferimientos anteriores respetan `00-governance` (no declarar hecho sin evidencia ejecutada) y
`50-performance` (no optimizar sin baseline). Las confirmaciones de ejecutabilidad SQL (PERF-3) e
integridad bajo concurrencia (INT-1, INT-3) requieren `yarn test:integration` con
`INTEGRATION_DATABASE_URL` sobre una base desechable — pendiente de entorno, no de código.
