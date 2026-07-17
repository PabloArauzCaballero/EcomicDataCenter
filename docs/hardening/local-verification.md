# Verificación local de la rama HARDENING

Esta guía cubre dos modos soportados. El modo Docker completo es el recomendado porque reproduce NGINX, migraciones, API y PostgreSQL con la topología endurecida.

## Requisitos

- Node.js `22.16.x` recomendado, o una versión admitida por `package.json`.
- Corepack y Yarn `1.22.22`.
- Docker Engine con Docker Compose v2.
- Puertos libres: `8080` para el stack completo; `3000` y `5432` para ejecución del API en host.

## Opción A: stack completo con Docker

### 1. Crear configuración local coherente

```bash
corepack enable
yarn local:env
```

El generador crea contraseñas aleatorias y mantiene sincronizados los passwords de PostgreSQL con las URLs de conexión. No sobrescribe un `.env` existente. Para reemplazarlo de forma intencional:

```bash
node scripts/create-local-env.cjs --force
```

### 2. Instalar dependencias con lockfile

```bash
yarn install --frozen-lockfile
```

### 3. Construir e iniciar

```bash
yarn local:up
```

El servicio `migrate` debe terminar con código cero antes de que el API arranque.

### 4. Verificar salud y smoke tests

```bash
yarn local:verify
```

El verificador espera liveness y readiness, después ejecuta `yarn smoke` y conserva el resultado en `artifacts/smoke/smoke-results.json`.

Puntos de acceso:

- API: `http://localhost:8080/api/v1`
- Health: `http://localhost:8080/health`
- Readiness: `http://localhost:8080/ready`
- Swagger local: `http://localhost:8080/docs`

### 5. Diagnóstico y apagado

```bash
yarn local:logs
yarn local:down
```

## Opción B: PostgreSQL en Docker y API en el host

Este modo facilita depuración con `tsx watch`.

### 1. Crear configuración para runtime en host

```bash
yarn local:env:host
```

Para reemplazar una configuración existente:

```bash
node scripts/create-local-env.cjs --host --force
```

### 2. Iniciar únicamente PostgreSQL con puerto local

```bash
yarn local:db:up
```

El override `docker-compose.local.yml` publica PostgreSQL solo en `127.0.0.1`, no en todas las interfaces.

### 3. Preparar la base de datos

```bash
yarn db:migrate
yarn db:verify:privileges
yarn db:seed:boot
yarn db:seed:mock
```

### 4. Iniciar y verificar el API

Terminal 1:

```bash
yarn dev
```

Terminal 2:

```bash
yarn local:verify
```

### 5. Apagar PostgreSQL

```bash
yarn local:db:down
```

## Gate de calidad local

Antes de solicitar revisión:

```bash
yarn format:check
yarn lint
yarn typecheck
yarn quality:all
yarn test
yarn build
```

Para ejecutar el gate completo, incluida auditoría de dependencias y validaciones Docker/PostgreSQL:

```bash
yarn release:verify
```

## Reinicio destructivo de datos locales

El siguiente comando elimina el volumen local de PostgreSQL. Úselo solamente cuando quiera reconstruir la base desde cero:

```bash
docker compose down --volumes
```

En modo API host:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml down --volumes
```

Después, genere o conserve el `.env`, inicie nuevamente PostgreSQL y repita migraciones y seeds.

## Fallos frecuentes

- **`password authentication failed`**: las URLs y passwords no coinciden. Regenere `.env` con el script en vez de editar solo una variable.
- **`ENOTFOUND postgres` al usar `yarn dev`**: se generó configuración Docker para un proceso ejecutado en host. Use `yarn local:env:host`.
- **Readiness 503**: revise `yarn local:logs`; normalmente indica migración fallida o conexión reader/writer no disponible.
- **Puerto 5432 ocupado**: cambie `POSTGRES_HOST_PORT` en `.env` y ajuste las tres URLs de base de datos al mismo puerto antes de iniciar el modo host.
- **Swagger no disponible**: confirme `SWAGGER_ENABLED=true`; esta opción está permitida solo fuera de producción.
