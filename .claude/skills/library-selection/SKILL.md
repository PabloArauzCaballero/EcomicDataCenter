---
name: library-selection
description: Selecciona o evalúa una librería con matriz de compatibilidad, mantenimiento, seguridad, licencia, rendimiento, costo de salida y evidencia oficial. Prohíbe dos librerías para la misma responsabilidad sin ADR. Úsala antes de añadir cualquier dependencia.
---

# Skill: library-selection

## Propósito

Decidir dependencias con criterio y evidencia, evitando duplicación y lock-in innecesario.

## Cuándo usarla

Antes de `yarn add` de cualquier dependencia no trivial, o al reemplazar una existente.

## Cuándo NO usarla

Para actualizaciones de parche por seguridad (aplica la regla de parche directamente).

## Fuentes obligatorias

`.claude/rules/70-library-selection.md`, `package.json`, `yarn.lock`, `docs/decisions/`, doc oficial
de la versión fijada (usa `context7` si está instalado).

## Entradas requeridas

La responsabilidad a cubrir y las alternativas candidatas.

## Detente si

Ya existe una dependencia para esa responsabilidad: no añadas una segunda sin ADR que lo justifique.

## Flujo por fases

1. Define la responsabilidad exacta. 2. Enumera alternativas (incluida "no añadir nada"). 3. Evalúa
   por: compatibilidad con Node/TS/lockfile, mantenimiento, advisories, licencia, rendimiento, costo
   operacional, lock-in y salida. 4. Verifica doc oficial de la versión. 5. Decide y registra ADR si es
   estructural. 6. Instala con `yarn` y verifica.

## Comandos permitidos

`yarn info <pkg>`, `yarn add <pkg>@<version> --exact`, `yarn install --frozen-lockfile`,
`yarn typecheck`, `yarn security:audit`.

## Comandos prohibidos

`npm`/`pnpm` install; cambios de versión mayor sin autorización; añadir cola/Express/ORM alterno.

## Evidencia requerida

Matriz comparativa, versión elegida, resultado de `security:audit` y `typecheck` tras instalar.

## Entregables

Matriz de decisión + ADR si aplica + verificación.

## Formato de respuesta

Responsabilidad · alternativas · matriz · decisión · evidencia.

## Lista de verificación final

- [ ] Sin duplicar responsabilidad. - [ ] Compatible con el lockfile. - [ ] Sin advisory high/critical.
- [ ] Licencia aceptable. - [ ] ADR si es estructural.

## Limitaciones

No garantiza ausencia de vulnerabilidades futuras; fija la decisión y su fecha.

## Trazabilidad

`prompt/programacionBackend.md` §1; `prompt/programacionGeneral.md` §13; gate `async-scope`.
