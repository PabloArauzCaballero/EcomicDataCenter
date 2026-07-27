# Almacén durable de evidencia: contrato genérico y adaptador de GitHub Pages

La tarea diaria de ChatGPT (ver [chatgpt-daily-economic-research.md](./chatgpt-daily-economic-research.md))
registra un artefacto de procedencia por cada página analizada. El backend exige un `storageUri`
que apunte a una **copia durable** de la evidencia. Este documento define primero el contrato de
almacenamiento independiente de proveedor y después un adaptador concreto sobre GitHub Pages, con su
paso a paso.

El backend solo valida que `storageUri` sea una cadena de 1 a 4000 caracteres; no verifica el host
ni la durabilidad. La durabilidad es una garantía **operativa**: la produce el almacén que configures
y la confirma la tarea antes de registrar el artefacto.

## Contrato de almacenamiento (cualquier proveedor)

Cualquier host que sirva objetos inmutables detrás de una URL pública HTTPS cumple el contrato:
Amazon S3, Google Cloud Storage, Cloudflare R2, Azure Blob (static website), Netlify, GitHub Pages,
etc. El adaptador cambia solo en cómo se sube el objeto; el resto es idéntico.

### Variables

| Variable | Uso |
|---|---|
| `ECONOMIC_STORAGE_BASE_URL` | Base pública del almacén, sin barra final. Ej.: `https://<owner>.github.io/<repo>` |
| `ECONOMIC_STORAGE_TOKEN` | Credencial de escritura del almacén, si el proveedor la requiere |

### Clave de objeto direccionada por contenido

La ruta del objeto se deriva del SHA-256 (minúsculas, 64 hex) del contenido efectivamente analizado:

```
evidence/{ab}/{cd}/{sha256}.{ext}
```

- `ab` = primeros dos caracteres del sha256; `cd` = los dos siguientes (particionado que evita
  directorios con demasiados archivos).
- `ext` deriva del `mimeType`: `html`, `pdf`, `json`, `txt`.
- `storageUri = ${ECONOMIC_STORAGE_BASE_URL}/evidence/{ab}/{cd}/{sha256}.{ext}`.

Direccionar por contenido hace la copia **inmutable e idempotente**: el mismo contenido produce
siempre la misma ruta, así que reejecutar la tarea no duplica objetos ni pisa evidencia previa. El
mismo sha256 también permite que el backend deduplique el artefacto (respuesta `EXISTING`).

### Ciclo por evidencia

1. Calcula el sha256 sobre los bytes exactos analizados.
2. Construye la clave y `storageUri`.
3. Si el objeto ya existe en el almacén, reutilízalo (no vuelvas a subir).
4. Si no existe, sube los bytes exactos con el método del proveedor (ver adaptador).
5. Confirma durabilidad antes de registrar el artefacto: un `GET` público a `storageUri` responde
   `200`, o el API del almacén confirma la escritura.
6. Registra el artefacto con `POST /api/v1/provenance/artifacts` usando ese `storageUri`.
7. Si la copia no se puede confirmar, excluye el hallazgo y repórtalo como bloqueo. Nunca inventes
   una ruta.

### Qué se puede almacenar

Solo evidencia **pública**: páginas ya publicadas por fuentes identificables. No almacenes contenido
sensible, privado, con licencia restrictiva de redistribución, ni secretos. Un almacén público como
GitHub Pages expone todo lo que subes; si alguna fuente no admite copia pública, usa un almacén
privado con URL firmada o repórtala como bloqueo.

---

## Adaptador de GitHub Pages

GitHub Pages sirve, gratis y de forma durable, los archivos de un repositorio bajo
`https://<owner>.github.io/<repo>/<ruta>`. La subida se hace con la **Contents API** de GitHub, que
confirma la escritura de inmediato (sin esperar el build de Pages).

Usa un **repositorio dedicado** solo para evidencia. No es el repositorio de código
`EcomicDataCenter`: la regla de no modificar el repo durante una ejecución se refiere al código y la
documentación del proyecto, no a este almacén separado.

### Requisitos previos

- Una cuenta u organización de GitHub.
- Permiso para crear un repositorio público y un token de acceso de grano fino.

### Paso 1 — Crear el repositorio de evidencia

1. Crea un repositorio **público** nuevo, por ejemplo `economic-evidence-store`.
2. Inicialízalo con un `README.md` (así existe la rama por defecto `main`).
3. Añade un archivo `index.html` mínimo en la raíz para tener una página de aterrizaje neutra, por
   ejemplo con el texto «Copias de evidencia del Observatorio Económico. Contenido público».

### Paso 2 — Habilitar GitHub Pages

1. En el repositorio: **Settings → Pages**.
2. En **Build and deployment → Source**, elige **Deploy from a branch**.
3. Selecciona rama `main` y carpeta `/ (root)`. Guarda.
4. Espera a que GitHub muestre la URL publicada. La base será
   `https://<owner>.github.io/economic-evidence-store`.
5. Ese valor, sin barra final, es tu `ECONOMIC_STORAGE_BASE_URL`.

### Paso 3 — Crear el token de escritura (grano fino)

1. En GitHub: **Settings → Developer settings → Personal access tokens → Fine-grained tokens →
   Generate new token**.
2. **Resource owner**: la cuenta u organización dueña del repositorio.
3. **Repository access → Only select repositories**: elige únicamente `economic-evidence-store`.
4. **Permissions → Repository permissions → Contents**: **Read and write**. No concedas ningún otro
   permiso.
5. Fija una expiración corta y una rotación periódica.
6. Guarda el valor como `ECONOMIC_STORAGE_TOKEN` en el secreto/configuración de la tarea. Nunca lo
   escribas en este archivo, en el chat, en URLs ni en logs.

### Paso 4 — Configurar la tarea

En la configuración de la tarea programada de ChatGPT, define:

- `ECONOMIC_STORAGE_BASE_URL` = `https://<owner>.github.io/economic-evidence-store`
- `ECONOMIC_STORAGE_TOKEN` = el token del Paso 3

### Paso 5 — Subir una copia (Contents API)

Para la clave `evidence/{ab}/{cd}/{sha256}.{ext}`, la tarea envía el contenido en base64:

```
PUT https://api.github.com/repos/<owner>/economic-evidence-store/contents/evidence/{ab}/{cd}/{sha256}.{ext}
Authorization: Bearer $ECONOMIC_STORAGE_TOKEN
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28
Content-Type: application/json

{
  "message": "evidence {sha256}",
  "content": "<contenido-en-base64>",
  "branch": "main"
}
```

- Respuesta `201 Created`: la copia quedó escrita.
- Respuesta `422` porque el archivo ya existe: es aceptable; la ruta está direccionada por contenido,
  así que el objeto existente es idéntico. Reutilízalo.

### Paso 6 — Confirmar durabilidad

Comprueba la existencia con la Contents API (respuesta inmediata, sin esperar el build de Pages):

```
GET https://api.github.com/repos/<owner>/economic-evidence-store/contents/evidence/{ab}/{cd}/{sha256}.{ext}
Authorization: Bearer $ECONOMIC_STORAGE_TOKEN
Accept: application/vnd.github+json
```

- `200`: el objeto existe. Registra el artefacto con
  `storageUri = ${ECONOMIC_STORAGE_BASE_URL}/evidence/{ab}/{cd}/{sha256}.{ext}`.
- `404`: la subida no se completó. Reintenta la subida; si sigue fallando, excluye el hallazgo y
  repórtalo como bloqueo.

La URL de Pages queda navegable poco después del build (suele tardar hasta uno o dos minutos). La
confirmación de durabilidad se basa en la Contents API, no en que Pages ya haya publicado.

### Verificación manual

Con el token exportado en `ECONOMIC_STORAGE_TOKEN`, sube un objeto de prueba y confírmalo:

```bash
printf 'prueba' | base64                      # obtén el base64 del contenido
curl -X PUT \
  -H "Authorization: Bearer $ECONOMIC_STORAGE_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/<owner>/economic-evidence-store/contents/evidence/te/st/test.txt \
  -d '{"message":"prueba","content":"cHJ1ZWJh","branch":"main"}'

curl -I https://<owner>.github.io/economic-evidence-store/evidence/te/st/test.txt
```

El segundo comando debe responder `200` una vez que Pages haya publicado. Borra el objeto de prueba
al terminar.

## Limitaciones y consideraciones

- **Visibilidad pública**: todo lo subido es accesible por cualquiera. Solo evidencia pública.
- **Límites de GitHub Pages**: sitio de hasta ~1 GB, ~100 GB de ancho de banda al mes y un número
  acotado de builds por hora. Para evitar builds excesivos, agrupa subidas cuando sea posible; la
  Contents API confirma la escritura aunque el build aún no haya corrido.
- **Retención**: define una política (por ejemplo, mantener N meses) y elimínala con un proceso
  operado por una persona, nunca desde la ejecución diaria.
- **Rotación de credenciales**: rota `ECONOMIC_STORAGE_TOKEN` periódicamente y ante cualquier
  sospecha de exposición.
- **No sensible**: no uses este adaptador para material con licencia de no redistribución ni datos
  personales.

## Migrar a otro proveedor

El contrato no cambia: solo se sustituyen el método de subida y la base pública.

- **S3 / R2 / GCS**: `ECONOMIC_STORAGE_BASE_URL` = la URL pública del bucket o su dominio CDN;
  subida con `PUT` firmado del proveedor; confirmación con `HEAD`/`GET` del objeto.
- **Netlify / host estático**: `ECONOMIC_STORAGE_BASE_URL` = el dominio del sitio; subida por el
  mecanismo de despliegue del proveedor.

La clave `evidence/{ab}/{cd}/{sha256}.{ext}`, la confirmación previa al registro y la política de
bloqueo se mantienen idénticas, de modo que cambiar de proveedor no altera el prompt de la tarea.
