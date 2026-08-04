# 05 — Coste medido de la instrumentación

> Fase 22. **Ninguna cifra de este documento está estimada.** Todas provienen de ejecuciones
> reales del 2026-08-03 en el equipo de desarrollo. Donde una medición no pudo hacerse, se dice.

## 1. Entorno de medición

| Elemento | Valor |
|---|---|
| Máquina | Windows 11, Node.js v22.23.1 |
| Artefacto | `dist/` compilado con `yarn build` |
| Jaeger | `jaegertracing/jaeger:2.20.0` en Docker, OTLP/HTTP en `127.0.0.1:4318` |
| Base de datos | PostgreSQL 17 gestionado (Neon), **remoto por WAN** |
| Cliente de carga | `node:http` con `keepAlive`, una conexión, peticiones secuenciales |

**Limitación declarada:** una sola máquina, sin aislamiento de CPU y con la base de datos al otro
lado de una WAN. Las cifras sirven para comparar configuraciones entre sí en igualdad de
condiciones, no como capacidad de producción.

---

## 2. Coste aislado de la capa de trazas

Servidor Fastify que ejecuta el mismo `telemetry.bootstrap` de producción, el mismo plugin de
Fastify y un `TracingService` real, con un handler deliberadamente trivial (bucle aritmético de
2000 iteraciones). Sin base de datos: **todo lo que cambia entre columnas es la instrumentación**.

20 000 peticiones medidas tras 3000 de calentamiento, por configuración.

| Configuración | Throughput (req/s) | media (ms) | p50 (ms) | p95 (ms) | p99 (ms) |
|---|---:|---:|---:|---:|---:|
| `OTEL_ENABLED=false` | **5156.7** | 0.1745 | 0.1514 | 0.3160 | 0.4144 |
| Habilitado, muestreo 1.0, Jaeger disponible | **2906.0** | 0.3205 | 0.2936 | 0.4745 | 1.1429 |
| Habilitado, muestreo 0.1, Jaeger disponible | **3491.3** | 0.2658 | 0.2464 | 0.4513 | 0.6181 |
| Habilitado, muestreo 1.0, **Jaeger caído** | **3739.6** | 0.2483 | 0.2419 | 0.3518 | 0.5041 |

Lectura:

- El coste absoluto del trazado completo es de **~0.14 ms de p50 por petición** (0.1514 → 0.2936).
- Sobre un handler que no hace nada, esos 0.14 ms son un **44 % de caída de throughput**. Es el
  peor caso posible y la razón por la que el muestreo existe: a 0.1 la caída baja a 32 %.
- Con el backend caído el proceso va **más rápido** que con Jaeger disponible (3739 vs 2906 req/s):
  el exportador falla pronto y deja de serializar. Confirma que la exportación es asíncrona y que
  una caída del backend **no** degrada el servicio.
- El p99 del muestreo completo (1.14 ms) refleja los lotes de exportación; sigue por debajo de
  1.2 ms.

## 3. Coste sobre un endpoint real

`GET /api/v1/provenance/organizations?page=1&pageSize=5`, que atraviesa guardas, validación,
Sequelize y PostgreSQL remoto. 200 peticiones tras 30 de calentamiento, `RATE_LIMIT_MAX` elevado
para no medir el limitador.

| Configuración | media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Arranque (ms) | RSS (MiB) |
|---|---:|---:|---:|---:|---:|---:|
| `OTEL_ENABLED=false` | 175.71 | 173.25 | 181.56 | 197.12 | 9444 | 105.2 |
| Habilitado, muestreo 1.0 | 187.67 | 183.17 | 197.61 | 326.86 | 11028 | 123.3 |

Lectura:

- **p50: +9.9 ms (+5.7 %)**, **p95: +16.1 ms (+8.8 %)**. Sobre una latencia dominada por la WAN,
  el trazado añade además del ~0.14 ms del §2 los **spans de las consultas `pg`** (11 a 17 por
  petición en este endpoint), que es donde está el resto del coste.
- **p99: 326.9 ms frente a 197.1 ms.** La cola es notablemente peor con muestreo completo. Es el
  argumento medido para no usar ratio 1.0 en producción.
- **Arranque: +1.6 s** (9.4 s → 11.0 s), por el registro de instrumentaciones. Relevante para la
  ventana de arranque de un despliegue, no para el servicio.
- **Memoria residente: +18 MiB (+17 %)**, estable durante la medición.

## 4. Recomendación derivada de la medición

| Entorno | Ratio | Fundamento |
|---|---:|---|
| development | 1.0 | El coste es irrelevante y se necesita ver todo |
| test | 0.0 / exportador en memoria | Las pruebas no exportan a la red |
| staging | 0.25 | Suficiente para validar sin pagar la cola del p99 |
| **production** | **0.10** | Con la degradación medida de p95/p99, 1.0 no es defendible; 0.10 mantiene el coste dentro del ruido de la WAN |

Estos valores son un punto de partida. Deben reajustarse con tráfico real: `OTEL_TRACES_SAMPLER_ARG`
se cambia sin desplegar código.

## 5. Mediciones no realizadas

Se declaran explícitamente en lugar de estimarse:

| Medición | Motivo |
|---|---|
| Carga concurrente (varios clientes) | El cliente usado es secuencial con una conexión; aísla mejor el coste por petición, pero no mide saturación |
| Uso de CPU por configuración | No se instrumentó el consumo de CPU del proceso; el throughput es el indicador indirecto usado |
| Pérdida de spans bajo saturación | Requiere un Collector saturado deliberadamente, que no existe todavía |
| Collector saturado | No hay despliegue de Collector (`03-production-topology.md` está en diseño) |
| Soak prolongado con trazas (`yarn soak`) | No ejecutado en esta iteración; el soak vigente se hizo sin telemetría |
| Latencia con PostgreSQL local | La base disponible es remota; se documenta el sesgo en §1 |

## 6. Reproducción

Levantar Jaeger, compilar y medir. El servidor de banco de pruebas usa el bootstrap real:

```bash
yarn jaeger:up
yarn build

# bench-server.cjs — servidor mínimo sobre el bootstrap de producción
cat > bench-server.cjs <<'JS'
process.chdir(process.env.REPO_ROOT);
require(process.env.REPO_ROOT + '/dist/common/observability/telemetry.bootstrap');
const Fastify = require(process.env.REPO_ROOT + '/node_modules/fastify');
const { fastifyTracingPlugin } = require(process.env.REPO_ROOT + '/dist/common/observability/fastify-tracing.plugin');
const { TracingService } = require(process.env.REPO_ROOT + '/dist/common/observability/tracing.service');
const tracing = new TracingService();
(async () => {
  const app = Fastify({ logger: false });
  if (process.env.OTEL_ENABLED === 'true') await app.register(fastifyTracingPlugin());
  app.get('/work', async () =>
    tracing.runInSpan('bench.execute', { 'app.module': 'bench' }, () => {
      let total = 0;
      for (let i = 0; i < 2000; i += 1) total += i % 7;
      return { total };
    }));
  await app.listen({ host: '127.0.0.1', port: Number(process.env.PORT) });
})();
JS

REPO_ROOT="$PWD" PORT=4121 OTEL_ENABLED=false node bench-server.cjs &
REPO_ROOT="$PWD" PORT=4122 OTEL_ENABLED=true OTEL_TRACES_SAMPLER_ARG=1 \
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4318/v1/traces node bench-server.cjs &
```

El cliente usa `node:http` con `new http.Agent({ keepAlive: true, maxSockets: 1 })`, 3000
peticiones de calentamiento y 20 000 medidas, y reporta media y percentiles sobre la serie
ordenada. **Sin `keepAlive` la medición es inútil**: en Windows el establecimiento de conexión
(~15 ms) domina y oculta por completo el coste de la instrumentación.

Para el endpoint real basta arrancar `node dist/main.js` con `RATE_LIMIT_MAX` elevado y medir con
el mismo cliente contra `/api/v1/provenance/organizations`.
