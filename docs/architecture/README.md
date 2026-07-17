# Documentación de arquitectura

Esta carpeta contiene decisiones y límites técnicos del core estadístico.

## Lectura recomendada

1. `architecture-profile.md`: riesgo, alcance y capacidades activas.
2. `architecture.md`: arquitectura lógica y persistencia.
3. `dependency-rules.md`: dependencias permitidas y prohibidas.
4. `authorization-matrix.md`: roles derivados de los casos de uso.
5. `security-boundaries.md`: zonas y cruces de confianza.
6. `threat-model.md`: amenazas STRIDE y riesgos residuales.
7. `non-functional-requirements.md`: requisitos y presupuestos iniciales.
8. `clean-code-review.md`: refactor y checks de mantenibilidad.
9. `architecture-gate.md`: evidencia de cierre de fase 2.

## Diagramas

- `system-context.puml`
- `container-diagram.puml`
- `component-diagram.puml`
- `deployment-diagram.puml`
- `trust-boundaries.puml`

Los diagramas son autónomos y no dependen de includes remotos.
