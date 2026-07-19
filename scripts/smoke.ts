import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

interface CheckResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  statusCode?: number;
  detail?: string;
}

const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://localhost:8080';

async function check(name: string, path: string, token?: string): Promise<CheckResult> {
  try {
    const request: RequestInit = { signal: AbortSignal.timeout(10_000) };
    if (token) request.headers = { authorization: `Bearer ${token}` };

    const response = await fetch(`${baseUrl}${path}`, request);
    return {
      name,
      status: response.ok ? 'PASS' : 'FAIL',
      statusCode: response.status,
      ...(!response.ok ? { detail: `HTTP ${response.status}` } : {}),
    };
  } catch (error) {
    return {
      name,
      status: 'FAIL',
      detail: error instanceof Error ? error.message : 'Network error',
    };
  }
}

async function checkProtectedRoute(): Promise<CheckResult> {
  const token = process.env.SMOKE_TOKEN;
  if (token) {
    return check('protected sources', '/api/v1/provenance/sources?page=1&pageSize=1', token);
  }
  if (process.env.AUTH_MODE === 'disabled') {
    return check(
      'protected sources in local auth mode',
      '/api/v1/provenance/sources?page=1&pageSize=1',
    );
  }
  return {
    name: 'protected sources',
    status: 'SKIP',
    detail: 'SMOKE_TOKEN is required when authentication is enabled',
  };
}

async function main(): Promise<void> {
  const checks: CheckResult[] = [
    await check('liveness', '/health'),
    await check('readiness', '/ready'),
    await checkProtectedRoute(),
  ];
  const report = {
    executedAt: new Date().toISOString(),
    baseUrl,
    passed: checks.filter((item) => item.status === 'PASS').length,
    failed: checks.filter((item) => item.status === 'FAIL').length,
    skipped: checks.filter((item) => item.status === 'SKIP').length,
    checks,
  };
  const directory = resolve('artifacts/smoke');
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, 'smoke-results.json'),
    JSON.stringify(report, null, 2),
    'utf8',
  );
  if (report.failed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Smoke failed'}\n`);
  process.exitCode = 1;
});
