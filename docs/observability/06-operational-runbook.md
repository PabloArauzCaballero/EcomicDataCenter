# 06 — Runbook operativo de trazabilidad

> Fase 24. Procedimientos de diagnóstico. Cada sección empieza por la comprobación más barata.
> Regla transversal: **la trazabilidad nunca justifica degradar el servicio**. Ante la duda,
> `OTEL_ENABLED=false` y desplegar; el backend opera igual.

Índice: §1 no llegan trazas · §2 el backend se volvió lento · §3 logs sin `trace_id` ·
§4 contexto perdido en una frontera asíncrona · §5 datos sensibles en las trazas ·
§6 comprobaciones rápidas.

---

## 1. Jaeger no recibe trazas

### 1.1 ¿Está habilitada?

```bash
# La respuesta debe traer x-trace-id. Si no lo trae, no hay span activo.
curl -si "$BASE_URL/api/v1/provenance/organizations" | grep -i x-trace-id
```

Sin la cabecera: `OTEL_ENABLED` no es `true`, o el endpoint consultado está excluido
(`/health`, `/ready`, `/metrics`, `/favicon.ico`, `/docs`). Los excluidos **no** deben producir
trazas; comprobar contra un endpoint de negocio.

### 1.2 Ver la configuración efectiva

```bash
OTEL_DIAG_LOG_LEVEL=INFO   # y reiniciar el proceso
```

En el arranque aparece una línea JSON con `source: "otel"`:

```
Tracing started: service=... endpoint=... sampler=... ratio=... propagators=...
```

Es la fuente de verdad: si el `endpoint` no es el esperado, el problema es de configuración, no de
red.

### 1.3 ¿Responde el destino?

```bash
curl -sv -X POST "$OTEL_EXPORTER_OTLP_TRACES_ENDPOINT" \
  -H 'Content-Type: application/json' -d '{"resourceSpans":[]}'
```

Un 200 confirma alcance. `ECONNREFUSED` → el servicio está caído o el puerto es otro.
Timeout → cortafuegos o red equivocada.

Recordar la asimetría de red: dentro de Docker el destino es `http://jaeger:4318/v1/traces`; desde
el host es `http://localhost:4318/v1/traces`. Es la causa más frecuente.

### 1.4 ¿Está el DNS resolviendo el nombre del servicio?

```bash
docker compose exec api getent hosts jaeger
```

Sin respuesta: el contenedor de Jaeger no está en la red `app`. Levantarlo con las dos
superposiciones: `docker compose -f docker-compose.yml -f docker-compose.jaeger.yml up -d`.

### 1.5 ¿Errores del exportador?

Con `OTEL_DIAG_LOG_LEVEL=ERROR` (por defecto) los fallos salen en stderr con `"source":"otel"`.
**Un exportador que falla siempre lo dice**; el silencio significa que exporta bien.

```bash
docker compose logs api | grep '"source":"otel"'
```

- `Not Found` → el endpoint apunta a una ruta que el receptor no sirve. Verificar `/v1/traces`.
- `ECONNREFUSED` → §1.3.
- Nada, pero tampoco trazas → §1.6.

### 1.6 ¿Está el muestreo descartando todo?

```bash
# Diagnóstico: forzar el 100 % temporalmente
OTEL_TRACES_SAMPLER=always_on
```

Si con `always_on` aparecen trazas, el ratio era la causa. Con `parentbased_traceidratio` y un
cliente que envía `traceparent` con la marca de no muestreado, la decisión del cliente manda: es el
comportamiento correcto, no un fallo.

### 1.7 ¿Llegó pero no se encuentra?

```bash
curl -s "$JAEGER_URL/api/services"          # ¿aparece observatorio-economico-api?
curl -s "$JAEGER_URL/api/traces/$TRACE_ID"  # ¿está esa traza concreta?
```

El servicio aparece pero la traza no: el lote aún no se ha exportado (esperar ~5 s) o esa traza no
fue muestreada.

### 1.8 Verificación completa

```bash
BASE_URL=http://127.0.0.1:3000 yarn jaeger:verify
```

Recorre los siete pasos y señala el punto exacto del fallo.

---

## 2. El backend se volvió lento

**Primera acción, siempre disponible:** `OTEL_ENABLED=false` y desplegar. Si la latencia no mejora,
las trazas no eran la causa y hay que buscar en otro sitio.

Coste medido de referencia (`05-performance-results.md`): +0.14 ms de p50 en un handler trivial;
+5.7 % de p50 y +8.8 % de p95 en un endpoint real con muestreo 1.0. Una degradación mucho mayor
apunta a una de estas causas:

| Causa | Comprobación | Corrección |
|---|---|---|
| Muestreo demasiado alto | Ver el `ratio` de la línea de arranque | Bajar `OTEL_TRACES_SAMPLER_ARG` a 0.10 |
| Exportador síncrono o lento | Latencia correlacionada con el intervalo de exportación | Confirmar `BatchSpanProcessor` (es el único configurado) |
| Collector saturado | Métricas del Collector en `:8888`, cola y descartes | Escalar el Collector o bajar el ratio |
| Instrumentación ruidosa | Contar spans por traza en la UI | Revisar `telemetry.instrumentations.ts`; `fs`, `dns` y `net` deben seguir sin activarse |
| Cardinalidad excesiva | Buscar un atributo con valores casi únicos | Mover el identificador a `app.entity.id` y sacarlo del nombre del span |
| Consultas `pg` desbordadas | Muchos `pg.query` por petición | No es un problema de trazas: es un N+1 que la traza acaba de revelar |

Una traza con cientos de spans para una petición sencilla es un defecto de configuración, no una
característica.

---

## 3. Los logs no traen `trace_id`

Un log correlacionado se ve así:

```json
{"level":30,"trace_id":"0c88...","span_id":"945f...","trace_flags":"01","msg":"Request completed"}
```

| Síntoma | Causa | Corrección |
|---|---|---|
| Ningún log tiene `trace_id` | `OTEL_ENABLED=false`, o el bootstrap no es la primera importación | Verificar que `dist/main.js` empieza con `require("./common/observability/telemetry.bootstrap")` |
| Los logs de petición sí, los de arranque no | Correcto: en el arranque no hay span activo | Ninguna |
| Los logs de la tarea programada no lo traen | Sólo debe ocurrir si el trazado está apagado | La tarea crea un span raíz; ver §4 |
| El log de un `setTimeout` no lo trae | El contexto se perdió al salir del ámbito asíncrono | Envolver el trabajo en `TracingService.runInRootSpan` |

La correlación la aporta `@opentelemetry/instrumentation-pino`, que sólo inyecta cuando hay
contexto activo. La aplicación **no** añade el campo a mano: dos nombres para el mismo dato es peor
que uno.

---

## 4. El contexto se pierde en una frontera asíncrona

Hoy este sistema **no tiene colas ni workers** (ADR-0003), por lo que la única frontera es la tarea
programada, que crea su propia traza raíz a propósito.

Cuando se apruebe un proceso diferido, el contrato ya existe: `MessagingTraceService`.

| Comprobación | Cómo |
|---|---|
| ¿Se inyectó el contexto? | El mensaje publicado debe llevar `traceparent` en su carrier |
| ¿Se extrajo? | El span consumidor debe compartir `traceId` con el productor |
| ¿Se cerró el span? | `consume()` cierra en `finally`; no cerrar manualmente |
| ¿Mensajes antiguos sin metadatos? | Deben procesarse igual, iniciando una traza nueva. Cubierto por prueba |
| ¿Reintentos? | Registrar el intento en `app.job.attempt`, no en el nombre del span |

Si `scheduler.domain-metrics` aparece colgando de una petición HTTP, alguien cambió
`runInRootSpan` por `runInSpan`: es un defecto, la tarea debe ser raíz.

---

## 5. Aparecen datos sensibles en las trazas

Procedimiento completo y responsabilidades: `04-data-privacy-policy.md` §7. Resumen operativo:

1. **Contener ya**: `OTEL_ENABLED=false` si es transversal; desactivar la instrumentación concreta
   si está acotada. Desplegar.
2. **Delimitar**: qué atributo, desde qué versión, cuántas trazas.
3. **Borrar** el índice o rango afectado. Con retención de 14 días, esperar no es una opción.
4. **Rotar** cualquier credencial expuesta: borrar el índice no la invalida.
5. **Reducir** la retención temporalmente y revisar quién consultó la UI.
6. **Corregir** en la Barrera 2 (proceso) **y** en la Barrera 3 (Collector), con una prueba que
   falle sin el arreglo.
7. **Documentar** según `docs/runbooks/incident-response.md`.

Prevención: la Barrera 3 del Collector borra cabeceras de autorización y fuerza `url.query` aunque
el proceso falle en hacerlo.

---

## 6. Comprobaciones rápidas

```bash
# Levantar Jaeger localmente
yarn jaeger:up                 # UI en http://127.0.0.1:16686
yarn jaeger:logs
yarn jaeger:down

# Verificación completa del canal de trazas
BASE_URL=http://127.0.0.1:3000 yarn jaeger:verify

# Servicios conocidos por Jaeger
curl -s http://127.0.0.1:16686/api/services

# Una traza concreta
curl -s "http://127.0.0.1:16686/api/traces/$TRACE_ID"

# Últimas trazas de la tarea programada
curl -s "http://127.0.0.1:16686/api/traces?service=observatorio-economico-api&operation=scheduler.domain-metrics&limit=5"

# Diagnóstico interno del SDK
OTEL_DIAG_LOG_LEVEL=DEBUG   # y reiniciar

# Apagado de emergencia
OTEL_ENABLED=false          # y reiniciar
```

### Qué mirar en la UI ante un incidente

1. Buscar por el `x-trace-id` que reportó quien abrió el incidente.
2. Ordenar por duración: el span más largo de la ruta crítica es el culpable habitual.
3. Los spans en rojo llevan el evento `exception` con el **tipo** de error y sus frames; el mensaje
   crudo no está por política.
4. Los spans `pg.query:*` dan la latencia real de la base; si dominan, el problema no es la API.
5. `app.module` y `app.operation` identifican la operación de negocio sin leer el código.
