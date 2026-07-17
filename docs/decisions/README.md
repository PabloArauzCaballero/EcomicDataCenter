# Registro de decisiones arquitectónicas

Los ADR son inmutables después de aceptarse. Una decisión nueva reemplaza a la anterior mediante otro ADR; no se reescribe la historia sin indicarlo.

| ADR | Decisión | Estado |
|---|---|---|
| 0001 | Fastify como adapter HTTP | Aceptado |
| 0002 | Identidad externa y JWT por JWKS | Aceptado con contrato pendiente |
| 0003 | Sin cola en la primera versión | Aceptado |
| 0004 | Schemas y credenciales DB separadas | Aceptado |
| 0005 | Idempotencia mediante identidades del dominio | Aceptado |
| 0006 | Logs JSON a stdout/stderr | Aceptado |
| 0007 | Estrategia reader y proyecciones | Aceptado |
| 0008 | API versionada y OpenAPI contractual | Aceptado |
| 0009 | Transacciones serializables para revisiones | Aceptado |
| 0010 | NGINX + API stateless + migration job | Aceptado para Docker |
| 0011 | Backup según RPO/RTO | Propuesto; bloqueado por SLO |
| 0012 | Confidencialidad default-deny | Propuesto; bloqueado por política |
