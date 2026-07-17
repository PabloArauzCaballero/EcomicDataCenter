# ADR-0009: aislamiento serializable para registro y revisión

- Estado: aceptado
- Fecha: 2026-07-16
- Responsables: arquitectura backend

## Contexto

Dos cargas concurrentes podrían crear revisiones corrientes duplicadas o numeraciones inconsistentes para una misma observación.

## Decisión

Las operaciones de registro/revisión usan transacción `SERIALIZABLE`, bloqueo de la observación/revisión pertinente e índices únicos como última línea de defensa. Los conflictos de serialización pueden reintentarse con límite; errores de validación o negocio no se reintentan.

El bulk usa una transacción controlada con `SAVEPOINT` por registro para devolver resultados parciales sin abrir cientos de transacciones paralelas.

## Consecuencias

- Puede existir mayor contención sobre la misma serie/periodo.
- Los retries deben incluir jitter o límite estricto y métricas.
- La eficacia debe probarse con concurrencia real de PostgreSQL.

## Validación

Pruebas concurrentes de la misma observación, revisión corriente única y rollback de lote.
