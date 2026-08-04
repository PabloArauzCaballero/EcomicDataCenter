# 04 — Política de datos en las trazas

> Fase 18. Una traza es legible por cualquiera con acceso al backend de trazas y se conserva días
> o semanas. Sin una política explícita, Jaeger se convierte en una copia no gobernada de los datos
> que el resto del sistema protege.

Aplica a `src/common/observability/**` y a cualquier span creado por código de este repositorio.
Regla marco: `.claude/rules/30-security.md`.

---

## 1. Datos permitidos

| Categoría | Ejemplos | Justificación |
|---|---|---|
| Ruta normalizada | `http.route = /api/v1/data/query` | Identifica la operación; no contiene valores |
| Método y estado HTTP | `GET`, `200`, `409` | Sin contenido |
| Nombre de operación de negocio | `intelligence.submit-claims` | Vocabulario fijo |
| Módulo y operación | `app.module`, `app.operation` | Enumerados cortos |
| Identificadores técnicos internos | `app.entity.id`, `app.organization.id` (UUID) | Claves sustitutas sin significado fuera del sistema |
| Recuentos y tamaños | `app.batch.size`, `app.submission.published` | Enteros |
| Modo de consulta | `app.query.mode` = `CURRENT`/`VINTAGE` | Cardinalidad 2 |
| Metadatos de base de datos | `db.system`, `db.namespace`, `server.address`, `server.port` | Topología, no datos |
| Texto SQL sin valores ligados | `SELECT ... WHERE x = $1` | Necesario para identificar la consulta lenta |
| Tipo de error y stack | `SequelizeDatabaseError` + frames | Ya saneado por `toSafeErrorLog` |
| Recursos del servicio | `service.name`, `service.version`, `deployment.environment.name` | Identidad del emisor |

## 2. Datos prohibidos

Ninguno de estos puede aparecer en un nombre de span, un atributo, un evento o una excepción:

- Contraseñas, tokens de acceso o refresco, claves de API, cookies, cabecera `Authorization`.
- Cuerpos de solicitud o respuesta, completos o parciales.
- Query strings sin redactar.
- **Valores de parámetros SQL** (`enhancedDatabaseReporting` permanece desactivado).
- Cadenas de conexión, variables de entorno, cualquier secreto.
- Documentos de identidad, NIT, datos médicos, cuentas bancarias, direcciones.
- **Texto producido por agentes de IA**: `assertion`, `excerpt`, `rawPayload`, `entityMentions`.
  Es entrada no confiable; publicarla en una traza reintroduce en un sistema interno el contenido
  que la política de cuarentena aísla.
- Justificaciones de revisores y cualquier texto libre escrito por una persona.
- Filtros de consulta: `datasetVersionId`, dimensiones, periodos, códigos de entidad.
- Mensajes de error crudos: el mensaje puede embeber SQL y valores ligados.
- Rutas de archivo de almacenamiento (`storageUri`), URIs de origen y hashes de artefacto.
- Stack traces enviados al cliente (esto ya lo impide `HttpExceptionFilter`).

## 3. Estrategia de redacción — tres barreras

### Barrera 1 · No capturar (`src/common/observability/telemetry.instrumentations.ts`)

- `HttpInstrumentation` sin `headersToSpanAttributes`: ninguna cabecera se convierte en atributo.
- `PgInstrumentation` con `enhancedDatabaseReporting: false` y `requireParentSpan: true`.
- `PinoInstrumentation` con `disableLogSending: true`: los registros no viajan por OpenTelemetry.
- Ninguna instrumentación captura cuerpos; no existe opción activada para ello.

### Barrera 2 · Redactar en el proceso (`telemetry.redaction.ts`)

| Función | Efecto |
|---|---|
| `redactQueryString` | `?entityCode=NIT-12345` → `?<redacted>` en `url.path` y `url.query` |
| `redactUrlCredentials` | `https://user:secret@host` → `https://<redacted>@host` en `url.full` |
| `isUntracedTarget` | Sondeos de infraestructura no generan span |
| `recordSpanFailure` (`span-failure.ts`) | Registra tipo, código y frames; **nunca** el mensaje |

Se aplican en tres puntos: el `requestHook` de HTTP (entrante y saliente), el `requestHook` del
plugin de Fastify —que escribe el destino crudo en `url.path`— y el registro de excepciones.

### Barrera 3 · Redactar en el Collector (`infra/otel-collector/otel-collector.config.yml`)

Procesador `attributes/redact`: borra cabeceras de autorización y cookies, fuerza `url.query` a
`<redacted>` y elimina parámetros de consulta. Es la red de seguridad para una instrumentación
nueva que empiece a reportar algo no previsto.

## 4. Verificación automatizada

| Control | Prueba |
|---|---|
| El mensaje crudo del error no llega al span | `src/common/observability/tests/tracing.service.spec.ts` · `src/common/errors/tests/http-exception.tracing.spec.ts` |
| La query string se redacta | `src/common/observability/tests/telemetry.redaction.spec.ts` |
| Las credenciales de URL se redactan | idem |
| Ni la cabecera `Authorization` ni el filtro de consulta aparecen en ningún span | `test/observability/tracing.e2e-spec.ts` |
| Los sondeos excluidos no generan span | idem |

Estas pruebas forman parte de `yarn test` y `yarn test:e2e`: una regresión de privacidad rompe el
build, no se descubre auditando Jaeger.

## 5. Retención y acceso

| Entorno | Almacenamiento | Retención | Acceso |
|---|---|---|---|
| Desarrollo | Jaeger all-in-one, memoria | Vida del contenedor | Sólo `127.0.0.1` (`docker-compose.jaeger.yml`) |
| Staging | Según `03-production-topology.md` | 7 días | Red privada + autenticación del proxy |
| Producción | Según `03-production-topology.md` | **14 días máximo** | Red privada + autenticación; sin exposición pública |

La retención es corta a propósito: una traza responde "qué pasó en este incidente", no es un
archivo histórico. El registro histórico e inmutable es la auditoría en PostgreSQL.

## 6. Auditoría de la política

- Al añadir una instrumentación: revisar sus atributos por defecto contra §2 **antes** de
  habilitarla, y dejar la evidencia en el ADR o en la nota de cambio.
- Al añadir un span de negocio: registrarlo en `02-business-spans-catalog.md` con su análisis de
  privacidad.
- Trimestralmente: buscar en Jaeger un atributo con valores de alta cardinalidad inesperada; suele
  ser el primer síntoma de una fuga.

## 7. Procedimiento ante filtración

1. **Contener.** Desactivar la captura problemática: `OTEL_ENABLED=false` si es transversal, o la
   instrumentación concreta si está acotada. Desplegar.
2. **Evaluar.** Determinar qué atributo, desde qué versión y qué volumen de trazas lo contiene.
3. **Eliminar.** Borrar el índice o el rango de almacenamiento afectado. Con la retención de 14
   días, esperar no es una opción aceptable si el dato es sensible.
4. **Revocar.** Si se filtró una credencial, rotarla; el borrado del índice no basta.
5. **Reducir accesos.** Revisar quién consultó la UI en la ventana afectada.
6. **Corregir.** Añadir la redacción en la Barrera 2 **y** en la Barrera 3, con una prueba que
   falle sin la corrección.
7. **Documentar.** Registrar el incidente según `docs/runbooks/incident-response.md` e indicar en
   este documento qué regla se añadió.

## 8. Responsables operativos

| Rol | Responsabilidad |
|---|---|
| Arquitectura backend | Aprueba instrumentaciones y atributos nuevos; mantiene este documento |
| Operación de plataforma | Retención, accesos, red privada, TLS y borrado del almacenamiento |
| Quien implementa el cambio | Ejecuta la revisión de §6 y aporta la prueba de §4 |
