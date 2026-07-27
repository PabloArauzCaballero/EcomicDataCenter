---
paths:
  - 'src/**/*.ts'
  - 'test/**/*.ts'
---

# Clean code (TypeScript)

- KISS: la solución más simple que cumpla el requisito. No abstraer por anticipación ni por moda.
- Nombres precisos en **inglés** para identificadores (gate `quality:naming`). Prohibidos nombres
  genéricos de archivo/clase: `utils`, `helpers`, `manager`, `processor` (gate `quality:clean-code`).
- Funciones y clases cohesivas, una responsabilidad. Evitar anidamiento profundo.
- Sin `any` explícito, sin `@ts-ignore`/`@ts-nocheck`, sin `catch {}` vacío, sin `console.*` en
  runtime, sin marcadores `TODO/FIXME/HACK` (gate `quality:clean-code`).
- Sin duplicación semántica: extraer a una unidad con nombre cuando se repite lógica.
- Comentarios que explican el porqué (decisión, invariante), no el qué obvio. No sustituyen diseño.
- Límite de tamaño de archivo: ≤299 líneas para archivos productivos (gate `quality:files`).
- Tipado estricto: preferir `unknown` + validación a `any`. Respetar `exactOptionalPropertyTypes`
  y `noUncheckedIndexedAccess` del `tsconfig.json`.
- Al terminar un cambio, aplica el mismo estilo del código circundante y pasa `yarn lint` y
  `yarn format:check`.
