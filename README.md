# Observatorio Económico Core Backend

> Estado: rama `HARDENING` preparada para validación técnica local y revisión previa a producción. La aprobación productiva continúa bloqueada hasta completar los gates runtime e institucionales indicados en `docs/hardening/production-review-checklist.md`.

Backend para el núcleo de datos del **Observatorio de la Situación Económica y de los Mercados de Bolivia**. La implementación transforma el modelo lógico en una API NestJS y un modelo físico PostgreSQL, manteniendo como capacidades centrales el registro y la consulta de datos con trazabilidad histórica.

## Capacidades implementadas

- Procedencia: organizaciones, fuentes y artefactos inmutables.
- Gobierno semántico: dominios, conceptos, frecuencias, unidades, geografía, listas y clasificaciones versionadas.
- Metadatos: operaciones estadísticas, metodologías, estructuras, datasets e indicadores.
- Registro individual transaccional con revisión y conservación de _vintages_.
- Importación por lotes de hasta 500 observaciones con resultados parciales, `SAVEPOINT` por registro y replay idempotente.
- Consulta actual o según una fecha de corte, paginada en servidor.
- Calidad, incidencias, rupturas de serie, linaje y relaciones entre indicadores.
- JWT externo RS256/JWKS con issuer, audience, organización UUID, autorización por rol y política default-deny.
- Logs estructurados, métricas Prometheus, liveness y readiness.
- OpenAPI, Postman, PlantUML, modelo de datos, backup/restore y runbooks.

No se incorporaron usuarios locales, dashboards, noticias, IA, pronósticos ni microdatos porque no pertenecen al modelo entregado.

## Stack

- Node.js `>=20.19 <21` o `>=22 <23`
- NestJS 11 + Fastify
- TypeScript estricto
- PostgreSQL 17 + Sequelize 6 + Umzug
- Zod
- Pino y Prometheus
- Jest + Supertest
- Yarn `1.22.22`

## Inicio local recomendado: stack completo con Docker

### 1. Preparar herramientas y configuración

```bash
corepack enable
yarn local:env
yarn install --frozen-lockfile
```

`yarn local:env` genera contraseñas aleatorias y crea un `.env` coherente para PostgreSQL, migraciones, API y backup. No sobrescribe un archivo existente.

### 2. Construir e iniciar

```bash
yarn local:up
```

NGINX es la única entrada pública. El API espera a que el migrador termine correctamente.

### 3. Ejecutar verificación local

```bash
yarn local:verify
```

El comando espera liveness y readiness, ejecuta smoke tests y guarda evidencia en:

```text
artifacts/smoke/smoke-results.json
```

Puntos de acceso:

- API: `http://localhost:8080/api/v1`
- Health: `http://localhost:8080/health`
- Readiness: `http://localhost:8080/ready`
- Swagger local: `http://localhost:8080/docs`
- Métricas: internas; NGINX no publica `/metrics`

### 4. Logs y apagado

```bash
yarn local:logs
yarn local:down
```

La guía detallada, incluido el modo de depuración con API en host, está en `docs/hardening/local-verification.md`.

## Desarrollo con API en el host

```bash
yarn local:env:host
yarn local:db:up
yarn db:migrate
yarn db:verify:privileges
yarn db:seed:boot
yarn db:seed:mock
yarn dev
```

En otra terminal:

```bash
yarn local:verify
```

El override `docker-compose.local.yml` publica PostgreSQL solamente en `127.0.0.1`.

## Autorización

| Rol                   | Responsabilidad                             |
| --------------------- | ------------------------------------------- |
| `DATA_OFFICER`        | Registro, corrección e importación de datos |
| `ANALYST`             | Consulta y trazabilidad                     |
| `METHODOLOGY_STEWARD` | Gobierno semántico, publicación y calidad   |

El token debe incluir los claims configurados en `AUTH_ROLE_CLAIM` y `AUTH_ORGANIZATION_CLAIM`.

`AUTH_MODE=disabled` está permitido únicamente fuera de producción. La validación de entorno rechaza ese modo en producción.

## Calidad

```bash
yarn format:check
yarn lint
yarn typecheck
yarn quality:all
yarn test
yarn build
```

Los validadores que no requieren una base en ejecución también pueden ejecutarse de manera individual:

```bash
python scripts/check_file_limits.py
node scripts/check_typescript_syntax.cjs
python scripts/validate_diagrams.py
python scripts/validate_physical_model.py
python scripts/validate_project.py
python scripts/validate_openapi.py
python scripts/validate_contract_routes.py
```

### Gate de verificación de release

En una estación con Yarn, PostgreSQL 17 y Docker:

```bash
yarn release:verify
```

El gate falla temprano si falta una herramienta, el lockfile no es reproducible, la auditoría de dependencias bloquea el release o una validación técnica falla. Carga prolongada, backup y restore requieren un entorno y objetivos aprobados.

## Documentación

- Verificación local: `docs/hardening/local-verification.md`
- Plan de hardening: `docs/hardening/plan.md`
- Hallazgos: `docs/hardening/findings.md`
- Eficiencia de recursos: `docs/hardening/resource-efficiency.md`
- Controles de seguridad: `docs/hardening/security-controls.md`
- Estándares de data center: `docs/hardening/data-center-standards-mapping.md`
- Checklist de producción: `docs/hardening/production-review-checklist.md`
- Arquitectura: `docs/architecture/architecture.md`
- Flujos: `docs/architecture/flows.md`
- Contrato HTTP: `docs/endpoints/openapi.yaml`
- Guía de endpoints: `docs/endpoints/endpoints.md`
- Postman: `docs/postman/collection.json`
- Modelo físico: `docs/data-model/data-model.pdf`
- Auditoría física: `docs/data-model/physical-model-audit.md`
- Roles y grants: `docs/data-model/schema-ownership-and-grants.md`
- Decisiones: `docs/decisions/`
- Runbooks: `docs/runbooks/`
