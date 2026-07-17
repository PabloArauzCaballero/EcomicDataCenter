# Baseline y presupuesto de rendimiento

## Diferencia entre presupuesto y SLO

Los límites actuales son defensas del producto, no compromisos institucionales. Los SLO de disponibilidad, latencia y frescura permanecen **UNKNOWN** hasta contar con volumen, infraestructura y aprobación del cliente.

## Escenario reproducible

`test/load/query-baseline.k6.js` ejecuta consultas paginadas autenticadas. Sus valores por defecto sirven solo como smoke de carga local:

- 5 usuarios virtuales;
- 30 segundos;
- error menor a 1 %;
- p95 menor a 1 segundo.

Estos umbrales no deben publicarse como SLO. Deben reemplazarse tras medir:

- dataset representativo;
- cardinalidad real de dimensiones;
- distribución de filtros y fechas vintage;
- número máximo de réplicas API;
- límite total de conexiones PostgreSQL;
- latencia de red y replica lag.

## Evidencia requerida

Guardar JSON de k6 y planes `EXPLAIN (ANALYZE, BUFFERS)` en `artifacts/load/`, que está ignorado por Git. Comparar antes y después de cualquier índice, cache o vista materializada.
