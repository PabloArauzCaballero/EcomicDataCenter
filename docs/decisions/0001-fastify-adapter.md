# ADR-0001: Fastify como adapter HTTP

- Estado: aceptado
- Fecha: 2026-07-15
- Responsables: arquitectura backend

## Contexto

El backend es nuevo, no hereda middleware Express y se espera una carga de consultas e ingestión concurrente. NestJS permite elegir adapter sin cambiar las reglas de dominio.

## Drivers

- compatibilidad completa con NestJS;
- menor sobrecarga de transporte;
- límites de body y pruebas mediante `inject`;
- una sola tecnología HTTP.

## Opciones

1. Express: ecosistema amplio, pero no existe dependencia heredada que lo justifique.
2. Fastify: adecuado para proyecto nuevo y compatible con los plugins requeridos.
3. Fastify directo sin NestJS: menos abstracción, pero perdería DI, guards y módulos exigidos.

## Decisión

Usar NestJS con `@nestjs/platform-fastify`. Helmet y rate limit usan plugins Fastify. Se prohíbe introducir middleware o tipos Express.

## Consecuencias

Toda librería HTTP futura debe demostrar compatibilidad Fastify. Cambiar de adapter requiere benchmark, pruebas E2E y ADR de reemplazo.

## Validación

Build, E2E con adapter real, límites de body, CORS, rate limit y graceful shutdown.
