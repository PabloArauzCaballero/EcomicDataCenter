# ADR-0011: estrategia de backup condicionada por RPO/RTO

- Estado: propuesto
- Fecha: 2026-07-16
- Responsables: operación y propietario del dato

## Contexto

El sistema conserva revisiones históricas y trazabilidad. Elegir `pg_dump`, snapshots o pgBackRest sin RPO/RTO sería arbitrario.

## Decisión provisional

- Desarrollo/QA: backup lógico `pg_dump` para reproducibilidad.
- Producción: no se aprueba estrategia final hasta ratificar RPO, RTO, volumen y plataforma.
- Si se exige PITR o RPO bajo, evaluar pgBackRest/WAL o servicio administrado equivalente.
- Ningún backup se considera válido sin restore drill aislado.

## Alternativas

- Solo snapshot: rápido, pero insuficiente como única garantía.
- Solo `pg_dump`: simple, puede no cumplir recuperación de bases grandes.
- pgBackRest/PITR: mayor capacidad y complejidad operativa.

## Gate

Definir RPO/RTO, cifrado, retención, destino, responsables y ejecutar restauración medida.
