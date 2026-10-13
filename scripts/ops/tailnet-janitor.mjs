#!/usr/bin/env node
// Borra de la tailnet los nodos muertos que dejan los runners de GitHub, y
// falla si la tailnet se acerca a su tope de dispositivos.
//
// Por que existe: cada trabajo de Actions que entra a la tailnet registra un
// nodo `github-*`. Con una clave no efimera ese nodo queda para siempre. El
// 2026-09-25 se juntaron 991 y Tailscale empezo a rechazar nodos nuevos con
// «node quota reached on this tailnet»: el recolector y el despliegue dejaron
// de llegar a pablo-h310 durante dias, y el paso de Tailscale salia en verde.
//
// Credenciales (una de las dos):
//   TS_API_CLIENT_ID + TS_API_CLIENT_SECRET  cliente OAuth con `devices:core` de escritura (no caduca)
//   TS_API_KEY                               token de acceso de la API (caduca a los 90 dias como mucho)
//
// Opciones:
//   TS_JANITOR_MIN_AGE_MINUTES  antiguedad minima para borrar un nodo desconectado (60)
//   TS_JANITOR_ALERT_AT         dispositivos a partir de los cuales se falla (800; el tope es 1000)
//   TS_JANITOR_DRY_RUN=1        solo contar, no borrar
//   TS_JANITOR_OPTIONAL=1       sin credenciales, avisar y salir en 0 en lugar de fallar

const API = 'https://api.tailscale.com/api/v2';
const RUNNER_PREFIX = 'github-';

const minAgeMinutes = Number(process.env.TS_JANITOR_MIN_AGE_MINUTES ?? 60);
const alertAt = Number(process.env.TS_JANITOR_ALERT_AT ?? 800);
const dryRun = process.env.TS_JANITOR_DRY_RUN === '1';
const optional = process.env.TS_JANITOR_OPTIONAL === '1';

// Anotaciones de Actions: se ven en el resumen del run, no solo en el log.
const annotate = (level, message) =>
  console.log(process.env.GITHUB_ACTIONS ? `::${level}::${message}` : `[${level}] ${message}`);

async function accessToken() {
  const clientId = process.env.TS_API_CLIENT_ID;
  const clientSecret = process.env.TS_API_CLIENT_SECRET;
  if (clientId && clientSecret) {
    const response = await fetch(`${API}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      }),
    });
    if (!response.ok)
      throw new Error(
        `Tailscale rechazo el cliente OAuth: ${response.status} ${await response.text()}`,
      );
    return (await response.json()).access_token;
  }
  return process.env.TS_API_KEY || null;
}

async function api(token, method, path) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok)
    throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json().catch(() => null);
}

async function main() {
  const token = await accessToken();
  if (!token) {
    const message =
      'Faltan TS_API_CLIENT_ID/TS_API_CLIENT_SECRET (o TS_API_KEY): no se pueden limpiar los nodos muertos de CI. ' +
      'Sin esto la tailnet vuelve a llenarse y la ingesta deja de llegar a pablo-h310.';
    annotate(optional ? 'warning' : 'error', message);
    process.exit(optional ? 0 : 1);
  }

  const { devices } = await api(token, 'GET', '/tailnet/-/devices?fields=all');
  const cutoff = Date.now() - minAgeMinutes * 60_000;
  const dead = devices.filter(
    (device) =>
      device.hostname?.startsWith(RUNNER_PREFIX) &&
      !device.connectedToControl &&
      Date.parse(device.lastSeen ?? 0) < cutoff,
  );

  console.log(`dispositivos en la tailnet: ${devices.length}`);
  console.log(`nodos de runner muertos (> ${minAgeMinutes} min sin conexion): ${dead.length}`);

  let removed = 0;
  const failures = [];
  if (!dryRun) {
    for (const device of dead) {
      try {
        await api(token, 'DELETE', `/device/${device.nodeId ?? device.id}`);
        removed += 1;
      } catch (error) {
        failures.push(`${device.hostname}: ${error.message}`);
      }
    }
  }
  const remaining = devices.length - removed;
  console.log(
    `${dryRun ? 'se borrarian' : 'borrados'}: ${dryRun ? dead.length : removed}; quedan: ${remaining}`,
  );

  if (failures.length) {
    annotate('error', `No se pudieron borrar ${failures.length} nodos. Primero: ${failures[0]}`);
  }
  if (remaining >= alertAt) {
    annotate(
      'error',
      `La tailnet tiene ${remaining} dispositivos (aviso en ${alertAt}, tope 1000). ` +
        'Al llegar al tope ningun runner puede entrar y la ingesta se corta.',
    );
  }
  if (failures.length || remaining >= alertAt) process.exit(1);
}

main().catch((error) => {
  annotate('error', `tailnet-janitor: ${error.message}`);
  process.exit(1);
});
