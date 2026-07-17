# Seeds

Existen exactamente dos categorías persistentes:

- `boot/`: catálogos mínimos permitidos en producción.
- `mock/`: escenario sintético determinista, rechazado cuando `NODE_ENV=production`.

Todos los JSON se validan con Zod antes de persistirse. Los registros usan UUID o códigos estables y se reconcilian mediante upsert controlado. `verify-seed-idempotency.ts` ejecuta cada grupo dos veces para detectar duplicados o cambios no deterministas.
