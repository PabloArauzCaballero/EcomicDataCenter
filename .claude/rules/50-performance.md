---
paths:
  - 'src/modules/query/**/*.ts'
  - 'src/common/persistence/**/*.ts'
  - 'src/database/**/*.ts'
---

# Rendimiento y escalabilidad

- Medir antes de optimizar. No aceptar una optimización sin baseline ni sin verificar regresiones
  (`scripts/soak-test.mjs` → `yarn soak`; comparar por media de mitades, no muestras sueltas).
- Paginación en base de datos, nunca en memoria. Preferir cursor keyset sobre `OFFSET` profundo;
  no calcular `COUNT(*)` de ventana cuando se pagina por cursor.
- Evitar N+1: agregación con JSON (`jsonb_agg`) o joins acotados. Toda FK crítica indexada
  (gate `quality:physical-model` verifica cobertura de índices líder).
- Transacciones cortas; lotes fragmentados que confirman por bloques (no una transacción gigante).
  Reintento serializable acotado; sin reintentos ilimitados.
- `statement_timeout`, `idle_in_transaction_session_timeout` y pools acotados ya configurados; no
  removerlos. Lectura por `ReadQueryExecutor` en transacción `READ ONLY`.
- Payloads acotados por Zod (límites de tamaño de lote y de campos). Sin cargas completas
  innecesarias en memoria.
- Crecimiento a largo plazo: particionado/archivado solo cuando el volumen real lo justifique
  (umbrales en `docs/runbooks/data-lifecycle-and-partitioning.md`). No introducir microservicios,
  Kafka ni Redis sin justificación y ADR.
