# Runbook de migraciones y rollback

## Antes del cambio

1. Confirmar versión de aplicación y migración objetivo.
2. Ejecutar backup y comprobar que existe una ruta de restauración.
3. Probar en una copia representativa.
4. Revisar filas incompatibles con nuevos `CHECK`.
5. Estimar locks y duración de índices.
6. Confirmar que solo una tarea de migración está activa.

## Aplicación

```bash
yarn db:migrate
yarn db:verify:privileges
```

La CLI usa `DATABASE_MIGRATOR_URL`, un pool de una conexión y un advisory lock. Verificar el historial en `infrastructure.migration_history`.

En CI o staging efímero:

```bash
yarn db:verify:migrations
```

Este comando comprueba instalación vacía, upgrade desde `0009`, rollback de `0014` y reaplicación. Está prohibido en producción.

## Validación posterior

- readiness de reader y writer;
- smoke de lectura y escritura mínima;
- matriz de privilegios;
- logs de migración sin secretos;
- métricas de error y latencia;
- ausencia de objetos funcionales en `public`.

## Rollback

```bash
yarn db:migrate:undo
```

El comando revierte solo la última migración. No usarlo a ciegas cuando existan datos incompatibles o una aplicación nueva dependa del esquema.

Advertencia: revertir `0014` restaura los grants amplios definidos por `0009`. Debe hacerse únicamente dentro de un rollback completo, con tráfico detenido y reaplicación posterior del hardening.

Para cambios expand/contract: agregar primero, desplegar código compatible y retirar en una migración posterior. Un rollback de aplicación no revierte automáticamente datos ni migraciones.
