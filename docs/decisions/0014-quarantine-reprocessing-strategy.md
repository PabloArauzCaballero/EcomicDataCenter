# ADR-0014: estrategia de reprocesamiento de observaciones en cuarentena

- Estado: propuesto; bloqueado por decisión de modelo de datos
- Fecha: 2026-07-21
- Responsables: arquitectura backend
- Relacionado: ADR-0003 (sin cola en la primera versión), ADR-0005 (idempotencia)

## Contexto

`ReprocessingService.reprocess` de un ítem `QUARANTINED` cambia su `processingStatus` a `RECEIVED`
y devuelve `REQUEUED` (hallazgo INT-2/HD-034). Pero:

- Ningún consumidor avanza `RECEIVED`: las colas están diferidas por ADR-0003.
- El claim **estructurado** del ítem no se persiste. En `ClaimPersistenceService`, un ítem en
  cuarentena solo marca el raw (`markRaw(..., 'QUARANTINED')`); en submission solo se almacena
  `item.rawPayload`, no `item.claim`. No existe normalizador `rawPayload → claim`.
- `sweepAbandoned` mueve cualquier `RECEIVED` viejo a `DEAD_LETTER` con el motivo "Abandoned in
  RECEIVED", de modo que un ítem re-encolado termina en dead-letter con una razón engañosa.

En consecuencia, `reprocess` promete un reintento que la arquitectura actual no puede cumplir y el
modelo de datos no puede soportar. (Confirmado: ningún código asigna `processingStatus='REJECTED'`,
así que esa rama de `isRetryable` es inalcanzable con el pipeline actual.)

## Opciones

1. **Consumidor asíncrono de `RECEIVED`** (rechazada por ahora): reintroduce una cola/worker, en
   conflicto directo con ADR-0003.
2. **Re-ejecución síncrona en `reprocess`** (elegida): persistir el claim estructurado normalizado
   junto al raw en la submission, de modo que `reprocess` pueda volver a ejecutar
   `ClaimPersistenceService.persist` dentro de su transacción, sin cola.
3. **No-op honesto** (descartada): rechazar `reprocess` mientras no exista consumidor degradaría una
   capacidad ya expuesta en el contrato.

## Restricción de seguridad (bloqueante)

`routeClaim` es **determinista sobre el contenido**: re-ejecutar `persist` sobre un ítem
`QUARANTINED` lo vuelve a cuarentenar siempre. Para que `reprocess` "avance" tendría que **saltarse
la cuarentena**, que es un **control de seguridad** sobre salida no confiable de agentes de IA
(prompt-injection; `review-routing.policy`). Un bypass automático readmitiría contenido correctamente
aislado. Por tanto la re-ejecución **nunca** puede auto-publicar: a lo sumo debe crear una **tarea de
revisión humana** con la autoridad explícita del operador, y jamás pasar a `PUBLISHED` sin decisión
humana. Esta política afecta seguridad de producción y **requiere firma del responsable de
dominio/seguridad**; no se auto-implementa.

## Decisión

Persistir el claim estructurado validado (columna `normalized_claim_json` en `raw_observation`, o
tabla adjunta) en la submission. `reprocess` de un `QUARANTINED`, con autoridad de operador,
re-ejecuta la persistencia **forzando el destino a `REVIEW` humano (nunca `PUBLISHED`)**, de forma
idempotente. `sweepAbandoned` distingue el abandono por caída (nunca procesado) del re-encolado por
operador para no atribuir un motivo falso.

## Consecuencias

- Requiere migración aditiva y regeneración del modelo físico/Sequelize (gate `quality:physical-model`).
- Alcance **feature** (backend-production), no de hardening.
- Elimina el callejón sin salida `RECEIVED` y el dead-letter con motivo engañoso.
- El claim estructurado se vuelve dato persistido: revisar confidencialidad y retención (ADR-0012).

## Validación

Pruebas de integración: `reprocess` de un ítem en cuarentena produce una claim/quarantine coherente sin
duplicados; `sweepAbandoned` no reclama ítems re-encolados; el estado converge a un terminal honesto.
