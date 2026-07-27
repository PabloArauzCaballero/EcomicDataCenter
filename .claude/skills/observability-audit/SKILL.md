---
name: observability-audit
description: Audita la observabilidad del backend (logs estructurados, correlation/trace ID, métricas RED/USE y de dominio, health/ready, /metrics protegido, redacción de datos sensibles, alertas, apagado del recolector). Úsala para verificar que el sistema es operable en producción.
---

# Skill: observability-audit

## Propósito

Confirmar que el sistema puede operarse y diagnosticarse sin acceso directo a la base, y sin filtrar
datos sensibles.

## Cuándo usarla

Antes de release o al añadir endpoints/procesos que deban ser observables.

## Cuándo NO usarla

Para seguridad de auth o rendimiento medido (usa las skills respectivas).

## Fuentes obligatorias

`.claude/rules/40-observability.md`, `src/common/observability/`, `src/common/http/`,
`src/modules/health/health.controller.ts`, ADR 0006.

## Entradas requeridas

Si hay app arrancable y `/metrics` accesible (token de scraping).

## Detente si

Se requiere conectar una plataforma externa (Sentry/Datadog/Grafana) con auth: propón y detente.

## Flujo por fases

1. Logs estructurados (Pino), niveles, `correlation_id` normalizado. 2. Redacción de authorization/
   cookie/password/token y ausencia de payloads completos. 3. Métricas Prometheus: HTTP, ingesta, DB,
   auditoría, dominio (contradicciones, revisiones, dead-letters, frescura, retraso). Cardinalidad
   acotada. 4. `/health`, `/ready` (ambos pools), `/metrics` protegido por token en prod. 5. Recolector
   periódico con `unref` y silencio en apagado. 6. Alertas propuestas para señales críticas.

## Comandos permitidos

Arranque local, `curl` a `/health` `/ready` `/metrics`, `yarn quality:operations`, lectura de
`src/common/observability`.

## Comandos prohibidos

Conectar plataformas externas sin aprobación; exponer `/metrics` sin token en prod.

## Evidencia requerida

Salida real de `/metrics` mostrando las series esperadas; respuesta de `/ready`; confirmación de
redacción en un log de ejemplo.

## Entregables

Inventario de señales presentes/ausentes, métricas de dominio faltantes, y reglas de alerta sugeridas.

## Formato de respuesta

Señales presentes · brechas · alertas propuestas · evidencia ejecutada.

## Lista de verificación final

- [ ] `/health` y `/ready` correctos. - [ ] `/metrics` 404 sin token / 200 con token en prod.
- [ ] Métricas de dominio presentes. - [ ] Sin datos sensibles en logs/labels. - [ ] Apagado sin ruido.

## Limitaciones

No mide latencia bajo carga (eso es `performance-audit`). No valida dashboards externos.

## Trazabilidad

`prompt/programacionBackend.md` §32–§34; ADR 0006; gate `operations`.
