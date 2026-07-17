# Runbook de backup y restauración

## Estado de decisión

La estrategia final de producción sigue bloqueada hasta aprobar RPO, RTO, retención, cifrado y plataforma. Para desarrollo y QA se entrega un flujo lógico reproducible con `pg_dump` en formato custom.

## Backup lógico aislado

El API nunca ejecuta respaldos. El servicio `backup` de Compose es un contenedor de operación de una sola ejecución:

```bash
docker compose --profile operations run --rm backup
```

Requisitos:

- `BACKUP_DATABASE_URL` con credencial dedicada y mínima;
- volumen `backup_data` fuera del filesystem efímero;
- scheduler externo —CI, plataforma o cron del host—;
- cifrado fuera del contenedor cuando sea obligatorio;
- alerta si no se genera el archivo o el checksum.

Cada ejecución produce:

```text
observatorio-<UTC>.dump
observatorio-<UTC>.dump.sha256
```

## Restore drill obligatorio

1. Crear una base aislada sin tráfico.
2. Montar el backup y su checksum.
3. Definir `RESTORE_DATABASE_URL` y `BACKUP_FILE`.
4. Ejecutar `infra/backup/restore-drill.sh` desde una imagen PostgreSQL compatible.
5. Aplicar migraciones pendientes con el migrator de la versión restaurada.
6. Ejecutar smoke read-only y medir duración, RPO observado y RTO.
7. Guardar evidencia en `artifacts/restore/`.
8. Destruir el entorno y revocar la credencial temporal.

## Criterio de aprobación

Un archivo existente no cuenta como respaldo válido. El gate pasa únicamente cuando checksum, restauración, migraciones y smoke read-only terminan correctamente y existe evidencia con tiempos medidos.
