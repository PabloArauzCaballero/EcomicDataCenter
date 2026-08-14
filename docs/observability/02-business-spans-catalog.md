# 02 — Catálogo de spans de negocio

> Fase 8. Un span de negocio existe cuando la traza técnica **no basta** para
> entender qué estaba haciendo el sistema. No se instrumenta cada método: se instrumentan las
> operaciones que un operador nombra cuando describe un incidente.

Convención: `<dominio>.<acción>`, sin identificadores en el nombre (§8 del diseño). Todos se crean
con `TracingService`; ningún servicio de dominio importa `@opentelemetry/*`.

---

## Resumen

| Span | Módulo | Archivo | Tipo |
|---|---|---|---|
| `intelligence.daily-analysis` | intelligence | `daily-analysis.service.ts` | interno |
| `intelligence.submit-claims` | intelligence | `submission.service.ts` | interno |
| `intelligence.review-decision` | intelligence | `review.service.ts` | interno |
| `intelligence.reprocess-observation` | intelligence | `reprocessing.service.ts` | interno |
| `ingestion.register-observation` | ingestion | `observation-registration.service.ts` | interno |
| `ingestion.import-batch` | ingestion | `batch-import.service.ts` | interno |
| `provenance.register-artifact` | provenance | `provenance.service.ts` | interno |
| `query.search-observations` | query | `data-query.service.ts` | interno |
| `scheduler.domain-metrics` | observability | `domain-metrics.collector.ts` | **raíz** |

---

## `intelligence.daily-analysis`

- **Operación:** ciclo diario completo de un agente de IA: abre la ejecución, entrega el lote de
  afirmaciones y cierra la ejecución.
- **Motivo de negocio:** es la operación más larga y compuesta del sistema. Un fallo puede estar en
  cualquiera de sus tres etapas y la traza técnica sólo mostraría "un POST lento".
- **Atributos:** `app.module=intelligence`, `app.operation=daily-analysis`,
  `app.entity.type=agent-run`, `app.entity.id` (UUID de la ejecución, añadido tras abrirla),
  `app.batch.size` (número de ítems del lote).
- **Eventos:** `agent-run.opened`, `agent-run.completed`.
- **Privacidad:** ningún texto del agente. `app.batch.size` es un entero; `app.entity.id` es una
  clave técnica interna.

## `intelligence.submit-claims`

- **Operación:** persistencia de un lote de hasta 200 afirmaciones, cada una en su `SAVEPOINT`.
- **Motivo de negocio:** responde "de las 200 afirmaciones, ¿cuántas se publicaron y cuántas
  quedaron en revisión?" sin abrir la base de datos.
- **Atributos:** `app.module`, `app.operation=submit-claims`, `app.entity.type=agent-run`,
  `app.entity.id`, `app.batch.size`, y tras la transacción `app.submission.published`,
  `app.submission.pending_review`, `app.submission.quarantined`, `app.submission.rejected`.
- **Privacidad:** sólo recuentos enteros. **Nunca** `assertion`, `excerpt` ni `rawPayload`: son
  entrada no confiable de un agente de IA y podrían contener datos ajenos o intentos de inyección.

## `intelligence.review-decision`

- **Operación:** decisión humana (aprobar/rechazar) sobre una afirmación pendiente.
- **Motivo de negocio:** es el punto donde una interpretación se convierte en información
  publicada. Su latencia y sus fallos tienen consecuencia institucional.
- **Atributos:** `app.module`, `app.operation=review-decision`, `app.entity.type=review-task`,
  `app.entity.id`, `app.review.decision` (`APPROVED` | `REJECTED`, cardinalidad 2).
- **Privacidad:** la justificación del revisor **no** se registra; puede contener texto libre.

## `intelligence.reprocess-observation`

- **Operación:** reencolado de un ítem rechazado o en cuarentena para un nuevo intento.
- **Motivo de negocio:** el reproceso es el mecanismo de recuperación tras un incidente de
  ingesta; hay que poder ver si funcionó y cuánto tardó.
- **Atributos:** `app.module`, `app.operation=reprocess-observation`,
  `app.entity.type=raw-observation`, `app.entity.id`.
- **Privacidad:** el payload crudo nunca se toca ni se registra.

## `ingestion.register-observation`

- **Operación:** registro de una observación estadística individual con idempotencia durable.
- **Motivo de negocio:** es la vía cuantitativa oficial. Un registro lento o fallido afecta al
  núcleo estadístico, no a la capa de inteligencia.
- **Atributos:** `app.module=ingestion`, `app.operation=register-observation`,
  `app.entity.type=observation`, `app.organization.id`.
- **Privacidad:** `app.organization.id` es el UUID interno de una institución, no un dato personal.
  Los valores medidos no se registran.

## `ingestion.import-batch`

- **Operación:** importación de un lote en bloques que confirman por separado.
- **Motivo de negocio:** la operación más pesada del núcleo estadístico. Sin este span, un lote de
  500 registros aparece como una única petición larga sin estructura.
- **Atributos:** `app.module`, `app.operation=import-batch`, `app.entity.type=data-entry-batch`,
  `app.organization.id`, `app.batch.size`.
- **Privacidad:** sólo el tamaño del lote, nunca su contenido.

## `provenance.register-artifact`

- **Operación:** alta idempotente (por SHA-256) del artefacto de origen que respalda una evidencia.
- **Motivo de negocio:** sin artefacto no puede existir evidencia; es la primera pieza del día de
  un agente y un fallo aquí bloquea todo lo demás.
- **Atributos:** `app.module=provenance`, `app.operation=register-artifact`,
  `app.entity.type=source-artifact`, `app.entity.id` (UUID de la **fuente**).
- **Privacidad:** ni `storageUri`, ni `originalUri`, ni el SHA-256 se publican como atributo.

## `query.search-observations`

- **Operación:** consulta paginada del núcleo estadístico con política de divulgación aplicada.
- **Motivo de negocio:** es el camino de lectura que ve el público. Su p95 es el número que un
  operador vigila.
- **Atributos:** `app.module=query`, `app.operation=search-observations`,
  `app.query.page_size` (entero acotado 1–200), `app.query.mode` (`CURRENT` | `VINTAGE`).
- **Privacidad:** **ningún filtro**. `datasetVersionId`, dimensiones y periodos pueden revelar qué
  está investigando quien consulta; se quedan fuera de la traza igual que fuera del log.

## `scheduler.domain-metrics`

- **Operación:** recolección periódica (60 s) de contradicciones abiertas, revisiones pendientes,
  dead letters, fuentes obsoletas y retraso de ingesta.
- **Motivo de negocio:** es la única tarea programada del proceso. Si deja de publicar gauges, los
  paneles muestran ceros creíbles y el fallo pasa inadvertido.
- **Tipo:** **span raíz** (`runInRootSpan`). No hereda de ninguna petición: una tarea de fondo
  colgada de la petición que casualmente estaba en vuelo produciría una traza engañosa.
- **Atributos:** `app.module=observability`, `app.operation=collect-domain-metrics`,
  `app.job.name=domain-metrics`.
- **Errores:** el fallo se sigue absorbiendo para no romper el temporizador, pero se registra en el
  span; de otro modo un trabajo que nunca publica un gauge parecería exitoso.

---

## Reglas para añadir un span de negocio

1. Debe responder una pregunta que la traza técnica no responde.
2. Nombre `<dominio>.<acción>` estable; el identificador va en `app.entity.id`, jamás en el nombre.
3. Atributos de baja cardinalidad, o identificadores técnicos internos.
4. Prohibido: texto libre, contenido de agentes de IA, filtros de consulta, valores medidos,
   credenciales, rutas de almacenamiento.
5. Se añade su fila a este catálogo en el mismo cambio.
6. Si el método sólo delega, el span va en el punto que representa la operación, no en cada capa.
