# Gate consolidado de modelo físico

| Gate | Evidencia | Estado |
|---|---|---|
| 40 entidades sin drift | `validate_physical_model.py` | Pass estático |
| 377 campos: tipo, nullability, PK y unique | Catálogo + migraciones | Pass estático |
| 76 FK con destino exacto | Catálogo + `0007` | Pass estático |
| 76 FK con índice líder | `0008`, `0012`, `0013` | Pass estático |
| Ninguna tabla funcional en `public` | Validador | Pass estático |
| Migraciones consecutivas y reversibles | `0001`-`0016` | Pass estático |
| Constraints y triggers críticos | `0010`, `0011`, `0015` | Pass estático |
| Reader por whitelist | `0014` | Pass estático |
| Backup read-only | `0016` | Pass estático |
| Migraciones en PostgreSQL real | Entorno no disponible | Blocked |
| Prueba real de grants | PostgreSQL/psql no disponibles | Blocked |
| Upgrade, rollback y concurrencia | Entorno no disponible | Blocked |

El modelo está cerrado estáticamente, pero no habilita producción hasta completar los gates bloqueados.
