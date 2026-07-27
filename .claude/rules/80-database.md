---
paths:
  - 'src/database/**/*.ts'
  - 'scripts/generate_migrations.py'
  - 'scripts/sync_model_catalog.py'
  - 'scripts/generate_models.py'
---

# Base de datos, migraciones y seeds

- **El modelo físico se genera, no se escribe a mano.** El catálogo `docs/model/model-catalog.json`
  y los modelos Sequelize se derivan del SQL de migración con el parser del repo
  (`scripts/sync_model_catalog.py`, `scripts/generate_models.py`). Mantener FKs en
  `scripts/generate_migrations.py:FK_TARGETS`. El gate `quality:physical-model` verifica la deriva.
- Migraciones **aditivas y hacia adelante**: nunca reescribir una migración ya aplicada; añadir una
  nueva. Toda migración es reversible (`up`/`down`) y numeración contigua. Verifica el ciclo con
  `yarn db:verify:migrations` (install → upgrade → rollback → reapply).
- Prohibido `sync({ force: true })` / `sync({ alter: true })`. Operación destructiva requiere
  estrategia expand/contract y aprobación.
- Datos crudos, evidencia y auditoría son **inmutables** (triggers + privilegios). Correcciones =
  nuevas revisiones; los históricos no se borran.
- Roles segregados: `migrator`/`writer`/`reader`/`backup` con privilegios mínimos. El reader no
  escribe; el writer no borra auditoría (`db:verify:privileges`).
- Seeds: boot idempotentes (`upsert` por clave natural, ejecutables dos veces sin cambio); mock
  bloqueados en producción. UUID estables y válidos (gate `quality:seeds`).
- **`db:*` locales apuntan a Neon por `.env`.** Para una base local pasa las `DATABASE_*_URL`
  inline en el mismo comando; verifica el destino (`pg_namespace`) antes de confiar en la ejecución.
- No ejecutar migraciones ni DDL contra Neon/producción sin plan, respaldo y aprobación.
