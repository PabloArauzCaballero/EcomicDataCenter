# ADR-0007: reader separado y proyecciones explícitas

- Estado: aceptado
- Fecha: 2026-07-16
- Responsables: arquitectura backend

## Contexto

El dominio combina escrituras con integridad fuerte y consultas históricas/agregadas. Un único pool dificultaría mínimo privilegio y futura separación de carga.

## Drivers

- credencial de solo lectura;
- paginación y contratos estables;
- evolución a réplica sin cambiar casos de uso;
- evitar un QueryManager universal.

## Opciones

1. Un pool writer para todo: simple, pero con privilegios excesivos.
2. Replicación automática Sequelize: útil con réplica real, menos explícita para read-your-writes.
3. Instancias reader/writer separadas: aislamiento claro y testeable.

## Decisión

Usar dos instancias Sequelize y credenciales distintas. Las consultas viven en repositories de dominio. Las vistas se crean solo cuando estabilizan un contrato o simplifican una consulta; no se asume que aceleran por sí mismas.

No existe fallback automático reader → writer. Una caída del reader hace fallar readiness y las lecturas, evitando sobrecargar silenciosamente el writer.

## Consecuencias

- Debe calcularse el pool total considerando todas las réplicas de API.
- Los flujos read-your-writes consultan dentro de la transacción writer.
- Una réplica real exige documentar lag y tolerancia.

## Validación

Pruebas de grants, readiness y consultas contra credencial reader en fase de integración.
