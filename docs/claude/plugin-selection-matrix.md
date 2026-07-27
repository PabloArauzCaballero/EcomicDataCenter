# Matriz de selección de plugins de Claude Code

> Fase 2 de `CLAUDE_ORGANIZAR_SKILLS_BACKEND.md`. Catálogo fuente:
> `claude_backend_skills_recomendadas.json`.

## Advertencia de verificación (obligatoria)

**La CLI `claude` no es invocable desde esta sesión de agente.** No se pudo ejecutar
`claude plugin list --json --available`, `claude plugin details`, `/plugin` ni `/doctor`. Por
tanto, la columna **Disponibilidad** dice "sin verificar" en todos los casos: refleja lo que el
catálogo declara, no una comprobación contra el marketplace. **La instalación queda para ejecución
humana** en una sesión interactiva de Claude Code, tras `claude plugin details <plugin>`.

Esto respeta las reglas de la orden: no inventar disponibilidad, no fabricar instalaciones, no
declarar que algo funciona sin evidencia.

## Decisiones por plugin

Leyenda de decisión: **Instalar** (recomendado ya) · **Condicional** (solo si se cumple X) ·
**Descartar** (no aplica al stack real).

| Plugin | Categoría | Disponibilidad | Scope sugerido | Requisitos / Auth | Decisión | Justificación (evidencia del repo) |
|---|---|---|---|---|---|---|
| `typescript-lsp` | Code intelligence | sin verificar | user | `npm i -g typescript-language-server typescript` (o alternativa si el equipo prohíbe globales) | **Instalar** | Backend 100% TypeScript estricto; da diagnósticos/navegación reales. |
| `code-simplifier` | Clean code | sin verificar | user | ninguno | **Instalar** | Complementa el `/simplify` ya usado; refactor sin cambiar contratos. |
| `security-guidance` | Seguridad | sin verificar | user | Claude Code ≥2.1.144, Python 3.8+, repo Git (todo presente) | **Instalar** | Revisión de seguridad del diff antes del commit; base junto a CodeQL. |
| `42crunch-api-security-testing` | Seguridad API | sin verificar | user | ninguno | **Instalar** | Existe `docs/endpoints/openapi.yaml`; audita BOLA/BFLA en 48 rutas. |
| `context7` | Selección de librerías | sin verificar | user (MCP comunitario, revisar fuente) | ninguno | **Instalar** | Doc por versión fijada en `yarn.lock`; apoya `library-selection`. |
| `claude-code-setup` | AI workflow | sin verificar | user | ninguno | **Instalar** | Recomendación de hooks/subagentes adaptada al repo. |
| `claude-md-management` | AI workflow | sin verificar | user | ninguno | **Instalar** | Mantiene el nuevo `CLAUDE.md` breve y sin degradarse. |
| `skill-creator` | AI workflow | sin verificar | user | ninguno | **Condicional** | Ya existe una skill `skill-creator` empaquetada en este entorno; instalar el plugin solo si se quiere su versión completa. Evitar duplicado. |
| `postman` | API testing | sin verificar | user | **Auth Postman (MCP)** → detenerse para autenticar | **Condicional** | El repo genera colección Postman; útil, pero requiere cuenta/token. |
| `github` | Delivery | sin verificar | user | **Token GitHub mínimo (MCP)** → detenerse para autenticar | **Condicional** | Repo con GitHub Actions; útil para PRs/issues con permisos mínimos. |
| `neon` | Base de datos | sin verificar | user | **Auth Neon (MCP)** → detenerse para autenticar | **Condicional (recomendado)** | La base remota **es Neon** (memoria de proyecto). Empezar en solo-lectura; DDL destructivo prohibido sin plan+respaldo. |
| `pr-review-toolkit` | Clean code | sin verificar | user | ninguno | **Condicional** | Solapa con `/code-review` ya disponible. Elegir uno para revisión profunda. |
| `serena` | Clean code | sin verificar | user (comunitario, revisar fuente) | ninguno | **Condicional** | Útil en repos grandes; el proyecto ya tiene navegación por gates. Evaluar valor extra. |
| `codspeed` | Rendimiento | sin verificar | user | ninguno | **Condicional** | No hay arnés de benchmarks aún (solo `scripts/soak-test.mjs`). Instalar cuando exista benchmark reproducible. |
| `session-report` | AI observability | sin verificar | user | ninguno | **Condicional** | Útil para vigilar costo de contexto; opcional. |
| `semgrep` | SAST | sin verificar | user | Compatibilidad Windows dudosa (usar WSL) | **Condicional** | Elegir UN escáner. Ya hay CodeQL + `security:audit`. Semgrep solo si se quiere SAST local. |
| `aikido` | SAST | sin verificar | user | cuenta Aikido | **Condicional** | Alternativa a Semgrep si la organización ya usa Aikido. No instalar ambos. |
| `sentry` / `datadog` / `grafana-mcp` / `grafana-cloud-mcp` | Observabilidad | sin verificar | user | auth respectiva | **Condicional** | La app **expone** métricas Prometheus, pero no hay plataforma externa conectada. Instalar solo la que corresponda cuando exista. Elegir una. |
| `redis-development` | Rendimiento | sin verificar | — | — | **Descartar** | No hay Redis en el stack. |
| `terraform` | Infra | sin verificar | — | — | **Descartar** | No hay IaC Terraform. |
| `aws-dev-toolkit` | Infra | sin verificar | — | — | **Descartar** | No desplegado en AWS (Docker/Compose). |
| `playwright` | Testing E2E | sin verificar | — | — | **Descartar (para este repo)** | Backend sin frontend; E2E de API ya cubierto por Supertest + suite de integración. |
| `mcp-server-dev` / `plugin-dev` | AI workflow | sin verificar | — | — | **Descartar** | No se va a construir MCP/plugin propio ahora. |

## Perfil mínimo recomendado (sin auth, ejecutar primero)

```powershell
$plugins = @(
  "typescript-lsp",
  "code-simplifier",
  "security-guidance",
  "42crunch-api-security-testing",
  "context7",
  "claude-code-setup",
  "claude-md-management"
)
# Prerrequisito de typescript-lsp (omitir si el binario ya existe o el equipo prohíbe globales):
npm install -g typescript-language-server typescript
# Verificar antes de instalar cada uno:
$plugins | ForEach-Object { claude plugin details "$_@claude-plugins-official" }
# Instalar (revisar salida de details primero):
$plugins | ForEach-Object { claude plugin install "$_@claude-plugins-official" --scope user }
claude plugin list
```

Aplicar cambios: `/reload-plugins`. Validar: `/doctor` y `/plugin`.

## Puntos de detención que requieren autorización humana

- **Auth de MCP externos:** `postman`, `github`, `neon`, `sentry`/`datadog`/`grafana*`, `aikido`.
  Autenticar en el momento, con permisos mínimos (lectura primero), sin guardar tokens en Git.
- **Instalación global npm** para `typescript-lsp` si la política del equipo lo restringe.
- **Elección única** de: un escáner SAST, una plataforma de observabilidad, una herramienta de
  revisión profunda (`pr-review-toolkit` o `/code-review`).

## Regla de scope aplicada

`user` para herramientas personales del desarrollador (recomendado por defecto aquí). `project`
**solo** tras aprobación del equipo, especialmente para plugins con MCP/hooks (`neon`, `github`,
`postman`), porque comparten configuración con acceso externo. `local` para pruebas puntuales.
