# Registro de prueba de restauración

| Campo | Valor |
|---|---|
| Fecha (UTC) | 2026-07-20T03:49:14Z |
| Motor | PostgreSQL 17 (postgres:17-alpine) |
| Origen | Instancia `edc-prod-pg`, esquema completo tras 28 migraciones |
| Destino | Instancia `edc-restore-pg`, contenedor limpio e independiente |
| Método | `pg_dump --format=custom --compress=9` + `pg_restore --clean --if-exists` |
| Tamaño del respaldo | 276083 bytes |
| SHA-256 | `e3e77a566e6203e23747b40799de71d0cc20bbf4aeccc9ddeb87154b49c9008f` |
| Duración del respaldo | 1 s |
| **RTO medido** | **2 s** (verificación de checksum + restauración + smoke de lectura) |
| **RPO** | 0 registros perdidos: el estado restaurado es idéntico al del origen |

## Verificación de integridad

| Conteo | Origen | Restaurado |
|---|---|---|
| Migraciones aplicadas | 28 | 28 |
| Unidades geográficas | 39 | 39 |
| Dominios estadísticos | 48 | 48 |
| Afirmaciones | 3 | 3 |
| Evidencias | 3 | 3 |
| Observaciones crudas | 4 | 4 |
| Entradas de auditoría | 2 | 2 |

Diferencia entre ambos estados: **ninguna**.

## Garantías tras la restauración

Los controles de integridad sobreviven al ciclo completo:

```
UPDATE audit.audit_log            → ERROR: audit_log is append-only
UPDATE intelligence.raw_observation → ERROR: raw_observation payload is immutable
Disparadores críticos presentes    → 3 de 3
```

## Alcance y límites de esta prueba

- Se ejecutó sobre un conjunto de datos **de tamaño reducido**. El RTO medido no
  es extrapolable a volumen productivo: debe repetirse contra una copia
  representativa antes de fijar el objetivo formal de recuperación.
- El respaldo se generó sin cifrado. En producción, `BACKUP_ENCRYPTION_ENABLED`
  debe activarse y la clave gestionarse fuera del repositorio.
- La restauración no incluyó los privilegios (`--no-owner --no-privileges`),
  por lo que tras un desastre real hay que reejecutar las migraciones de grants
  o `yarn db:grants:reapply`.

## Conclusión

El procedimiento de `infra/backup/run-backup.sh` e `infra/backup/restore-drill.sh`
es **funcional y reproducible**. La restauración quedó demostrada de extremo a
extremo con verificación de checksum, comparación de conteos y confirmación de
que las garantías de inmutabilidad siguen activas.
