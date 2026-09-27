#!/usr/bin/env node
/**
 * Measures what the administrative console costs a reader once the registers
 * are full.
 *
 * The screens aggregate over the operational registers, and an aggregation that
 * answers in twenty milliseconds against an empty table says nothing about the
 * same aggregation against a hundred thousand rows. So the register is filled
 * first, through the intake route the public site actually calls, and only then
 * the console screens are read under concurrency.
 *
 * What is reported is the distribution, not a mean: a mean hides the slow tail,
 * and the slow tail is the operator waiting. Every screen is reported
 * separately, because one fast screen must not be allowed to carry a slow one.
 *
 * The batch size matches the intake contract: fifty events per call. A larger
 * batch is refused outright rather than accepted and trimmed, which is the
 * right behaviour and the reason this number is not a guess.
 *
 * Usage:
 *   node scripts/admin-console-load.mjs --base-url http://127.0.0.1:3210 \
 *     --events 100000 --readers 20 --duration-seconds 300 \
 *     --out artifacts/admin-console-load.json
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

function readOption(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const BASE_URL = readOption('base-url', 'http://127.0.0.1:3210').replace(/\/+$/u, '');
const EVENTS = Number(readOption('events', '100000'));
const READERS = Number(readOption('readers', '20'));
const DURATION_SECONDS = Number(readOption('duration-seconds', '300'));
const BATCH_SIZE = Number(readOption('batch-size', '50'));
const WRITERS = Number(readOption('writers', '8'));
const OUT = readOption('out', 'artifacts/admin-console-load.json');
/*
 * The credential is taken from the environment, not from an argument.
 *
 * A token on the command line is visible to every other process on the machine
 * through the process list, and ends up in shell history. `--token` is kept for
 * a throwaway local run, but the environment is the way to pass a real one.
 */
const TOKEN = process.env['ADMIN_LOAD_TOKEN'] ?? readOption('token', '');

/** The screens an operator opens, each one an aggregation over the registers. */
const SCREENS = [
  '/api/v1/admin/overview',
  '/api/v1/admin/analytics/traffic?granularity=day',
  '/api/v1/admin/analytics/exports?pageSize=50',
  '/api/v1/admin/ingestion/sources',
  '/api/v1/admin/ingestion/runs?pageSize=50',
  '/api/v1/admin/quality/summary',
  '/api/v1/admin/health/summary',
  '/api/v1/admin/seeds/packages',
  '/api/v1/admin/audit/events?pageSize=50',
];

const ROUTES = ['/', '/prensa', '/lugares', '/mundo', '/temas', '/empresas'];
const DEVICES = ['DESKTOP', 'MOBILE', 'TABLET'];
const REFERRERS = ['DIRECT', 'SEARCH', 'SOCIAL', 'EXTERNAL', 'INTERNAL'];

function headers() {
  return {
    'content-type': 'application/json',
    accept: 'application/json',
    ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
  };
}

/** One batch of visits, dated across the window the console aggregates by. */
function buildBatch(size, offset) {
  const events = [];
  for (let index = 0; index < size; index += 1) {
    const position = offset + index;
    // Spread over sixty days so the day and hour groupings have real buckets to
    // fold; a hundred thousand rows on one instant is a different query.
    const occurredAt = new Date(Date.now() - (position % (60 * 24)) * 3_600_000);
    events.push({
      eventId: `load-${randomUUID()}`,
      occurredAt: occurredAt.toISOString(),
      route: ROUTES[position % ROUTES.length],
      kind: position % 17 === 0 ? 'DOWNLOAD_INTENT' : 'PAGE_VIEW',
      device: DEVICES[position % DEVICES.length],
      referrer: REFERRERS[position % REFERRERS.length],
      visitorBucket: (position % 5_000).toString(16).padStart(16, '0'),
      isRobot: position % 23 === 0,
    });
  }
  return events;
}

async function fillRegister() {
  const startedAt = Date.now();
  let sent = 0;
  let accepted = 0;
  let failures = 0;
  let firstRefusal = null;
  const refusals = new Map();
  const batches = Math.ceil(EVENTS / BATCH_SIZE);
  let nextBatch = 0;

  async function worker() {
    for (;;) {
      const batch = nextBatch;
      nextBatch += 1;
      if (batch >= batches) return;
      const offset = batch * BATCH_SIZE;
      const size = Math.min(BATCH_SIZE, EVENTS - offset);
      const response = await fetch(`${BASE_URL}/api/v1/admin/analytics/traffic`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ events: buildBatch(size, offset) }),
      }).catch(() => null);
      sent += size;
      if (!response || !response.ok) {
        failures += 1;
        const status = response ? response.status : 0;
        refusals.set(status, (refusals.get(status) ?? 0) + 1);
        if (response && firstRefusal === null) firstRefusal = (await response.text()).slice(0, 300);
        else if (response) await response.text().catch(() => '');
        await delay(status === 429 ? 1_000 : 100);
        continue;
      }
      const body = await response.json().catch(() => null);
      accepted += Number(body?.data?.accepted ?? 0);
    }
  }

  await Promise.all(Array.from({ length: WRITERS }, worker));
  return {
    sent,
    accepted,
    failedBatches: failures,
    refusalsByStatus: Object.fromEntries(refusals),
    // Kept verbatim: a batch that was refused for a reason nobody recorded is
    // how a load test ends up reporting an empty register as a fast one.
    firstRefusal,
    seconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
  };
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return Number(sorted[Math.max(0, index)].toFixed(1));
}

async function readConsole() {
  const samples = new Map(SCREENS.map((screen) => [screen, []]));
  const failures = new Map(SCREENS.map((screen) => [screen, 0]));
  /** Why requests were refused, so «failures» is never an unexplained number. */
  const refusals = new Map();
  const deadline = Date.now() + DURATION_SECONDS * 1_000;

  async function reader(index) {
    let step = index;
    while (Date.now() < deadline) {
      const screen = SCREENS[step % SCREENS.length];
      step += 1;
      const startedAt = performance.now();
      const response = await fetch(`${BASE_URL}${screen}`, { headers: headers() }).catch(
        () => null,
      );
      const elapsed = performance.now() - startedAt;
      if (!response || !response.ok) {
        const status = response ? response.status : 0;
        refusals.set(status, (refusals.get(status) ?? 0) + 1);
        failures.set(screen, (failures.get(screen) ?? 0) + 1);
        if (response) await response.text().catch(() => '');
        // Backing off on a refusal is not politeness: without it a rejected
        // request returns instantly and the loop measures how fast the process
        // can say no, which is not the question.
        await delay(response && response.status === 429 ? 1_000 : 200);
        continue;
      }
      await response.text();
      samples.get(screen).push(elapsed);
      // A reader is a person, not a hammer: without a pause this measures how
      // fast the process can be saturated, which is a different question.
      await delay(50);
    }
  }

  await Promise.all(Array.from({ length: READERS }, (_unused, index) => reader(index)));

  const screens = SCREENS.map((screen) => {
    const sorted = [...samples.get(screen)].sort((left, right) => left - right);
    return {
      screen,
      requests: sorted.length,
      failures: failures.get(screen) ?? 0,
      p50Ms: percentile(sorted, 0.5),
      p95Ms: percentile(sorted, 0.95),
      p99Ms: percentile(sorted, 0.99),
      maxMs: sorted.length ? Number(sorted[sorted.length - 1].toFixed(1)) : null,
    };
  });
  const everySample = SCREENS.flatMap((screen) => samples.get(screen)).sort(
    (left, right) => left - right,
  );
  return {
    screens,
    refusalsByStatus: Object.fromEntries(refusals),
    overall: {
      requests: everySample.length,
      failures: screens.reduce((total, screen) => total + screen.failures, 0),
      p50Ms: percentile(everySample, 0.5),
      p95Ms: percentile(everySample, 0.95),
      p99Ms: percentile(everySample, 0.99),
    },
  };
}

async function main() {
  const intake = await fillRegister();
  const read = await readConsole();
  const report = {
    baseUrl: BASE_URL,
    measuredAt: new Date().toISOString(),
    parameters: {
      events: EVENTS,
      batchSize: BATCH_SIZE,
      writers: WRITERS,
      readers: READERS,
      durationSeconds: DURATION_SECONDS,
    },
    intake,
    ...read,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  // The slowest screen decides, not the average of all of them.
  const worst = report.screens.reduce(
    (slowest, screen) => ((screen.p95Ms ?? 0) > (slowest.p95Ms ?? 0) ? screen : slowest),
    report.screens[0],
  );
  process.stdout.write(`\nslowest screen: ${worst.screen} p95=${worst.p95Ms} ms\n`);
}

await main();
