# Guía de uso de Claude Code en este proyecto

> Fase 12 de `CLAUDE_ORGANIZAR_SKILLS_BACKEND.md`.

## Skills del proyecto (invócalas por nombre)

| Necesidad | Skill | Cómo invocarla | Evidencia esperada |
|---|---|---|---|
| Implementar/extender backend | `backend-production` | "Usa la skill backend-production para…" | Código, migración/modelos si aplica, pruebas, `quality:all` verde |
| Endurecer / auditoría por fases | `backend-hardening` | "Usa backend-hardening sobre…" | Matriz de hallazgos + correcciones + evidencia |
| Revisar Clean Code del diff | `clean-code-review` | "Aplica clean-code-review al diff" | Observaciones + gates de estilo verdes |
| Auditar seguridad | `security-audit` | "Ejecuta security-audit en…" | Matriz de riesgos + `security:audit`/`quality:security` |
| Auditar observabilidad | `observability-audit` | "Corre observability-audit" | Señales presentes/ausentes + salida de `/metrics` |
| Auditar rendimiento | `performance-audit` | "Usa performance-audit para…" | Baseline + comparación antes/después |
| Elegir/evaluar librería | `library-selection` | "library-selection para <responsabilidad>" | Matriz + decisión + `security:audit` |
| Verificar producción | `production-verification` | "Ejecuta production-verification" | Tabla control→resultado + veredicto |

## Comandos internos de Claude Code (integrados en este entorno)

`/code-review`, `/security-review`, `/simplify`, `/run`, `/init`. No inventes slash commands: los de
plugins solo existen tras instalarlos y verificarlos con `claude plugin details`.

## Comandos del proyecto (yarn)

- Calidad: `yarn quality:all` · `yarn lint` · `yarn typecheck` · `yarn format:check` · `yarn security:audit`
- Pruebas: `yarn test` · `yarn test:integration` (con `INTEGRATION_DATABASE_URL`) · `yarn test:e2e`
- Base de datos (local, pasar `DATABASE_*_URL` inline): `yarn db:migrate` · `yarn db:verify:migrations`
- Contratos: `yarn openapi:export` · `yarn postman:generate`
- Operación: `yarn local:up` · `yarn local:verify` · `yarn soak` · `yarn release:verify`

## Reglas activas por ruta

Al editar `src/**`, `test/**`, `package.json`, `docs/**` se cargan automáticamente las reglas de
`.claude/rules/` correspondientes. Ver `.claude/rules/` y `docs/claude/skills-traceability.md`.

## Plugins

Aún no instalados (ver `installation-report.md`). Para instalarlos, sigue
`plugin-selection-matrix.md` en una sesión interactiva y añade cada uno a `.claude/settings.json`
por fusión.
