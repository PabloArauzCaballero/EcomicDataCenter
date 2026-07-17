# Capa de datos

Contiene conexiones reader/writer, modelos Sequelize, migraciones versionadas, CLI y seeds.

## Reglas

- La aplicación no crea objetos funcionales en `public`.
- Migraciones usan `DATABASE_MIGRATOR_URL`.
- Escrituras usan `DATABASE_WRITER_URL`.
- Consultas usan `DATABASE_READER_URL`.
- `sync({ force|alter })` está prohibido.
- Los modelos ORM no se devuelven como contrato público.
- Los roles PostgreSQL se aprovisionan por infraestructura, no durante el arranque del API.
- Toda migración debe exportar `up` y `down` y mantener la secuencia numérica.

## Migraciones

- `0001`–`0007`: schemas, tablas y claves foráneas.
- `0008`: hardening inicial, índices, triggers y vista.
- `0009`: grants iniciales.
- `0010`: constraints e invariantes de series/metadatos.
- `0011`: consistencia de revisiones, medidas y atributos.
- `0012`–`0013`: cobertura de índices para las 76 FK y consultas críticas.
- `0014`: grants default-deny, whitelist reader y funciones de trigger.
- `0015`: idempotencia durable y replay de lotes.
- `0016`: acceso read-only para backup dedicado.

Umzug registra el estado en `infrastructure.migration_history`. La CLI usa un advisory lock y un pool migrator de una conexión.

## Comandos

```bash
yarn db:migrate
yarn db:migrate:undo
yarn db:verify:migrations
yarn db:verify:privileges
yarn quality:physical-model
```

`db:verify:migrations` necesita una base sin historial y está prohibido en producción.

`db:verify:privileges` necesita `psql` y una base ya migrada. El bootstrap local está en `infra/postgres/init-local.sh`.

## Documentación relacionada

- `docs/data-model/physical-model-audit.md`
- `docs/data-model/schema-ownership-and-grants.md`
- `docs/data-model/migration-strategy.md`
