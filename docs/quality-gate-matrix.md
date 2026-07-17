# Matriz objetiva de calidad

| Área | Gate | Evidencia | Estado |
|---|---|---|---|
| Arquitectura | Capas y dependencias permitidas | `validate_architecture.py` | Pass |
| Clean Code | Sin `any`, console runtime, controllers genéricos o archivos >299 | `check_clean_code.py`, `check_file_limits.py` | Pass |
| Sintaxis | TypeScript parseable | 150 archivos con transpile offline | Pass |
| Imports | Imports locales existentes | 297 imports | Pass |
| Modelo | 40 tablas / 377 campos | `validate_physical_model.py` | Pass |
| Relaciones | 76 FK y cobertura de índice | Validador físico | Pass |
| Migraciones | Secuencia `0001–0015`, up/down estáticos | Archivos y validador | Pass estático |
| Seeds | Solo boot/mock, JSON, UUID estables | `validate_seed_catalogs.py` | Pass estático |
| Persistencia | Reader/writer y retry acotado | `validate_persistence.py` | Pass estático |
| Negocio | Ingestión, provenance, idempotencia y bulk | `validate_use_cases.py` | Pass estático |
| Seguridad | JWT, default-deny, límites y OpenAPI | `validate_security_contracts.py` | Pass estático |
| API | 35 paths / 37 operaciones | OpenAPI y rutas | Pass |
| Async | No existe caso de uso diferido | ADR-0003 + assessment | N/A aprobado |
| Operación | NGINX, no-root, backup, restore, métricas | `validate_operations.py` | Pass estático |
| Documentación | PlantUML y PDF | 21 diagramas, PDF 16 páginas | Pass |
| Lockfile | Instalación reproducible | `yarn.lock` ausente | **Blocked** |
| Type-check | `tsc --noEmit` | Tipos Node/Jest ausentes | **Blocked** |
| Tests | Jest unit/integration/E2E | Dependencias ausentes | **Blocked** |
| Build | Nest build | Dependencias ausentes | **Blocked** |
| Base real | Migraciones, seeds, grants | PostgreSQL/psql ausentes | **Blocked** |
| Contenedores | Build/Compose/smoke | Docker ausente | **Blocked** |
| Rendimiento | k6 + planes reales | Infra y dataset ausentes | **Blocked** |
| Recuperación | Backup y restore drill | No ejecutado | **Blocked** |
| Gobierno | Claims, confidencialidad, SLO, RPO/RTO | Aprobación del cliente ausente | **Blocked** |

## Veredicto

Un gate crítico bloqueado impide calificar el sistema como 10/10 o listo para producción. El estado correcto es **implementación completa pendiente de verificación de release**.
