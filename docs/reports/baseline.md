# Línea base de ejecución — Fase 0

**Fecha de ejecución:** 2026-08-03
**Commit HEAD:** `64b70fe` (`Merge branch 'HARDENING' into main: consolidación de hardening`)
**Árbol de trabajo:** sucio — 21 archivos modificados y 8 sin rastrear respecto de HEAD
(ver §5, «Deriva del árbol de trabajo»).
**Alcance:** ejecución real de la cadena de verificación declarada en `package.json`, sin
modificar código ni configuración. Ningún resultado de esta página es estimado.

---

## 1. Identificación del sistema

| Dimensión | Valor observado | Evidencia |
| --- | --- | --- |
| Framework HTTP | NestJS 11.1.28 sobre Fastify 5.10.0 (`@nestjs/platform-fastify`) | `package.json:74-79` |
| Lenguaje | TypeScript 5.8.3, modo estricto | `package.json:110`, `tsconfig.json` |
| Runtime | Node.js v22.23.1 (rango declarado `>=20.19 <21 \|\| >=22 <23`) | ejecución `node -v`; `package.json:8-10` |
| Gestor de paquetes | Yarn 1.22.22 (`packageManager` fijado) | ejecución `yarn -v`; `package.json:7` |
| ORM | Sequelize 6.37.8 + `sequelize-typescript` 2.1.6 | `package.json:89-90` |
| Migraciones | Umzug 3.8.2, runner propio en `src/database/migration.runner.ts` | `package.json:91` |
| Motor de datos | PostgreSQL (driver `pg` 8.16.3) | `package.json:83` |
| Validación | Zod 4.4.3 en el borde (`ZodValidationPipe`) | `package.json:93`; `src/common/validation/zod-validation.pipe.ts` |
| AuthN | JWT externo RS256 vía JWKS (`jsonwebtoken` 9.0.2, `jwks-rsa` 3.2.0) | `package.json:80-81`; ADR 0002 |
| AuthZ | RBAC default-deny por decorador `@Roles()` + `RolesGuard` | `src/common/auth/roles.guard.ts`; ADR 0012 |
| Observabilidad | Pino 9.9.5 (`nestjs-pino` 4.6.1) + Prometheus (`prom-client` 15.1.3) | `package.json:82-86` |
| Contrato HTTP | OpenAPI 3.0.3 generado por `@nestjs/swagger` 11.4.6 y exportado a YAML | `package.json:77`; `scripts/export-openapi.ts` |
| Pruebas | Jest 29.7.0 + Supertest 7.1.3, tres configuraciones (unit / integration / e2e) | `package.json:19-22` |
| Colas / mensajería | **Ninguna.** Prohibidas por ADR 0003 y verificado por el gate `quality:async-scope` | ADR 0003; `scripts/validate_async_scope.py` |
| Caché / Redis | **Ninguno.** No hay dependencia de caché en el manifiesto | `package.json:70-93` |
| Entrada de red | NGINX como front, procesos separados | ADR 0010; `docker-compose.yml` |
| Python (gates) | 3.14.2 — requerido por 12 de los 18 validadores de `quality:all` | ejecución `python --version`; `package.json:39` |

### Estructura del repositorio (código productivo)

| Área | Contenido |
| --- | --- |
| `src/modules/` | 7 módulos de dominio: `governance`, `health`, `ingestion`, `intelligence`, `provenance`, `quality`, `query` |
| `src/common/` | 11 áreas transversales: `audit`, `auth`, `errors`, `hashing`, `http`, `observability`, `persistence`, `statistical`, `validation`, más `bulk.ts` y `persistence.transaction.ts` |
| `src/database/` | 29 migraciones, 54 modelos Sequelize, seeds boot/mock, 4 CLI |
| `src/config/` | Validación de entorno (`environment.ts`) |
| `scripts/` | 33 scripts: 12 validadores Python, generadores de contrato y modelo, verificación de release |

**Integraciones externas salientes:** ninguna llamada HTTP saliente en el núcleo. La única
frontera externa de entrada es el proveedor de identidad JWKS. Los agentes de IA entregan datos
por HTTP hacia `/api/v1/intelligence/*`; el backend no los invoca.

---

## 2. Resultados de la cadena de verificación

Todos los comandos se ejecutaron desde la raíz del repositorio, en este orden.

| # | Comando | Resultado | Código de salida | Detalle |
| --- | --- | --- | --- | --- |
| 1 | `yarn install --frozen-lockfile` | **OK** | 0 | `success Already up-to-date` en 0,22 s. El lockfile es coherente con `package.json`. |
| 2 | `yarn typecheck` | **OK** | 0 | `tsc --noEmit` sin errores. |
| 3 | `yarn build` | **OK** | 0 | `nest build` sin errores. |
| 4 | `yarn lint` | **OK** | 0 | ESLint con `--max-warnings=0`, sin hallazgos. |
| 5 | `yarn format:check` | **FALLA** | 1 | Prettier reporta 1 archivo mal formateado. Ver §3.1. |
| 6 | `yarn test` | **OK** | 0 | 28 suites, 188 pruebas, 188 aprobadas, 10,1 s. |
| 7 | `yarn test:e2e` | **OK** | 0 | 1 suite, 2 pruebas, 2 aprobadas. |
| 8 | `yarn test:integration` | **NO EJECUTADO** | — | Falta `INTEGRATION_DATABASE_URL`. Ver §3.3. |
| 9 | `yarn quality:all` | **OK** | 0 | 18 validadores encadenados; salida final `VALIDATION_OK`. |
| 10 | `yarn openapi:export` | **OK** | 0 | Regenera `docs/endpoints/openapi.yaml`; `git status` posterior sin cambios ⇒ **el contrato publicado está sincronizado con el código**. |
| 11 | `yarn security:audit` | **FALLA** | 12 | 17 avisos (16 High, 1 Moderate) sobre 253 paquetes auditados. Ver §3.2. |

### Validadores cubiertos por `quality:all`

`files`, `syntax`, `naming`, `imports`, `diagrams`, `clean-code`, `architecture`,
`physical-model`, `seeds`, `persistence`, `use-cases`, `security`, `async-scope`, `operations`,
`project`, `openapi`, `routes` — 17 invocaciones que cubren los 18 validadores declarados
(`quality:syntax` agrupa dos comprobaciones). Todos aprobaron.

---

## 3. Fallos registrados

No se corrigió ninguno en esta fase: la Fase 0 establece la línea base sin alterar el sistema.
Cada fallo queda con causa, impacto y acción concreta.

### 3.1 `BLOQUEO-BASE-01` — `yarn format:check` falla

* **Causa:** el archivo `AGENTE_CHATGPT_CARGA_DIARIA.md` (30 327 bytes, raíz del repositorio, sin
  rastrear en git) no cumple el formato de Prettier y no está excluido en `.prettierignore`.
* **Impacto:** el gate de formato del pipeline falla. Bloquea cualquier CI que ejecute
  `format:check` mientras el archivo permanezca en el árbol.
* **Severidad:** `MEDIUM` — no afecta el comportamiento en ejecución, sí la puerta de calidad.
* **Acción concreta:** decidir el destino del archivo y aplicar una de dos opciones:
  ejecutar `yarn format` para normalizarlo, o añadirlo a `.prettierignore` si se considera
  material generado y no editorial. Requiere decisión del propietario del documento.
* **Validación:** `yarn format:check` con código de salida 0.

### 3.2 `BLOQUEO-BASE-02` — `yarn security:audit` falla con 16 avisos High

* **Causa:** seis avisos de seguridad únicos, propagados por 16 rutas de dependencia. Todos son
  **transitivos salvo uno** (`@fastify/static` es dependencia directa).

  | Severidad | Paquete | Versión vulnerable | Parcheado en | Aviso | CVE |
  | --- | --- | --- | --- | --- | --- |
  | High | `@fastify/static` | `<=10.1.0` | `>=10.1.1` | Route guard bypass por path traversal | CVE-2026-15074 |
  | High | `find-my-way` | `<=9.6.0` | `>=9.7.0` | DDoS con HTTP/2 | CVE-2026-47219 |
  | High | `fast-uri` | `>=3.0.0 <3.1.5` | `>=3.1.5` | Host confusion por backslash en la autoridad | CVE-2026-18446 |
  | High | `js-yaml` | `>=5.0.0 <=5.2.1` | `>=5.2.2` | Tiempo de parseo exponencial en colecciones flow | — |
  | High | `brace-expansion` | `<1.1.17` | `>=1.1.17` | DoS por expansión no acotada | CVE-2026-14257 |
  | High | `brace-expansion` | `<1.1.18` | `>=1.1.18` | DoS por arreglos intermedios no acotados | CVE-2026-69152 |

* **Rutas de propagación:** `@fastify/static` (directa, `package.json:73`); `find-my-way` vía
  `fastify` y vía `@nestjs/platform-fastify > fastify`; `fast-uri` vía
  `fastify > @fastify/ajv-compiler` y `fastify > fast-json-stringify`; `js-yaml` vía
  `@nestjs/swagger`; `brace-expansion` vía `@fastify/static > glob > minimatch` y
  `sequelize-typescript > glob > minimatch`.
* **Impacto:** la regla `.claude/rules/30-security.md` exige `security:audit` sin avisos
  high/critical antes de un release. Con este estado **no puede declararse apto para producción**.
  `@fastify/static` y `find-my-way` afectan directamente al enrutado y al servido de estáticos del
  proceso expuesto; no son solo ruido de cadena de construcción.
* **Severidad:** `BLOCKER`.
* **Acción concreta:** actualizar `@fastify/static` de `9.1.3` a `>=10.1.1` — es un salto de
  versión mayor, por lo que exige revisión de compatibilidad y, según
  `.claude/rules/70-library-selection.md`, autorización explícita. Para las transitivas
  (`find-my-way`, `fast-uri`, `js-yaml`, `brace-expansion`) aplicar `resolutions` **acotadas al
  camino vulnerable**, nunca globales, y re-verificar con `yarn install --frozen-lockfile`,
  `yarn typecheck`, `yarn test`, `yarn test:e2e`.
* **Validación:** `yarn security:audit` con código de salida 0.
* **Nota:** los CVE llevan identificadores de 2026 y son posteriores al cierre del pase de
  hardening registrado en `docs/hardening/`. Es deriva de dependencias, no una regresión de código.

### 3.3 `BLOQUEO-BASE-03` — pruebas de integración no ejecutables

* **Causa:** `yarn test:integration` requiere `INTEGRATION_DATABASE_URL`; la variable no está
  definida en `.env` ni en el entorno de esta sesión.
* **Impacto:** la capa de integración —repositorios, transacciones serializables, migraciones y
  triggers contra PostgreSQL real— queda **sin verificar** en esta línea base. Es la capa donde
  viven las garantías de idempotencia (ADR 0005) y de aislamiento (ADR 0009).
* **Severidad:** `CRITICAL` — no es un fallo del código, es una brecha de evidencia.
* **Acción concreta:** levantar PostgreSQL local con `yarn local:db:up` y ejecutar
  `INTEGRATION_DATABASE_URL=<url-local> yarn test:integration`. **No debe apuntarse a Neon:**
  las `db:*` locales resuelven contra el remoto por defecto al cargar `.env`, y ejecutar pruebas
  de integración contra la base remota es una operación no autorizada.
* **Validación:** `yarn test:integration` con código de salida 0 y conteo de suites registrado.

---

## 4. Riesgos iniciales identificados

| ID | Riesgo | Origen | Severidad | Consecuencia si no se trata |
| --- | --- | --- | --- | --- |
| `RB-01` | Avisos de seguridad High sin resolver en dependencias de enrutado y estáticos | §3.2 | `BLOCKER` | Impide declarar preparación productiva; superficie de bypass de guardas y DDoS |
| `RB-02` | Capa de integración sin evidencia ejecutada | §3.3 | `CRITICAL` | Las garantías de idempotencia y aislamiento transaccional quedan afirmadas pero no demostradas |
| `RB-03` | El grafo de Graphify se construyó en `64b70fe8`, pero el árbol tiene 29 archivos con deriva | §5 | `HIGH` | Todo análisis basado en el grafo omite 5 archivos productivos nuevos; ver informe de auditoría Graphify |
| `RB-04` | Gate de formato en rojo por un documento sin rastrear en la raíz | §3.1 | `MEDIUM` | CI en rojo permanente; ruido que enmascara fallos reales |
| `RB-05` | Un único `server` declarado en el contrato OpenAPI, apuntando a `http://localhost:8080` | `docs/endpoints/openapi.yaml` | `MEDIUM` | Los integradores no tienen URL de destino real; el contrato no describe ambientes |
| `RB-06` | 12 de 18 validadores de calidad dependen de Python 3 fuera del gestor de paquetes | `package.json:31-53` | `MEDIUM` | La reproducibilidad del gate depende de un intérprete no declarado en `engines` ni fijado por versión |

---

## 5. Deriva del árbol de trabajo

El árbol no está limpio respecto de `64b70fe`. Esto importa porque el grafo de Graphify y varios
informes previos se construyeron sobre el commit, no sobre el árbol.

* **21 archivos modificados**, concentrados en `src/common/` (auth, errors, validation) y
  `src/modules/` (ingestion, intelligence, query), más los artefactos regenerados de
  `graphify-out/`.
* **8 rutas sin rastrear**, de las cuales **5 son código productivo o de prueba**:
  `src/common/auth/organization-scope.ts`, `src/common/validation/zod-issue.ts`,
  `src/modules/intelligence/agent-run-query.repository.ts`,
  `src/common/errors/tests/http-exception.filter.spec.ts`,
  `src/common/validation/tests/zod-validation.pipe.spec.ts`.

Las 188 pruebas unitarias, el `typecheck`, el `build`, el `lint` y `quality:all` de esta línea
base se ejecutaron **sobre el árbol de trabajo**, es decir, incluyendo esos cambios. La línea base
describe el árbol actual, no el commit.

---

## 6. Criterio de salida de la Fase 0

| Criterio | Estado | Sustento |
| --- | --- | --- |
| Repositorio instalable | **Cumplido** | `yarn install --frozen-lockfile` en 0,22 s, sin desviación del lockfile |
| Repositorio evaluado | **Cumplido** | 11 comandos ejecutados; 8 OK, 2 en fallo, 1 no ejecutable, todos registrados |
| Estado actual registrado | **Cumplido** | §2 y §3 de esta página |
| Comandos reales documentados | **Cumplido** | Todos los comandos provienen de `package.json`; ninguno inventado |
| Riesgos iniciales identificados | **Cumplido** | §4, seis riesgos clasificados |

**Fase 0 cerrada con tres fallos registrados y no ocultados** (`BLOQUEO-BASE-01`,
`BLOQUEO-BASE-02`, `BLOQUEO-BASE-03`). Ninguno se corrigió en esta fase por diseño; dos de ellos
(`-02` y `-03`) requieren autorización o infraestructura fuera del alcance de un cambio documental.

---

## 7. Evidencia

Registros completos de ejecución conservados durante la sesión:

| Archivo de registro | Comandos cubiertos |
| --- | --- |
| `baseline-install.log` | versiones de runtime, `yarn install --frozen-lockfile` |
| `baseline-static.log` | `typecheck`, `build`, `lint`, `format:check` |
| `baseline-test.log` | `test` (unitarias) |
| `baseline-e2e.log` | `test:e2e`, `security:audit` |
| `baseline-quality.log` | `quality:all` |
| `baseline-openapi.log` | `openapi:export` y verificación de diferencia posterior |

> Los registros residen en el directorio temporal de la sesión y no están versionados. Las cifras
> y códigos de salida transcritos en §2 y §3 son su contenido literal. Para conservar evidencia
> firmada a largo plazo, el procedimiento del repositorio es `docs/runbooks/evidence/` con hash
> SHA-256 adjunto, como en `restore-drill-2026-07-20.md.sha256`.
