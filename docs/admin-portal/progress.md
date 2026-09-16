# Avance del portal administrativo

Registro por fase. Cada fila dice qué se hizo, con qué evidencia **ejecutada** y
qué quedó fuera. Lo no ejecutado se marca como no ejecutado; no se declara
probado nada por el hecho de que compile.

Fecha del registro: 2026-09-16. Base de pruebas: PostgreSQL 17 en Docker
(`obs-admin-portal-pg`, puerto 55450), con tres bases separadas —
`observatory_it` (integración), `economic_observatory` (extremo a extremo) y
`observatory_clean` (migración desde cero).

## Fase 0 — Inspección

Inventario del núcleo y del tablero sin cambiar nada. Resultado en
[`baseline.md`](baseline.md): commits de partida, stack real, 18 puertas de
calidad, el modelo físico generado y las rutas públicas existentes.

**Hallazgo que condicionó el resto:** el modelo físico no se escribe, se genera,
y su analizador solo lee `src/database/migrations/*.ts`. Toda la SQL de la nueva
migración tuvo que vivir dentro del archivo de migración.

## Fase 1 — Registro de la operación

Migración `0075-observe-the-operation.ts`: esquema `operations` con diez tablas
(`seed_application`, `seed_run`, `source_expectation`, `ingestion_event`,
`read_model_publication`, `export_request`, `traffic_event`, `health_probe`,
`health_incident`, `alert_delivery`), las columnas de población en
`quality_lineage.quality_assessment` y los permisos mínimos por rol.

- `yarn quality:physical-model` → PASS (63 tablas, 624 campos, 103 claves
  foráneas).
- Migraciones sobre base virgen → 75 aplicadas, 4,6 s, 11 esquemas.

**Corrección de fondo incluida:** `read_models.refresh_snapshot(...)`,
`SECURITY DEFINER` con `search_path` fijo. El escritor no puede tocar
`read_models` —la 0014 se lo revoca a propósito— y el sembrador necesitaba
refrescar. Esto cierra el CI en rojo que el proyecto arrastraba desde el
2026-09-08.

## Fase 2 — Sembradores gobernados

Manifiesto de 20 paquetes con perfiles, dependencias y suma de comprobación sobre
los bytes crudos; cerrojo consultivo por (base, paquete); punto de control que
solo se amplía **después** del commit.

- `seed-lifecycle.integration-spec` y `seed-recovery.integration-spec` → 13 casos,
  todos verdes, incluidos los dos fallos inyectados (antes y después del commit).
- `SEED-01`, `SEED-07`, `SEED-08` y el foco del diálogo → verdes en navegador.

**Dos defectos propios corregidos durante la fase:** el punto de control
reclamaba una unidad que nunca hizo commit, y la reanudación heredaba el punto de
una ejecución `PARTIAL` ya completa, con lo que la reparación no hacía nada.

## Fase 3 — Ingesta, calidad y metadatos

Etapas de ingesta instrumentadas en `SubmissionService`, `ReviewService` y
`BatchImportService`, registradas **después** del commit. Siete reglas de calidad
con población declarada. Catálogo de metadatos con conteo de referencias.

- `quality-evaluation.integration-spec` → verde.
- `ingestion-stages.integration-spec` → 4 casos verdes (ING-02, ING-06, ING-08 y
  la distinción entre «sin etapas registradas» y «no pasó nada»).

**Dos reglas se reescribieron porque no podían fallar nunca:**
`CLAIM_HAS_EVIDENCE` (un disparador ya garantiza evidencia en `PUBLISHED`, así
que se acotó a `DRAFT`/`PENDING_REVIEW`) y `EVIDENCE_HAS_DIGEST` (`sha256` es
`NOT NULL`), sustituida por `EVIDENCE_HAS_PROVENANCE`.

## Fase 4 — Área privada del tablero

Sesión con cookie HttpOnly firmada por HMAC, contraseñas con scrypt y comparación
en tiempo constante, JWT RS256 acuñado por petición en el servidor, JWKS servido
por el tablero y consumido por el núcleo. Once pantallas.

- `admin-auth.spec` → 9 casos por navegador, verdes: anónimo rechazado, cookie
  manipulada rechazada, cierre de sesión efectivo, mutación sin token rechazada,
  mutación desde otro origen rechazada.
- La conexión pública de lectura **no** se tocó.

## Fase 5 — Exportaciones y telemetría

Identificador de exportación en la respuesta, techo de filas declarado en el
archivo, tres etapas registradas. Telemetría de visitas sin dirección IP, sin
cadena de consulta y con cubo de visitante que rota a diario.

- `admin-exports.spec` y `admin-traffic.spec` → verdes.
- **Defecto propio encontrado y corregido:** las etapas se registraban con una
  promesa suelta. Medido: `void` perdió 8 de 8; `after()` de Next.js perdió 2 de
  12 sin dejar aviso; con espera acotada a 2 s quedaron 14 de 14. El detalle está
  en [`decisions.md`](decisions.md) §3.
- `EXP-05` apaga el receptor (revocando el `INSERT` del escritor) y comprueba que
  el archivo llega igual y que el hueco es visible.

## Fase 6 — Disponibilidad

Sondeo externo con umbrales configurables, incidentes que abren a los tres
fallos y cierran a los dos éxitos, avisos deduplicados por clave única.

- `availability.integration-spec` → 4 casos verdes (HLT-01, HLT-02, HLT-03 y el
  registro de todo sondeo, incluido el desconocido).
- `readiness.integration-spec` → 3 casos verdes (HLT-04: un catálogo obligatorio
  sin aplicar se cuenta como faltante y nombra de qué depende; aplicado deja de
  contarse; una suma de comprobación distinta es conflicto, no «aplicado»).

## Fase 7 — Revisión visual y de accesibilidad

Cuatro anchos, zoom al 200 %, axe-core sobre cada pantalla, y las 38 capturas
abiertas y revisadas una por una.

- Diez incumplimientos serios encontrados y corregidos: contraste insuficiente en
  `--ink-faint` (3,81:1) y en los distintivos de estado, y once regiones
  desplazables sin foco de teclado.
- El estado nunca se distingue solo por color: palabra, marca y color.

## Fase 8 — Cierre

- `yarn test` → 78 suites, 613 pruebas, verde.
- `yarn quality:all` → 18 puertas, sin FAIL.
- `yarn lint`, `yarn format:check`, `yarn typecheck` → limpios.
- Migraciones sobre base virgen → 75 en 4,6 s.
- Sembradores de arranque desde cero sobre `observatory_clean` → ejecutado; ver
  [`final-report.md`](final-report.md) para el tiempo y el recuento.

## Lo que no se hizo

- **No se hizo `git push`.** `dev` despliega automáticamente y el plan exige
  autorización explícita. El trabajo queda confirmado en local.
- **No se tocó producción** ni se aplicó ninguna migración fuera de las bases
  efímeras de Docker.
- **AUTH-04** (aislamiento entre organizaciones) queda declarado como no
  comprobado en runtime: este despliegue de pruebas tiene una sola organización.
- **REG-02** (pares de versiones) queda por construcción, no por ejecución: no se
  levantó el frontend anterior contra el núcleo nuevo.
- El analizador del modelo físico sigue sin leer `migration-sql/`; la 0075 se
  adaptó a la herramienta en vez de arreglar la herramienta.
