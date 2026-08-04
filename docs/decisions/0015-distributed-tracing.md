# ADR-0015: trazabilidad distribuida con OpenTelemetry y Jaeger

- Estado: aceptado
- Fecha: 2026-08-03
- Responsables: arquitectura backend
- Reemplaza: la fila «OpenTelemetry completo — diferido» de `docs/decisions/library-matrix.md`

## Contexto

El backend expone métricas Prometheus y logs Pino con `x-request-id`, pero no puede responder
dónde se consume el tiempo dentro de una solicitud ni qué consulta concreta falló. La capa de
inteligencia procesa lotes de hasta 200 afirmaciones por entrega, cada una con persistencia
propia dentro de un `SAVEPOINT`; ante una degradación, hoy sólo se dispone de una duración
agregada por ruta.

ADR-0003 mantiene el sistema sin colas ni workers, y ADR-0006 fija Pino como sistema de logs.
Cualquier solución de trazas debe convivir con ambos sin sustituirlos.

## Drivers

- Diagnóstico por solicitud: ruta crítica, dependencia más lenta y punto exacto de fallo.
- Un identificador que soporte técnico pueda entregar y que un operador pueda buscar.
- No introducir infraestructura de la que dependa el camino de negocio.
- No convertir el almacén de trazas en un repositorio de datos sensibles.
- Mantener el dominio libre de dependencias de proveedor.

## Opciones

1. **Sólo métricas y logs (statu quo).** Coste cero, pero no responde «¿dónde se fue el tiempo de
   esta solicitud?». Insuficiente para operar en producción real.
2. **Cliente Jaeger nativo (`jaeger-client`).** Descontinuado desde 2022 y acopla el código al
   proveedor. Descartado.
3. **OpenTelemetry con `auto-instrumentations-node`.** Cobertura inmediata a cambio de ~40
   paquetes para tecnologías inexistentes en este repositorio; contradice la regla de selección
   de librerías y amplía la superficie de CVE sin uso real.
4. **OpenTelemetry con instrumentaciones explícitas y exportación OTLP.** Estándar neutral,
   superficie mínima, backend intercambiable por variable de entorno.

## Decisión

Adoptar **OpenTelemetry** como estándar de instrumentación y **OTLP/HTTP (JSON)** como transporte,
con **Jaeger** como plataforma de almacenamiento y visualización.

1. Instrumentaciones explícitas: `http`, `fastify`, `nestjs-core`, `pg`, `pino`. Ninguna otra.
2. Sequelize se observa a través del driver `pg`; no se instala instrumentación de ORM, para no
   duplicar spans ni añadir una segunda librería para la misma responsabilidad.
3. El código de telemetría vive en `src/common/observability/`, dentro del grafo mantenido que
   compilan `tsc` y los validadores de calidad. Los servicios de dominio dependen únicamente de
   `TracingService`, no de `@opentelemetry/*`.
4. La telemetría se activa con `OTEL_ENABLED`, cuyo valor por defecto es `false`. Con el SDK
   apagado la aplicación arranca y opera igual, con spans no-op.
5. La exportación es asíncrona y por lotes. **La disponibilidad de Jaeger nunca condiciona una
   solicitud de negocio.**
6. Se excluyen de la traza `/health`, `/ready`, `/metrics`, `/favicon.ico` y `/docs`.
7. El `trace_id` procede siempre del contexto activo de OpenTelemetry, nunca de una cabecera del
   cliente. `x-request-id` conserva su rol de correlación de auditoría.
8. Prohibido registrar en spans: cabeceras de autorización, cookies, cuerpos, query strings sin
   redactar, valores de parámetros SQL, secretos y el texto no confiable producido por agentes
   de IA.
9. El cierre del SDK se ejecuta desde `OnApplicationShutdown`, después del cierre de la
   aplicación; el módulo de observabilidad no registra handlers de señal propios ni llama a
   `process.exit`.

## Consecuencias

- Dependencias nuevas de producción: `@opentelemetry/api`, `sdk-node`, `sdk-trace-base`,
  `resources`, `semantic-conventions`, `exporter-trace-otlp-http`, `instrumentation-http`,
  `instrumentation-nestjs-core`, `instrumentation-pg`, `instrumentation-pino`, y `@fastify/otel`.
  De desarrollo: `sdk-trace-node` e `instrumentation` (proveedor y exportador en memoria para las
  pruebas). La instrumentación de Fastify usa `@fastify/otel` y no
  `@opentelemetry/instrumentation-fastify`, que su propio paquete declara deprecado. El plugin se
  registra **explícitamente** en `main.ts`, no mediante `registerOnInitialization`: ese modo se
  engancha a un canal de diagnóstico global y duplica el registro cuando se construye más de una
  instancia de Fastify en el proceso.
- `prom-client` sigue siendo el sistema de métricas: OpenTelemetry se adopta **sólo para trazas**.
  No hay dos librerías para la misma responsabilidad.
- Jaeger en modo `all-in-one` con almacenamiento en memoria es exclusivo de desarrollo. Producción
  exige Collector, almacenamiento persistente, retención declarada, red privada y autenticación.
- El coste en latencia debe medirse, no suponerse (`docs/observability/05-performance-results.md`).

## Criterio de revisión

Reabrir este ADR si: se aprueba una cola o un proceso diferido (habilitará
`MessagingTraceService` y un `service.name` propio); se incorpora Redis u otra dependencia de
infraestructura; el volumen de trazas exige *tail sampling* o gRPC; o la medición de rendimiento
muestra una sobrecarga superior al 5 % en p95 con el muestreo de producción.
