# Auditoría del grafo de conocimiento (Graphify) — Fase 1

**Fecha del análisis:** 2026-08-03
**Grafo analizado:** `graphify-out/graph.json`, construido en el commit `64b70fe8`
**HEAD del repositorio:** `64b70fe` — el grafo corresponde al commit, **no al árbol de trabajo**
**Método:** lectura directa de los artefactos de Graphify y recorrido programático del grafo
(conteo por área, grafo de dependencias entre áreas, detección de componentes fuertemente
conexos por Tarjan, grado de centralidad, contraste contra el árbol real en disco).

> **Esta página es el prerrequisito de la Fase 1.** Ninguna documentación arquitectónica
> definitiva debe crearse antes de ella. Su conclusión operativa está en §10 y §11.

---

## 1. Artefactos consultados

| Artefacto | Tamaño | Estado | Uso en esta auditoría |
| --- | --- | --- | --- |
| `graphify-out/graph.json` | 3 169 623 B | Presente | Fuente primaria: 2 836 nodos, 4 850 aristas |
| `graphify-out/GRAPH_REPORT.md` | 52 581 B | Presente | Resumen de corpus, comunidades y hubs de navegación |
| `graphify-out/manifest.json` | 75 761 B | Presente | Inventario de archivos ingeridos |
| `graphify-out/.graphify_labels.json` | 10 465 B | Presente | Etiquetas de comunidad |
| `graphify-out/graph.html` | 2 636 036 B | Presente | Visualización; no aporta datos no presentes en `graph.json` |
| `graphify-out/cache/` | — | Presente | Índice de estadísticas; sin uso analítico |
| `graphify-out/2026-07-27/` | — | Presente | Instantánea fechada: `graph.json`, `GRAPH_REPORT.md`, `manifest.json`, `.graphify_labels.json` |
| `graphify-out/2026-07-19/` | — | Presente | Instantánea fechada anterior |
| `graphify-out/cache/stat-index.json` | — | **Ausente** | Ruta citada por el plan; el caché existe pero no con ese nombre. Sin impacto: los datos que aportaría están en `graph.json` |

---

## 2. Resumen ejecutivo

El grafo cubre **421 archivos y ~174 945 palabras** y modela el repositorio con alta fidelidad:
el **99 % de las aristas son EXTRACTED** (derivadas de AST, no inferidas) y solo 27 aristas son
inferidas, con confianza media 0,76. Todos los nodos tienen `_origin: "ast"`. No hay
ambigüedad declarada.

Cuatro conclusiones gobiernan el resto del trabajo documental:

1. **El grafo está desfasado respecto del árbol de trabajo.** Cinco archivos productivos existen
   en disco y no en el grafo (§4). Cualquier análisis arquitectónico que se apoye solo en el
   grafo omitirá funcionalidad real, incluida la de aislamiento por organización.
2. **No existen ciclos a nivel de archivo.** Los 250 nodos de archivo bajo `src/` no forman ningún
   componente fuertemente conexo (§6). La disciplina de importación del código es sólida.
3. **Sí existe un ciclo a nivel de área**, un componente fuertemente conexo de seis áreas que
   incluye `src/modules/intelligence` (§6.2). No es un ciclo de importación, sino un
   acoplamiento de agregación que conviene documentar explícitamente antes de dibujar C4.
4. **La documentación existente ya está dentro del grafo.** 86 de 87 documentos Markdown de
   `docs/` están modelados, con `docs/decisions` (102 nodos) y `docs/hardening` (96 nodos) entre
   las áreas más densas. El repositorio **no parte de cero documental**: parte de un cuerpo
   documental amplio que debe evaluarse, no reemplazarse a ciegas.

---

## 3. Inventario cuantitativo

### 3.1 Totales

| Métrica | Valor |
| --- | --- |
| Nodos | 2 836 |
| Aristas | 4 850 |
| Hiperaristas | 0 |
| Comunidades detectadas | 264 (205 mostradas, 59 omitidas por escasas) |
| Aristas EXTRACTED | 99 % |
| Aristas INFERRED | 27 (1 %), confianza media 0,76 |
| Aristas AMBIGUOUS | 0 |

### 3.2 Nodos por tipo de archivo

| `file_type` | Nodos | Interpretación |
| --- | --- | --- |
| `code` | 1 653 | Módulos, servicios, repositorios, modelos, guards, pipes, migraciones, scripts |
| `document` | 1 108 | Markdown de `docs/`, `prompt/`, `README`, informes |
| `concept` | 65 | Conceptos de dominio extraídos de la documentación |
| `rationale` | 10 | Nodos de justificación, enlazados por la relación `rationale_for` |

### 3.3 Taxonomía de relaciones

Graphify modela **13 tipos de relación**. La tabla contrasta lo que el plan de documentación
pide inventariar contra lo que el grafo realmente distingue.

| Relación | Aristas | Correspondencia con el inventario exigido por el plan |
| --- | --- | --- |
| `contains` | 1 852 | Contención estructural archivo → símbolo |
| `imports` | 879 | Imports |
| `references` | 822 | Referencias cruzadas, incluidas las documentales |
| `imports_from` | 455 | Imports con origen explícito |
| `calls` | 425 | Llamadas |
| `method` | 249 | Pertenencia de método a clase |
| `re_exports` | 112 | Reexportación (barrels) |
| `extends` | 25 | Herencia de clase |
| `indirect_call` | 13 | Llamadas indirectas |
| `rationale_for` | 10 | Vínculo decisión → elemento justificado |
| `inherits` | 5 | Herencia |
| `defines` | 2 | Definición |
| `cites` | 1 | Cita documental |

**Limitación estructural de la fuente, registrada explícitamente:** el grafo **no tipa los nodos
por rol arquitectónico**. Todos los nodos carecen de `kind`/`type`; solo tienen `file_type` entre
cuatro valores. Por tanto Graphify **no puede, por sí solo**, producir el inventario que el plan
exige en su Fase 1 —«módulos, controladores, servicios, repositorios, entidades, DTO, guards,
interceptores, middlewares, workers, eventos, adaptadores»—. Esa clasificación se deriva aquí de
la convención de nombres de archivo del repositorio, que es estricta y está verificada por los
gates `quality:architecture` y `quality:clean-code`.

Del mismo modo, el grafo **no modela inyección de dependencias, acceso a datos, ni publicación o
consumo de eventos** como relaciones propias: las representa como `imports` y `calls`. Las
conclusiones sobre DI y acceso a datos de esta auditoría se apoyan en el contraste con el código,
no en el grafo aislado.

### 3.4 Inventario por rol arquitectónico

Derivado del árbol real en disco, con el grafo como verificación cruzada.

| Rol | Cantidad | Ubicación |
| --- | --- | --- |
| Módulos de dominio | 7 | `src/modules/{governance,health,ingestion,intelligence,provenance,quality,query}` |
| Controladores | 8 | Uno por módulo, más `claim-review.controller.ts` en `intelligence` |
| Módulos Nest (`*.module.ts`) | 11 | 7 de dominio + `audit`, `observability`, `configuration`, `database` |
| Modelos de persistencia | 54 | `src/database/models/` |
| Migraciones | 29 | `src/database/migrations/0001`–`0029` |
| Guards | 2 | `jwt-auth.guard.ts`, `roles.guard.ts` |
| Interceptores | 2 | `audit.interceptor.ts`, `request-context.interceptor.ts` |
| Pipes de validación | 1 | `zod-validation.pipe.ts` |
| Filtros de excepción | 1 | `http-exception.filter.ts` |
| Repositorios | 8 | `observation-write`, `revision-write`, `structure`, `data-query`, `trace`, `intelligence-write`, `claim-query`, `agent-run-query` |
| Colectores de métricas | 2 | `database-pool.collector.ts`, `domain-metrics.collector.ts` |
| Workers / consumidores | **0** | Prohibidos por ADR 0003; confirmado por el gate `quality:async-scope` |
| Eventos / mensajería | **0** | No existe canal de eventos. Ver §11, consecuencia sobre AsyncAPI |
| Adaptadores externos salientes | **0** | El núcleo no realiza llamadas HTTP salientes |
| Rutas HTTP | 49 | Ver §7 |

### 3.5 Nodos por área de origen

Áreas principales, por densidad de nodos:

| Área | Nodos | | Área | Nodos |
| --- | ---: | --- | --- | ---: |
| `src/modules/intelligence` | 200 | | `docs/progress` | 86 |
| `scripts` | 185 | | `src/database/seeds` | 71 |
| `.claude` | 166 | | `docs/claude` | 69 |
| `package.json` | 150 | | `docs/runbooks` | 47 |
| `src/modules/governance` | 123 | | `src/modules/query` | 45 |
| `src/modules/ingestion` | 115 | | `src/modules/quality` | 44 |
| `src/database/models` | 109 | | `src/common/auth` | 36 |
| `docs/decisions` | 102 | | `src/modules/provenance` | 36 |
| `docs/hardening` | 96 | | `src/common/observability` | 34 |
| `docs/architecture` | 93 | | `docs/data-model` | 34 |
| `src/database/migrations` | 87 | | `docs/endpoints` | 13 |

**Señal de desequilibrio documental:** `src/modules/intelligence` es el área de código más densa
del repositorio (200 nodos) y es la que procesa entrada explícitamente no confiable, pero
`docs/endpoints` —donde vive el contrato de esa entrada— tiene solo 13 nodos. El desequilibrio
entre superficie de riesgo y superficie documental es el hallazgo documental más relevante del
grafo.

---

## 4. Diferencias entre el grafo y el código

Contraste directo: 234 archivos `.ts` bajo `src/` en disco frente a 238 rutas de `src/`
representadas en el grafo.

### 4.1 En disco pero ausentes del grafo (5)

| Archivo | Naturaleza | Consecuencia para la documentación |
| --- | --- | --- |
| `src/common/auth/organization-scope.ts` | Código productivo | **Alta.** Es lógica de aislamiento institucional, un control de seguridad. Todo análisis de autorización basado solo en el grafo lo omite |
| `src/common/validation/zod-issue.ts` | Código productivo | **Media.** Es el saneador de incidencias de validación que usa `HttpExceptionFilter`; afecta al modelo de error documentado |
| `src/modules/intelligence/agent-run-query.repository.ts` | Código productivo | **Media.** Repositorio de consulta no reflejado en el mapa de acceso a datos |
| `src/common/errors/tests/http-exception.filter.spec.ts` | Prueba | Baja |
| `src/common/validation/tests/zod-validation.pipe.spec.ts` | Prueba | Baja |

### 4.2 En el grafo pero ausentes del disco

**Ninguno.** El grafo no contiene referencias fantasma. Su contenido es un subconjunto estricto
del árbol real, lo que significa que **el grafo nunca sobre-afirma**: solo puede quedarse corto.

### 4.3 Documentación

87 archivos `.md` bajo `docs/` en disco, 86 representados. El único ausente es
`docs/hardening/improvement-plan-2026-07-30.md`, creado con posterioridad a la construcción del
grafo.

### 4.4 Causa y clasificación

La causa de las nueve ausencias es única y benigna: **el grafo se construyó en el commit
`64b70fe8`, y los archivos ausentes son cambios sin confirmar del árbol de trabajo** (los 8 sin
rastrear del estado de git, de los cuales 6 caen bajo `src/` o `docs/`). No hay inconsistencia
semántica entre el grafo y el código; hay desfase temporal.

* **Clasificación:** `HIGH` — no bloquea, pero invalida el uso del grafo como fuente única.
* **Acción:** regenerar el grafo (`graphify update .`) después de confirmar los cambios
  pendientes, y **antes** de dibujar cualquier diagrama C4 o mapa de dependencias definitivo.
* **Mitigación aplicada en esta auditoría:** todo hallazgo se verificó contra el árbol en disco.

---

## 5. Componentes con alta centralidad

Grado total (entrada + salida) de los nodos de `src/`. Estos son los puntos donde un cambio no
documentado propaga el mayor daño, y por tanto los que exigen documentación prioritaria.

| Grado | Componente | Archivo | Rol |
| ---: | --- | --- | --- |
| 132 | `index.ts` | `src/database/models/index.ts` | Barrel de los 54 modelos. El nodo más central del sistema |
| 56 | `model.registry.ts` | `src/database/models/model.registry.ts` | Registro de modelos para Sequelize |
| 53 | `Actor` | `src/common/auth/actor.ts` | Tipo de identidad que atraviesa toda petición autenticada |
| 46 | `governance.controller.ts` | `src/modules/governance/` | Controlador con más operaciones (18 rutas) |
| 46 | `intelligence.schemas.ts` | `src/modules/intelligence/` | Esquemas Zod del borde no confiable |
| 42 | `MetricsService` | `src/common/observability/metrics.service.ts` | Punto único de métricas Prometheus |
| 40 | `app.module.ts` | `src/` | Composición raíz |
| 39 | `observation-registration.service.ts` | `src/modules/ingestion/` | Registro de observaciones e idempotencia |
| 39 | `intelligence.controller.ts` | `src/modules/intelligence/` | Borde de entrada de agentes de IA |
| 38 | `Roles()` | `src/common/auth/auth.decorators.ts` | Decorador de autorización, aplicado en todas las rutas protegidas |
| 35 | `run-boot-seeds.ts` | `src/database/seeds/runners/` | Carga de catálogos base |
| 33 | `submission.service.ts` | `src/modules/intelligence/` | Ingesta de envíos de agentes |
| 30 | `migration.types.ts` / `MigrationContext` | `src/database/` | Contrato de migración compartido por las 29 migraciones |
| 27 | `withSerializableRetry()` | `src/common/persistence/serializable-retry.ts` | Reintento serializable (ADR 0009) |
| 27 | `application.error.ts` | `src/common/errors/` | Jerarquía de error de dominio |

**Lectura:** cuatro de los quince componentes más centrales pertenecen a
`src/modules/intelligence`. Es simultáneamente el área más acoplada y la que recibe entrada no
confiable. `Actor`, `Roles()` y `application.error.ts` son transversales de seguridad y error con
alta centralidad, lo que confirma que sus contratos deben documentarse antes que los de cualquier
módulo individual.

---

## 6. Dependencias circulares

### 6.1 Nivel de archivo — limpio

Se construyó el grafo dirigido de relaciones `imports` e `imports_from` restringido a `src/` y se
aplicó Tarjan.

> **Resultado: 0 componentes fuertemente conexos de tamaño mayor que 1.**

No existe una sola dependencia circular entre archivos del código productivo. Esto es un hallazgo
positivo verificable y sostiene la afirmación de que la disciplina de capas del repositorio se
respeta en la práctica, no solo en la regla.

### 6.2 Nivel de área — un componente fuertemente conexo

Agregando por área, el grafo dirigido sí presenta un ciclo:

```
SCC = { src/common/audit, src/common/, src/modules/intelligence,
        src/common/observability, src/database/, src/common/persistence }
```

Con cuatro ciclos de dos elementos:

| Par mutuamente dependiente | Aristas ida / vuelta |
| --- | --- |
| `src/common/observability` ↔ `src/database/` | 3 / 2 |
| `src/common/observability` ↔ `src/common/persistence` | 3 / 3 |
| `src/common/persistence` ↔ `src/database/` | 2 / 2 |
| `src/common/persistence` ↔ `src/modules/intelligence` | 1 / 1 |

**Interpretación honesta.** Tres de los cuatro pares son acoplamiento esperado y de bajo peso
entre infraestructura transversal: el colector de métricas de pool observa la base de datos y la
base de datos emite métricas; la capa de persistencia instrumenta y es instrumentada. Al no
existir ciclo a nivel de archivo (§6.1), **ninguno de estos es un ciclo real de importación**: son
un artefacto de agregar archivos distintos en una misma área.

El par que merece atención es **`src/common/persistence` → `src/modules/intelligence`** (1 arista).
Una utilidad transversal que apunta hacia un módulo de dominio invierte la dirección de dependencia
esperada por `.claude/rules/10-backend-architecture.md`. El gate `quality:architecture` aprueba,
por lo que no viola la regla codificada, pero es la única arista del sistema que va de
`common/` hacia `modules/` y debe quedar documentada con su justificación —o corregida— antes de
publicar el diagrama de componentes.

* **Clasificación:** `MEDIUM`.
* **Acción:** identificar la arista concreta en `src/common/persistence/` y registrar su motivo en
  el documento de dependencias entre módulos, o invertirla.

---

## 7. Puntos de entrada y flujos principales

### 7.1 Superficie HTTP real

Extraída de los 8 controladores por análisis de decoradores `@Controller`/`@Get`/`@Post`:
**49 rutas**.

| Módulo | Rutas | Verbos | Naturaleza |
| --- | ---: | --- | --- |
| `governance` | 18 | Todas POST | Alta de catálogos semánticos, versiones y transiciones de estado |
| `intelligence` | 12 | 9 POST, 3 GET | **Borde no confiable.** Registro de agentes, ejecuciones, envíos, triaje, revisión, reprocesamiento, cartas muertas |
| `quality` | 7 | 6 POST, 1 GET | Reglas, dimensiones, incidencias, relaciones de linaje, rupturas de serie |
| `provenance` | 6 | 3 POST, 3 GET | Organizaciones, fuentes, artefactos |
| `ingestion` | 4 | 3 POST, 1 GET | Observaciones, lotes, traza de revisión |
| `health` | 3 | Todas GET | `/health`, `/ready`, `/metrics` |

*(El total por módulo suma 50 porque `/metrics` se expone desde el módulo de salud pero pertenece
conceptualmente a observabilidad; las rutas HTTP distintas son 49.)*

### 7.2 Ciclo de vida de una petición

Reconstruido del grafo y verificado contra el código:

```
NGINX (ADR 0010)
  → Fastify + @fastify/helmet + @fastify/rate-limit
  → RequestContextInterceptor      (src/common/http/) — request-id, contexto
  → JwtAuthGuard                   (src/common/auth/) — RS256 vía JWKS (ADR 0002)
  → RolesGuard                     (src/common/auth/) — RBAC default-deny (ADR 0012)
  → ZodValidationPipe              (src/common/validation/) — validación en el borde
  → Controller                     (transporte, sin reglas de negocio)
  → Service                        (reglas de negocio)
  → Repository                     (writer o ReadQueryExecutor según ADR 0004/0007)
  → PostgreSQL
  ⇢ AuditInterceptor               (src/common/audit/) — auditoría append-only
  ⇢ HttpExceptionFilter            (src/common/errors/) — modelo de error único
  ⇢ MetricsService                 (src/common/observability/) — Prometheus
```

### 7.3 Flujos de datos principales

| Flujo | Entrada | Recorrido | Salida |
| --- | --- | --- | --- |
| **Ingesta estadística** | `POST /data/observations`, `POST /data/observation-batches` | normalizador → validador de estructura → evaluador de calidad → repositorio de escritura, con idempotencia de lote | Observaciones y revisiones inmutables |
| **Inteligencia de agentes** | `POST /intelligence/agent-runs/{id}/submissions` | contenido no confiable → normalizador de afirmaciones → triaje → cuarentena o persistencia → enrutado a revisión | Afirmaciones, contradicciones, tareas de revisión |
| **Consulta histórica** | `POST /data/query` | plan de consulta → `ReadQueryExecutor` (pool lector) → mapeo → paginación por cursor | Series filtradas por confidencialidad y organización |
| **Gobierno semántico** | 18 rutas `POST /governance/*` | política de transición de versión → repositorio | Catálogos versionados |
| **Revisión humana** | `POST /intelligence/review-tasks/{id}/decisions` | política de enrutado → decisión → revisión, nunca borrado | Correcciones como revisiones |

Los cinco flujos convergen en `src/database/models/index.ts`, el nodo de mayor centralidad (§5),
lo que es coherente con un núcleo de datos único y sin colas.

---

## 8. Componentes huérfanos

De 250 nodos de archivo bajo `src/`, **18 tienen grado ≤ 1**.

| Categoría | Cantidad | Evaluación |
| --- | ---: | --- |
| Nodos de `README.md` de módulo y su título | 15 | **Falso positivo estructural.** Los README de módulo no son importados por código; su grado bajo es esperado, no es abandono |
| `ErrorCode` (`src/common/errors/application.error.ts`) | 1 | Símbolo exportado con una sola referencia en el grafo. El archivo contenedor tiene grado 27 |
| `plugin-status.spec.ts` | 1 | Archivo de prueba; grado bajo esperado |

> **Conclusión: no hay código productivo huérfano.** Ningún archivo de implementación bajo `src/`
> queda desconectado del grafo. Los 15 README de bajo grado señalan otra cosa —que la
> documentación por módulo existe pero no está enlazada desde ningún índice navegable—, lo que es
> un hallazgo documental, no arquitectónico.

---

## 9. Módulos críticos

Criterio de criticidad: superficie de entrada no confiable, centralidad, densidad de nodos y
consecuencia de un fallo silencioso.

| Prioridad | Módulo | Justificación | Densidad | Riesgo documental actual |
| --- | --- | --- | ---: | --- |
| 1 | `src/modules/intelligence` | Procesa salida de agentes de IA, entrada explícitamente no confiable por `.claude/rules/30-security.md`. Cuatro de los quince nodos más centrales. Doce rutas | 200 nodos | **Alto**: el contrato de su borde carece de descripciones y ejemplos (§10) |
| 2 | `src/common/auth` | Punto único de authN/authZ. `Actor` (grado 53) y `Roles()` (grado 38). Contiene `organization-scope.ts`, **ausente del grafo** | 36 nodos | **Alto**: control de aislamiento institucional no modelado |
| 3 | `src/database/` (modelos + migraciones) | 54 modelos, 29 migraciones, el barrel más central del sistema (grado 132) | 196 nodos | Medio: existe `docs/data-model/` con modelo físico auditado |
| 4 | `src/modules/ingestion` | Idempotencia de dominio (ADR 0005) e inmutabilidad del dato crudo | 115 nodos | Medio |
| 5 | `src/modules/governance` | Mayor superficie HTTP: 18 rutas y transiciones de estado versionadas | 123 nodos | Medio |
| 6 | `src/common/persistence` | Aislamiento serializable (ADR 0009) y separación lector/escritor (ADR 0004/0007). Origen de la arista invertida de §6.2 | 14 nodos | Medio |

---

## 10. Riesgos documentales

Derivados del grafo y verificados contra el árbol.

| ID | Riesgo | Evidencia | Severidad |
| --- | --- | --- | --- |
| `RG-D01` | Las 49 operaciones del contrato OpenAPI **carecen de `description`**; solo tienen `summary` | `docs/endpoints/openapi.yaml`, verificación programática | `HIGH` |
| `RG-D02` | Los 47 esquemas del contrato **carecen de `description`** sin excepción | ídem | `HIGH` |
| `RG-D03` | **Cero ejemplos** en el contrato: 0 de 38 cuerpos de petición y 0 de 49 respuestas | ídem | `HIGH` |
| `RG-D04` | Ninguna operación documenta `404`, pese a que 13 rutas llevan parámetros de ruta y el filtro de errores **sí produce `NOT_FOUND`** (`http-exception.filter.ts:151`) | contraste contrato ↔ código | `HIGH` |
| `RG-D05` | Las 39 operaciones POST responden `200`; ninguna declara `201`. El contrato no distingue creación de consulta | `docs/endpoints/openapi.yaml` | `MEDIUM` |
| `RG-D06` | Los 15 README de módulo no están enlazados desde ningún índice navegable (§8) | grado ≤1 en el grafo | `MEDIUM` |
| `RG-D07` | El grafo está desfasado; `organization-scope.ts`, `zod-issue.ts` y `agent-run-query.repository.ts` no están modelados | §4.1 | `HIGH` |
| `RG-D08` | El área de mayor riesgo (`intelligence`, 200 nodos) tiene la menor cobertura contractual proporcional (`docs/endpoints`, 13 nodos) | §3.5 | `HIGH` |
| `RG-D09` | La arista `src/common/persistence` → `src/modules/intelligence` invierte la dirección de dependencia esperada y no está justificada en ningún documento | §6.2 | `MEDIUM` |
| `RG-D10` | Un único `server` en el contrato, `http://localhost:8080`; no describe ambientes reales | `docs/endpoints/openapi.yaml` | `MEDIUM` |

---

## 11. Riesgos arquitectónicos

| ID | Riesgo | Evidencia | Severidad |
| --- | --- | --- | --- |
| `RG-A01` | Avisos de seguridad High sin resolver, incluido un bypass de guardas de ruta en `@fastify/static` | `docs/reports/baseline.md` §3.2 | `BLOCKER` |
| `RG-A02` | La capa de integración —donde viven las garantías de ADR 0005 y ADR 0009— no tiene evidencia ejecutada | `docs/reports/baseline.md` §3.3 | `CRITICAL` |
| `RG-A03` | Ciclo de área que incluye un módulo de dominio dentro de un componente fuertemente conexo con infraestructura transversal | §6.2 | `MEDIUM` |
| `RG-A04` | Concentración de centralidad: `src/database/models/index.ts` con grado 132 es un punto único de propagación de cambio | §5 | `MEDIUM` |

### Consecuencia decisiva sobre el alcance del plan

El grafo confirma, y el código verifica, que **el sistema no tiene eventos, mensajería,
WebSockets ni trabajos asíncronos**: cero workers, cero adaptadores de cola, cero relaciones de
publicación o consumo, dependencias de cola prohibidas por ADR 0003 y verificadas por el gate
`quality:async-scope`.

Por tanto **la Fase 11 del plan (AsyncAPI y catálogo de eventos) no aplica a este sistema**. El
propio plan la condiciona: «Aplicar cuando el backend publique o consuma mensajes, eventos,
WebSockets o trabajos asíncronos». Producir un `asyncapi/asyncapi.yaml` aquí sería documentar
funcionalidad inexistente, lo que la regla 3 del mandato prohíbe expresamente. La ausencia queda
registrada como decisión trazable, no como omisión.

---

## 12. Acciones ejecutadas en esta fase

| # | Acción | Resultado |
| --- | --- | --- |
| 1 | Inventario de los 9 artefactos de Graphify previstos por el plan | 8 presentes, 1 ausente (`cache/stat-index.json`), sin impacto |
| 2 | Recorrido programático de 2 836 nodos y 4 850 aristas | Taxonomías de §3.2 y §3.3 |
| 3 | Contraste grafo ↔ disco para `src/` (234 archivos) y `docs/` (87 archivos) | 9 ausencias, 0 fantasmas (§4) |
| 4 | Tarjan sobre el grafo de importaciones a nivel de archivo | 0 ciclos (§6.1) |
| 5 | Tarjan sobre el grafo agregado por área | 1 componente fuertemente conexo de 6 áreas (§6.2) |
| 6 | Cálculo de grado sobre nodos de `src/` | Ranking de centralidad (§5) y huérfanos (§8) |
| 7 | Extracción de las 49 rutas reales desde los decoradores de los 8 controladores | Superficie HTTP (§7.1) |
| 8 | Contraste de las 49 rutas contra las 49 operaciones de `docs/endpoints/openapi.yaml` | **Paridad exacta**: sin rutas sin documentar ni operaciones fantasma |
| 9 | Auditoría de calidad del contrato | Base de `RG-D01`–`RG-D05` y `RG-D10` |
| 10 | Verificación de ausencia de eventos y workers | Fase 11 del plan declarada no aplicable (§11) |

---

## 13. Criterio de salida de la Fase 1

| Criterio | Estado |
| --- | --- |
| Se consultaron todos los artefactos relevantes de Graphify | **Cumplido** (§1) |
| Se inventariaron nodos por tipo | **Cumplido**, con la limitación de tipado documentada (§3.3) |
| Se inventariaron relaciones | **Cumplido** (§3.3) |
| Se revisaron dependencias circulares | **Cumplido**: 0 a nivel de archivo, 1 SCC a nivel de área (§6) |
| Se revisaron componentes huérfanos | **Cumplido**: 0 productivos (§8) |
| Se identificaron componentes de alta centralidad | **Cumplido** (§5) |
| Se documentaron flujos principales | **Cumplido** (§7) |
| Se contrastó el grafo contra el código real | **Cumplido**: 9 ausencias, causa única identificada (§4) |
| Riesgos documentales y arquitectónicos registrados | **Cumplido** (§10, §11) |

**Fase 1 cerrada.** El grafo es fiel pero está desfasado; su desfase está acotado, su causa
identificada y toda conclusión de esta página se verificó contra el árbol real. Queda habilitada
la Fase 2.

### Deuda registrada y no resuelta

`RG-D07` permanece abierto: **el grafo debe regenerarse tras confirmar los cambios pendientes y
antes de publicar cualquier diagrama C4 definitivo.** No se regeneró en esta fase porque hacerlo
sobre un árbol sucio produciría un artefacto que no corresponde a ningún commit, lo que
degradaría la trazabilidad en vez de mejorarla.
