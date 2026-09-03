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
| 0013 | Idempotencia de replay para submission de agentes | Propuesto; bloqueado por evidencia |
| 0014 | Estrategia de reprocesamiento de cuarentena | Propuesto; bloqueado por modelo de datos |
| 0015 | Trazabilidad distribuida con OpenTelemetry y Jaeger | Aceptado |
| 0016 | Credencial compartida para el colector alojado | Aceptado |
| 0017 | Recolección diaria determinista | Aceptado |
| 0018 | Aprovisionar la base en el arranque | Aceptado |
| 0019 | Cobertura de prensa y listados renderizados | Aceptado |
| 0020 | Materializar los modelos de lectura de prensa | Aceptado |
| 0021 | La curva de rendimientos vive fuera de las lecturas medidas | Aceptado |
| 0022 | Las lecturas sociales entran como expectativa, nunca como medición | Aceptado |
| 0023 | El comercio se lee por su forma de hacer negocio, no por la plataforma | Aceptado |
| 0024 | El panel mundial entra completo, no como lista de lectura | Aceptado |
| 0025 | El registro lee comercio, no plataformas | Aceptado |
