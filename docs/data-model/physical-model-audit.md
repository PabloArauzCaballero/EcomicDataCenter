# Auditoría del modelo físico — fase 3

## 1. Alcance

Esta fase contrasta el modelo físico implementado con las fuentes de dominio y con `docs/model/model-catalog.json`. La auditoría cubre tablas, columnas, tipos, nulabilidad, claves, relaciones, constraints, índices, triggers, schemas y permisos PostgreSQL.

No modifica el alcance funcional: se conservan las 40 entidades del modelo fuente y no se añaden tablas de identidad, colas ni agregados no documentados.

## 2. Resultado verificable

| Elemento | Resultado |
|---|---:|
| Schemas funcionales | 6 |
| Schema de infraestructura | 1 |
| Tablas del dominio | 40 |
| Campos contrastados | 375 |
| Claves foráneas | 76 |
| Claves foráneas con índice líder | 76 de 76 |
| Migraciones versionadas | 14 |
| Triggers de integridad | 10 |
| Objetos funcionales en `public` | 0 |

El validador reproducible es `scripts/validate_physical_model.py`.

## 3. Hallazgos corregidos

### 3.1 Cobertura insuficiente de claves foráneas

La línea base tenía 49 claves foráneas sin un índice cuyo primer campo fuese la FK. Esto podía degradar joins, validaciones referenciales y borrados/actualizaciones de claves padre.

Se añadieron:

- 25 índices para `provenance`, `semantic` y `metadata`;
- 23 índices dedicados para `statistics` y `quality_lineage`;
- un índice compuesto de evaluaciones que cubre `data_entry_batch_id`;
- tres índices adicionales para consultas históricas, incidencias y series.

La cobertura final es 76 de 76. La existencia de un índice no prueba por sí sola un plan óptimo; los planes `EXPLAIN (ANALYZE, BUFFERS)` quedan para la fase de rendimiento con datos representativos.

### 3.2 Invariantes protegidas solo en servicios

Se trasladaron a PostgreSQL invariantes que deben mantenerse aunque una escritura no pase por el API:

- formato de hashes SHA-256;
- coherencia de conteos terminales de lotes;
- una única dimensión temporal por estructura;
- un único indicador primario por versión de dataset;
- correspondencia entre representación de dimensión y valor almacenado;
- pertenencia de códigos y clasificaciones a su catálogo;
- pertenencia del indicador a la versión del dataset;
- pertenencia de medidas y atributos a la estructura de datos;
- consistencia lote–dataset–artefacto de una revisión;
- al menos una medida por revisión;
- revisión corriente únicamente en estado publicado;
- prevención de relaciones reflexivas inválidas.

Las validaciones de negocio que dependen de permisos, proceso o contexto del actor permanecen en services. No se trasladó lógica HTTP a la base.

### 3.3 Permisos reader demasiado amplios

La migración inicial permitía al reader consultar todas las tablas de todos los schemas. La migración `0014-harden-runtime-grants.ts` revoca esos permisos y aplica una whitelist basada en las consultas reales del backend.

El reader:

- tiene `SELECT` solo en 21 tablas/vistas aprobadas;
- no recibe acceso al schema `semantic`;
- no puede escribir, crear objetos ni usar secuencias;
- inicia con `default_transaction_read_only=on`;
- no puede ejecutar funciones internas de integridad.

El writer conserva DML sobre tablas base, sin DDL, y recibe `EXECUTE` únicamente sobre las funciones necesarias para los triggers.

## 4. Organización por schema

| Schema | Responsabilidad | Escritura runtime | Lectura runtime |
|---|---|---|---|
| `provenance` | organizaciones, fuentes, artefactos y lotes | Writer | Whitelist reader |
| `semantic` | dominios, conceptos, catálogos y clasificaciones | Writer | Sin acceso directo reader |
| `metadata` | metodologías, estructuras y datasets versionados | Writer | Whitelist reader |
| `statistics` | indicadores, series, observaciones y revisiones | Writer | Whitelist reader |
| `quality_lineage` | reglas, evaluaciones, incidencias y linaje | Writer | Whitelist reader |
| `read_models` | proyecciones contractuales de lectura | Sin DML writer | Reader |
| `infrastructure` | historial de migraciones | Migrator | Sin acceso runtime |

## 5. Estrategia de integridad

Se usa la herramienta más simple que protege correctamente cada regla:

- `NOT NULL`, `UNIQUE`, `CHECK` y FK para invariantes locales;
- índices parciales para unicidad condicionada;
- triggers únicamente para reglas entre tablas o para validación diferida;
- services para transiciones, permisos y coordinación transaccional.

No se creó un motor genérico de reglas ni funciones dinámicas basadas en input del cliente.

## 6. Riesgos pendientes

1. Las migraciones no se ejecutaron contra PostgreSQL en este entorno; falta validar sintaxis y comportamiento real del motor.
2. Los índices se crean sin `CONCURRENTLY`, apropiado para el primer despliegue antes de tráfico. Una actualización sobre tablas pobladas debe evaluar ventana de mantenimiento o una migración online separada.
3. Los nuevos `CHECK` validan filas existentes. Una base con drift fallará de forma explícita y requerirá limpieza previa.
4. La política institucional de confidencialidad sigue sin estar aprobada; la whitelist técnica no sustituye esa decisión.
5. La distribución y cardinalidad reales todavía no permiten confirmar selectividad ni costo de índices.

## 7. Gate

El modelo físico queda aprobado de forma estática para continuar a la fase 4. El gate ejecutable permanece abierto hasta migrar una base vacía y una base actualizada desde `0009`, verificar rollback controlado y ejecutar la matriz real de privilegios.
