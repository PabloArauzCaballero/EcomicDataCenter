const { spawnSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');

function readEnvironmentFile() {
  const environmentPath = resolve(process.cwd(), '.env');
  if (!existsSync(environmentPath)) return {};

  return Object.fromEntries(
    readFileSync(environmentPath, 'utf8')
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separatorIndex = line.indexOf('=');
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      }),
  );
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function wait(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function requestStatus(baseUrl, path) {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      signal: AbortSignal.timeout(5000),
    });
    const body = await response.text();
    return {
      ok: response.ok,
      statusCode: response.status,
      detail: body.slice(0, 300),
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: 0,
      detail: error instanceof Error ? error.message : 'Network error',
    };
  }
}

async function waitUntilReady(baseUrl, timeoutMilliseconds) {
  const deadline = Date.now() + timeoutMilliseconds;
  let lastHealth;
  let lastReadiness;

  while (Date.now() < deadline) {
    lastHealth = await requestStatus(baseUrl, '/health');
    lastReadiness = await requestStatus(baseUrl, '/ready');

    if (lastHealth.ok && lastReadiness.ok) return;

    process.stdout.write(
      `Waiting for local stack: health=${lastHealth.statusCode}, ready=${lastReadiness.statusCode}\n`,
    );
    await wait(2000);
  }

  throw new Error(
    `Local stack did not become ready. Last health=${JSON.stringify(lastHealth)}; last readiness=${JSON.stringify(lastReadiness)}`,
  );
}

function runSmokeChecks(baseUrl) {
  const yarnCommand = process.platform === 'win32' ? 'yarn.cmd' : 'yarn';
  const result = spawnSync(yarnCommand, ['smoke'], {
    env: { ...process.env, SMOKE_BASE_URL: baseUrl },
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Smoke checks failed with exit code ${result.status ?? 'unknown'}`);
  }
}

async function main() {
  const fileEnvironment = readEnvironmentFile();
  const baseUrl =
    process.env.SMOKE_BASE_URL ?? fileEnvironment.SMOKE_BASE_URL ?? 'http://127.0.0.1:8080';
  const timeoutMilliseconds = parsePositiveInteger(
    process.env.LOCAL_STARTUP_TIMEOUT_MS ?? fileEnvironment.LOCAL_STARTUP_TIMEOUT_MS,
    180000,
  );

  process.stdout.write(`Verifying local stack at ${baseUrl}\n`);
  await waitUntilReady(baseUrl, timeoutMilliseconds);
  runSmokeChecks(baseUrl);
  process.stdout.write('Local stack verification passed.\n');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Local verification failed'}\n`);
  process.stderr.write('Inspect the services with: yarn local:logs\n');
  process.exitCode = 1;
});
