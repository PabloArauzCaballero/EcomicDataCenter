# Flujos críticos

## Registro individual

```text
JWT y rol DATA_OFFICER
-> organización UUID del actor coincide
-> fingerprint + claim atómico de batchCode
-> replay seguro o 409 por fingerprint distinto
-> artefacto, fuente, organización y dataset son consistentes
-> dataset version está PUBLISHED
-> estructura y referencias válidas
-> identidad de serie determinista
-> observación bloqueada
-> hash igual: UNCHANGED
-> hash distinto: revisión DRAFT
-> reglas de calidad
   -> CRITICAL FAIL: REJECTED
   -> sin crítico: VALIDATED -> PUBLISHED
-> revisión anterior SUPERSEDED
-> relación REVISED_FROM
-> lote COMMITTED o REJECTED
```

## Importación por lotes

```text
fingerprint + claim atómico de batchCode
-> replay seguro cuando existe resultado idéntico
-> lote VALIDATING
-> por cada registro
   -> SAVEPOINT
   -> ejecutar el mismo registro individual interno
   -> éxito: RELEASE
   -> error: ROLLBACK TO SAVEPOINT y registrar error seguro
-> calcular accepted/rejected
-> COMMITTED | PARTIAL | REJECTED
-> persistir conteos y respuesta completa para replay
```

## Consulta histórica

```text
filtros Zod
-> SQL parametrizado en reader
-> para cada observación elegir revisión PUBLISHED:
   current: is_current=true
   vintage: valid_from <= corte < valid_to
-> paginación server-side
-> medidas, atributos, dimensiones, fuente y resumen de calidad
```

## Publicación de metodología

```text
DRAFT -> TECHNICAL_REVIEW -> METHODOLOGICAL_REVIEW -> APPROVED -> PUBLISHED
-> exige publication_date
-> bloquea versión corriente
-> suplanta corriente previa
-> nueva versión is_current=true
```

## Publicación de dataset

```text
DRAFT -> UNDER_REVIEW -> APPROVED -> PUBLISHED
-> exige publication_date
-> metodología asociada PUBLISHED
-> data_structure activa
-> suplanta versión corriente previa
-> dataset.publication_status=PUBLISHED
```

## Apagado

Nest activa hooks de apagado. El orquestador deja de enviar tráfico por readiness, espera las solicitudes en curso y termina el proceso. API y futuras clases de workers deben desplegarse como procesos separados.

## Evaluación asíncrona

La versión actual no tiene workers: el alcance no define trabajo diferido. Los criterios de activación y el diseño requerido están en `async-processing-assessment.md`.
