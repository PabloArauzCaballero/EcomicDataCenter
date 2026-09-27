# Arquitectura del portal administrativo

## La idea en una frase

El núcleo sigue siendo la única autoridad sobre los datos y sobre quién puede tocarlos;
el portal añade un registro de **cómo está funcionando el observatorio** y una consola que
lo lee. Nada de lo que el portal muestra se inventa: o está medido y lo dice, o no está
medido y también lo dice.

## Los tres procesos

```
   navegador                observatorio-dashboard                 EcomicDataCenter
  ───────────              ───────────────────────                ──────────────────
  /admin/*  ──cookie──►    capa de servidor                       /api/v1/admin/*
                           · verifica la sesión
                           · acuña un JWT RS256  ──Bearer──►       JwtAuthGuard (JWKS)
                           · nunca lo devuelve                     RolesGuard
                                                                   AuditInterceptor
  /            ──beacon──► /api/analytics ──SITE_TELEMETRY──►      operations.traffic_event
  /api/export  ──────────► instrumentado    ──SITE_TELEMETRY──►    operations.export_request
                           │
                           └─ lee PostgreSQL directamente (solo lectura, sin cambios)
```

El tablero público **no cambió de forma**: sigue leyendo su PostgreSQL con la conexión de
solo lectura que ya tenía. Lo único que se le añadió es que cuenta lo que hace.

## Por qué el tablero acuña el token y no guarda uno

No hay proveedor de identidad delante de este despliegue, y construir uno no era el
encargo. Lo que el núcleo ya sabe hacer es verificar un RS256 contra un JWKS, comprobar
emisor, audiencia y caducidad, y aplicar **sus** roles.

Así que el tablero autentica a la persona contra una lista de operadores de su propia
configuración (scrypt, comparación en tiempo constante) y acuña, **por petición y en el
servidor**, un token de dos minutos con los roles de esa persona. El núcleo lo verifica
contra `GET /api/admin/jwks` del tablero, exactamente como verificaría el de cualquier
proveedor externo.

Consecuencias que importan:

- **El portal no implementa autorización.** Un 403 es del núcleo. Si el tablero
  desapareciera, las reglas seguirían siendo las mismas.
- **El navegador nunca tiene una credencial del núcleo.** La cookie de sesión es
  `HttpOnly`, va firmada con HMAC y no contiene el token; el token se crea y muere dentro
  de la petición.
- **Migrar a un proveedor real es cambiar tres variables** (`AUTH_JWKS_URI`,
  `AUTH_ISSUER`, `AUTH_AUDIENCE`) y quitar el emisor local. Nada del dominio cambia.

## El esquema `operations`

Migración **0075**. Diez tablas, todas sobre *procesos*, ninguna sobre el país:

| Tabla | Responde a |
| --- | --- |
| `seed_application` | Qué paquete, en qué versión y con qué checksum carga esta base. Único por (base, paquete, versión). |
| `seed_run` | Qué se pidió, quién lo pidió y hasta dónde llegó. Huella única de la petición. |
| `source_expectation` | Qué calendario declara cada fuente. |
| `ingestion_event` | Qué etapa alcanzó cada ejecución y con qué contadores. Solo se añade. |
| `read_model_publication` | Si lo que se cargó llegó a verse. |
| `export_request` | Qué archivo se pidió, cuál se generó y cuál falló. |
| `traffic_event` | Visitas, sin dirección del visitante ni texto buscado. |
| `health_probe` | Cada comprobación externa y su resultado. |
| `health_incident` | Un incidente por caída, no uno por sondeo. |
| `alert_delivery` | Si el aviso salió, aparte de si el incidente existe. |

Está separado de los esquemas de dominio a propósito: una política de retención sobre
`operations` no puede convertirse en una política sobre la historia económica, que es
inmutable.

La migración también amplía `quality_lineage.quality_assessment` con numerador,
denominador, no evaluados, versión de regla, alcance y corte. Nullable: las evaluaciones
ya registradas nunca se midieron así y esta migración no les inventa una población.

## Dónde vive cada decisión

| Decisión | Archivo | Por qué ahí |
| --- | --- | --- |
| Si una fuente está atrasada | `src/modules/admin/source-schedule.policy.ts` | No sabe SQL: se prueba contra un reloj fijo. |
| Si un paquete puede aplicarse | `src/modules/admin/seed-policy.ts` | Puro; el orden de los rechazos es parte del contrato. |
| Si una regla cumple | `src/modules/quality/quality-evaluation.service.ts` | `judge()` es la única función que decide, y devuelve `NOT_EVALUATED` sin población. |
| Qué copias rebuild una siembra | `src/modules/admin/seed-catalogue-map.ts` | Es un hecho operativo de este despliegue, no una propiedad de los archivos. |
| Qué catálogos se comparan fila a fila | `src/modules/admin/seed-catalogue-map.ts` | Describe lo que los sembradores ya escriben; no es un segundo cargador. |

## Lo que el portal deliberadamente no hace

- **No mide la transferencia completa de una descarga.** Nada aquí observa el último byte
  llegando al lector, así que no hay un estado que lo afirme.
- **No promete personas únicas.** Lo que un balde diario puede medir se llama «sesiones
  estimadas» en la pantalla.
- **No ejecuta SQL, comandos ni rutas arbitrarias.** La consola manda un **código de
  paquete** de una lista cerrada; el núcleo lo resuelve contra la suya.
- **No acepta que el navegador diga a qué entorno apunta.** El entorno sale de la
  configuración del servidor. Una consola multi-entorno necesitaría destinos configurados
  y permisos por destino, y no existe.
- **No añade cola ni worker.** La reconciliación corre en el propio proceso de la API con
  estado durable (`seed_run` con latido y checkpoint), que es lo que el ADR 0003 admite.
