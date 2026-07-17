# Informe de fase 5 — persistencia, queries y transacciones

## Cabecera

```text
Fase actual: 5 de 10
Objetivo: aislar lectura/escritura, limitar ejecutores y endurecer transacciones.
Gate de entrada: aprobado
Gate de salida: aprobado estáticamente; integración PostgreSQL bloqueada
```

## Avance realizado

- `ReadQueryExecutor` abre transacciones read-only, mide duración y normaliza errores de infraestructura.
- Reader y writer usan credenciales y registros de modelos separados.
- Los repositories de consulta conservan SQL y joins del dominio; el ejecutor no se convirtió en objeto dios.
- Se creó un plan puro y parametrizado para consultas estadísticas.
- Se eliminaron `SELECT *` de trazabilidad mediante columnas explícitas.
- El retry serializable solo cubre `40001` y `40P01`, con intentos limitados y jitter.
- Se añadieron pruebas para clasificación de reintentos y construcción del query plan.

## Riesgos y mitigación

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Retry indiscriminado | Duplicidad o tormenta de reintentos | Solo errores transitorios PostgreSQL |
| Reader con modelos writer | Escritura accidental | Registro aislado y transacción read-only |
| Query manager universal | Acoplamiento y SQL inseguro | Interfaz mínima; SQL en repositories |
| `SELECT *` | Overfetch y contratos inestables | Whitelist de columnas |

## Decisiones

No se creó `CommandManager`: duplicaría Sequelize sin reducir complejidad.

## Estado

**Aprobada estáticamente.** Falta prueba de integración con reader/writer reales.
