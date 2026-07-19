# Graph Report - EcomicDataCenter  (2026-07-19)

## Corpus Check
- 296 files · ~105,804 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1920 nodes · 3110 edges · 186 communities (136 shown, 50 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8db23bcc`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- environment.ts
- governance.controller.ts
- index.ts
- Roles
- scripts
- data-query.controller.ts
- quality.controller.ts
- migration.types.ts
- Prompt final especializado para backend con NestJS, TypeScript, Zod, JWT y Sequelize
- compilerOptions
- actor.ts
- Lineamientos de programación profesional para código en producción
- devDependencies
- observation-input.schemas.ts
- Casos de uso del core de datos
- Modelo de datos final
- app.module.ts
- observation-registration.service.ts
- mock-seed.metadata.ts
- DatasetVersionModel
- MethodologyVersionModel
- Instrucciones generales de generación del proyecto
- project_scope.py
- observation-write.repository.ts
- metadata-catalog.service.ts
- Opción A: stack completo con Docker
- dependencies
- application.error.ts
- batch-idempotency.ts
- Informe de fase 3 — modelo físico y PostgreSQL
- semantic.service.ts
- batch-import.service.ts
- .registerWithinBatch
- health.controller.ts
- DimensionDefinitionModel
- Secuencia ejecutada
- Observatorio Económico Core Backend
- Arquitectura del backend
- create-local-env.cjs
- physical_model_parser.py
- MetricsService
- Informe final de validación técnica
- HttpExceptionFilter
- observation-value.mapper.ts
- ADR-NNNN: Título
- Auditoría del modelo físico — fase 3
- Fuentes principales
- check_identifier_language.cjs
- Endpoints del core estadístico
- Informe de fase 2 de 10 — Arquitectura y seguridad
- yaml
- verify-local-stack.cjs
- Checklist para revisión específica de producción
- Informe de progreso del proyecto
- withSerializableRetry
- Flujos críticos
- Requisitos no funcionales y presupuestos de diseño
- Modelo de amenazas — Fase 2
- Estrategia de migraciones PostgreSQL
- package.json
- exclude
- check_typescript_syntax.cjs
- Evaluación de procesamiento asíncrono — fase 8
- Revisión Clean Code — Fase 2
- Ownership, roles y grants PostgreSQL
- ADR-0001: Fastify como adapter HTTP
- ADR-0002: identidad externa y JWT mediante JWKS
- ADR-0007: reader separado y proyecciones explícitas
- Controles de seguridad aplicados
- Informe de fase 4 — boot/mock seeds e idempotencia
- nest-cli.json
- 8. Separación de responsabilidades
- generate_migrations.py
- validate_diagrams.py
- Perfil arquitectónico
- ADR-0003: no introducir cola ni workers inicialmente
- ADR-0005: idempotencia mediante identidades del dominio
- Mapeo de estándares internacionales aplicables
- Validación final de la rama HARDENING
- Plan de implementación
- Informe de fase 5 — persistencia, queries y transacciones
- Informe de fase 6 — casos de uso y reglas de negocio
- Reglas de dependencias
- Límites de confianza y seguridad
- ADR-0004: base dedicada, schemas y credenciales separadas
- ADR-0006: logs JSON a stdout/stderr
- ADR-0008: API versionada y OpenAPI como contrato HTTP
- ADR-0009: aislamiento serializable para registro y revisión
- ADR-0010: NGINX como entrada y procesos separados
- ADR-0011: estrategia de backup condicionada por RPO/RTO
- ADR-0012: autorización de confidencialidad default-deny
- Cuarentena del código ajeno al núcleo económico
- Auditoría de memoria y eficiencia de recursos
- Informe de fase 7 — API, autenticación, permisos y OpenAPI
- Informe de fase 8 — workers, outbox e integraciones
- Informe de fase 9 — observabilidad, rendimiento y operación
- Informe de fase 10 — pruebas, auditoría, documentación y empaquetado
- Runbook de backup y restauración
- Runbook de migraciones y rollback
- build_openapi.py
- generate_models.py
- Capa de datos
- Gate de arquitectura — Fase 2 de 10
- Baseline y presupuesto de rendimiento
- Matriz de selección de librerías
- Registro de hallazgos de hardening
- .prettierrc.json
- build_data_model_docs.py
- smoke.ts
- validate_contract_routes.py
- Documentación de arquitectura
- validate_seed_catalogs.py
- verify_database_privileges.sh
- ClassificationModel
- ClassificationVersionModel
- DataIssueModel
- Matriz de autorización funcional
- Modelo de datos
- Colección Postman
- Matriz objetiva de calidad
- eslint.config.mjs
- 21. Estrategias permitidas para envío de JWT
- 7. Versionado de API
- Ingestión
- Diagramas PlantUML
- query-baseline.k6.js
- physical-model-gate.md
- README.md
- README.md
- README.md
- README.md
- README.md
- deployment.md
- incident-response.md
- README.md
- README.md
- dotenv
- fastify
- @fastify/helmet
- @fastify/static
- restore-drill.sh
- run-backup.sh
- init-local.sh
- README.md
- jsonwebtoken
- @nestjs/core
- nestjs-pino
- @nestjs/swagger
- pg
- pino
- reflect-metadata
- rxjs
- README.md
- run_release_verification.sh
- README.md
- README.md
- README.md
- README.md
- README.md
- README.md
- README.md
- README.md
- README.md
- data-query.controller.ts
- environment.ts
- OrganizationModel
- read-query.executor.ts
- DataQueryController
- export-openapi.ts
- observation-normalizer.ts
- seed-snapshot.ts
- JwtAuthGuard
- Public
- DataQueryInput
- RolesGuard
- reapply-runtime-grants.ts
- UnitMeasureModel
- ConfigurationModule
- @nestjs/common
- Injectable

## God Nodes (most connected - your core abstractions)
1. `scripts` - 56 edges
2. `Prompt final especializado para backend con NestJS, TypeScript, Zod, JWT y Sequelize` - 46 edges
3. `Lineamientos de programación profesional para código en producción` - 26 edges
4. `Roles()` - 24 edges
5. `GovernanceController` - 24 edges
6. `sequelize` - 22 edges
7. `compilerOptions` - 21 edges
8. `getEnvironment()` - 20 edges
9. `MetricsService` - 18 edges
10. `DatasetVersionModel` - 17 edges

## Surprising Connections (you probably didn't know these)
- `createContractApplication()` --references--> `test`  [EXTRACTED]
  scripts/export-openapi.ts → package.json
- `withSerializableRetry()` --references--> `sequelize`  [EXTRACTED]
  src/common/persistence/serializable-retry.ts → package.json
- `createMigrationRunner()` --references--> `sequelize`  [EXTRACTED]
  src/database/migration.runner.ts → package.json
- `withMigrationLock()` --references--> `sequelize`  [EXTRACTED]
  src/database/migration.runner.ts → package.json
- `createContractApplication()` --indirect_call--> `AppModule`  [INFERRED]
  scripts/export-openapi.ts → src/app.module.ts

## Import Cycles
- None detected.

## Communities (186 total, 50 thin omitted)

### Community 0 - "environment.ts"
Cohesion: 0.16
Nodes (11): validateSeedFiles(), artifactSchema, conceptSchema, date, frequencySeedSchema, mockSeedSchema, organizationSchema, qualityDimensionSeedSchema (+3 more)

### Community 1 - "governance.controller.ts"
Cohesion: 0.10
Nodes (28): attributeSchema, createDatasetSchema, createDatasetVersionSchema, createDataStructureSchema, createIndicatorSchema, createMethodologySchema, createMethodologyVersionSchema, createStatisticalOperationSchema (+20 more)

### Community 2 - "index.ts"
Cohesion: 0.05
Nodes (43): createReaderDatabase(), dialectOptions(), PostgresDialectOptions, ClassificationModel, Column, Table, ClassificationVersionModel, Column (+35 more)

### Community 3 - "Roles"
Cohesion: 0.08
Nodes (28): Injectable, ZodValidationPipe, ProvenanceController, ApiBearerAuth, ApiOperation, ApiTags, Body, Controller (+20 more)

### Community 4 - "scripts"
Cohesion: 0.04
Nodes (55): scripts, build, compose:validate, db:grants:reapply, db:migrate, db:migrate:undo, db:provision:roles, db:seed:boot (+47 more)

### Community 5 - "data-query.controller.ts"
Cohesion: 0.20
Nodes (9): ReadQueryExecutor, Inject, Injectable, mapQueryRow(), DataQueryRepository, QueryRow, Injectable, TraceRepository (+1 more)

### Community 6 - "quality.controller.ts"
Cohesion: 0.09
Nodes (33): Roles(), QualityController, ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Get (+25 more)

### Community 8 - "Prompt final especializado para backend con NestJS, TypeScript, Zod, JWT y Sequelize"
Cohesion: 0.05
Nodes (43): 0. Regla superior obligatoria sobre backend, 10. Migraciones y seeders, 11. Transacciones con Sequelize, 12. Auditoría estándar de entidades, 13. Repository genérico para CRUD con Sequelize, 14. Service genérico para CRUD: opcional y controlado, 15. Prohibición de controllers genéricos, 16. Validación con Zod (+35 more)

### Community 9 - "compilerOptions"
Cohesion: 0.05
Nodes (40): jest, node, scripts/**/*.ts, src/app.module.ts, src/common/**/*.ts, src/config/**/*.ts, src/database/seeders, src/database/**/*.ts (+32 more)

### Community 10 - "actor.ts"
Cohesion: 0.26
Nodes (10): Actor, ACTOR_ROLES, ActorRole, TokenClaims, environment, allowedRoles, baseClaimsSchema, organizationIdSchema (+2 more)

### Community 11 - "Lineamientos de programación profesional para código en producción"
Cohesion: 0.06
Nodes (35): 0. Modo obligatorio: temperatura 0, precisión y cero adivinanzas, 10. Tipado y contratos de datos, 11. Organización de carpetas, 12. Performance y escalabilidad, 13. Integraciones externas, 14. Logs y observabilidad, 15. Código listo para producción, 16. Formato de respuesta esperado (+27 more)

### Community 12 - "devDependencies"
Cohesion: 0.06
Nodes (33): eslint, eslint-config-prettier, @eslint/js, jest, @nestjs/cli, @nestjs/testing, devDependencies, eslint (+25 more)

### Community 13 - "observation-input.schemas.ts"
Cohesion: 0.15
Nodes (15): attributeValueSchema, decimal, importObservationBatchSchema, isoDate, MeasureValueInput, measureValueSchema, observationRecordSchema, registerObservationSchema (+7 more)

### Community 14 - "Casos de uso del core de datos"
Cohesion: 0.07
Nodes (26): Actores, Alternativas, Casos de uso del core de datos, Ejemplo, Flujo principal, Flujo principal, Flujo principal, Objetivo (+18 more)

### Community 15 - "Modelo de datos final"
Cohesion: 0.08
Nodes (23): 1. Resultado de la revisión final, 2. Núcleo obligatorio y extensión institucional, 32 entidades obligatorias, 3. Catálogo de entidades, 4. Reglas de integridad indispensables, 5. Índices principales, 6. Ejemplo lógico, 7. Datos oficiales y resultados académicos (+15 more)

### Community 16 - "app.module.ts"
Cohesion: 0.08
Nodes (21): Injectable, environment, LoggableRequest, LoggableResponse, RequestContextInterceptor, ObservabilityModule, Global, Module (+13 more)

### Community 17 - "observation-registration.service.ts"
Cohesion: 0.21
Nodes (10): ObservationRecordInput, RegisterWithinBatchInput, RegistrationWithoutBatch, EvaluationResult, nonNegativeConfig, numericRangeConfig, QualityEvaluatorService, requiredMeasureConfig (+2 more)

### Community 18 - "mock-seed.metadata.ts"
Cohesion: 0.09
Nodes (23): DataStructureModel, Column, Table, DatasetIndicatorModel, Column, Table, DatasetModel, Column (+15 more)

### Community 19 - "DatasetVersionModel"
Cohesion: 0.20
Nodes (5): DatasetService, Inject, Injectable, CreateDatasetInput, DatasetVersionInput

### Community 20 - "MethodologyVersionModel"
Cohesion: 0.12
Nodes (15): sequelize, ensureGroupRole(), ensureLoginRole(), GROUP_ROLES, LoginRole, main(), requireEnv(), sequelize (+7 more)

### Community 21 - "Instrucciones generales de generación del proyecto"
Cohesion: 0.10
Nodes (20): 0. Modo de trabajo obligatorio: precisión, temperatura 0 y cero adivinanzas, 10. Workers como procesos persistentes de producción, 1. Lectura obligatoria de prompts base, 2. Lectura y análisis de diagramas del sistema, 3. Criterios de interpretación de los diagramas, 4. Manejo de diagramas faltantes o incompletos, 5. Relación entre diagramas y arquitectura generada, 6. Generación de entregables (+12 more)

### Community 22 - "project_scope.py"
Cohesion: 0.15
Nodes (16): main(), main(), iter_core_typescript_files(), iter_files(), iter_maintained_code_files(), Path, Yield unique files from explicit roots without traversing quarantined code., Yield TypeScript files that belong to the deployed application graph. (+8 more)

### Community 23 - "observation-write.repository.ts"
Cohesion: 0.15
Nodes (10): DataEntryBatchModel, Column, Table, ObservationModel, Column, Table, mapDimensionValue(), BatchClaimInput (+2 more)

### Community 24 - "metadata-catalog.service.ts"
Cohesion: 0.17
Nodes (8): MetadataCatalogService, Inject, Injectable, CreateDataStructureInput, CreateIndicatorInput, CreateStatisticalOperationInput, MetadataService, Injectable

### Community 25 - "Opción A: stack completo con Docker"
Cohesion: 0.11
Nodes (18): 1. Crear configuración local coherente, 1. Crear configuración para runtime en host, 2. Iniciar únicamente PostgreSQL con puerto local, 2. Instalar dependencias con lockfile, 3. Construir e iniciar, 3. Preparar la base de datos, 4. Cargar catálogos y datos sintéticos, 4. Iniciar y verificar el API (+10 more)

### Community 26 - "dependencies"
Cohesion: 0.11
Nodes (19): @fastify/helmet, @fastify/rate-limit, jwks-rsa, @nestjs/platform-fastify, dependencies, @fastify/helmet, @fastify/rate-limit, jwks-rsa (+11 more)

### Community 27 - "application.error.ts"
Cohesion: 0.14
Nodes (14): BusinessRuleError, ErrorCode, NotFoundError, FrequencyModel, Column, Table, GeographicUnitModel, Column (+6 more)

### Community 28 - "batch-idempotency.ts"
Cohesion: 0.15
Nodes (21): assertFingerprint(), batchRequestFingerprint(), canonicalize(), fingerprint(), manualRequestFingerprint(), replayBatchImport(), replayRegistration(), BatchImportService (+13 more)

### Community 29 - "Informe de fase 3 — modelo físico y PostgreSQL"
Cohesion: 0.12
Nodes (16): 10. Desviaciones, 11. Estado, 1. Objetivo, 2. Archivos creados, 3. Archivos modificados, 4. Avances verificables, 5. Correcciones principales, 6. Pruebas ejecutadas (+8 more)

### Community 30 - "semantic.service.ts"
Cohesion: 0.40
Nodes (3): DatabaseConnections, DatabaseLifecycle, Inject

### Community 31 - "batch-import.service.ts"
Cohesion: 0.24
Nodes (9): HttpCode, CurrentActor, IngestionController, ApiBearerAuth, ApiOperation, ApiTags, Body, Controller (+1 more)

### Community 32 - ".registerWithinBatch"
Cohesion: 0.17
Nodes (6): MetricsService, Injectable, Inject, ObservationRegistrationService, Inject, Injectable

### Community 33 - "health.controller.ts"
Cohesion: 0.30
Nodes (7): ENVIRONMENT, DATABASE_CONNECTIONS, READER_DATABASE, WRITER_DATABASE, HealthController, Controller, database

### Community 34 - "DimensionDefinitionModel"
Cohesion: 0.13
Nodes (13): AttributeDefinitionModel, Column, Table, DatasetVersionModel, Column, Table, DimensionDefinitionModel, Column (+5 more)

### Community 35 - "Secuencia ejecutada"
Cohesion: 0.13
Nodes (14): Criterios no negociables, Definición de terminado, Estado por fase, Fase 1 — Baseline e inventario, Fase 2 — Integridad del repositorio y build, Fase 3 — Memoria y eficiencia de recursos, Fase 4 — Seguridad de la información, Fase 5 — Clean Code y nomenclatura (+6 more)

### Community 36 - "Observatorio Económico Core Backend"
Cohesion: 0.13
Nodes (14): 1. Preparar herramientas y configuración, 2. Construir e iniciar, 3. Cargar catálogos y datos locales, 4. Ejecutar verificación local, 5. Logs y apagado, Autorización, Calidad, Capacidades implementadas (+6 more)

### Community 37 - "Arquitectura del backend"
Cohesion: 0.14
Nodes (13): 10. Diagramas, 1. Propósito, 2. Estilo arquitectónico, 3. Módulos, 4. Persistencia, 5. Integridad y concurrencia, 6. Lectura, 7. Seguridad (+5 more)

### Community 38 - "create-local-env.cjs"
Cohesion: 0.14
Nodes (12): adminPassword, backupPassword, environment, { existsSync, writeFileSync }, forceOverwrite, migratorPassword, { randomBytes }, readerPassword (+4 more)

### Community 39 - "physical_model_parser.py"
Cohesion: 0.27
Nodes (12): expected_type(), leading_index_columns(), load_fk_targets(), migration_source(), normalized_type(), parse_fks(), parse_tables(), Path (+4 more)

### Community 40 - "MetricsService"
Cohesion: 0.33
Nodes (5): Environment, DatabaseConnectionFactories, defaultFactories, initializeDatabaseConnections(), Inject

### Community 41 - "Informe final de validación técnica"
Cohesion: 0.14
Nodes (13): 1. Evidencia ejecutada, 2. Cambios críticos validados, 3. Gates bloqueados, 4. Intento de type-check, 5. Intento de bootstrap de Yarn, 6. Gate de release reproducible, 7. Calificación objetiva, Informe final de validación técnica (+5 more)

### Community 43 - "observation-value.mapper.ts"
Cohesion: 0.22
Nodes (8): ObservationRevisionModel, Column, Table, AttributeValueInput, mapAttributeValue(), mapMeasureValue(), RevisionWriteRepository, Injectable

### Community 44 - "ADR-NNNN: Título"
Cohesion: 0.15
Nodes (12): ADR-NNNN: Título, Consecuencias, Contexto, Criterio de revisión, Decisión, Drivers de decisión, Negativas y compromisos, Opciones consideradas (+4 more)

### Community 45 - "Auditoría del modelo físico — fase 3"
Cohesion: 0.17
Nodes (11): 1. Alcance, 2. Resultado verificable, 3.1 Cobertura insuficiente de claves foráneas, 3.2 Invariantes protegidas solo en servicios, 3.3 Permisos reader demasiado amplios, 3. Hallazgos corregidos, 4. Organización por schema, 5. Estrategia de integridad (+3 more)

### Community 46 - "Fuentes principales"
Cohesion: 0.17
Nodes (11): DDI Lifecycle, Decisiones derivadas de la investigación, Dictamen, Elementos deliberadamente no adoptados, Fuentes principales, GSIM 2.0, INE Bolivia, Marco jurídico boliviano (+3 more)

### Community 47 - "check_identifier_language.cjs"
Cohesion: 0.18
Nodes (11): configFile, configPath, fs, identifierTokens(), parsedConfig, path, root, spanishTerms (+3 more)

### Community 48 - "Endpoints del core estadístico"
Cohesion: 0.18
Nodes (10): Calidad y linaje, Consulta, Convenciones, Endpoints del core estadístico, Flujo interno de registro, Gobierno semántico y de metadatos, Ingestión y revisión, Operación (+2 more)

### Community 49 - "Informe de fase 2 de 10 — Arquitectura y seguridad"
Cohesion: 0.18
Nodes (10): 1. Resumen, 2. Avance verificable, 3. Decisiones clave, 4. Riesgos, 5. Desviaciones, 6. Pruebas ejecutadas, 7. Estado, Archivos creados (+2 more)

### Community 50 - "yaml"
Cohesion: 0.22
Nodes (5): yaml, main(), make_request(), schema_example(), yaml

### Community 51 - "verify-local-stack.cjs"
Cohesion: 0.29
Nodes (10): { existsSync, readFileSync }, main(), parsePositiveInteger(), readEnvironmentFile(), requestStatus(), { resolve }, runSmokeChecks(), { spawnSync } (+2 more)

### Community 52 - "Checklist para revisión específica de producción"
Cohesion: 0.20
Nodes (9): A. Código y contratos, Artefactos mínimos de firma, B. Seguridad de software y supply chain, C. Base de datos, Checklist para revisión específica de producción, D. Rendimiento y estabilidad, E. Continuidad y operación, F. Infraestructura y estándares de data center (+1 more)

### Community 53 - "Informe de progreso del proyecto"
Cohesion: 0.20
Nodes (9): 1. Resumen del ciclo de trabajo, 2. Avance realizado, 3. Riesgos detectados, 4. Decisiones clave tomadas, 5. Desviaciones de lo esperado, 6. Fase actual del proyecto, 7. Próxima acción recomendada, 8. Estado general del entregable (+1 more)

### Community 54 - "withSerializableRetry"
Cohesion: 0.42
Nodes (6): databaseErrorCode(), isRetryableTransactionError(), RETRYABLE_TRANSACTION_CODES, retryDelay(), TransactionRetryOptions, withSerializableRetry()

### Community 55 - "Flujos críticos"
Cohesion: 0.22
Nodes (8): Apagado, Consulta histórica, Evaluación asíncrona, Flujos críticos, Importación por lotes, Publicación de dataset, Publicación de metodología, Registro individual

### Community 56 - "Requisitos no funcionales y presupuestos de diseño"
Cohesion: 0.22
Nodes (8): 1. Regla de uso, 2. Correctitud e integridad, 3. Seguridad, 4. Rendimiento y capacidad, 5. Disponibilidad y recuperación, 6. Observabilidad, 7. Gates posteriores, Requisitos no funcionales y presupuestos de diseño

### Community 57 - "Modelo de amenazas — Fase 2"
Cohesion: 0.22
Nodes (8): 1. Método y alcance, 2. Activos, 3. Entradas, 4. Riesgos STRIDE, 5. Controles transversales, 6. Riesgo residual aceptado en fase 2, 7. Revisión, Modelo de amenazas — Fase 2

### Community 58 - "Estrategia de migraciones PostgreSQL"
Cohesion: 0.22
Nodes (8): Despliegue, Estrategia de migraciones PostgreSQL, Fuente de verdad, Gates ejecutables pendientes, Rollback, Secuencia actual, Serialización, Verificación automatizada

### Community 59 - "package.json"
Cohesion: 0.22
Nodes (8): description, engines, node, license, name, packageManager, private, version

### Community 60 - "exclude"
Cohesion: 0.22
Nodes (8): scripts, **/*.spec.ts, test, ./tsconfig.json, exclude, extends, dist, node_modules

### Community 61 - "check_typescript_syntax.cjs"
Cohesion: 0.22
Nodes (8): configFile, configPath, files, fs, parsedConfig, path, root, ts

### Community 62 - "Evaluación de procesamiento asíncrono — fase 8"
Cohesion: 0.25
Nodes (7): Criterios que obligan a reabrir ADR-0003, Decisión, Diseño obligatorio al activarse, Estado del gate, Evaluación de procesamiento asíncrono — fase 8, Evidencia del alcance, Flujo vigente

### Community 63 - "Revisión Clean Code — Fase 2"
Cohesion: 0.25
Nodes (7): Acoplamiento entre módulos, Criterios automatizados, Hallazgo corregido, Límites, Objetivo, Resultado, Revisión Clean Code — Fase 2

### Community 64 - "Ownership, roles y grants PostgreSQL"
Cohesion: 0.25
Nodes (7): 1. Principio, 2. Roles, 3. Endurecimiento, 4. Whitelist reader, 5. Funciones y triggers, 6. Verificación, Ownership, roles y grants PostgreSQL

### Community 65 - "ADR-0001: Fastify como adapter HTTP"
Cohesion: 0.25
Nodes (7): ADR-0001: Fastify como adapter HTTP, Consecuencias, Contexto, Decisión, Drivers, Opciones, Validación

### Community 66 - "ADR-0002: identidad externa y JWT mediante JWKS"
Cohesion: 0.25
Nodes (7): ADR-0002: identidad externa y JWT mediante JWKS, Consecuencias, Contexto, Decisión, Drivers, Opciones, Validación

### Community 67 - "ADR-0007: reader separado y proyecciones explícitas"
Cohesion: 0.25
Nodes (7): ADR-0007: reader separado y proyecciones explícitas, Consecuencias, Contexto, Decisión, Drivers, Opciones, Validación

### Community 68 - "Controles de seguridad aplicados"
Cohesion: 0.25
Nodes (7): Contenedores y red, Controles de seguridad aplicados, Entrada y transporte, Identidad y autorización, Logs y errores, Pendientes que requieren entorno, Persistencia

### Community 69 - "Informe de fase 4 — boot/mock seeds e idempotencia"
Cohesion: 0.25
Nodes (7): Avance realizado, Cabecera, Decisiones, Desviaciones, Estado, Informe de fase 4 — boot/mock seeds e idempotencia, Riesgos detectados

### Community 70 - "nest-cli.json"
Cohesion: 0.25
Nodes (7): collection, compilerOptions, assets, deleteOutDir, tsConfigPath, $schema, sourceRoot

### Community 71 - "8. Separación de responsabilidades"
Cohesion: 0.25
Nodes (8): 8. Separación de responsabilidades, Controllers, DTOs, Mappers, Modules, Repositories, Schemas, Services

### Community 72 - "generate_migrations.py"
Cohesion: 0.50
Nodes (7): checks_for(), constraint_name(), main(), parse_unique(), render_foreign_keys(), render_schema_migration(), sql_type()

### Community 73 - "validate_diagrams.py"
Cohesion: 0.39
Nodes (7): balanced_braces(), declared_relational_aliases(), main(), Path, Valida llaves de bloques, ignorando la notación crow's foot o{ y }o., relationship_tokens(), validate_file()

### Community 74 - "Perfil arquitectónico"
Cohesion: 0.29
Nodes (6): 1. Clasificación del sistema, 2. Capacidades obligatorias activas, 3. Capacidades condicionales, 4. Límites de alcance, 5. Incertidumbres que no deben resolverse por suposición, Perfil arquitectónico

### Community 75 - "ADR-0003: no introducir cola ni workers inicialmente"
Cohesion: 0.29
Nodes (6): ADR-0003: no introducir cola ni workers inicialmente, Contexto, Criterio de revisión, Decisión, Drivers, Opciones

### Community 76 - "ADR-0005: idempotencia mediante identidades del dominio"
Cohesion: 0.29
Nodes (6): ADR-0005: idempotencia mediante identidades del dominio, Consecuencias, Contexto, Decisión, Opciones, Validación

### Community 77 - "Mapeo de estándares internacionales aplicables"
Cohesion: 0.29
Nodes (6): Alcance y advertencia, Criterios de uso, Evidencia mínima para una revisión de producción, Fuentes oficiales verificadas, Mapeo de estándares internacionales aplicables, Matriz de trazabilidad

### Community 78 - "Validación final de la rama HARDENING"
Cohesion: 0.29
Nodes (6): Candidato, Dictamen, Gates automáticos, Gates externos, Validación final de la rama HARDENING, Verificación local preparada

### Community 79 - "Plan de implementación"
Cohesion: 0.29
Nodes (6): Estado final, Evidencia consolidada, Fases, Gates de release pendientes, Plan de implementación, Regla de cierre

### Community 80 - "Informe de fase 5 — persistencia, queries y transacciones"
Cohesion: 0.29
Nodes (6): Avance realizado, Cabecera, Decisiones, Estado, Informe de fase 5 — persistencia, queries y transacciones, Riesgos y mitigación

### Community 81 - "Informe de fase 6 — casos de uso y reglas de negocio"
Cohesion: 0.29
Nodes (6): Avance realizado, Cabecera, Desviaciones, Estado, Informe de fase 6 — casos de uso y reglas de negocio, Riesgos y mitigación

### Community 82 - "Reglas de dependencias"
Cohesion: 0.33
Nodes (5): 1. Dirección permitida, 2. Reglas obligatorias, 3. Excepciones aceptadas, 4. Verificación, Reglas de dependencias

### Community 83 - "Límites de confianza y seguridad"
Cohesion: 0.33
Nodes (5): 1. Zonas, 2. Cruces de frontera, 3. Datos que no deben cruzar límites, 4. Bloqueos previos a exposición pública, Límites de confianza y seguridad

### Community 84 - "ADR-0004: base dedicada, schemas y credenciales separadas"
Cohesion: 0.33
Nodes (5): ADR-0004: base dedicada, schemas y credenciales separadas, Consecuencias, Contexto, Decisión, Validación

### Community 85 - "ADR-0006: logs JSON a stdout/stderr"
Cohesion: 0.33
Nodes (5): ADR-0006: logs JSON a stdout/stderr, Alternativas, Contexto, Decisión, Validación

### Community 86 - "ADR-0008: API versionada y OpenAPI como contrato HTTP"
Cohesion: 0.33
Nodes (5): ADR-0008: API versionada y OpenAPI como contrato HTTP, Alternativas descartadas, Contexto, Decisión, Validación

### Community 87 - "ADR-0009: aislamiento serializable para registro y revisión"
Cohesion: 0.33
Nodes (5): ADR-0009: aislamiento serializable para registro y revisión, Consecuencias, Contexto, Decisión, Validación

### Community 88 - "ADR-0010: NGINX como entrada y procesos separados"
Cohesion: 0.33
Nodes (5): ADR-0010: NGINX como entrada y procesos separados, Consecuencias, Contexto, Decisión, Validación

### Community 89 - "ADR-0011: estrategia de backup condicionada por RPO/RTO"
Cohesion: 0.33
Nodes (5): ADR-0011: estrategia de backup condicionada por RPO/RTO, Alternativas, Contexto, Decisión provisional, Gate

### Community 90 - "ADR-0012: autorización de confidencialidad default-deny"
Cohesion: 0.33
Nodes (5): ADR-0012: autorización de confidencialidad default-deny, Consecuencia, Contexto, Datos requeridos, Decisión de seguridad

### Community 91 - "Cuarentena del código ajeno al núcleo económico"
Cohesion: 0.33
Nodes (5): Controles, Cuarentena del código ajeno al núcleo económico, Decisión, Riesgo residual, Rutas en cuarentena

### Community 92 - "Auditoría de memoria y eficiencia de recursos"
Cohesion: 0.33
Nodes (5): Auditoría de memoria y eficiencia de recursos, Controles aplicados, Prueba de estabilidad requerida, Resultado del análisis estático, Riesgos residuales

### Community 93 - "Informe de fase 7 — API, autenticación, permisos y OpenAPI"
Cohesion: 0.33
Nodes (5): Avance realizado, Cabecera, Estado, Informe de fase 7 — API, autenticación, permisos y OpenAPI, Riesgos abiertos

### Community 94 - "Informe de fase 8 — workers, outbox e integraciones"
Cohesion: 0.33
Nodes (5): Cabecera, Estado, Informe de fase 8 — workers, outbox e integraciones, Resultado, Riesgo evitado

### Community 95 - "Informe de fase 9 — observabilidad, rendimiento y operación"
Cohesion: 0.33
Nodes (5): Avance realizado, Bloqueos, Cabecera, Estado, Informe de fase 9 — observabilidad, rendimiento y operación

### Community 96 - "Informe de fase 10 — pruebas, auditoría, documentación y empaquetado"
Cohesion: 0.33
Nodes (5): Avance realizado, Cabecera, Calificación, Gates bloqueados, Informe de fase 10 — pruebas, auditoría, documentación y empaquetado

### Community 97 - "Runbook de backup y restauración"
Cohesion: 0.33
Nodes (5): Backup lógico aislado, Criterio de aprobación, Estado de decisión, Restore drill obligatorio, Runbook de backup y restauración

### Community 98 - "Runbook de migraciones y rollback"
Cohesion: 0.33
Nodes (5): Antes del cambio, Aplicación, Rollback, Runbook de migraciones y rollback, Validación posterior

### Community 99 - "build_openapi.py"
Cohesion: 0.47
Nodes (3): operation(), ref(), response()

### Community 100 - "generate_models.py"
Cohesion: 0.67
Nodes (5): camel(), main(), pascal(), render_model(), type_parts()

### Community 101 - "Capa de datos"
Cohesion: 0.33
Nodes (5): Capa de datos, Comandos, Documentación relacionada, Migraciones, Reglas

### Community 102 - "Gate de arquitectura — Fase 2 de 10"
Cohesion: 0.40
Nodes (4): Bloqueos para producción, no para fase 3, Evidencia, Gate de arquitectura — Fase 2 de 10, Resultado

### Community 103 - "Baseline y presupuesto de rendimiento"
Cohesion: 0.40
Nodes (4): Baseline y presupuesto de rendimiento, Diferencia entre presupuesto y SLO, Escenario reproducible, Evidencia requerida

### Community 104 - "Matriz de selección de librerías"
Cohesion: 0.40
Nodes (4): Criterio, Dependencias no activadas, Gate de actualización, Matriz de selección de librerías

### Community 105 - "Registro de hallazgos de hardening"
Cohesion: 0.40
Nodes (4): Conclusión técnica, Convenciones, Hallazgos, Registro de hallazgos de hardening

### Community 106 - ".prettierrc.json"
Cohesion: 0.40
Nodes (4): printWidth, semi, singleQuote, trailingComma

### Community 107 - "build_data_model_docs.py"
Cohesion: 0.60
Nodes (4): build_schema_diagrams(), build_tex(), plantuml_entity(), tex()

### Community 108 - "smoke.ts"
Cohesion: 0.70
Nodes (4): check(), checkProtectedRoute(), CheckResult, main()

### Community 109 - "validate_contract_routes.py"
Cohesion: 0.80
Nodes (4): controller_routes(), main(), normalize(), openapi_routes()

### Community 110 - "Documentación de arquitectura"
Cohesion: 0.50
Nodes (3): Diagramas, Documentación de arquitectura, Lectura recomendada

### Community 111 - "validate_seed_catalogs.py"
Cohesion: 0.83
Nodes (3): collect_ids(), find_sensitive(), main()

### Community 113 - "ClassificationModel"
Cohesion: 0.09
Nodes (16): chunkItems(), ClassificationMappingModel, Column, Table, ConceptModel, Column, Table, StatisticalDomainModel (+8 more)

### Community 114 - "ClassificationVersionModel"
Cohesion: 0.15
Nodes (14): GovernanceController, ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Param, Post (+6 more)

### Community 115 - "DataIssueModel"
Cohesion: 0.23
Nodes (15): createWriterDatabase(), QualityDimensionModel, Column, Table, reconcileFrequencies(), reconcileQualityDimensions(), reconcileUnits(), runBootSeeds() (+7 more)

### Community 121 - "21. Estrategias permitidas para envío de JWT"
Cohesion: 0.67
Nodes (3): 21. Estrategias permitidas para envío de JWT, Opción A: JWT en cookie httpOnly, Opción B: JWT como Bearer token

### Community 122 - "7. Versionado de API"
Cohesion: 0.67
Nodes (3): 7. Versionado de API, Opción A: prefijo por controller, Opción B: prefijo global y rutas versionadas

### Community 138 - "@fastify/helmet"
Cohesion: 0.13
Nodes (13): ClassificationItemModel, Column, Table, CodeItemModel, Column, Table, CodeListModel, Column (+5 more)

### Community 168 - "data-query.controller.ts"
Cohesion: 0.21
Nodes (10): decimal, dimensionValueSchema, isoDate, uuid, buildDataQueryPlan(), DataQueryPlan, dimensionPredicate(), dataQuerySchema (+2 more)

### Community 169 - "environment.ts"
Cohesion: 0.35
Nodes (9): booleanFromString, environmentSchema, getEnvironment(), resetEnvironmentForTests(), main(), main(), main(), createMigrationRunner() (+1 more)

### Community 170 - "OrganizationModel"
Cohesion: 0.18
Nodes (10): OrganizationModel, Column, Table, SourceArtifactModel, Column, Table, SourceModel, Column (+2 more)

### Community 171 - "read-query.executor.ts"
Cohesion: 0.21
Nodes (7): ApplicationError, ConflictError, InfrastructureError, SafeErrorLog, stringProperty(), toSafeErrorLog(), ReadQueryContext

### Community 172 - "DataQueryController"
Cohesion: 0.15
Nodes (8): DataQueryController, ApiBearerAuth, ApiTags, Controller, Get, Param, DataQueryService, Injectable

### Community 173 - "export-openapi.ts"
Cohesion: 0.27
Nodes (8): test, createContractApplication(), createDatabaseDouble(), exportOpenApi(), AppModule, Module, createRequestId(), bootstrap()

### Community 174 - "observation-normalizer.ts"
Cohesion: 0.33
Nodes (8): DimensionValueInput, buildRevisionHash(), buildSeriesIdentity(), dimensionToken(), normalizedAttribute(), normalizedMeasure(), OrderedDimension, stableHash()

### Community 175 - "seed-snapshot.ts"
Cohesion: 0.36
Nodes (7): canonicalize(), hashSnapshot(), SnapshotRow, BOOT_FREQUENCY_IDS, BOOT_QUALITY_DIMENSION_IDS, BOOT_UNIT_IDS, MOCK_IDS

### Community 176 - "JwtAuthGuard"
Cohesion: 0.32
Nodes (3): JwtAuthGuard, Inject, Injectable

### Community 177 - "Public"
Cohesion: 0.38
Nodes (3): Header, Public(), Get

### Community 178 - "DataQueryInput"
Cohesion: 0.38
Nodes (4): ApiOperation, Body, Post, DataQueryInput

### Community 179 - "RolesGuard"
Cohesion: 0.40
Nodes (3): RolesGuard, Inject, Injectable

### Community 181 - "UnitMeasureModel"
Cohesion: 0.50
Nodes (3): Column, Table, UnitMeasureModel

### Community 182 - "ConfigurationModule"
Cohesion: 0.67
Nodes (3): ConfigurationModule, Global, Module

## Knowledge Gaps
- **757 isolated node(s):** `name`, `version`, `private`, `description`, `license` (+752 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **50 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `sequelize` connect `MethodologyVersionModel` to `quality.controller.ts`, `environment.ts`, `DataQueryController`, `ClassificationModel`, `Public`, `DatasetVersionModel`, `withSerializableRetry`, `metadata-catalog.service.ts`, `dependencies`, `batch-idempotency.ts`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `dotenv`, `fastify`, `@fastify/static`, `jsonwebtoken`, `@nestjs/core`, `nestjs-pino`, `@nestjs/swagger`, `pg`, `pino`, `reflect-metadata`, `@nestjs/common`, `rxjs`, `MethodologyVersionModel`, `yaml`, `package.json`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Why does `scripts` connect `scripts` to `package.json`, `export-openapi.ts`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _757 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `governance.controller.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0967741935483871 - nodes in this community are weakly interconnected._
- **Should `index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05026300409117475 - nodes in this community are weakly interconnected._
- **Should `Roles` be split into smaller, more focused modules?**
  _Cohesion score 0.07568027210884354 - nodes in this community are weakly interconnected._