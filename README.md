# Observatorio Económico Core Backend

> Estado formal del plan: **10 de 10 fases trabajadas y cerradas estáticamente**. El release productivo permanece bloqueado hasta completar los gates runtime e institucionales descritos en `validation/validation-report.md`.

Backend de producción para el núcleo de datos del **Observatorio de la Situación Económica y de los Mercados de Bolivia**. La implementación transforma el modelo lógico de 40 entidades en una API NestJS y un modelo físico PostgreSQL, manteniendo como núcleo dos operaciones: registrar datos y consultarlos con trazabilidad histórica.

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
- OpenAPI, Postman, PlantUML, modelo de datos LaTeX/PDF, backup/restore y runbooks.

No se inventaron usuarios locales, dashboards, noticias, IA, pronósticos ni microdatos: esos elementos no pertenecen al modelo entregado.

## Stack

- Node.js `>=20.19 <24`
- NestJS 11 + Fastify
- TypeScript estricto
- PostgreSQL + Sequelize 6 + Umzug
- Zod
- Pino y Prometheus
- Jest + Supertest
- Yarn 1

## Inicio local

### 1. Preparar configuración

```bash
cp .env.example .env
```

Cambie todos los valores `change-me`. `AUTH_MODE=disabled` está permitido únicamente fuera de producción.

### 2. Instalar dependencias

```bash
corepack enable
yarn install
```

El entorno donde se generó este entregable no tuvo acceso al registro de paquetes, por lo que no fue posible producir un `yarn.lock` verificable. Antes de desplegar, genere y revise el lockfile en un entorno con red y luego use siempre:

```bash
yarn install --frozen-lockfile
```

### 3. Ejecutar migraciones y seeds

```bash
yarn db:migrate
yarn db:verify:privileges
yarn db:seed:boot
```

Datos sintéticos de desarrollo, nunca en producción:

```bash
yarn db:seed:mock
```

### 4. Iniciar API

```bash
yarn dev
```

Con Docker Compose, NGINX es la única entrada pública:

```bash
docker compose up --build
```

- API: `http://localhost:8080/api/v1`
- Health: `http://localhost:8080/health`
- Readiness: `http://localhost:8080/ready`
- Métricas: `/metrics` únicamente en la red interna de la API; NGINX responde 404 por defecto

## Autorización

| Rol                   | Responsabilidad                             |
| --------------------- | ------------------------------------------- |
| `DATA_OFFICER`        | Registro, corrección e importación de datos |
| `ANALYST`             | Consulta y trazabilidad                     |
| `METHODOLOGY_STEWARD` | Gobierno semántico, publicación y calidad   |

El token debe incluir los claims configurados en `AUTH_ROLE_CLAIM` y `AUTH_ORGANIZATION_CLAIM`.

## Calidad

```bash
yarn format:check
yarn lint
yarn typecheck
yarn test
yarn quality:all
yarn build
```

Los validadores que no requieren dependencias instaladas pueden ejecutarse directamente:

```bash
python scripts/check_file_limits.py
node scripts/check_typescript_syntax.cjs
python scripts/validate_diagrams.py
python scripts/validate_physical_model.py
python scripts/validate_project.py
python scripts/validate_openapi.py
python scripts/validate_contract_routes.py
```

Consulte `validation/validation-report.md` para distinguir evidencia ejecutada de gates bloqueados.

### Gate de verificación de release

En una estación con Yarn, PostgreSQL 17 y Docker:

```bash
sh scripts/run_release_verification.sh
```

El script falla temprano si no existe `yarn.lock` o falta una herramienta. Carga, backup y restore se ejecutan después con datos y objetivos aprobados.

## Documentación

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
- Progreso y limitaciones: `docs/progress/progress-report.md`
