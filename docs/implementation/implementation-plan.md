# Plan de implementación

## Estado final

```text
Fase actual: 10 de 10
Fases completadas formalmente: 10
Fases restantes: 0
Objetivo del ciclo: cerrar de forma consecutiva fases 4–10 conservando el avance de fases 1–3.
Gate de entrada: aprobado
Gate de salida: aprobado estáticamente
Release productivo: bloqueado por gates runtime e inputs institucionales
```

## Fases

| Fase | Alcance | Estado |
|---|---|---|
| 1 | Descubrimiento, fuentes, contradicciones y alcance | Completada |
| 2 | Arquitectura, perfil, ADR, amenazas y dependencias | Completada |
| 3 | Modelo físico, schemas, roles, migraciones e índices | Completada estáticamente |
| 4 | Boot/mock seeds e idempotencia | Completada estáticamente |
| 5 | Persistencia, repositories, queries y transacciones | Completada estáticamente |
| 6 | Casos de uso y reglas de negocio | Completada estáticamente |
| 7 | API, auth, permisos y OpenAPI | Completada estáticamente |
| 8 | Workers, outbox e integraciones | Cerrada como N/A mediante ADR-0003 |
| 9 | Observabilidad, rendimiento, Docker y operación | Completada estáticamente |
| 10 | Pruebas, auditoría, documentación y ZIP | Completada estáticamente |

## Evidencia consolidada

- 40 modelos y 40 tablas.
- 377 campos y 76 claves foráneas.
- 16 migraciones consecutivas.
- 3 archivos boot y 1 mock, con 32 UUID estables.
- 35 paths y 37 operaciones OpenAPI.
- 37 requests Postman.
- 21 diagramas PlantUML fuente.
- 151 archivos TypeScript parseados.
- 297 imports locales resueltos.
- 10 archivos de prueba creados.
- PDF del modelo físico compilado a 16 páginas A4.

## Gates de release pendientes

1. Generar y revisar `yarn.lock` con Yarn 1.22.22.
2. Instalar con lockfile congelado.
3. Ejecutar format, lint, type-check, unit, integration, E2E y build.
4. Ejecutar migraciones `0001–0015` en PostgreSQL 17 desde cero y como upgrade.
5. Ejecutar doble boot/mock seed y rechazo mock en producción.
6. Verificar roles y grants reales.
7. Ejecutar smoke, k6, backup y restore drill.
8. Ratificar claims JWT, confidencialidad, SLO, RPO y RTO.

## Regla de cierre

Las diez fases documentales y de implementación están cerradas. El producto no se declara listo para producción hasta que todos los gates anteriores cambien de `Blocked` a `Pass` con evidencia.
