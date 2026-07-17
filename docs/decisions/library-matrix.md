# Matriz de selección de librerías

## Criterio

Las versiones seleccionadas son las fijadas en `package.json`. La fase 2 evalúa responsabilidad y compatibilidad arquitectónica; vulnerabilidades y licencias deben verificarse automáticamente con el lockfile en CI antes de release.

| Responsabilidad | Candidatos considerados | Selección y versión | Compatibilidad | Seguridad y mantenimiento | Licencia esperada* | Rendimiento | Alternativa de salida | Fuente de decisión |
|---|---|---|---|---|---|---|---|---|
| Framework | NestJS, Fastify directo | NestJS 11.1.28 | Node 20–23, TS decorators | Proyecto maduro; majors requieren plan de migración | MIT | Coste de DI aceptado para modularidad | Fastify directo con mayor código transversal | Requisito backend + ADR-0001 |
| Adapter HTTP | Express, Fastify | Fastify 5.6.2 | Nest platform-fastify 11 | Plugins seleccionados deben soportar Fastify 5 | MIT | Menor overhead esperado; benchmark pendiente | Express adapter con ADR y pruebas | ADR-0001 |
| ORM | Sequelize, Prisma, TypeORM | Sequelize 6.37.7 + sequelize-typescript 2.1.6 | PostgreSQL 17; TypeScript | Línea estable requerida; no usar alpha | MIT | Consultas complejas pueden usar SQL constante en repository | SQL dedicado o migración ORM planificada | Requisito del proyecto |
| Migraciones | Umzug, sequelize-cli | Umzug 3.8.2 | Sequelize 6 | Ejecución separada y control programático | MIT | No aplica al tráfico runtime | Framework equivalente con historial compatible | ADR-0004 |
| Validación | Zod, Joi, class-validator | Zod 4.4.3 | TypeScript strict | Schema runtime y tipo inferido; validar cambios major | MIT | Coste acotado en límites HTTP/env | Joi/class-validator con migración explícita | Lineamiento backend |
| Logging | Pino, Winston | Pino 9.9.5 + nestjs-pino 4.6.1 | Fastify/Nest | Redacción central; revisar transports antes de agregar | MIT | JSON y bajo overhead relativo | Logger OTel compatible | ADR-0006 |
| JWT/JWKS | jose, jsonwebtoken+jwks-rsa | jsonwebtoken 9.0.2 + jwks-rsa 3.2.0 | CommonJS/Nest actual | Algoritmo fijo, timeout y cache; auditar CVE con lockfile | MIT | Verificación local salvo obtención de clave | `jose` en migración ESM controlada | ADR-0002 |
| Métricas | prom-client, OTel metrics | prom-client 15.1.3 | Node runtime | Evitar labels de alta cardinalidad | Apache-2.0 | Recolección interna; coste medible | OTel metrics exporter | Perfil actual monolítico |
| Contrato API | @nestjs/swagger, zod-openapi | @nestjs/swagger 11.2.0 + YAML versionado | Nest 11 | Swagger UI desactivable; contrato revisado en CI | MIT | Fuera de hot path salvo generación | Generador Zod/OpenAPI probado | ADR-0008 |
| Pruebas | Jest, Vitest | Jest 29.7.0 + Supertest 7.1.3 | ts-jest 29; Nest testing | Mantener versiones compatibles; no mezclar runners | MIT | Ejecución CI, no runtime | Vitest tras prueba de compatibilidad | Stack existente |
| Reverse proxy | NGINX, proxy de plataforma | NGINX 1.29.0-alpine en Compose | HTTP privado hacia Fastify | Imagen fijada; escaneo obligatorio | BSD-2-Clause | Rate limit y keepalive en borde | Ingress/Gateway de plataforma | ADR-0010 |

\* La licencia indicada debe confirmarse mediante SBOM/licence scan sobre el árbol resuelto por `yarn.lock`; no sustituye verificación legal.

## Dependencias no activadas

| Capacidad | Decisión |
|---|---|
| Redis/cache | No existe evidencia de necesidad ni política de invalidación. |
| BullMQ/pg-boss | No existe trabajo diferido actual; ver ADR-0003. |
| Circuit breaker | Solo existe JWKS de lectura con cache/timeout; reevaluar al agregar integraciones. |
| OpenTelemetry completo | Diferido hasta que existan procesos distribuidos o requisito enterprise. |
| Kubernetes/Helm | Diferido hasta definir plataforma y disponibilidad. |

## Gate de actualización

Una actualización major requiere:

1. revisión de notas oficiales;
2. compatibilidad de Node y peer dependencies;
3. auditoría de seguridad y licencia;
4. build, unit, integration y E2E;
5. benchmark si afecta transporte, ORM o serialización;
6. plan de rollback.
