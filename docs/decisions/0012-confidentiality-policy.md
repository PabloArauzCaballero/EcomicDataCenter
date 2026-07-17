# ADR-0012: autorización de confidencialidad default-deny

- Estado: propuesto; bloqueado por política institucional
- Fecha: 2026-07-16
- Responsables: propietario del dato, seguridad y metodología

## Contexto

`ObservationRevision` contiene `confidentiality_status`, pero los documentos fuente no definen qué rol puede consultar cada estado ni si depende del dataset, organización o fecha.

## Decisión de seguridad

No inventar una matriz. Antes de exposición productiva debe aprobarse una política explícita. La implementación resultante debe ser default-deny y aplicarse en el repository/query policy, no solo en el frontend.

## Datos requeridos

- catálogo cerrado de estados;
- rol y organización autorizados por estado;
- tratamiento de datos embargados;
- acceso a URI de artefactos;
- auditoría de lectura, si aplica;
- reglas para exportación.

## Consecuencia

La fase 2 puede cerrarse porque el riesgo está identificado, pero el release productivo queda bloqueado.
