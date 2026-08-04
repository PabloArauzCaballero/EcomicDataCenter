# Runbook: backend en Render para el colector de ChatGPT con clave compartida

Deja el backend accesible para un colector alojado que solo conoce la URL pública y una contraseña.
Aplica la decisión del [ADR-0016](../decisions/0016-hosted-collector-key.md); léelo antes de ejecutar
este procedimiento, porque la credencial es un secreto único de larga vida sin caducidad.

## 1. Generar la clave del colector

```bash
openssl rand -base64 48
```

Guarda el resultado en tu gestor de contraseñas. Es el **único** valor que entregarás al agente
además de la URL, y el único que puede volver a emitirse: no se deriva de nada ni se recupera del
servidor. Mínimo aceptado por la validación de configuración: 32 caracteres.

**No la escribas en el repositorio, en un ticket ni en el propio documento del agente.**

## 2. Variables de entorno del servicio

Obligatorias, sin valor por defecto: el proceso no arranca sin ellas.

| Variable | Valor | Motivo |
|---|---|---|
| `DATABASE_WRITER_URL` | cadena del rol writer | `src/config/environment.ts` la exige |
| `DATABASE_READER_URL` | cadena del rol reader | pool de lectura aislado (ADR-0004) |
| `DATABASE_MIGRATOR_URL` | cadena del rol migrator | obligatoria con `NODE_ENV=production` |
| `DATABASE_SSL` | `true` | Neon y el PostgreSQL gestionado de Render exigen TLS |

Específicas de Render:

| Variable | Valor | Motivo |
|---|---|---|
| `APP_HOST` | `0.0.0.0` | el valor por defecto `127.0.0.1` deja el proceso inalcanzable |
| `TRUST_PROXY` | `true` | Render termina TLS en un proxy delante del proceso |

**No configures `APP_PORT` en Render.** El proceso escucha en la variable `PORT` que inyecta la
plataforma, y esta tiene precedencia sobre `APP_PORT`. Fijar `APP_PORT` a un valor distinto del que
Render asigna provoca el ciclo `Detected a new open port` → `Restarting deploy to update network
configuration` → `Timed Out`: la plataforma enruta hacia su puerto y el proceso escucha en otro.

Modo de operación:

| Variable | Valor | Motivo |
|---|---|---|
| `NODE_ENV` | `production` | activa las validaciones duras de configuración |
| `AUTH_MODE` | `agent_key` | un solo colector autenticado por clave compartida (ADR-0016) |
| `AGENT_INGESTION_KEY` | la clave del paso 1 | márcala como secreta en el panel de Render |
| `SWAGGER_ENABLED` | `false` | obligatorio en producción |
| `METRICS_ENABLED` | `false` | si lo activas, `METRICS_SCRAPE_TOKEN` de ≥24 caracteres pasa a ser obligatorio |

Si habilitas `agent_key` sin `AGENT_INGESTION_KEY`, o con una clave de menos de 32 caracteres, **el
proceso falla al arrancar**. Es deliberado: nunca degrada a acceso abierto.

`CORS_ORIGINS` se deja vacío: ChatGPT llama servidor a servidor, no envía cabecera `Origin` y CORS
no interviene. Solo hace falta si algún día un navegador consume la API.

## 2.1 Configuración del servicio en Render

| Campo | Valor |
|---|---|
| Build Command | `yarn install --frozen-lockfile && yarn build` |
| Start Command | `node dist/main.js` |
| Health Check Path | `/health` |

Tres detalles que rompen el despliegue si se equivocan:

- **`/health`, no `/api/v1/health`.** `main.ts` excluye `health`, `ready` y `metrics` del prefijo
  global, de modo que viven en la raíz. Los logs de arranque lo confirman: `Mapped {/health, GET}`.
  Un health check apuntado al prefijo devuelve `404` y Render marca el servicio como caído.
- **`&&`, no `;`.** Con `;` el build se ejecuta aunque `yarn install` haya fallado, y se despliega un
  `dist` obsoleto sin que nada avise.
- **`node dist/main.js`, no `yarn start`.** Yarn 1 no propaga `SIGTERM` a su proceso hijo de forma
  fiable, así que el apagado controlado (`enableShutdownHooks`, cierre de pools) no llegaría a
  ejecutarse al redesplegar.

## 3. Preparar la base de datos

El agente necesita tres filas sembradas —organización, fuente y el colector `CHATGPT_DAILY_MACRO`—
además de los catálogos de dominios y geografía. Las siembra `boot/agent-bootstrap.json`.

```bash
yarn db:migrate
yarn db:seed:boot
```

Ambos comandos son idempotentes y toman las `DATABASE_*_URL` del entorno. Ejecutados desde una
estación de trabajo apuntan a la base remota configurada en `.env`: **verifica el destino antes de
lanzarlos**. Como alternativa, anteponerlos al comando de arranque de Render los ejecuta en cada
despliegue:

```
node dist/database/cli/migrate.js && node dist/database/seeds/runners/run-boot-seeds.js && node dist/main.js
```

## 4. Verificación

```bash
BASE_URL=https://<servicio>.onrender.com
KEY='<la clave del paso 1>'

curl -sS "$BASE_URL/health"
curl -sS "$BASE_URL/ready"
```

La puerta está cerrada — sin clave y con clave equivocada debe responder **401**:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$BASE_URL/api/v1/intelligence/daily-analysis" \
  -H 'Content-Type: application/json' -d '{}'
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$BASE_URL/api/v1/intelligence/daily-analysis" \
  -H 'Authorization: Bearer clave-incorrecta-de-relleno-para-la-prueba' \
  -H 'Content-Type: application/json' -d '{}'
```

La puerta abre con la clave correcta — debe responder **400**:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$BASE_URL/api/v1/intelligence/daily-analysis" \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d '{}'
```

`400` es el resultado correcto: el cuerpo vacío no valida, pero llegar al validador demuestra que la
autenticación y el rol pasaron. Un `401` aquí significa que la clave del servicio no coincide con la
que enviaste; un `403`, que el rol sintético no se aplicó.

La frontera sigue cerrada incluso **con** la clave — estos deben responder **403**:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$BASE_URL/api/v1/intelligence/agents" \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d '{}'
curl -sS -o /dev/null -w '%{http_code}\n' "$BASE_URL/api/v1/intelligence/dead-letters" \
  -H "Authorization: Bearer $KEY"
```

## 5. Rotar la clave

1. Genera una nueva con el paso 1.
2. Cámbiala en las variables de entorno de Render y espera al redespliegue.
3. Actualiza la credencial en el panel de acciones del agente de ChatGPT.

No hay ventana de solapamiento: el backend acepta una sola clave, de modo que entre los pasos 2 y 3
el agente recibirá `401`. Programa la rotación fuera de su horario de ejecución. Rota de inmediato si
la clave apareció en un log, una captura de pantalla o un canal compartido.

## 6. Límites conocidos

- La credencial no caduca y no admite revocación selectiva. Quien la obtenga puede enviar
  afirmaciones hasta que se rote; lo enviado entra como evidencia sujeta a revisión, nunca como dato
  estadístico oficial. Vigila `recordsReceived` y la cola `PENDING_REVIEW`.
- La auditoría atribuye toda la ingesta al mismo sujeto, `hosted-collector`: este modo sirve a un
  único colector.
- En el plan gratuito Render suspende el servicio por inactividad; el primer reintento del agente
  puede agotar el timeout de 30 s antes de que el proceso despierte.
- Para pasar al modo con proveedor de identidad no hace falta tocar código: fija `AUTH_MODE=jwks` con
  `AUTH_JWKS_URI`, `AUTH_ISSUER` y `AUTH_AUDIENCE`, y emite al agente un token con rol
  `INGESTION_AGENT` y el claim de organización `92000000-0000-4000-8000-000000000001`.
