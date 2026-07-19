# Validación final de la rama HARDENING

## Candidato

La evidencia válida corresponde siempre al SHA visible como `head` del PR #1 y a los workflows asociados a ese mismo commit. Un resultado de un commit anterior no aprueba el candidato actual.

## Gates automáticos

| Gate | Estado exigido | Evidencia |
|---|---|---|
| Instalación con lockfile congelado | Exitoso | GitHub Actions `backend-quality` |
| Auditoría de dependencias | Exitoso | `yarn security:audit` |
| Docker Compose y override local | Exitoso | Validación de ambas topologías en CI |
| Formato, lint y TypeScript | Exitoso | `format:check`, `lint` y `typecheck` |
| Arquitectura, seguridad y nomenclatura | Exitoso | Gates `quality:*` ejecutados individualmente |
| Pruebas | Exitoso | Suites por dominio y `yarn test` completo |
| Migraciones, privilegios y seeds | Exitoso | GitHub Actions con PostgreSQL 17 |
| Build de aplicación e imagen | Exitoso | `yarn build` y target Docker `runtime` |
| Contratos OpenAPI/Postman | Exitoso y sin drift | Exportador, validadores y comparación Git |
| Flujo local Docker end-to-end | Exitoso | Compose, migraciones, seeds, health, readiness y smoke |
| CodeQL | Exitoso | Workflow `codeql` |

## Verificación local preparada

La rama incluye un flujo reproducible para pruebas locales:

```bash
corepack enable
yarn local:env
yarn install --frozen-lockfile
yarn local:up
yarn local:seed
yarn local:verify
```

El workflow `backend-quality` reproduce este mismo recorrido mediante Docker Compose antes de aprobar el candidato.

Para inspeccionar servicios o detenerlos:

```bash
yarn local:logs
yarn local:down
```

El detalle, la recuperación ante fallos y el modo alternativo con API en host se encuentran en `local-verification.md`.

## Gates externos

- Load y soak test con carga representativa y observación de memoria, event-loop lag, conexiones y latencia.
- Restore drill aislado con RPO/RTO medidos.
- Configuración real de secretos, TLS, firewall, observabilidad y límites de plataforma.
- Revisión institucional de continuidad y proveedor de data center.

## Dictamen

**Estado actual: preparado para prueba local y revisión técnica; no aprobado para despliegue productivo.**

El dictamen solo cambia después de que el SHA final complete todos los gates automáticos y se adjunte evidencia para los bloqueos de `findings.md` y `production-review-checklist.md`.
