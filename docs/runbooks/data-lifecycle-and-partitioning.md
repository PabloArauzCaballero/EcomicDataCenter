# Ciclo de vida de datos, retención y particionado

> Alcance: políticas operativas del datacenter económico. Complementa
> `backup-and-restore.md` y `migrations-and-rollback.md`.

## 1. Regla rectora

**Nada que respalde una cifra publicada se elimina.** El archivado mueve datos a
almacenamiento frío; no los borra. Toda excepción requiere aprobación
institucional documentada, con responsable y fecha.

## 2. Clasificación de datos

| Clase | Contenido | Retención mínima | Eliminación |
|---|---|---|---|
| Probatorio | `raw_observation`, `claim_evidence`, `source_artifact`, `observation_revision` | Permanente | Prohibida |
| Auditoría | `audit.audit_log` | 10 años | Prohibida antes del plazo |
| Curado | `fact_claim`, `data_contradiction`, `review_task` | Permanente | Prohibida |
| Operativo | `agent_run`, `quality_assessment` | 3 años en línea | Archivable |
| Derivado | `document_cluster`, `claim_cluster_member` | Reconstruible | Recalculable |

La clase Derivado es la única que puede regenerarse: si un cluster se corrompe,
se recalcula desde `fact_claim` sin pérdida de información.

## 3. Retención y archivado

| Dato | En línea | Archivo frío | Criterio de traslado |
|---|---|---|---|
| `raw_observation` normalizada | 12 meses | Permanente | `processing_status = 'NORMALIZED'` y antigüedad > 12 meses |
| `raw_observation` en dead-letter | Hasta resolución | Permanente | Nunca antes de ser revisada |
| `agent_run` | 24 meses | 7 años | Ejecución cerrada |
| `audit_log` | 24 meses | 10 años | Por antigüedad |
| `observation_revision` no vigente | 36 meses | Permanente | `is_current = false` |

El archivado se implementa como exportación verificada por checksum al
almacenamiento de objetos, seguida de `DELETE` **solo** en las clases Operativo
y solo tras confirmar la integridad de la copia. Las clases Probatorio,
Auditoría y Curado nunca se borran de la copia caliente sin decisión formal.

## 4. Particionado

### 4.1 Cuándo aplicarlo

No antes de que se cumpla alguno de estos umbrales, medidos en producción:

- `statistics.observation_revision` supera 50 millones de filas.
- `intelligence.raw_observation` supera 20 millones de filas.
- `audit.audit_log` supera 100 millones de filas.
- El plan de una consulta de rango temporal deja de usar índice.

Particionar antes de tiempo añade complejidad de mantenimiento sin beneficio
medible: PostgreSQL 17 gestiona sin dificultad tablas de decenas de millones de
filas con los índices ya presentes.

### 4.2 Claves de partición

| Tabla | Estrategia | Clave | Intervalo |
|---|---|---|---|
| `statistics.observation` | RANGE | `period_start` | Anual |
| `statistics.observation_revision` | RANGE | `valid_from` | Anual |
| `intelligence.raw_observation` | RANGE | `received_at` | Trimestral |
| `audit.audit_log` | RANGE | `occurred_at` | Trimestral |

### 4.3 Procedimiento

El particionado de una tabla existente no es una migración en línea: requiere
ventana de mantenimiento.

1. Estimar el tamaño y la duración sobre una copia representativa; registrar la
   medición. Sin esa cifra no se aprueba la ventana.
2. Probar el ciclo completo en staging con volumen equivalente.
3. Verificar backup y **restauración probada** inmediatamente antes.
4. Crear la tabla particionada con el mismo esquema y restricciones.
5. Copiar por lotes acotados, verificando conteos por partición.
6. Renombrar dentro de una transacción con `LOCK TABLE`.
7. Recrear índices, disparadores y privilegios; confirmar con
   `scripts/verify_database_privileges.sh`.
8. Ejecutar `yarn test:integration` contra la base migrada.
9. Conservar la tabla original renombrada durante al menos 14 días.

**Rollback:** revertir el renombrado. Por eso la tabla original se conserva.

### 4.4 Creación anticipada de particiones

Una partición faltante hace fallar las escrituras. Deben crearse con al menos
un periodo de anticipación, y la ausencia de la partición del periodo siguiente
debe alertarse antes de que se necesite.

## 5. Corrección de datos

Nunca se corrige con `UPDATE` sobre el dato publicado.

| Situación | Procedimiento |
|---|---|
| Valor estadístico erróneo | Nueva `observation_revision`; la anterior pasa a `is_current = false` |
| Afirmación errónea | Nueva `fact_claim`; la anterior recibe `superseded_by_claim_id` |
| Fuentes en conflicto | `data_contradiction` abierta; ambas coexisten hasta resolución justificada |
| Error de normalización | Reproceso desde `raw_observation`, que conserva el original íntegro |

## 6. Publicación

| Dato | Publicación |
|---|---|
| Observación de fuente oficial sin contradicción | Automática |
| Observación con divergencia | Coexiste; revisión humana |
| `fact_claim` de tipo `FACT` o `INDICATOR_READING`, confianza suficiente | Automática |
| Cualquier inferencia, pronóstico, opinión o recomendación de IA | Revisión humana obligatoria |
| Impacto `CRITICAL` o `HIGH` | Revisión humana obligatoria |
| Cambio de metodología | Aprobación de `METHODOLOGY_STEWARD` |

## 7. Responsables

| Ámbito | Responsable |
|---|---|
| Catálogos y metodologías | `METHODOLOGY_STEWARD` |
| Revisión de afirmaciones y contradicciones | `DATA_REVIEWER` |
| Ingesta estadística institucional | `DATA_OFFICER` |
| Recolección automatizada | `INGESTION_AGENT` (sin capacidad de aprobar ni publicar) |

## 8. Verificación periódica

| Control | Frecuencia |
|---|---|
| Restauración de backup probada | Trimestral (evidencia en `docs/runbooks/evidence/`) |
| Soak test de 8–24 h | Antes de cada despliegue mayor (`yarn soak`) |
| Revisión de dead-letters pendientes | Semanal |
| Revisión de contradicciones abiertas | Semanal |
| Vigencia de particiones futuras | Mensual |
| Revisión de la matriz de privilegios | Cada despliegue |
