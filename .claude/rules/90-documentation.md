---
paths:
  - 'docs/**/*.md'
  - '**/README.md'
  - 'docs/endpoints/openapi.yaml'
---

# Documentación

- Documentación institucional en **español**; identificadores y código en **inglés**.
- `prompt/` contiene reglas de generación; `docs/` contiene documentación del sistema generado. No
  se mezclan ni se sustituyen.
- Contratos generados, no escritos a mano: `docs/endpoints/openapi.yaml` por `scripts/build_openapi.py`
  y la colección Postman por `scripts/generate_postman.py`. Tras cambiar rutas/DTOs, regenera y
  confirma sin drift (`yarn quality:openapi`, `yarn quality:routes`). Los generadores emiten LF.
- Decisiones de arquitectura como ADR en `docs/decisions/` (una decisión por archivo).
- Evidencia operativa firmada (restauración, soak) versionada en `docs/runbooks/evidence/` con su
  `.sha256`; volcados y reportes de carga permanecen en `artifacts/` (no versionados).
- Cada carpeta importante mantiene su `README.md`. No copiar documentos extensos dentro de
  `CLAUDE.md` ni de las reglas: resumir y enlazar la fuente.
