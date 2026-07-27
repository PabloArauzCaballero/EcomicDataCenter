# Informe de instalación

> Fase 12 de `CLAUDE_ORGANIZAR_SKILLS_BACKEND.md`.

## Estado de instalación de plugins

**Perfil mínimo instalado y habilitado (scope user), con autorización explícita del usuario.**

El binario real se localizó dentro de la extensión de VS Code:
`…\.vscode\extensions\anthropic.claude-code-2.1.216-win32-x64\resources\native-binary\claude.exe`
(v2.1.216). No estaba en el PATH del shell, por eso las primeras búsquedas no lo encontraron.

### Ejecutado y verificado en esta sesión

| Acción | Resultado |
|---|---|
| `npm install -g typescript-language-server typescript` | ✅ `typescript-language-server --version` → **5.3.0**; `tsc` global presente |
| `claude plugin marketplace add anthropics/claude-plugins-official` | ✅ clonado por HTTPS, validado (258 plugins) |
| `claude plugin install <p>@claude-plugins-official --scope user` × 7 | ✅ exit 0 en los 7 |
| `claude plugin list` | ✅ los 7 `enabled`, scope user |
| Carga de las 8 skills de `.claude/skills/` por el runtime | ✅ registradas y activas |

### Plugins instalados (scope user)

| Plugin | Versión | Estado |
|---|---|---|
| `code-simplifier` | 1.0.0 | enabled |
| `typescript-lsp` | 1.0.0 | enabled (prerequisito tsserver 5.3.0 instalado) |
| `security-guidance` | 2.0.6 | enabled (4 hooks harness-only, ~0 tokens) |
| `42crunch-api-security-testing` | 1.15.0 | enabled |
| `context7` | (commit) | enabled |
| `claude-code-setup` | 1.0.0 | enabled |
| `claude-md-management` | 1.0.0 | enabled |

Se instalaron en **scope user** (personales, en `~/.claude/`), no en el repo: el `.claude/settings.json`
del proyecto se deja con `enabledPlugins: {}` a propósito, porque compartir plugins por el repo
(scope project) requiere aprobación del equipo. Reversible con
`claude plugin uninstall <p>@claude-plugins-official --prune` y
`npm uninstall -g typescript-language-server typescript`.

## Plugins aprobados para instalar (perfil mínimo, sin auth)

`typescript-lsp`, `code-simplifier`, `security-guidance`, `42crunch-api-security-testing`,
`context7`, `claude-code-setup`, `claude-md-management`. Comandos en
`docs/claude/plugin-selection-matrix.md`.

- Prerrequisito: `npm install -g typescript-language-server typescript` (o alternativa si el equipo
  prohíbe globales). Verificar con `typescript-language-server --version`.

## Plugins condicionales (requieren decisión o auth)

- **Auth de MCP externo:** `neon` (la base remota es Neon), `github`, `postman`,
  `sentry`/`datadog`/`grafana*`, `aikido`. Autenticar en el momento, permisos mínimos, sin tokens en Git.
- **Elección única:** un SAST (`semgrep` o `aikido`), una plataforma de observabilidad, una
  herramienta de revisión profunda (`pr-review-toolkit` o el `/code-review` ya disponible).

## Plugins descartados

`redis-development` (sin Redis), `terraform`/`aws-dev-toolkit` (sin IaC/AWS), `playwright` (backend
sin frontend; E2E de API ya cubierto), `mcp-server-dev`/`plugin-dev` (no se construye MCP/plugin propio).

## Cambios de archivos realizados (sin plugins)

Creados:
- `CLAUDE.md` (raíz, breve).
- `.claude/README.md`, `.claude/settings.json` (enabledPlugins vacío, para fusionar al instalar).
- `.claude/rules/` (10 reglas modulares con `paths`).
- `.claude/skills/` (8 skills: backend-production, backend-hardening, clean-code-review,
  security-audit, observability-audit, performance-audit, library-selection, production-verification).
- `docs/claude/` (environment-inventory, current-configuration-audit, plugin-selection-matrix,
  skills-traceability, installation-report, validation-report, usage-guide).

No se modificó `~/.claude/` (config global del usuario) ni su memoria. No se tocó `settings.json`
del usuario.

## Riesgos

- `enabledPlugins` vacío es intencional; al instalar, añadir por fusión y revisar el diff.
- `neon` con acceso de escritura sería peligroso: empezar en solo-lectura; DDL destructivo prohibido
  sin plan/respaldo.

## Autenticación pendiente

Toda la de la lista condicional. Ninguna credencial fue solicitada ni almacenada.
