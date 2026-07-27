---
name: clean-code-review
description: Revisión de Clean Code para el diff reciente en TypeScript/NestJS de este repo. Detecta nombres pobres, funciones/clases sobrecargadas, duplicación, acoplamiento, errores silenciosos y falta de pruebas, sin imponer sobrearquitectura. Úsala tras implementar y antes del commit.
---

# Skill: clean-code-review

## Propósito

Elevar claridad y mantenibilidad del código cambiado sin alterar comportamiento ni añadir capas
innecesarias.

## Cuándo usarla

Después de una implementación, antes del commit o del PR.

## Cuándo NO usarla

Para buscar bugs de correctitud o seguridad (usa `/code-review` o `security-audit`).

## Fuentes obligatorias

`prompt/programacionGeneral.md` (§1–§5, KISS), `.claude/rules/20-clean-code.md`, el diff actual.

## Entradas requeridas

El conjunto de archivos cambiados (diff). Si no hay diff, pídelo.

## Detente si

Una "mejora" cambiaría contratos, comportamiento o pruebas: proponla, no la apliques a ciegas.

## Flujo por fases

1. Delimita el diff. 2. Revisa por criterios (abajo). 3. Propón cambios mínimos y justificados.
2. Aplica solo los seguros. 5. Verifica `yarn lint`, `yarn format:check`, `yarn typecheck`.

## Criterios

Nombres ambiguos · funciones/clases con demasiadas responsabilidades · duplicación semántica ·
acoplamiento innecesario · anidamiento excesivo · errores silenciados (`catch {}`) · comentarios que
sustituyen diseño · abstracción prematura/sobreingeniería · archivo >299 líneas · falta de pruebas
de la lógica añadida · `any`/`@ts-ignore`/`console.*`/`TODO`.

## Comandos permitidos

`yarn lint`, `yarn format:check`, `yarn typecheck`, `yarn quality:clean-code`, `yarn quality:files`,
`yarn quality:naming`, `yarn test`.

## Comandos prohibidos

Reescrituras masivas fuera del diff; cambios de dependencias; refactor de módulos no tocados.

## Evidencia requerida

Diff propuesto, justificación por cambio, y gates de estilo/tipo en verde.

## Entregables

Lista priorizada de observaciones + cambios aplicados con su porqué.

## Formato de respuesta

Observación · archivo:línea · severidad · propuesta · aplicado/no. Cierre con gates ejecutados.

## Lista de verificación final

- [ ] Sin `any`/suppress/console/TODO nuevos. - [ ] Sin duplicación introducida. - [ ] Nombres en
      inglés y precisos. - [ ] Archivos ≤299 líneas. - [ ] `quality:clean-code` verde.

## Limitaciones

No garantiza ausencia de bugs; es calidad, no correctitud.

## Trazabilidad

`prompt/programacionGeneral.md` §1–§5; gates `clean-code`, `files`, `naming`.
