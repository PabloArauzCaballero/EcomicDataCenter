# Plan de corrección de hardening — 30 de julio de 2026

Revisión integral del backend posterior a la consolidación de la rama `HARDENING`. Complementa
`findings.md` y `improvement-plan-2026-07.md`; no re-registra hallazgos ya `Resuelto`.

## Baseline verificado antes de tocar código

`yarn typecheck` ✓ · `yarn lint` ✓ · `yarn format:check` ✓ · `yarn test` 179/179 ✓.

## Matriz de hallazgos

| ID | Sev. | Área | Archivo | Hallazgo | Fase |
|---|---|---|---|---|---|
| HD-039 | Alta | Correctitud de consulta | `query/data-query.plan.ts:71` | La paginación por cursor descendente compara la clave como tupla (`(period_start, series_key) < …`), lo que implica `series_key DESC`, pero la página se emite con `ORDER BY period_start DESC, series_key ASC`. Con empates en `period_start` la página siguiente re-sirve filas ya entregadas y omite el resto del grupo. | A |
| HD-043 | Media | Contrato de error | `common/validation/zod-validation.pipe.ts:11` | El pipe lanza `BadRequestException` con las `issues` en el cuerpo, pero el filtro aplana un `HttpException` a su mensaje: el cliente recibe `"Invalid request"` sin saber qué campo falló. La rama `ZodError` del filtro era inalcanzable desde HTTP. | A |
| HD-041 | Media | Seguridad (AuthN) | `common/auth/jwt-auth.guard.ts:79` | `jsonwebtoken` sólo valida `exp` cuando la reclamación está presente: un token emitido sin expiración se acepta indefinidamente. Sin `clockTolerance` declarada. | B |
| HD-042 | Media | Seguridad (AuthZ) | `intelligence/submission.service.ts:42`, `review.service.ts:138`, `agent-registry.service.ts:121` | La guarda de aislamiento institucional era *fail-open*: `if (actor.organizationId && agent && …)` omite la comparación cuando no se encuentra el agente del run. La FK `fk_agent_run_ai_agent_id` (`ON DELETE RESTRICT`) garantiza que existe, así que la rama sólo podía desactivar la autorización en silencio. | B |
| HD-046 | Baja | Clean-code / seguridad | 3 servicios + 2 copias en línea | `assertActorOrganization` estaba duplicado literalmente cinco veces. Una copia divergente es indistinguible de una comprobación ausente. | B |
| HD-040 | Media | Observabilidad / integridad | `review.service.ts:81,121`, `reprocessing.service.ts:85,150`, `batch-import.service.ts:175` | Cinco contadores se incrementaban **dentro** del callback de `withSerializableRetry`. Un conflicto 40001 reejecuta el callback (hasta 3 intentos), así que la métrica se cuenta una vez por intento; y un intento que termina en rollback reporta un resultado que nunca ocurrió. `submission.service.ts` y `observation-registration.ts` ya usaban el patrón correcto. | C |
| HD-044 | Media | Observabilidad | `common/errors/http-exception.filter.ts:99` | Los errores de plugin Fastify se respondían por `statusCode` sin registrar nada. Un 5xx originado en un plugin quedaba sin rastro en los logs: la única evidencia era el código que vio el cliente. | C |
| HD-045 | Baja-Media | Arquitectura / rendimiento | `intelligence/agent-registry.service.ts:115` | `getAgentRun` (GET) abría una transacción SERIALIZABLE con reintento sobre el pool **writer** para una lectura pura. Una flota de agentes consultando su propio progreso compite por conexiones de escritura con la ingesta que reportan. | D |

## Fases de ejecución

- **Fase A — Correctitud de contrato y datos:** HD-039, HD-043.
- **Fase B — Seguridad AuthN/AuthZ:** HD-041, HD-042, HD-046.
- **Fase C — Observabilidad:** HD-040, HD-044.
- **Fase D — Arquitectura de lectura:** HD-045.
- **Fase E — Verificación y documentación.**

## Decisión deliberada de no cambiar

`ReprocessingService.deadLetters` también es una lectura sobre el pool writer, y **debe seguir
siéndolo**. La migración 0025 aísla `intelligence.raw_observation` del reader y la 0029 le devuelve
únicamente `SELECT (processing_status, received_at)` para el recolector de métricas. Las columnas de
la vista de dead-letters (`payload_hash`, `retry_count`, `last_error`) son inalcanzables desde el
reader por diseño: moverla habría fallado con `permission denied` en todo entorno correctamente
migrado. Queda documentado en el propio método.

## Puntos que requieren decisión humana, no código

- `DATA_REVIEWER` no figura en `ORGANIZATION_SCOPED_ROLES` (escribe sin ámbito institucional) pero
  tampoco en `CROSS_INSTITUTION_ROLES` de `disclosure.policy` (lee sólo lo público). La asimetría
  entre lo que ese rol puede aprobar y lo que puede leer es coherente sólo si es intencional;
  requiere confirmación de la política institucional o un ADR, no un cambio unilateral.
- HD-010 (soak) y HD-011 (drill de restauración) siguen abiertos y siguen siendo bloqueantes:
  necesitan entorno, no código.

## Restricciones respetadas

Sin tocar Neon ni producción, sin secretos, sin `git push`, sin DDL, sin migraciones nuevas y sin
operaciones destructivas. Ninguna corrección se declara verificada sin su ejecución registrada.
