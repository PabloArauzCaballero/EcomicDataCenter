# ADR-0005: idempotencia mediante identidades del dominio

- Estado: aceptado
- Fecha: 2026-07-15
- Responsables: arquitectura backend

## Contexto

Las cargas pueden reintentarse por timeout o error de red. El dominio ya contiene identidades estables para artefactos, lotes, series y revisiones.

## Opciones

1. Tabla genérica de `Idempotency-Key`: útil para comandos sin identidad propia, pero duplicaría estados y limpieza.
2. Identidades del dominio: menor complejidad y constraints directos.

## Decisión

- Artefacto: SHA-256 único.
- Lote: `batch_code` único.
- Serie: hash de dimensiones normalizadas.
- Revisión: hash normalizado de periodo, medidas, atributos y confidencialidad.
- Publicación: bloqueo de fila e índice de versión corriente.

No se agrega tabla genérica mientras los comandos reintentables conserven respuesta determinista mediante estas identidades.

## Consecuencias

El fingerprint se calcula sobre datos validados y normalizados. Cambios en normalización requieren compatibilidad y pruebas de regresión.

## Validación

Pruebas secuenciales y concurrentes del mismo payload, sin duplicados y con respuesta consistente.
