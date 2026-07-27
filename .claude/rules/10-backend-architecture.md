---
paths:
  - 'src/**/*.ts'
---

# Arquitectura backend (NestJS + Fastify)

- NestJS 11 sobre Fastify. **Regla anti-Express**: no introducir Express ni middlewares Express
  (`prompt/programacionBackend.md` §4; gate `quality:architecture`).
- Separación de capas estricta: controller (transporte) → service (negocio) → repository
  (persistencia). No mezclar HTTP con reglas de negocio.
- Los controllers **no** importan detalle de persistencia (`sequelize`, `database/models`); el
  gate `quality:persistence` lo verifica. No devolver modelos ORM: usar DTO/mappers de respuesta.
- Un módulo no importa el interior de otro módulo (`quality:architecture`). Composición por
  módulos registrados en `AppModule`.
- Prohibidos los controllers genéricos (`quality:use-cases`, `programacionBackend.md` §15).
- Validación de entrada siempre con Zod en el borde (pipe de validación), antes del service.
- Lectura y escritura usan pools separados (reader/writer). Repos de consulta pasan por
  `ReadQueryExecutor`; nunca usan el writer (`quality:persistence`, ADR 0004/0007).
- Idempotencia de dominio por clave de negocio + huella (ADR 0005). Reintentos serializables
  acotados (`withSerializableRetry`, ADR 0009).
- Sin colas ni workers salvo ADR que lo apruebe (ADR 0003; gate `async-scope`). No agregar
  dependencias de cola (`bullmq`, `pg-boss`, etc.).
- Apagado controlado con `SIGINT`/`SIGTERM` y cierre de pools.
