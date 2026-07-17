# Perfil arquitectónico

## 1. Clasificación del sistema

El sistema es el **core de datos estadísticos** del Observatorio Económico y de Mercados de Bolivia. Su responsabilidad es preservar datos, metadatos, revisiones, calidad, procedencia y linaje. No administra usuarios, no contiene una interfaz gráfica y no procesa microdatos personales.

El perfil de riesgo se clasifica de la siguiente manera:

| Dimensión | Perfil | Fundamento |
|---|---|---|
| Integridad | Alta | Una cifra publicada no puede sobrescribirse silenciosamente; debe conservarse su revisión histórica. |
| Trazabilidad | Alta | Cada dato debe poder vincularse con fuente, artefacto, lote, metodología y controles de calidad. |
| Confidencialidad | Media, pendiente de política | El modelo no contiene microdatos, pero sí estados de confidencialidad cuya matriz de acceso aún debe ratificarse. |
| Disponibilidad | Pendiente de SLO institucional | La arquitectura permite réplicas y escalado horizontal, pero no se inventa un objetivo de disponibilidad. |
| Volumen | Potencialmente alto | Las consultas y series pueden crecer de forma sostenida; la carga inicial síncrona está acotada a 500 observaciones. |
| Consistencia | Fuerte en escritura | Registro y revisión requieren transacciones, bloqueos e invariantes de base de datos. |
| Latencia | Interactiva para API | Existen timeouts y paginación; el objetivo numérico debe validarse mediante carga representativa. |

## 2. Capacidades obligatorias activas

- Configuración validada con Zod.
- Migraciones versionadas fuera del proceso HTTP.
- Validación de entradas en límites de transporte.
- Autenticación default-deny y autorización por rol.
- Manejo centralizado de errores.
- Logs estructurados y correlation ID.
- Liveness y readiness separados.
- API versionada y contrato OpenAPI.
- Credenciales PostgreSQL separadas para migrator, writer y reader.
- Pruebas de reglas, contratos y flujos críticos.

## 3. Capacidades condicionales

| Capacidad | Estado de fase 2 | Criterio para activarla |
|---|---|---|
| Cola y workers | Diferida | Lotes o procesos que no cumplan el presupuesto síncrono, o necesidad de entrega diferida. |
| Outbox | Diferida | Publicación de eventos a consumidores externos con garantía al menos una vez. |
| Redis/cache distribuida | No activada | Evidencia de lecturas repetitivas costosas y política de invalidación aprobada. |
| Réplica física PostgreSQL | Preparada, no exigida | Volumen de lectura o aislamiento operativo que justifique una réplica real. |
| Materialized views | No activadas | Planes de consulta que no cumplan objetivos aun con índices y vistas normales. |
| Kubernetes | Diferido | Requisitos de alta disponibilidad, autoescalado o plataforma corporativa. |
| PITR/pgBackRest | Pendiente | RPO/RTO institucional ratificado y entorno productivo definido. |
| Tracing distribuido | Diferido | Incorporación de workers, integraciones o múltiples servicios. |

## 4. Límites de alcance

Incluido:

- procedencia y fuentes;
- estructuras y clasificaciones;
- datasets, indicadores y metodologías versionadas;
- observaciones y revisiones;
- ingestión individual y por lote;
- consultas actuales e históricas;
- calidad, incidencias, comparabilidad y linaje.

Excluido:

- identidad local, contraseñas, sesiones y MFA;
- frontend y visualización;
- IA, pronósticos y generación de contenido;
- web scraping y conectores institucionales;
- microdatos personales;
- notificaciones y webhooks.

## 5. Incertidumbres que no deben resolverse por suposición

1. `issuer`, `audience`, nombres y semántica final de claims JWT.
2. Matriz rol × confidencialidad × estado de publicación.
3. SLO de disponibilidad, latencia y frescura.
4. RPO/RTO y estrategia productiva de backup.
5. Volumen máximo diario y tamaño esperado de series.
6. Política de retención de artefactos y revisiones.

Estas incertidumbres no impiden diseñar la arquitectura, pero bloquean una declaración de preparación productiva completa.
