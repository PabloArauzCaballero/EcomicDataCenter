# Arquitectura del backend

## 1. Propósito

El backend implementa el núcleo estadístico del Observatorio Económico y de Mercados de Bolivia. Preserva procedencia, semántica, metadatos, observaciones, revisiones, calidad y linaje. No administra identidades, frontend, microdatos ni procesos de IA.

El perfil completo está en `architecture-profile.md` y los requisitos no funcionales en `non-functional-requirements.md`.

## 2. Estilo arquitectónico

Monolito modular y stateless con módulos de dominio explícitos. Se eligió esta forma porque los casos de uso comparten una transacción y un modelo de datos integrado. Separar microservicios en esta etapa introduciría consistencia distribuida sin una frontera operativa demostrada.

```text
Controller
  -> Service / caso de uso
      -> Repository
          -> PostgreSQL
```

Reglas:

- controller: transporte, decorators, status y delegación;
- service: reglas, autorización contextual y transacción;
- repository: persistencia y consultas;
- mapper: salida segura y desacoplada del ORM;
- schema: validación runtime en el límite.

Las reglas detalladas están en `dependency-rules.md` y se verifican con `scripts/validate_architecture.py`.

## 3. Módulos

| Módulo | Responsabilidad | Dependencias permitidas |
|---|---|---|
| `provenance` | organizaciones, fuentes y artefactos | common, config, database |
| `governance` | semántica, metodologías, estructuras, datasets e indicadores | common, database |
| `ingestion` | registro, revisión, lote y calidad inicial | common/statistical, database |
| `query` | consulta actual, vintage y trazabilidad | common/statistical, reader DB |
| `quality` | reglas, incidencias, linaje y comparabilidad | common, database |
| `health` | liveness, readiness y métricas | config, pools, observabilidad |

Un módulo no importa internals de otro. El valor tipado de dimensión se ubica en `common/statistical` porque es un concepto compartido por ingestión y consulta.

## 4. Persistencia

### Schemas

| Schema | Responsabilidad |
|---|---|
| `infrastructure` | historial de migraciones |
| `provenance` | organizaciones, fuentes, artefactos y lotes |
| `semantic` | conceptos, clasificaciones, geografía, unidades y frecuencias |
| `metadata` | operaciones, metodologías, estructuras, datasets y versiones |
| `statistics` | indicadores, series, observaciones, revisiones, medidas y atributos |
| `quality_lineage` | calidad, incidencias, linaje, relaciones y rupturas |
| `read_models` | proyecciones de solo lectura |

No se crean objetos funcionales en `public`.

### Conexiones

- migrator: DDL y grants, ejecutado fuera del API;
- writer: DML y transacciones;
- reader: SELECT y proyecciones.

No existe fallback automático del reader al writer. Las operaciones read-your-writes consultan dentro de la transacción writer.

## 5. Integridad y concurrencia

- FK y checks en PostgreSQL.
- Una sola versión/revisión corriente mediante índices parciales.
- Artefactos fuente inmutables y verificados por SHA-256.
- Serie identificada por dimensiones normalizadas y hash.
- Registro/revisión en transacción `SERIALIZABLE`.
- Lotes con `SAVEPOINT` por registro y límite de 500.
- Retry solo para conflictos transitorios; nunca para errores de negocio.

## 6. Lectura

Las consultas complejas usan SQL constante, parametrizado y paginado en repositories de consulta. El cliente no envía nombres de columnas, tablas, joins ni fragmentos SQL. Las vistas se justifican por estabilidad contractual o simplificación, no por una presunción de rendimiento.

## 7. Seguridad

- JWT externo RS256/JWKS.
- issuer y audience obligatorios en modo JWKS.
- guard global default-deny.
- roles derivados del diagrama de casos de uso.
- ownership de organización en ingestión.
- secretos fuera del repositorio.
- errores y logs redactados.
- NGINX como única entrada pública en Compose.

La política de confidencialidad está pendiente y bloquea el release productivo. Consultar `authorization-matrix.md`, `security-boundaries.md` y `threat-model.md`.

## 8. Procesos asíncronos

No se incluye cola. El alcance actual no define entrega diferida, notificaciones ni integración eventual. Si la carga o un nuevo caso de uso exige asincronía, se agregará un worker persistente separado, idempotencia y outbox mediante un ADR nuevo.

## 9. Operación

Topología base:

```text
Internet -> NGINX -> API stateless -> PostgreSQL
                       |              reader/writer
                       -> JWKS
                       -> logs/métricas
Migration Job ----------------------> migrator
```

Compose es un entorno reproducible, no una garantía de alta disponibilidad. Kubernetes, PITR y tracing distribuido se activan por requisitos y evidencia.

## 10. Diagramas

- `system-context.puml`
- `container-diagram.puml`
- `component-diagram.puml`
- `deployment-diagram.puml`
- `trust-boundaries.puml`
