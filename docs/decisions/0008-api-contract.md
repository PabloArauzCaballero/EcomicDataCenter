# ADR-0008: API versionada y OpenAPI como contrato HTTP

- Estado: aceptado
- Fecha: 2026-07-16
- Responsables: arquitectura backend

## Contexto

El frontend y sistemas institucionales requieren contratos estables, validables y compatibles con evolución.

## Decisión

Versionar por path (`/api/v1`) y usar `docs/endpoints/openapi.yaml` como contrato principal. `endpoints.md` explica intención, permisos y flujo sin duplicar cada schema.

Los cambios incompatibles crean una nueva versión o una transición documentada. Swagger UI permanece desactivable y no se publica por defecto en producción.

## Alternativas descartadas

- Versionado por header: menos visible para consumidores y operación.
- Solo decorators Swagger sin archivo versionado: dificulta review y drift.
- Documentación manual sin contrato máquina: no permite contract tests.

## Validación

- operationId únicos;
- rutas de controllers coincidentes;
- lint de OpenAPI;
- pruebas contractuales en CI.
