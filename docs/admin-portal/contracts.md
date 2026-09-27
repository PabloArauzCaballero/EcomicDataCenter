# Contratos del portal administrativo

Todas las rutas cuelgan de `/api/v1/admin`, son **default-deny** y están declaradas en
`docs/endpoints/openapi.yaml` con las nueve respuestas que el contrato exige. El generador
es `scripts/build_openapi.py`; `yarn quality:routes` verifica que el código y el contrato
digan lo mismo.

## Envoltura

```ts
type EvidenceState = 'known' | 'unknown' | 'stale' | 'not_applicable';

interface AdminEnvelope<T> {
  data: T;
  meta: {
    environmentId: string;   // del servidor, nunca de la petición
    observedAt: string | null;  // cuándo se observó la evidencia; null si no hubo
    generatedAt: string;
    evidenceState: EvidenceState;
    requestId: string;       // el mismo que viaja en `x-request-id`
  };
}
```

`evidenceState` vale `unknown` por defecto. Un llamador que olvide declarar su confianza
produce una respuesta que admite ignorancia, no una que afirme seguridad que no ganó.

Reglas de forma, en todas las respuestas:

- Fechas **ISO UTC**; la presentación las pasa a `America/La_Paz` y lo dice.
- Ventanas temporales con inicio **inclusivo** y fin **exclusivo**.
- Identificadores `bigint` como cadena.
- Un porcentaje sin denominador es `null`. Nunca 100 por ausencia de datos.
- «Observado», «recibido», «persistido» y «publicado» son campos distintos.

Paginación por **cursor keyset** (`occurredAt|id` en base64url). Un cursor que este API no
emitió se rechaza con 400: una vuelta silenciosa a la primera página haría que una URL
truncada devolviera las filas más nuevas mientras el lector cree estar continuando.

## Rutas

| Método y ruta | Roles | Qué devuelve |
| --- | --- | --- |
| `GET /admin/overview` | ANALYST, METHODOLOGY_STEWARD | Resumen con cobertura y frescura; cada cifra tiene su listado. |
| `GET /admin/health/summary` | ANALYST, METHODOLOGY_STEWARD | Sondeos, incidentes, publicación por conjunto y copias guardadas. |
| `GET /admin/audit/events` | ANALYST, METHODOLOGY_STEWARD | Auditoría paginada y acotada a la organización del lector. |
| `GET /admin/metadata/{catalog}` | ANALYST, METHODOLOGY_STEWARD | Un catálogo de una lista cerrada, con sus referencias. |
| `GET /admin/ingestion/sources` | ANALYST, METHODOLOGY_STEWARD | Fuentes, calendarios y veredicto de frescura. |
| `GET /admin/ingestion/runs` | ANALYST, METHODOLOGY_STEWARD | Ejecuciones filtrables y paginadas. |
| `GET /admin/ingestion/runs/{agentRunId}` | ANALYST, METHODOLOGY_STEWARD | Una ejecución y sus etapas. |
| `GET /admin/quality/evaluations` | ANALYST, METHODOLOGY_STEWARD | Evaluaciones con numerador, denominador y no evaluados. |
| `GET /admin/quality/summary` | ANALYST, METHODOLOGY_STEWARD | Cobertura de reglas, bloqueantes e incidencias. |
| `GET /admin/quality/issues/{dataIssueId}` | ANALYST, METHODOLOGY_STEWARD | Una incidencia, su evidencia y su historial. |
| `GET /admin/analytics/traffic` | ANALYST, METHODOLOGY_STEWARD | Agregados con la cobertura declarada. |
| `GET /admin/analytics/exports` | ANALYST, METHODOLOGY_STEWARD | Peticiones, generaciones y fallos. |
| `GET /admin/seeds/packages` | ANALYST, METHODOLOGY_STEWARD, SEED_OPERATOR | Manifiesto junto al registro de aplicaciones. |
| `GET /admin/seeds/runs/{seedRunId}` | ANALYST, METHODOLOGY_STEWARD, SEED_OPERATOR | Estado durable de una ejecución. |
| `POST /admin/seeds/validations` | METHODOLOGY_STEWARD, SEED_OPERATOR | Valida sin tocar un solo dato de dominio. |
| `POST /admin/seeds/reconciliations` | SEED_OPERATOR | **202** con un identificador de ejecución. Nunca un resultado. |
| `POST /admin/analytics/traffic` | SITE_TELEMETRY | Vistas del sitio público. |
| `POST /admin/analytics/exports` | SITE_TELEMETRY | Una etapa de una exportación. |
| `POST /api/v1/quality/evaluations` | METHODOLOGY_STEWARD | Ejecuta las reglas declaradas a un corte. |

### Ejemplo: pedir una reconciliación

```http
POST /api/v1/admin/seeds/reconciliations
Authorization: Bearer <RS256 acuñado por el tablero>
Content-Type: application/json

{
  "packageCode": "core-catalogues",
  "expectedVersion": "1.0.0",
  "expectedChecksum": "4f2c…64 hexadecimales…",
  "reason": "reparar una edición manual en semantic.frequency"
}
```

```http
HTTP/1.1 202 Accepted

{ "data": { "seedRunId": "…", "status": "QUEUED", "accepted": true },
  "meta": { "evidenceState": "not_applicable", … } }
```

`accepted: false` significa que una petición idéntica ya estaba en vuelo o ya corrió: el
identificador devuelto es el de **esa** ejecución. Es la idempotencia que hace que una
segunda pestaña no lance una segunda aplicación.

La versión y el checksum son obligatorios y son lo que convierte «aplicar la diferencia
que acabo de revisar» en eso y no en «aplicar lo que haya ahora». Si el paquete cambió
entre la validación y la aplicación, la respuesta es **409**.

## Errores

| Código | Cuándo |
| --- | --- |
| 400 | Filtro, cursor o cuerpo inválido. El detalle nombra el campo. |
| 401 | Sin sesión o token inválido. |
| 403 | Fuera de los permisos, o mutación sin token CSRF / con origen ajeno. |
| 404 | Entidad no visible para este lector, o paquete que este build no declara. |
| 409 | La versión o el checksum revisados ya no son los del build. |
| 422 | Regla de negocio: demo en producción, perfil que excluye el paquete, esquema insuficiente, dependencias rotas. |
| 429 | Límite de peticiones. |
| 503 | Dependencia que no respondió. |

Ninguna respuesta lleva SQL, trazas ni cadenas de conexión. El `requestId` de la envoltura
es el que aparece en el log del servidor.

## Nuevos roles

| Rol | Por qué existe |
| --- | --- |
| `SEED_OPERATOR` | Reconciliar un paquete reescribe filas de catálogo en bloque bajo la autoridad de un manifiesto: es un acto operativo, no editorial. Ningún otro rol lo implica, y tenerlo no arrastra ningún otro permiso. La alternativa —ensanchar `METHODOLOGY_STEWARD` hasta poder desplegar catálogos— habría convertido al custodio en administrador por accidente. |
| `SITE_TELEMETRY` | El sitio público necesita poder informar sobre sí mismo y nada más. Darle `INGESTION_AGENT` habría sido una línea más corta y habría permitido que un servidor web comprometido enviara observaciones económicas. |

La separación de deberes existente se mantiene: `token-claims.parser` sigue impidiendo que
un token de `INGESTION_AGENT` lleve otros roles.
