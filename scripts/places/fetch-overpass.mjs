/**
 * Queries the OpenStreetMap Overpass API for one Bolivian department at a
 * time, with retries.
 *
 * The public Overpass mirrors are shared infrastructure, not a service this
 * project pays for, and they are measurably unstable: a live check the same
 * day this script was written saw 2 of 3 requests fail with a dispatcher
 * timeout. Splitting by department keeps each request's payload and runtime
 * small enough to survive that instability, and alternating between two
 * independent mirrors means one mirror's outage does not stop the run.
 */

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const USER_AGENT = 'ObservatorioEconomico-research/1.0 (contacto: pabliarca@gmail.com)';

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** The Overpass QL that lists every node this project can classify, tagged. */
function queryFor(isoDepartment, classifyingKeys, timeoutSeconds) {
  const filters = classifyingKeys.map((key) => `node["${key}"](area.dept);`).join('\n  ');
  return `[out:json][timeout:${timeoutSeconds}];
area["ISO3166-2"="${isoDepartment}"]->.dept;
(
  ${filters}
);
out body;`;
}

/**
 * One department's nodes, or throws after exhausting every endpoint and
 * retry — a caller decides whether to skip the department or stop the run.
 */
export async function fetchDepartmentNodes(
  isoDepartment,
  classifyingKeys,
  { attemptsPerEndpoint = 2, timeoutSeconds = 100, retryDelayMs = 20000 } = {},
) {
  const data = queryFor(isoDepartment, classifyingKeys, timeoutSeconds);
  let lastError = null;
  for (const endpoint of ENDPOINTS) {
    for (let attempt = 0; attempt < attemptsPerEndpoint; attempt += 1) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), (timeoutSeconds + 15) * 1000);
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'user-agent': USER_AGENT,
          },
          body: `data=${encodeURIComponent(data)}`,
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!response.ok) throw new Error(`${endpoint} respondio ${response.status}`);
        const body = await response.json();
        return { elements: body.elements ?? [], generatedAt: body.osm3s?.timestamp_osm_base ?? null };
      } catch (error) {
        lastError = error;
        process.stderr.write(
          `  ${isoDepartment}: intento fallido en ${endpoint} (${error.message}); pausa ${retryDelayMs / 1000}s\n`,
        );
        await sleep(retryDelayMs);
      }
    }
  }
  throw new Error(`${isoDepartment}: agotados los reintentos en ambos servidores (${lastError?.message})`);
}
