# Informe de fase 6 — casos de uso y reglas de negocio

## Cabecera

```text
Fase actual: 6 de 10
Objetivo: cerrar registro, revisión, bulk, procedencia, estados e idempotencia de dominio.
Gate de entrada: aprobado
Gate de salida: aprobado estáticamente; E2E PostgreSQL bloqueado
```

## Avance realizado

- Migración `0015` agrega fingerprint SHA-256 y resultado JSON replayable al lote.
- Registro individual y bulk reclaman `batchCode` de forma atómica.
- Un reintento idéntico reproduce el resultado; un payload diferente devuelve conflicto.
- La procedencia verifica organización, propiedad de fuente y pertenencia del artefacto al dataset.
- El hash de revisión incluye publicación, vintage y motivo de revisión.
- Bulk mantiene `SAVEPOINT` por registro y respuesta parcial.
- Las máquinas de estado de dataset y metodología se aislaron en políticas puras con pruebas.
- Se añadieron pruebas de fingerprints, replay y transiciones.

## Riesgos y mitigación

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Reusar batch con otro payload | Duplicidad o respuesta incorrecta | Fingerprint completo + `409` |
| Fuente de otra organización/dataset | Trazabilidad falsa | Validación cruzada transaccional |
| Hash incompleto | Revisiones distintas tratadas como iguales | Incluir metadatos de revisión |
| Error local en bulk | Rollback total innecesario | SAVEPOINT por registro |

## Desviaciones

El registro individual generaba un código aleatorio, por lo que no era reintentable por el cliente. Ahora exige `batchCode` explícito y el contrato OpenAPI fue actualizado.

## Estado

**Aprobada estáticamente.** La concurrencia idempotente debe probarse con PostgreSQL real.
