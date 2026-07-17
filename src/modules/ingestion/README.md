# Ingestión

Implementa registro individual y carga por lotes.

## Flujo

1. Validar contrato Zod y actor.
2. Verificar estructura, dimensiones, frecuencia, unidad e indicador.
3. Normalizar la identidad de serie y la revisión.
4. Abrir transacción `SERIALIZABLE` con reintento limitado.
5. crear o localizar serie y observación;
6. bloquear la revisión corriente;
7. detectar duplicado idempotente por hash;
8. conservar la revisión anterior y registrar la nueva;
9. evaluar reglas de calidad y crear incidencias;
10. confirmar la transacción.

Los lotes usan una transacción y un `SAVEPOINT` por registro. Un fallo de un elemento se reporta sin revertir los registros válidos. El máximo de 500 evita payloads y transacciones sin límite.
