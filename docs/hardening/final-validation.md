# Validación final de la rama HARDENING

## Candidato

La evidencia válida corresponde siempre al SHA visible como `head` del PR #1 y a los workflows asociados a ese mismo commit. Un resultado de un commit anterior no aprueba el candidato actual.

## Gates automáticos

| Gate | Estado exigido | Evidencia |
|---|---|---|
| Instalación con lockfile congelado | Exitoso | GitHub Actions `backend-quality` |
| Auditoría de dependencias | Exitoso o riesgo aceptado formalmente | `yarn security:audit` |
| Docker Compose y override local | Exitoso | Validación de ambas topologías en CI |
| Formato, lint y TypeScript | Exitoso | `format:check`, `lint` y `typecheck` |
| Arquitectura, seguridad y nomenclatura | Exitoso | `yarn quality:all` |
| Pruebas | Exitoso | `yarn test` |
| Migraciones, privilegios y seeds | Exitoso | GitHub Actions con PostgreSQL 17 |
| Build de aplicación e imagen | Exitoso | `yarn build` y target Docker `runtime` |
| Contratos OpenAPI/Postman | Exitoso y sin drift | Validadores y comparación Git |
| CodeQL | Exitoso | Workflow `codeql` |

## Verificación local preparada

La rama incluye un flujo reproducible para pruebas locales:

```bash
corepack enable
yarn local:env
yarn install --frozen-lockfile
yarn local:up
yarn local:verify
```

El detalle y el modo alternativo con API en host se encuentran en `local-verification.md`.

## Gates externos

- Load y soak test con carga representativa.
- Restore drill aislado con RPO/RTO medidos.
- Configuración real de secretos, TLS, firewall, observabilidad y límites de plataforma.
- Revisión institucional de continuidad y proveedor de data center.

## Dictamen

**Estado actual: preparado para prueba local y revisión técnica; no aprobado para despliegue productivo.**

El dictamen solo cambia después de que el SHA final complete los gates automáticos y se adjunte evidencia para los bloqueos de `findings.md` y `production-review-checklist.md`.
