# Cómo se prueba el portal, y contra qué

Nada de lo que sigue usa dobles para el núcleo, la base o las métricas. Si no hay
PostgreSQL, la suite de integración se salta con `describe.skip` y lo dice; no finge.

## Bases de prueba

Dos bases en un PostgreSQL 17.5 efímero, y son **dos** por una razón que costó una tarde:
la suite de integración trunca y el recorrido de extremo a extremo necesita un corpus
cargado. Compartir una sola base hacía que cada ejecución de Playwright empezara con lo
que el último `jest` hubiera dejado.

```bash
docker run -d --name obs-admin-portal-pg \
  -e POSTGRES_DB=economic_observatory -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=<propio> -e MIGRATOR_PASSWORD=<propio> \
  -e WRITER_PASSWORD=<propio> -e READER_PASSWORD=<propio> -e BACKUP_PASSWORD=<propio> \
  -p 127.0.0.1:55450:5432 \
  -v "$(pwd)/infra/postgres/init-local.sh:/docker-entrypoint-initdb.d/010-roles.sh:ro" \
  postgres:17.5-alpine
```

`init-local.sh` es el mismo que usa `docker-compose`, así que los roles de la base de
pruebas son los del diseño. **Eso es parte de la prueba**: los dos fallos de privilegios
que este trabajo corrigió solo aparecen en una base cuyos privilegios son los correctos.

Segunda base para integración:

```sql
CREATE DATABASE observatory_it OWNER observatory_migrator;
GRANT CONNECT, CREATE ON DATABASE observatory_it TO backend_migrator;
GRANT CONNECT ON DATABASE observatory_it TO backend_writer, backend_reader, backup_operator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
```

## Suites del núcleo

```bash
# Unidad: lógica pura, sin base.
yarn test

# Integración: exige INTEGRATION_DATABASE_URL y solo esa variable.
DATABASE_MIGRATOR_URL=postgresql://observatory_migrator:…@127.0.0.1:55450/observatory_it \
DATABASE_WRITER_URL=postgresql://observatory_writer:…@127.0.0.1:55450/observatory_it \
DATABASE_READER_URL=postgresql://observatory_reader:…@127.0.0.1:55450/observatory_it \
INTEGRATION_DATABASE_URL=postgresql://observatory_migrator:…@127.0.0.1:55450/observatory_it \
DATABASE_SSL=false NODE_ENV=test \
yarn test:integration
```

Antes de la primera ejecución, la base de integración necesita los catálogos:

```bash
yarn db:migrate
yarn db:seed:boot --only=bcb-quotes   # carga los catálogos base y un corpus pequeño
```

`test/integration/admin-portal/harness.ts` levanta el **módulo de aplicación entero**, no
un subconjunto escrito a mano: lo que estas pruebas comprueban es que el cableado
funciona, y un cableado escrito en la prueba puede estar de acuerdo consigo mismo mientras
la aplicación no lo está.

### Inyección de fallos

`SEED_FAULT_INJECTION` acepta `before-commit`, `after-commit` y `before-publish`, y la
validación de entorno **la prohíbe en producción**. Sin ella no hay forma de comprobar que
un fallo antes del commit no deja nada, ni que uno después deja los datos aplicados con la
publicación pendiente: son afirmaciones que necesitan que el fallo ocurra de verdad.

## Recorrido de extremo a extremo

Tres procesos, ninguno simulado:

```bash
# 1. núcleo, contra la base de extremo a extremo, con JWKS apuntando al tablero
AUTH_MODE=jwks AUTH_JWKS_URI=http://127.0.0.1:3211/api/admin/jwks \
AUTH_ISSUER=observatorio-dashboard AUTH_AUDIENCE=observatorio-economico-core \
APP_PORT=3210 node dist/main.js

# 2. tablero, con la clave privada, la lista de operadores y el secreto de sesión
CORE_API_URL=http://127.0.0.1:3210 ADMIN_JWT_PRIVATE_KEY=… ADMIN_OPERATORS=… \
ADMIN_SESSION_SECRET=… DASHBOARD_DATABASE_URL=… npx next dev -p 3211

# 3. la suite
E2E_BASE_URL=http://127.0.0.1:3211 E2E_DATABASE_URL=… \
E2E_OPERATOR_PASSWORD=… E2E_READER_PASSWORD=… npx playwright test
```

Las credenciales se generan por ejecución y viven fuera de los repositorios. Ninguna está
en el árbol.

### Qué exige cada prueba

La regla de la suite es que una acción sensible demuestre **cinco capas**, y
`tests/e2e/admin-seeds.spec.ts` es donde se ve entera:

1. una persona pulsa un control real, localizado por rol y nombre accesible;
2. sale una petición real, observada con `waitForResponse`;
3. el núcleo autoriza y valida (y un 403 se comprueba como 403);
4. la base contiene el efecto exacto —o no contiene cambios cuando se rechazó—;
5. recargar el navegador muestra el mismo estado.

Una prueba que se detiene en las dos primeras demuestra que un botón es un botón.

| Archivo | Cubre |
| --- | --- |
| `admin-auth.spec.ts` | AUTH-01 a AUTH-05: anónimo, lectora, sesión cerrada, cookie manipulada, CSRF y origen. |
| `admin-seeds.spec.ts` | SEED-01, SEED-07, SEED-08: validar, diferencia, aplicar, registro, foco y Escape. |
| `admin-exports.spec.ts` | EXP-01 a EXP-04: CSV y JSON descargados y **parseados**, 400, 503 con fallo registrado, truncamiento declarado. |
| `admin-traffic.spec.ts` | TRF-01 a TRF-03: una visita, deduplicación, y que un término de búsqueda no llegue al registro. |
| `admin-screens.spec.ts` | UI-01, UI-03, UI-04, UI-05, ING-04, ING-05, QLT-02, META-02, HLT-03, HLT-05. |
| `admin-visual.spec.ts` | UI-02 y UI-03: cuatro viewports, zoom al 200 %, axe-core y estados que no dependen del color. |

El CSV se parsea con un lector que entiende comillas y saltos de línea
(`tests/e2e/support/csv.ts`). Contar `split('\n')` habría dado por buena una exportación
rota en cuanto un titular llevara una coma.

Los fallos se inyectan por la infraestructura efímera: `EXP-03` revoca `USAGE` sobre los
esquemas al rol lector y lo devuelve en `finally`. No hay forma de activar eso desde la
aplicación.

`retries: 0` a propósito. Una prueba que pasa al segundo intento es una carrera que nadie
ha mirado, y este portal trata precisamente de distinguir «funcionó» de «pareció
funcionar».

### Lo que la suite no puede hacer sola

`EXP-03` usa el conjunto `prensa` y no `series` porque la serie diaria se guarda cinco
minutos en memoria —deliberadamente, para que una caída no se convierta en la respuesta
que da la portada— y un éxito en caché habría hecho que la prueba no afirmara nada.

`admin-seeds.spec.ts` espera a que no haya ninguna reconciliación en vuelo antes de
empezar. Una petición idéntica hecha mientras otra corre se colapsa en ella a propósito
—es la idempotencia que SEED-03 exige— y una prueba que no partiera de un registro
tranquilo estaría mirando la ejecución de la prueba anterior.

## Diagnóstico de accesibilidad

`tests/diagnostics/axe-report.spec.ts` imprime **qué elemento** falla, no solo que alguno
falla. No afirma nada: existe para que un fallo de contraste o de foco se pueda arreglar.

```bash
npx playwright test --config playwright.config.ts --project=chromium \
  --reporter=line tests/diagnostics/axe-report.spec.ts
```

(Está fuera de `testDir`, así que hay que nombrarlo.)

## Artefactos

```
observatorio-dashboard/artifacts/e2e/
  report/         informe HTML
  results.json    resultado por prueba
  screenshots/    cuatro viewports × nueve pantallas, más el zoom y la portada
  output/         trazas, vídeos y capturas de los fallos
```

Las trazas pueden contener cookies y cabeceras: se conservan con acceso restringido y no
se publican.
