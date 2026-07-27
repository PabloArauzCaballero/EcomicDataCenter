---
paths:
  - 'test/**/*.ts'
  - 'src/**/*.spec.ts'
---

# Pruebas y verificabilidad

- Pruebas unitarias de lógica pura (`*.spec.ts`) rápidas y deterministas: normalización, políticas
  de enrutamiento/revisión, resolución de entidades, idempotencia (huella), esquemas Zod.
- Pruebas de integración contra PostgreSQL real (`test/integration/*.integration-spec.ts`,
  `yarn test:integration`, requiere `INTEGRATION_DATABASE_URL`): garantías que viven en la base
  (triggers de inmutabilidad, auditoría append-only, publicación sin evidencia, contradicciones),
  concurrencia (idempotencia bajo peticiones simultáneas, upserts concurrentes) y **ejecutabilidad
  del SQL generado** (un plan puede compilar como texto y fallar al ejecutar).
- La base de integración se toma **solo** de `INTEGRATION_DATABASE_URL`, nunca del `.env`: una suite
  que trunca tablas no debe poder alcanzar la base remota.
- No elimines ni ignores pruebas para poner el resultado en verde. Documenta las que dependan de
  servicios externos.
- Al aportar una capacidad nueva, añade su prueba (unitaria y, si toca la base o la concurrencia,
  de integración). Verifica: `yarn test` y `yarn test:integration`.
