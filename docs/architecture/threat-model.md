# Modelo de amenazas — Fase 2

## 1. Método y alcance

Se utiliza STRIDE sobre las fronteras documentadas en `trust-boundaries.puml`. El análisis cubre transporte HTTP, autenticación externa, autorización, persistencia, consultas, artefactos referenciados y observabilidad. No cubre la seguridad física del proveedor de identidad ni del almacenamiento externo.

## 2. Activos

1. Cifras y revisiones publicadas.
2. Metadatos, metodología y clasificaciones.
3. Procedencia, artefactos y hashes.
4. Historial de calidad, incidencias y linaje.
5. Credenciales de PostgreSQL y configuración JWT.
6. Contrato OpenAPI y reglas de autorización.
7. Disponibilidad de la API y base de datos.

## 3. Entradas

- requests REST;
- tokens JWT y JWKS;
- lotes de observaciones;
- filtros de consulta;
- variables de entorno;
- migraciones y seeds;
- respuestas PostgreSQL.

## 4. Riesgos STRIDE

| ID | Categoría | Amenaza | Impacto | Prob. | Nivel | Control requerido | Evidencia esperada |
|---|---|---|---|---|---|---|---|
| T-01 | Spoofing | Token falso, expirado o firmado con algoritmo distinto | Alto | Media | Alto | RS256 fijo, issuer, audience, JWKS y expiración | Unit/E2E 401 |
| T-02 | Spoofing | `organization_id` manipulado | Alto | Media | Alto | Claim validado y comparación server-side con organización enviada | Prueba negativa 403 |
| T-03 | Tampering | Sobrescritura de una revisión publicada | Crítico | Baja | Alto | Revisiones inmutables, índice corriente y transacción | Integración DB |
| T-04 | Tampering | Artefacto fuente reemplazado | Alto | Media | Alto | SHA-256 único e inmutabilidad de metadatos del artefacto | Migración + prueba trigger |
| T-05 | Tampering | Lote parcial deja contadores o datos inconsistentes | Alto | Media | Alto | Transacción + SAVEPOINT + reconciliación de contadores | E2E bulk |
| T-06 | Repudiation | Actor niega haber cargado o corregido un dato | Alto | Media | Alto | `sub`, organización, lote, artefacto, vintage y logs con request ID | Auditoría funcional |
| T-07 | Information disclosure | Modelo ORM, stack trace o URI interna expuesta | Alto | Media | Alto | DTO/mappers, filtro global, redacción y roles | Contract/E2E |
| T-08 | Information disclosure | Dato confidencial visible a rol incorrecto | Crítico | Media | Crítico | Matriz de confidencialidad default-deny | **Bloqueo institucional** |
| T-09 | Denial of service | Body, lote o página excesivos | Alto | Alta | Crítico | límites de body, 500 registros, página 200, rate limit | E2E/carga |
| T-10 | Denial of service | Query costosa agota pool | Alto | Media | Alto | statement timeout, paginación, reader pool e índices | EXPLAIN + k6 |
| T-11 | Elevation | Ruta nueva sin decorator de rol | Alto | Media | Alto | auth global y validador de rutas/políticas | Static test/E2E |
| T-12 | Elevation | Credencial writer ejecuta DDL | Crítico | Baja | Alto | roles DB separados y grants explícitos | Test de privilegios |
| T-13 | Supply chain | Dependencia comprometida o lockfile ausente | Alto | Media | Alto | lockfile, review, SCA, secret scan y versiones fijas | CI |
| T-14 | SSRF | URI de artefacto usada luego para fetch arbitrario | Alto | Baja hoy | Medio | no realizar fetch en core; adapter con allowlist si se añade | ADR futuro |
| T-15 | Availability | JWKS no disponible | Medio | Media | Medio | caché, timeout y fail-closed | Resilience test |

## 5. Controles transversales

- Auth default-deny; solo health/readiness/metrics están marcados públicos.
- NGINX es la única entrada pública en la topología Docker.
- SQL constante y replacements; filtros y sort con whitelist.
- Errores de cliente no incluyen stack ni detalles de infraestructura.
- Pino redacta autorización, cookies, tokens y contraseñas.
- Reader y writer tienen pools y credenciales distintos.
- Migraciones se ejecutan como proceso separado.
- El API no recupera contenido de URI aportadas por el cliente.

## 6. Riesgo residual aceptado en fase 2

- La disponibilidad del proveedor JWKS afecta autenticación cuando la caché no contiene la clave.
- El límite síncrono de 500 registros debe validarse con dataset representativo.
- La política de confidencialidad no está cerrada: no se debe exponer producción antes de resolver T-08.
- La seguridad del objeto referenciado por `storage_uri` pertenece al sistema de almacenamiento.
- No existe lockfile validado todavía; el gate de supply chain permanece abierto.

## 7. Revisión

Revisar este documento cuando cambien:

- proveedor JWT o claims;
- estados de confidencialidad;
- topología de despliegue;
- incorporación de workers, cache o integraciones;
- modelo de datos o endpoints de escritura;
- RPO/RTO y estrategia de backup.
