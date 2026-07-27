---
paths:
  - 'src/common/observability/**/*.ts'
  - 'src/common/http/**/*.ts'
  - 'src/modules/health/**/*.ts'
---

# Observabilidad

- Logs estructurados con Pino (nestjs-pino), niveles y `correlation_id` normalizado por request
  (`createRequestId`, allowlist + máximo). No registrar contenido sensible ni payloads completos.
- Redacción activa de cabeceras y campos sensibles (authorization, cookie, password, token).
- Métricas Prometheus (`prom-client`) con etiquetas de cardinalidad acotada: HTTP, ingesta,
  duración de operación de base de datos, auditoría, y de dominio (contradicciones abiertas,
  revisiones pendientes, dead-letters, frescura de fuentes, retraso de ingesta).
- `/health` (liveness), `/ready` (verifica ambos pools), `/metrics` protegido por token en
  producción (comparación en tiempo constante) — no depender solo del proxy de borde.
- El recolector periódico usa `unref` y respeta el apagado (no genera error tras cerrar pools).
- Al añadir una métrica: nombre estable, ayuda descriptiva, sin información sensible en labels.
