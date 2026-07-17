# ADR-0004: base dedicada, schemas y credenciales separadas

- Estado: aceptado
- Fecha: 2026-07-15
- Responsables: arquitectura de datos

## Contexto

El sistema requiere integridad fuerte, mínimo privilegio y separación entre DDL, escritura y lectura. La base administrativa `postgres` y el schema `public` no deben alojar objetos de aplicación.

## Decisión

Usar una base dedicada y schemas por responsabilidad. Separar credenciales:

- `backend_migrator`: DDL y ownership técnico;
- `backend_writer`: DML autorizado;
- `backend_reader`: SELECT únicamente;
- `backup_operator`: estrategia de respaldo cuando se active.

El API usa instancias reader/writer independientes, aunque puedan apuntar inicialmente al mismo clúster.

## Consecuencias

Los grants forman parte de migraciones y deben probarse. Las lecturas read-your-writes permanecen en la transacción writer. Una réplica física futura debe documentar lag y fallback.

## Validación

Pruebas que demuestren que writer no ejecuta DDL, reader no escribe y runtime no crea objetos en `public`.
