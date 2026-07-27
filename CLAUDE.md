# Observatorio Económico Core — Instrucciones del proyecto

Backend NestJS del núcleo de datos del Observatorio de la Situación Económica y de los Mercados
de Bolivia, con una capa de inteligencia que recibe datos de agentes de IA. Objetivo: información
trazable, versionada, auditada y segura, preparada para producción real.

## Precedencia (mayor a menor)

1. Requisitos aprobados y reglas de negocio institucionales.
2. `prompt/index.md` → `prompt/programacionGeneral.md` → `prompt/programacionBackend.md`.
3. Decisiones de arquitectura vigentes: `docs/decisions/*.md` (ADR).
4. Diagramas y contratos: `systemInfo/*.puml`, `docs/endpoints/openapi.yaml`.
5. Código y pruebas existentes (evidencia del stack real).
6. Supuestos documentados.

> Cuando `prompt/index.md` contradiga al código real, gobierna el código y el ADR. Obsoletos
> conocidos: `index.md` §6 (Express → es NestJS/Fastify), §10 (workers pg-boss → colas deferidas
> por ADR 0003), §8 (.zip). Ver `docs/claude/current-configuration-audit.md`.

## Stack (no cambiar sin ADR)

NestJS 11 + Fastify · TypeScript estricto · Sequelize 6 + Umzug + PostgreSQL 17 · Zod ·
JWT RS256/JWKS + RBAC · Pino + Prometheus · Jest + Supertest · Yarn 1.22.22.
Sin Express, sin colas, sin Redis, sin ORM alterno. Gestor de paquetes: **yarn** (no npm/pnpm).

## Reglas críticas

- Trabaja con precisión (temperatura 0). No inventes requisitos, entidades, endpoints, env vars,
  librerías ni comandos. Si falta información crítica o hay contradicción, **detente y pregunta**.
- No expongas secretos ni los escribas en archivos versionados o logs. `.env` no se versiona.
- No ejecutes operaciones destructivas (migraciones en prod, `sync({force/alter})`, `DROP`,
  `git push`, recursos cloud, DDL en Neon) sin aprobación explícita.
- **Las `db:*` locales apuntan a Neon remoto por defecto** (dotenv carga `.env`). Para una base
  local, pasa las `DATABASE_*_URL` inline antes del comando. Ver memoria del proyecto.
- Los datos crudos y la auditoría son inmutables; las correcciones crean revisiones, no borran.
- Los resultados de agentes de IA son entrada **no confiable**: validar, aislar, revisar.
- No declares nada "hecho" ni "listo para producción" sin evidencia ejecutada.

## Comandos verificados (`package.json`)

- Instalar: `yarn install --frozen-lockfile`
- Build / tipos / lint / formato: `yarn build` · `yarn typecheck` · `yarn lint` · `yarn format:check`
- Pruebas: `yarn test` (unit) · `yarn test:integration` (requiere `INTEGRATION_DATABASE_URL`) · `yarn test:e2e`
- Gates de calidad: `yarn quality:all` (18 validadores) · `yarn security:audit`
- Base de datos: `yarn db:migrate` · `yarn db:verify:migrations` · `yarn db:seed:boot`
- Contratos: `yarn openapi:export` · `yarn postman:generate`
- Operación local: `yarn local:up` · `yarn local:verify` · `yarn soak` · `yarn release:verify`

## Reglas modulares y skills

- Reglas por tema/ruta: `.claude/rules/` (arquitectura, clean code, seguridad, observabilidad,
  rendimiento, testing, librerías, base de datos, documentación).
- Procedimientos especializados: `.claude/skills/` — invócalos por nombre. Índice de uso en
  `docs/claude/usage-guide.md`.

## Evidencia

Toda fase termina con verificación ejecutada y registrada: build, typecheck, lint, pruebas,
`quality:all`, y cuando aplique migraciones/seeds/arranque contra PostgreSQL real. Registra
resultados y limitaciones; no ocultes fallos. Evidencia operativa firmada en
`docs/runbooks/evidence/`.
