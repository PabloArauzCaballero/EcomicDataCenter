# Auditoría de la configuración Claude Code existente

> Fase 1 de `CLAUDE_ORGANIZAR_SKILLS_BACKEND.md`.

## 1. Inventario previo

| Elemento | Estado antes de esta organización |
|---|---|
| `CLAUDE.md` (raíz del repo) | **No existía** |
| `.claude/` (repo) | **No existía** |
| `.claude/settings.json` | No existía |
| `.claude/rules/` | No existía |
| `.claude/skills/` | No existía |
| `.claude/agents/` | No existía |
| `.mcp.json` | No existía |
| `~/.claude/CLAUDE.md` (global del usuario) | Existe (skill `graphify`); fuera del alcance del repo |
| Memoria automática del usuario | Existe en el directorio de memoria del proyecto; fuera del repo |
| `prompt/` (fuentes de generación) | `index.md`, `programacionGeneral.md`, `programacionBackend.md`, `README.md` |
| `docs/` | Amplia: `architecture, data-model, decisions (10 ADR), endpoints, hardening, model, postman, runbooks, use-cases, quality-gate-matrix.md` |

**Conclusión:** el repositorio no tenía configuración de Claude Code propia. No hay riesgo de
sobrescritura: toda la estructura `.claude/` y el `CLAUDE.md` raíz se crean desde cero. No se
modifica la configuración global del usuario ni su memoria.

## 2. Respaldo

No aplica un respaldo de `.claude/` porque no existía. El respaldo efectivo es el control de
versiones Git: todos los archivos nuevos son rastreables y reversibles con `git`. No se tocó
`~/.claude/`.

## 3. Duplicaciones y conflictos detectados

### 3.1 Conflicto crítico: prompt de generación vs. sistema real

| Fuente | Afirma | Realidad implementada | Resolución |
|---|---|---|---|
| `prompt/index.md` §6 | "Backend Node.js con **Express**" | NestJS + Fastify | El código real gobierna (`programacionBackend.md` §4 "anti-Express" coincide). `index.md` §6 está **obsoleto**. |
| `prompt/index.md` §10 | Workers **pg-boss** persistentes obligatorios | Colas **deferidas** (ADR 0003); gate `async-scope` prohíbe deps de cola | El sistema no usa colas por decisión documentada. La regla de workers **no aplica** al estado actual; queda como guía condicional para si algún día se aprueba una cola. |
| `prompt/index.md` §8 | Entrega final en `.zip` | Entrega es el repositorio Git | Obsoleto; era instrucción de generación inicial. |

**Estas contradicciones no se resuelven inventando:** se resuelven priorizando el código real y
los ADR, tal como exige la orden (regla 5). Se documentan aquí y se reflejan en las reglas de
`.claude/rules/` para que Claude no reintroduzca Express ni colas sin un ADR que lo apruebe.

### 3.2 Riesgo de duplicación de reglas

`prompt/programacionGeneral.md` (933 líneas) y `prompt/programacionBackend.md` (2169 líneas) son
extensos. Copiarlos en `CLAUDE.md` violaría el control de contexto (Fase 3.4). **Mitigación:** el
`CLAUDE.md` raíz es breve y remite a estos documentos y a las skills; las reglas modulares de
`.claude/rules/` resumen los principios verificables con trazabilidad, sin copiar los textos.

### 3.3 Solapamiento entre reglas del prompt y gates ya existentes

Muchas reglas de `programacionBackend.md` **ya están codificadas** como validadores ejecutables
(`scripts/validate_*.py`, `quality:*`). Las reglas de `.claude/rules/` referencian el gate que las
hace cumplir en vez de reescribir la prosa, evitando divergencia entre "lo escrito" y "lo verificado".

## 4. Contenido obsoleto

- `prompt/index.md` §6 (Express), §8 (.zip), §10 (workers pg-boss como obligatorios).
- No se borra `prompt/` (es la fuente histórica de generación y la Fase 1 prohíbe destruir contenido válido); se marca su obsolescencia parcial aquí y en las reglas.

## 5. Elementos que deben conservarse

- Los 10 ADR de `docs/decisions/` (deciden el stack real).
- Los 18 gates `quality:*` y los `db:verify:*` (son la evidencia ejecutable).
- `docs/hardening/`, `docs/runbooks/`, `docs/runbooks/evidence/` (auditoría y evidencia operativa).
- `ECONOMIC_DATACENTER_PRODUCTION_READINESS.md` (informe de preparación productiva).

## 6. Recomendaciones

1. Crear `CLAUDE.md` raíz breve (hecho en Fase 5).
2. Modularizar reglas en `.claude/rules/` con `paths` (Fase 6).
3. Mover procedimientos largos a skills (Fase 7).
4. **No** instalar plugins automáticamente: la CLI `claude` no es operable desde esta sesión; se entrega la matriz y el plan para ejecución humana interactiva.
5. Registrar la obsolescencia de `prompt/index.md` §6/§8/§10 para evitar regresiones (Express, .zip, colas no aprobadas).
