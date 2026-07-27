# Trazabilidad de skills y reglas

> Fase 8 de `CLAUDE_ORGANIZAR_SKILLS_BACKEND.md`. Cada skill/regla se ancla a una fuente real del
> repositorio y a su evidencia ejecutable. No se copian fragmentos extensos de documentos: se
> resume el principio y se conserva la atribución.

## Skills

| Skill | Capacidad | Fuente | Sección de origen | Evidencia ejecutable |
|---|---|---|---|---|
| `backend-production` | Implementación backend de producción | `prompt/programacionBackend.md` | §3, §8, §9, §16, §18, §19 | `quality:all`, `test`, `test:integration`, `db:verify:migrations`, `openapi` |
| `backend-hardening` | Auditoría por fases | `docs/hardening/`, `ECONOMIC_DATACENTER_PRODUCTION_READINESS.md` | Fases 1–10 del informe | todos los gates + `security:audit` + drills |
| `clean-code-review` | Revisión de estilo/mantenibilidad | `prompt/programacionGeneral.md` | §1–§5 (KISS) | `quality:clean-code`, `quality:files`, `quality:naming` |
| `security-audit` | Seguridad + entrada IA | `prompt/programacionBackend.md`, `docs/architecture/threat-model.md` | §20–§31 | `quality:security`, `security:audit`, `db:verify:privileges` |
| `observability-audit` | Operabilidad | `prompt/programacionBackend.md`, ADR 0006 | §32–§34 | `quality:operations`, `/health` `/ready` `/metrics` |
| `performance-audit` | Rendimiento medido | `prompt/programacionGeneral.md`, `docs/architecture/performance-baseline.md` | §12 | `soak`, `test:integration`, `quality:physical-model` |
| `library-selection` | Decisión de dependencias | `prompt/programacionBackend.md` §1, `prompt/programacionGeneral.md` §13 | selección de stack | `security:audit`, `typecheck`, gate `async-scope` |
| `production-verification` | Gate de producción | `ECONOMIC_DATACENTER_PRODUCTION_READINESS.md`, `docs/hardening/production-review-checklist.md` | §9, §10, §14 | secuencia completa de `yarn` + arranque + drills |

## Reglas

| Regla | Tema | Fuente | Gate que la hace cumplir |
|---|---|---|---|
| `00-governance` | Precisión, precedencia, parada | `prompt/index.md`, `programacionGeneral.md` §0 | — (criterio) |
| `10-backend-architecture` | Capas, anti-Express, reader/writer | `programacionBackend.md` §3,§4,§8,§15; ADR 0001/0004/0007 | `architecture`, `persistence`, `use-cases` |
| `20-clean-code` | KISS, nombres, límites | `programacionGeneral.md` §1–§5 | `clean-code`, `files`, `naming` |
| `30-security` | AuthN/Z, IA no confiable, secretos | `programacionBackend.md` §20–§31; ADR 0002 | `security`, `security:audit` |
| `40-observability` | Logs, métricas, health | `programacionBackend.md` §32–§34; ADR 0006 | `operations` |
| `50-performance` | Medición, paginación, índices | `programacionGeneral.md` §12 | `physical-model` |
| `60-testing` | Unit + integración + concurrencia | `programacionBackend.md` §35–§36 | `test`, `test:integration` |
| `70-library-selection` | Yarn, no duplicar, resoluciones | `programacionBackend.md` §1 | `async-scope`, `security:audit` |
| `80-database` | Migraciones aditivas, inmutabilidad, roles | `programacionBackend.md` §9–§12; ADR 0004/0005/0009 | `physical-model`, `seeds`, `db:verify:*` |
| `90-documentation` | Español/inglés, contratos generados | `programacionGeneral.md` §5; `prompt/index.md` §7 | `openapi`, `routes`, `diagrams` |

## Nota de atribución

Las reglas resumen principios de los documentos fuente y de "Código limpio" (R. C. Martin) sin
reproducir su texto. La fuente autoritativa del stack son los ADR y el código; los prompts se citan
como origen de los principios.
