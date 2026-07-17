# Estrategia de migraciones PostgreSQL

## Fuente de verdad

Toda estructura de aplicación se crea mediante Umzug y migraciones TypeScript versionadas. `sequelize.sync({ force: true })` y `sequelize.sync({ alter: true })` están prohibidos.

El único bootstrap previo es `CREATE SCHEMA IF NOT EXISTS infrastructure`, necesario para `infrastructure.migration_history`.

## Secuencia actual

| Migración | Responsabilidad |
|---|---|
| `0001` | Schemas |
| `0002`-`0006` | Tablas por dominio |
| `0007` | 76 claves foráneas |
| `0008` | Constraints iniciales, índices, triggers y vista |
| `0009` | Grants runtime iniciales |
| `0010` | Invariantes de dominio y contexto de series |
| `0011` | Contexto de revisiones, medidas y atributos |
| `0012`-`0013` | Índices FK y consultas críticas |
| `0014` | Whitelist reader, funciones y hardening de grants |
| `0015` | Fingerprint y resultado replayable de lotes |
| `0016` | Grants read-only del operador de backup |

## Serialización

Las CLI de migración adquieren un advisory lock por base. El migrator usa una sola conexión y no reintenta DDL automáticamente.

## Despliegue

1. Probar restauración de un backup reciente.
2. Ejecutar sobre una copia representativa.
3. Revisar drift incompatible con nuevos constraints.
4. Estimar duración de índices y locks.
5. Detener escrituras si la ventana lo exige.
6. Aplicar con credencial migrator.
7. Verificar permisos writer, reader y backup.
8. Ejecutar readiness y smoke.
9. Conservar evidencia y versión desplegada.

Los índices `0012`/`0013` no usan `CONCURRENTLY` porque corresponden al primer despliegue sin tráfico. Upgrades sobre tablas grandes requieren migraciones online especializadas.

## Verificación automatizada

`yarn db:verify:migrations` exige una base vacía, migra hasta `0009`, aplica `0010`-`0016`, revierte `0016` y la reaplica. Está prohibido en producción.

## Rollback

Antes de revertir:

- confirmar compatibilidad de la aplicación anterior;
- revisar pérdida de constraints, columnas o privilegios;
- detener tráfico cuando se modifique un contrato;
- preferir roll-forward si ya existen datos dependientes.

Revertir `0015` elimina metadatos de replay. Revertir `0014` restaura grants amplios de `0009`; solo puede hacerse dentro de un rollback completo y controlado.

## Gates ejecutables pendientes

- instalación `0001`-`0016` sobre PostgreSQL 17;
- upgrade `0009` a `0016` con datos representativos;
- rollback y reaplicación de `0016`;
- prueba concurrente del claim idempotente de `0015`;
- permisos migrator/writer/reader/backup;
- revisión de locks y duración.
