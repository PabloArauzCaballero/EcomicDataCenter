# Informe de fase 2 de 10 — Arquitectura y seguridad

## 1. Resumen

Se formalizó y endureció la arquitectura del core estadístico. El trabajo se concentró en límites, dependencias, decisiones técnicas, seguridad, requisitos no funcionales y riesgos; no se agregaron entidades ni casos de uso.

## 2. Avance verificable

### Archivos creados

- `docs/architecture/architecture-profile.md`
- `docs/architecture/non-functional-requirements.md`
- `docs/architecture/dependency-rules.md`
- `docs/architecture/security-boundaries.md`
- `docs/architecture/authorization-matrix.md`
- `docs/architecture/architecture-gate.md`
- cinco diagramas PlantUML de arquitectura y seguridad
- `docs/decisions/README.md`
- ADR 0007 a 0012
- `templates/adr.md`
- `scripts/validate_architecture.py`
- `scripts/check_clean_code.py`
- `docs/architecture/clean-code-review.md`
- `src/common/statistical/dimension-value.schema.ts`
- `src/common/statistical/README.md`

### Archivos modificados

- ADR 0001 a 0006, normalizados con contexto, opciones, consecuencias y validación.
- `docs/architecture/threat-model.md`, ampliado a STRIDE.
- `docs/architecture/README.md`.
- `docs/implementation/implementation-plan.md`.
- `package.json`, con gate `quality:architecture`.
- schemas de ingestión y consulta, para eliminar dependencia cruzada entre módulos.

## 3. Decisiones clave

| Decisión | Justificación | Impacto |
|---|---|---|
| Contrato de dimensión en `common/statistical` | Ingestión y consulta comparten el mismo concepto del dominio | Elimina acoplamiento entre features sin crear una utilidad genérica |
| Reader y writer explícitos | Mínimo privilegio y futura réplica | Evita fallback silencioso y separa pools |
| OpenAPI como contrato | Consumidores institucionales necesitan estabilidad | Cambios incompatibles requieren versión |
| Serializable para revisiones | Evitar revisión corriente duplicada | Exige pruebas de concurrencia y manejo de retry |
| Confidencialidad default-deny | La política no está definida | Release productivo bloqueado hasta ratificación |
| Backup condicionado por RPO/RTO | No inventar objetivos operativos | ADR permanece propuesto |

## 4. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Claims JWT no firmados como contrato | 401/403 o ownership incorrecto | Ratificar issuer, audience, roles y organización |
| Confidencialidad sin matriz | Exposición crítica | Aprobar catálogo y políticas antes de producción |
| SLO/RPO/RTO ausentes | Arquitectura operativa no dimensionable | Taller con cliente y operación |
| Sin PostgreSQL/Docker en el entorno | Decisiones no verificadas en runtime | Ejecutar gates en fases 3, 9 y 10 |
| Sin lockfile instalable | Supply chain no reproducible | Generar y auditar `yarn.lock` con acceso al registry |

## 5. Desviaciones

El repositorio ya contenía artefactos de fases 3 a 10. No se eliminaron, pero se reclasificaron como trabajo adelantado pendiente de validación formal. La fase 2 no declara esos artefactos aprobados.

## 6. Pruebas ejecutadas

| Verificación | Resultado |
|---|---|
| Validador de dependencias arquitectónicas | Pass: 124 archivos TypeScript |
| Reglas Clean Code conservadoras | Pass: 124 archivos TypeScript |
| Acoplamiento entre módulos de dominio | Pass: no se detectaron imports cruzados |
| Controllers con acceso a modelos/Sequelize | Pass; única excepción técnica documentada: health |
| Documentación obligatoria fase 2 | Pass |
| Ejecución Node/Yarn/Jest | No ejecutada: Yarn/dependencias no disponibles |

## 7. Estado

**Fase 2 completada. Gate aprobado para continuar a fase 3.** La aprobación no equivale a preparación productiva.
