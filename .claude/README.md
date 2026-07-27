# Configuración de Claude Code para este proyecto

Estructura creada siguiendo `CLAUDE_ORGANIZAR_SKILLS_BACKEND.md`. Su objetivo es que Claude Code
trabaje con precisión, seguridad y evidencia sobre este backend NestJS.

## Contenido

```
.claude/
  settings.json         Config compartida del proyecto. enabledPlugins se llena AL instalar
                        plugins (ver docs/claude/plugin-selection-matrix.md). Fusionar, no reemplazar.
  settings.local.json   (no versionado) overrides personales/temporales de esta máquina.
  rules/                Reglas modulares por tema y por ruta (frontmatter `paths`).
  skills/               Procedimientos especializados, invocables por nombre.
```

## Cómo se usa

- Reglas: se cargan según la ruta que se edite (`paths`). Una regla por tema, sin duplicar `CLAUDE.md`.
- Skills: invócalas por nombre cuando necesites un flujo determinista (auditoría, verificación,
  selección de librerías). Índice en `docs/claude/usage-guide.md`.

## Plugins

`settings.json` NO enumera plugins todavía porque ninguno está instalado y la CLI `claude` no fue
operable en la sesión de organización. La matriz aprobada y los comandos de instalación (para
ejecución humana interactiva) están en `docs/claude/plugin-selection-matrix.md`. Al instalar un
plugin, añade su clave a `enabledPlugins` por fusión y revisa el diff.

## Fuente de verdad

- Reglas de generación: `prompt/`.
- Decisiones de stack: `docs/decisions/` (ADR).
- Evidencia ejecutable: `yarn quality:all`, `yarn test`, `yarn test:integration`, `db:verify:*`.
