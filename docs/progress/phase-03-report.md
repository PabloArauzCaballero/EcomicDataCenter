# Informe de fase 3 — modelo físico y PostgreSQL

## Estado de ejecución

- Total de fases planificadas: 10
- Fase actual: 3 de 10
- Fases completadas: 3
- Fases restantes: 7
- Estado de la fase: completada estáticamente
- Gate de entrada: aprobado
- Gate de salida: aprobado estáticamente / bloqueado en runtime
- Próxima fase: boot/mock seeds e idempotencia

## 1. Objetivo

Auditar y endurecer el modelo físico PostgreSQL sin alterar las 40 entidades del modelo fuente. El alcance incluye schemas, roles, migraciones, claves, constraints, índices, triggers, grants y conexiones reader/writer.

## 2. Archivos creados

### Migraciones

- `src/database/migrations/0010-add-domain-integrity-constraints.ts`
- `src/database/migrations/0011-add-statistical-context-triggers.ts`
- `src/database/migrations/0012-add-catalog-foreign-key-indexes.ts`
- `src/database/migrations/0013-add-statistical-foreign-key-indexes.ts`
- `src/database/migrations/0014-harden-runtime-grants.ts`

### Validación y operación

- `scripts/physical_model_parser.py`
- `scripts/validate_physical_model.py`
- `scripts/verify_database_privileges.sh`
- `src/database/cli/verify-migration-cycle.ts`

### Documentación

- `docs/data-model/physical-model-audit.md`
- `docs/data-model/schema-ownership-and-grants.md`
- `docs/data-model/migration-strategy.md`
- `docs/data-model/physical-model-gate.md`
- `docs/progress/phase-03-report.md`

## 3. Archivos modificados

- `.github/workflows/ci.yml`
- `package.json`
- `infra/postgres/roles.sql`
- `infra/postgres/init-local.sh`
- `src/database/migration.runner.ts`
- `src/database/database.factory.ts`
- `src/database/database.module.ts`
- `src/database/cli/migrate.ts`
- `src/database/cli/migrate-undo.ts`
- `src/database/README.md`
- `docs/data-model/README.md`
- `docs/data-model/data-model.tex`
- `docs/data-model/data-model.pdf`
- `docs/implementation/implementation-plan.md`
- `docs/runbooks/migrations-and-rollback.md`
- `docs/progress/progress-report.md`
- `validation/validation-report.md`

## 4. Avances verificables

| Métrica | Resultado |
|---|---:|
| Tablas contrastadas | 40 |
| Campos contrastados | 375 |
| FK contrastadas | 76 |
| FK con índice líder | 76 |
| FK sin cobertura antes de la fase | 49 |
| Migraciones totales | 14 |
| Nuevas migraciones | 5 |
| Triggers de integridad totales | 10 |
| Whitelist reader | 21 tablas/vistas |
| Archivos del entregable, sin manifiesto | 289 |

## 5. Correcciones principales

1. Se añadieron constraints para hashes, lotes, versiones corrientes, representaciones y relaciones reflexivas.
2. Se añadieron triggers para impedir combinaciones entre entidades de estructuras o datasets distintos.
3. Se protege la existencia de al menos una medida por revisión mediante constraint triggers diferidos.
4. Se completó la cobertura de índices de las 76 claves foráneas.
5. Se sustituyó el grant reader global por una whitelist derivada de consultas reales.
6. Se revocó `EXECUTE` de funciones a `PUBLIC` y se concedió al writer solo lo necesario.
7. Se endurecieron roles y bootstrap local.
8. Se serializó la ejecución de migraciones mediante advisory lock.
9. Se configuraron timeouts en cada conexión del pool, no en una conexión temporal.
10. Se añadieron gates CI para ciclo de migraciones y privilegios PostgreSQL.

## 6. Pruebas ejecutadas

Las comprobaciones estáticas ejecutadas y su salida se conservan en `validation/phase-03-static-validation.txt`.

- límites de archivos;
- Clean Code;
- boundaries arquitectónicos;
- modelo físico;
- estructura/modelos;
- diagramas;
- OpenAPI;
- rutas/contrato;
- imports locales;
- sintaxis y transpile TypeScript;
- sintaxis de scripts shell;
- compilación LaTeX y render visual del PDF de modelo físico.

El PDF fue recompilado en cuatro pasadas, renderizado a 18 páginas y revisado en el índice y las páginas afectadas, sin superposición ni recorte visible.

## 7. Bloqueos

- No existe `node_modules`; type-check, ESLint, Jest y build no son concluyentes.
- El entorno no dispone de PostgreSQL, `psql` ni Docker.
- No se ejecutaron migraciones desde cero, upgrade, rollback ni prueba real de grants.
- No se midieron planes de ejecución con datos representativos.

## 8. Riesgos

| Riesgo | Parte afectada | Mitigación |
|---|---|---|
| Error SQL no detectable por parser TypeScript | Migraciones `0010`–`0014` | Pipeline PostgreSQL 17 obligatorio |
| Lock durante creación de índices | Upgrade con datos | Ventana inicial o migración online especializada |
| Drift previo viola constraints | Base actualizada | Preflight y corrección antes de DDL |
| Política de datos no ratificada | Reader/API | Mantener bloqueo productivo |
| Rollback de `0014` restaura grants de `0009` | Seguridad durante rollback | Solo rollback completo y controlado |

## 9. Decisiones

- No se añadió ninguna entidad ni relación no presente en el modelo fuente.
- No se creó RLS porque el modelo no define tenant ni política de fila aprobada.
- No se usó `CREATE INDEX CONCURRENTLY` en el primer despliegue sin tráfico.
- No se introdujo un motor de reglas de base de datos.
- La base protege invariantes estructurales; permisos y flujos siguen en services.

## 10. Desviaciones

La fase no pudo cumplir el gate runtime por limitaciones del entorno. La entrega incluye los scripts y pasos de CI necesarios para cerrar ese gate en un runner con PostgreSQL.

## 11. Estado

**Fase 3 aprobada estáticamente y habilitada para continuar a fase 4.** No habilita despliegue productivo.
