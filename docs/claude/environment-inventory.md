# Inventario de entorno para Claude Code

> Fase 0 de `CLAUDE_ORGANIZAR_SKILLS_BACKEND.md`. Solo lectura; sin secretos.

| Campo | Valor | Evidencia |
|---|---|---|
| Fecha (UTC) | 2026-07-21 | — |
| Sistema operativo | Windows 11 | shell de la sesión |
| Shell | PowerShell (primario) + Bash (Git Bash) | entorno de la sesión |
| Raíz del repositorio | `EcomicDataCenter` | cwd |
| Rama Git | `HARDENING` | `git branch --show-current` |
| Cambios sin confirmar | 354 archivos (trabajo de hardening y de esta organización en curso) | `git status --short` |
| Node.js | v22.23.1 | `node --version` |
| Node requerido | `>=20.19 <21 \|\| >=22 <23` | `package.json` engines |
| npm | 10.9.8 | `npm --version` |
| Gestor de paquetes | **Yarn 1.22.22** | `package.json` packageManager + `yarn.lock` |
| Git | 2.52.0 | `git --version` |

## Stack real detectado (evidencia = código, no suposición)

| Capa | Tecnología | Evidencia |
|---|---|---|
| Framework HTTP | **NestJS 11 + Fastify** (no Express) | `@nestjs/platform-fastify`, `docs/decisions/0001-fastify-adapter.md`, gate `quality:architecture` "Regla anti-Express" |
| Lenguaje | TypeScript estricto | `tsconfig.json` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| ORM | Sequelize 6 + `sequelize-typescript` | dependencias + `src/database/models/` |
| Migraciones | Umzug 3 | `src/database/cli/migrate.ts` |
| Base de datos | PostgreSQL 17 | Dockerfile/compose + `docs/decisions/0004-database-isolation.md` |
| Validación | Zod 4 | `src/**/*.schemas.ts` |
| AuthN/AuthZ | JWT externo RS256/JWKS + RBAC | `src/common/auth/`, ADR 0002 |
| Observabilidad | Pino (nestjs-pino) + Prometheus (prom-client) | `src/common/observability/`, ADR 0006 |
| Pruebas | Jest + Supertest (unit + integración con PostgreSQL) | `jest.config.cjs`, `test/jest-integration.json` |
| Contratos | OpenAPI 3.0.3 + Postman (generados) | `docs/endpoints/openapi.yaml`, `scripts/build_openapi.py` |
| Colas / workers | **Deferidas explícitamente** | `docs/decisions/0003-no-queue-initially.md`, gate `quality:async-scope` |
| CI/CD | GitHub Actions | `.github/workflows/ci.yml`, `codeql.yml` |
| IaC / cloud | No hay Terraform ni AWS toolkit; despliegue por Docker/Compose | `Dockerfile`, `docker-compose.yml` |
| Redis | No usado | sin dependencia; sin evidencia en código |

## Gates de calidad ya existentes (18 en `quality:all`)

`quality:files, quality:syntax, quality:naming, quality:imports, quality:diagrams,
quality:clean-code, quality:architecture, quality:physical-model, quality:seeds,
quality:persistence, quality:use-cases, quality:security, quality:async-scope,
quality:operations, quality:project, quality:openapi, quality:routes` (+ `db:verify:*`).

## Datos NO verificables en esta sesión (limitaciones)

- **La CLI `claude` no es invocable desde esta sesión** (`command -v claude` sin resultado). Por tanto:
  - No se pudo ejecutar `/doctor`, `/plugin`, `claude plugin list` ni instalar plugins.
  - La disponibilidad real de cada plugin en el marketplace **no fue verificada**; la matriz de la Fase 2 marca ese estado como "pendiente de verificación humana".
- No se inspeccionaron variables de entorno sensibles (política de la orden).

## Contradicción crítica detectada (Fase 2, regla 8)

`prompt/index.md` §6 menciona "Backend Node.js con Express" y §10 exige workers `pg-boss`
persistentes. El sistema **real** implementado es NestJS + Fastify **sin colas** (ADR 0003,
gate `async-scope`), en línea con `prompt/programacionBackend.md` §4 ("Regla anti-Express").
Se resuelve a favor del código real (regla 5: el código es evidencia del stack). Detalle y
tratamiento en `current-configuration-audit.md`.
