# Base inspeccionada — portal administrativo

Fecha de la inspección: 2026-09-16. Todo lo que sigue se midió ejecutando, no leyendo.

## Repositorios y punto de partida

| Repositorio | Rama | Commit al empezar | Árbol al empezar |
| --- | --- | --- | --- |
| `EcomicDataCenter` | `dev` | `ae30a4399cbcaf2cf1899d2a971689d0510e31a9` | limpio (0 archivos modificados) |
| `observatorio-dashboard` | `dev` | `e04909c08cebaca1e902dc0e09f63bd1153d68c0` | limpio (0 archivos modificados) |

Ambos remotos coinciden con los del plan. **`dev` es la rama que despliega**: Coolify la
observa, así que un push a `dev` es un despliegue, no un respaldo. Este trabajo se
commitea localmente y no se publica sin autorización explícita.

## Gestores y comandos reales

- Núcleo: **yarn 1.22.22** (`packageManager` lo fija; `npm install` aquí está prohibido).
  Node `>=20.19 <21 || >=22 <23`; la máquina corre 22.23.1.
- Tablero: **npm** con `package-lock.json`. Node `>=22.16.0`.
- Prefijo real de la API: `${API_PREFIX}/${API_VERSION}` → `/api/v1`, con
  `/health`, `/ready`, `/version` y `/metrics` fuera del prefijo.

## Lo que ya existía y se reutilizó

| Capacidad | Dónde vive | Cómo se usó |
| --- | --- | --- |
| Autenticación JWT RS256 por JWKS y RBAC | `src/common/auth/*` | El portal **no** añade autorización: emite un token que el núcleo verifica con sus propias reglas. |
| Auditoría automática de toda petición no-GET | `src/common/audit/audit.interceptor.ts` | Las mutaciones del portal quedan auditadas sin anotar nada. |
| Lectura en transacción de solo lectura | `src/common/persistence/read-query.executor.ts` | Todas las consultas administrativas pasan por ahí. |
| Ejecuciones de agentes | `intelligence.agent_run` | Es la ejecución que el portal lista; no se creó una segunda. |
| Calidad, incidencias y transiciones | `src/modules/quality/*`, `quality_lineage.*` | Se extendió el módulo existente; no se duplicó. |
| Reconstrucción de copias guardadas | `src/database/snapshot-refresh.ts` | La publicación del portal la reutiliza. |
| Exportación pública | `observatorio-dashboard/src/app/api/export/route.ts` | Se instrumentó sin cambiar su contrato. |

## Hallazgos de la inspección que cambiaron el diseño

1. **El modelo físico se genera.** `docs/model/model-catalog.json` y los modelos Sequelize
   se derivan del SQL de migración (`scripts/sync_model_catalog.py`,
   `scripts/generate_models.py`), y `quality:physical-model` verifica la deriva. El parser
   solo lee `src/database/migrations/*.ts`: una tabla declarada en `migration-sql/` es
   **invisible** para el control que debería detectarla. Por eso la 0075 lleva su SQL
   dentro del propio archivo de migración.
2. **Un módulo no puede importar a otro** (`quality:architecture`). El módulo `admin` no
   importa nada de `ingestion`, `quality` ni `governance`: lee de la base que esos módulos
   escriben y actúa solo sobre el camino de siembra que le pertenece.
3. **Cada ruta debe estar en `docs/endpoints/openapi.yaml`** con las nueve respuestas y
   `security: bearerAuth` (`quality:routes`, `quality:security`). El contrato se genera con
   `scripts/build_openapi.py`; las rutas nuevas se declararon ahí.
4. **`validate_seed_catalogs.py` fija los directorios de siembra**: `boot`, `mock`,
   `runners`, `schemas`, `tests` y ninguno más. El manifiesto vive en
   `src/database/seeds/manifest.ts`, no en un directorio nuevo.
5. **Archivos de producción ≤ 299 líneas** (`quality:files`), sin `any`, sin `console.*`,
   sin marcadores `TODO` (`quality:clean-code`), identificadores en inglés
   (`quality:naming`).

## Lo que la inspección encontró roto y este trabajo corrigió

| Hallazgo | Evidencia | Corrección |
| --- | --- | --- |
| `REFRESH MATERIALIZED VIEW` exige ser dueño de la vista; el arranque lo ejecutaba por el writer. En una base con los privilegios del diseño falla con `permission denied for schema read_models` **después** de cargar bien todos los catálogos. | Reproducido en la base de pruebas: los cuatro refrescos fallaron mientras la carga había terminado. | Migración 0075 añade `read_models.refresh_snapshot(text, boolean)` `SECURITY DEFINER` con lista blanca; `snapshot-refresh.ts` y `run-boot-seeds.ts` la usan, con reserva al `REFRESH` directo si la migración no está. |
| El reader no tenía `SELECT` sobre `intelligence.raw_observation`, y el recolector de métricas de dominio cuenta ahí las cartas muertas. En una base con los privilegios del diseño esa métrica **siempre** falló en silencio. | `role_table_grants` sin la tabla; el recolector registra un aviso y publica nada. | La 0075 concede lectura de esa tabla y de los catálogos de referencia que la consola necesita. |
| El techo de sentencia del runtime (15 s) se aplicaba a la siembra de arranque. Sobre una base ya cargada, un `upsert` de catálogo se cancela y el aprovisionamiento queda a medias. | `canceling statement due to statement timeout` al re-sembrar la base de pruebas con el corpus cargado. | `runBootSeeds` abre su pool con un techo propio de una hora y ya no depende de un `SET` que solo alcanza a una conexión del pool. |
| El registro de siembra solo conocía lo aplicado desde la consola, así que un despliegue aprovisionado correctamente mostraba todos los catálogos como «no aplicado». | La consola mostraba `absent` para catálogos que estaban cargados. | `runBootSeeds` anota en `operations.seed_application` lo que aplica. |

## Límites de esta base

- No se tocó producción ni Neon. Todo se ejecutó contra un PostgreSQL 17.5 efímero en
  Docker (`obs-admin-portal-pg`, puerto 55450), con dos bases: `economic_observatory`
  para el recorrido de extremo a extremo y `observatory_it` para la suite de integración,
  que trunca.
- El árbol de trabajo es compartido con otras sesiones. Se commitea por ruta, nunca
  `git add -A`.
