# Certificación Beta 2.0

Evidencia ejecutada de production-verification sobre la rama `HARDENING`, con la feature
`daily-analysis` de codex y la remediación de seguridad `fast-uri` incluidas. Base de verificación:
PostgreSQL 17.5 local **desechable** (contenedor efímero, roles de mínimo privilegio vía
`init-local.sh`); nunca Neon.

## Tabla de evidencia por control

| # | Control | Comando | Resultado |
|---|---|---|---|
| 1 | Instalación reproducible | `yarn install --frozen-lockfile` | ✅ lockfile consistente |
| 2 | Tipado | `yarn typecheck` | ✅ 0 errores |
| 3 | Lint | `yarn lint` | ✅ 0 warnings |
| 4 | Formato | `yarn format:check` | ✅ sin cambios |
| 5 | Validadores | `yarn quality:all` | ✅ 17/17 (physical-model 53 tablas, routes 49, openapi 47, security 47) |
| 6 | Pruebas unitarias | `yarn test:unit` | ✅ 179/179 |
| 7 | Integración (base real) | `yarn test:integration` | ✅ 24/24 (query-sql, garantías de base, concurrencia) |
| 8 | Auditoría de dependencias | `yarn security:audit` | ✅ 0 vulnerabilidades (253 paquetes; `fast-uri` remediado a 3.1.4/4.1.1) |
| 9 | Ciclo de migraciones | `yarn db:verify:migrations` | ✅ install→upgrade→rollback→reapply (29 migraciones) |
| 10 | Seeds idempotentes | `yarn db:seed:boot` ×2 + `db:seed:verify` | ✅ ejecutable dos veces sin cambio |
| 11 | Build | `yarn build` | ✅ |
| 12 | Arranque real desde `dist/` | `node dist/main.js` | ✅ Nest arranca; DI resuelve `DailyAnalysisService` |
| 13 | Liveness / Readiness | `GET /health` · `GET /ready` | ✅ 200 / 200 (ambos pools autentican) |
| 14 | `/metrics` protegido | sin token / con token | ✅ 404 / 200 (comparación en tiempo constante) |
| 15 | Métricas de dominio | log de arranque + `/metrics` | ✅ 0 fallos del collector; gauges poblados (HD-037 + OBS-3) |
| 16 | Correlación al cliente | header de respuesta | ✅ `x-request-id` devuelto (OBS-1) |
| 17 | Smoke | `yarn smoke` | ✅ 3/3 (health, ready, protected) |
| 18 | Endpoint diario de codex | `POST /intelligence/daily-analysis` | ✅ registrado y validando (400 con body inválido, no 404) |

## No ejecutables aquí (requieren entorno/psql, no código)

| Control | Motivo | Estado |
|---|---|---|
| `db:verify:privileges` (matriz completa) | `psql` no está en el host Windows | Grant relevante de HD-037 verificado por `docker exec`; matriz completa la corre CI |
| Soak 10 min (RSS/heap/event-loop/pools) | Requiere ventana de carga sostenida | **HD-010** pendiente de entorno operativo |
| Drill de restauración (RTO/RPO) | Requiere instancia y volumen reales | **HD-011** pendiente de entorno operativo |
| Límites CPU/memoria de plataforma | Dependen de la plataforma de despliegue | **HD-012** pendiente de entorno |

## Roadmap con ADR (decisión deliberada — no bloquean la beta)

- **PERF-1 / ADR-0013** (idempotencia de replay a nivel submission): optimización de rendimiento
  **no medida**; `regla 50-performance` prohíbe optimizar sin baseline (bloqueado por el soak HD-010).
  Requiere tabla `agent_submission` + lógica de acumulación concurrente en el path de ingesta más
  crítico. **No se rushea antes del release.**
- **INT-2 / ADR-0014** (reprocesamiento de cuarentena): sin hueco de seguridad vivo hoy (reprocess no
  auto-publica). El fix correcto toca el routing de contenido no confiable (seguridad) y exige cambio
  de esquema; su diseño seguro (forzar a revisión humana, nunca auto-publicar) está fijado en el ADR.

## Veredicto

**Apto para beta 2.0 con observaciones operativas.** Todos los controles de software ejecutables están
en verde, sin vulnerabilidades de dependencias, con la feature de codex y las 13 correcciones de
hardening verificadas end-to-end contra PostgreSQL real. Las observaciones (HD-010/011/012) son
**operativas y de entorno**, no defectos de código, y deben cerrarse en la plataforma real antes de
declarar apto para producción general. PERF-1 e INT-2 quedan como roadmap con ADR, sin impacto en la
funcionalidad ni la seguridad de la beta.
