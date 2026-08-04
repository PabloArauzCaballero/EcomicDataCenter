# Trazabilidad distribuida — guía para desarrolladores

Cómo usar y mantener la trazabilidad de este backend. Decisión formal en
[ADR-0015](../decisions/0015-distributed-tracing.md).

| Documento | Para qué |
|---|---|
| [00 Auditoría del estado actual](00-current-state-audit.md) | Qué había antes y por qué el diseño es este |
| [01 Diseño de arquitectura](01-architecture-design.md) | Decisiones, alternativas y convenciones |
| [02 Catálogo de spans de negocio](02-business-spans-catalog.md) | Qué mide cada span propio |
| [03 Topología de producción](03-production-topology.md) | Cómo se despliega de verdad |
| [04 Política de datos](04-data-privacy-policy.md) | Qué se puede y qué no se puede registrar |
| [05 Coste medido](05-performance-results.md) | Cuánto cuesta, con números reales |
| [06 Runbook operativo](06-operational-runbook.md) | Qué hacer cuando algo falla |

---

## 1. Conceptos, en una pantalla

- **Traza (`trace`)**: todo lo que ocurre a raíz de un disparador —una petición HTTP o una
  ejecución programada—. Se identifica con un **`trace_id`** de 32 caracteres hexadecimales.
- **Span**: una operación dentro de la traza, con nombre, inicio, fin, atributos y eventos. Se
  identifica con un **`span_id`** de 16 caracteres.
- **Contexto**: el span activo "aquí y ahora". Viaja solo por las llamadas asíncronas del proceso
  gracias a `AsyncLocalStorage`; entre procesos hay que propagarlo explícitamente.
- **`trace_flags`**: si vale `01`, la traza fue muestreada y se exportó.
- **Padre/hijo**: un span creado con un contexto activo cuelga de él. Esa jerarquía es lo que
  convierte una lista de duraciones en una explicación.

En este backend el `trace_id` aparece en tres sitios a la vez: la cabecera `x-trace-id` de la
respuesta, el campo `trace_id` de cada log de Pino y la traza en Jaeger. Ese es el hilo que une
"un usuario reportó un error" con "esta consulta tardó 4 segundos".

`x-request-id` **no** es lo mismo: identifica la petición para la auditoría y existe con o sin
trazado.

---

## 2. Arrancar Jaeger y ver una traza

```bash
yarn jaeger:up          # UI en http://127.0.0.1:16686
```

En `.env`:

```env
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4318/v1/traces
OTEL_TRACES_SAMPLER_ARG=1
```

Con el backend en Docker el destino es `http://jaeger:4318/v1/traces` y hay que levantar Jaeger en
la misma red:

```bash
docker compose -f docker-compose.yml -f docker-compose.jaeger.yml up -d
```

Arrancar y pedir algo:

```bash
yarn build && yarn start
curl -si http://127.0.0.1:3000/api/v1/provenance/organizations | grep -i x-trace-id
```

Pegar el valor en la UI (Search → Trace ID), o comprobar todo el canal de una vez:

```bash
yarn jaeger:verify
```

Una petición típica se ve así:

```
GET /api/v1/data/query                      ← instrumentation-http
└── request                                  ← @fastify/otel
    └── DataQueryController.search           ← instrumentation-nestjs-core
        └── query.search-observations        ← span de negocio propio
            └── search
                ├── pg.connect               ← instrumentation-pg
                ├── pg.query:START
                ├── pg.query:WITH
                └── pg.query:COMMIT
```

Bajar Jaeger: `yarn jaeger:down`.

---

## 3. Crear un span de negocio

Inyecta `TracingService`. Está en un módulo `@Global()`, así que no hay que importar nada en el
módulo de dominio. **Nunca importes `@opentelemetry/*` desde código de negocio.**

Ejemplo real, de `src/modules/query/data-query.service.ts`:

```ts
import { APP_ATTRIBUTES } from '../../common/observability/telemetry.constants';
import { TracingService } from '../../common/observability/tracing.service';

@Injectable()
export class DataQueryService {
  constructor(
    private readonly queries: DataQueryRepository,
    private readonly tracing: TracingService,
  ) {}

  search(input: DataQueryInput, actor: Actor) {
    return this.tracing.runInSpan(
      'query.search-observations',
      {
        [APP_ATTRIBUTES.module]: 'query',
        [APP_ATTRIBUTES.operation]: 'search-observations',
        'app.query.page_size': input.pageSize,
        'app.query.mode': input.vintageDate ? 'VINTAGE' : 'CURRENT',
      },
      () => this.executeSearch(input, actor),
    );
  }
}
```

Reglas:

- Nombre `<dominio>.<acción>`, estable, **sin identificadores**. `intelligence.submit-claims`, no
  `intelligence.submit-claims.9f3a…`.
- El span se cierra solo, incluso si la operación lanza. El error original se relanza sin envolver.
- Instrumenta operaciones que nombrarías en un incidente, no cada método.
- Registra el span nuevo en [02-business-spans-catalog.md](02-business-spans-catalog.md).

### Eventos y atributos sobre la marcha

```ts
this.tracing.addEvent('agent-run.opened');
this.tracing.setAttributes({ [APP_ATTRIBUTES.entityId]: run.agentRunId });
```

Un **evento** marca un hito dentro del span (más barato que un span hijo). Un **atributo** describe
el span entero. Ambos son no-op si no hay span activo: llamarlos nunca rompe nada.

### Leer el identificador activo

```ts
constructor(private readonly traceContext: TraceContextService) {}

const traceId = this.traceContext.traceId(); // string | undefined
```

Devuelve `undefined` cuando no hay traza. **Nunca inventes un identificador**: apuntaría a una
traza inexistente.

---

## 4. Qué NO se registra

Resumen de [04-data-privacy-policy.md](04-data-privacy-policy.md). Prohibido en nombres,
atributos, eventos y excepciones:

- cabecera `Authorization`, cookies, tokens, claves de API, contraseñas;
- cuerpos de petición o respuesta, query strings sin redactar;
- valores de parámetros SQL, cadenas de conexión, variables de entorno;
- documentos de identidad, NIT, datos médicos o bancarios;
- **texto producido por agentes de IA** (`assertion`, `excerpt`, `rawPayload`);
- filtros de consulta y justificaciones escritas por personas;
- mensajes de error crudos — pueden traer SQL y valores ligados.

Sí se registran: rutas normalizadas, enumerados cortos, recuentos, UUID técnicos internos y el
tipo de error con sus frames.

---

## 5. Instrumentar trabajo programado

Una tarea de fondo **no** debe colgar de la petición que casualmente estaba en vuelo. Usa
`runInRootSpan`, como `src/common/observability/domain-metrics.collector.ts`:

```ts
await this.tracing.runInRootSpan(
  'scheduler.domain-metrics',
  {
    [APP_ATTRIBUTES.module]: 'observability',
    [APP_ATTRIBUTES.operation]: 'collect-domain-metrics',
    [APP_ATTRIBUTES.jobName]: 'domain-metrics',
  },
  () => this.publishCounts(),
);
```

Un span por ejecución, no uno por registro procesado. Si la tarea absorbe sus errores para no morir,
registra igualmente el fallo con `this.tracing.recordException(error)`.

---

## 6. Instrumentar un proceso separado (cuando exista)

Hoy no hay workers: ADR-0003 los difiere y el gate `yarn quality:async-scope` falla si aparece un
archivo `*worker*` en `src/`. El contrato está listo para el primer proceso aprobado:

```ts
// Al publicar
const carrier = this.messaging.inject();       // { traceparent: '00-...' }
await store(message, carrier);

// Al consumir
await this.messaging.consume(
  'ingestion.process-message',
  message.carrier,                              // undefined también funciona
  { [APP_ATTRIBUTES.jobName]: 'ingestion', [APP_ATTRIBUTES.jobAttempt]: attempt },
  async (span) => handle(message),
);
```

Un mensaje sin `traceparent` —los publicados antes de existir el contrato— se procesa igual e
inicia una traza nueva. Cada proceso separado debe además: inicializar su propio SDK importando
`telemetry.bootstrap` como primera línea, usar su propio `OTEL_SERVICE_NAME`
(`observatorio-economico-ingestor`, no el de la API) y cerrar el SDK al terminar.

---

## 7. Comprobar la correlación de logs

```bash
yarn start | grep trace_id
```

```json
{"level":30,"trace_id":"0c88…","span_id":"945f…","trace_flags":"01","msg":"Request completed"}
```

Lo inyecta `@opentelemetry/instrumentation-pino` en todo log emitido dentro de un contexto activo.
No añadas el campo a mano: duplicarlo crea dos nombres para el mismo dato. Los logs de arranque no
lo llevan porque no hay span; es correcto.

---

## 8. Problemas frecuentes

| Síntoma | Causa habitual | Solución |
|---|---|---|
| No hay `x-trace-id` en la respuesta | `OTEL_ENABLED` no es `true`, o el endpoint está excluido | Probar contra un endpoint de negocio |
| No aparece nada en Jaeger | Destino equivocado: `localhost` desde Docker o `jaeger` desde el host | Ajustar `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` |
| Aparece el servicio pero no la traza | Muestreo, o el lote aún no salió | `OTEL_TRACES_SAMPLER=always_on` y esperar 5 s |
| Los logs no traen `trace_id` | El bootstrap no fue la primera importación | `dist/main.js` debe empezar por `require("./common/observability/telemetry.bootstrap")` |
| `/health` no genera trazas | Es correcto: está excluido | Ninguna |
| Consultas `pg` sin padre | Ocurren fuera de una petición | Con `requireParentSpan: true` no se crean; es intencional |
| Cientos de spans por petición | Instrumentación ruidosa o N+1 | [06 §2](06-operational-runbook.md) |
| Cae Jaeger | Ninguno: se pierden spans, no peticiones | Verificado en pruebas y medido en [05](05-performance-results.md) |

Diagnóstico completo: [06-operational-runbook.md](06-operational-runbook.md).

---

## 9. Variables de entorno

Todas se validan con Zod en `src/config/environment.ts`; una mal escrita impide arrancar en lugar
de desactivar el trazado en silencio.

| Variable | Por defecto | Efecto |
|---|---|---|
| `OTEL_ENABLED` | `false` | Interruptor general. Con `false` la app opera igual, con spans no-op |
| `OTEL_SERVICE_NAME` | `observatorio-economico-api` | Nombre en Jaeger |
| `OTEL_SERVICE_NAMESPACE` | `observatorio-economico` | Agrupación de servicios |
| `OTEL_SERVICE_VERSION` | `1.0.0` | Versión desplegada |
| `OTEL_DEPLOYMENT_ENVIRONMENT` | valor de `NODE_ENV` | Entorno que emite |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | `http://localhost:4318/v1/traces` | Destino OTLP |
| `OTEL_EXPORT_TIMEOUT_MS` | `10000` | Timeout de exportación |
| `OTEL_TRACES_SAMPLER` | `parentbased_traceidratio` | Estrategia de muestreo |
| `OTEL_TRACES_SAMPLER_ARG` | `1` | Ratio 0–1. Producción: 0.10 ([05 §4](05-performance-results.md)) |
| `OTEL_PROPAGATORS` | `tracecontext,baggage` | Propagadores W3C |
| `OTEL_DIAG_LOG_LEVEL` | `ERROR` | Diagnóstico interno del SDK |

---

## 10. Pruebas

```bash
yarn test         # unitarias, incluidas las de observabilidad
yarn test:e2e     # trazado extremo a extremo sobre un servidor HTTP real
yarn jaeger:verify  # canal completo contra un Jaeger real
```

Al tocar la observabilidad, verifica también: `yarn typecheck`, `yarn lint`, `yarn build` y
`yarn quality:all`.
