#!/usr/bin/env node
/**
 * Drives sustained traffic and records whether the process stays stable.
 *
 * A leak shows up as memory that never returns to a baseline after garbage
 * collection, or as an event loop that falls progressively further behind.
 * Both need sustained load to become visible, which no unit test provides.
 *
 * Usage:
 *   node scripts/soak-test.mjs --base-url http://127.0.0.1:3111 \
 *     --duration-seconds 600 --concurrency 8 --token <metrics token>
 */

import { writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

function readOption(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const BASE_URL = readOption('base-url', 'http://127.0.0.1:3111');
const DURATION_SECONDS = Number(readOption('duration-seconds', '300'));
const CONCURRENCY = Number(readOption('concurrency', '8'));
const TOKEN = readOption('token', '');
const SAMPLE_INTERVAL_MS = 10_000;
const OUTPUT = readOption('out', 'artifacts/soak/soak-report.json');

/** Metric names read back from the target's own Prometheus endpoint. */
const GAUGES = [
  'observatory_process_resident_memory_bytes',
  'observatory_nodejs_heap_size_used_bytes',
  'observatory_nodejs_eventloop_lag_p99_seconds',
  'observatory_nodejs_active_handles_total',
];

async function scrape() {
  const response = await fetch(`${BASE_URL}/metrics`, {
    headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
  });
  if (!response.ok) throw new Error(`Metrics scrape failed with ${response.status}`);
  const body = await response.text();
  const sample = {};
  for (const line of body.split('\n')) {
    const [name, value] = line.split(' ');
    if (name && GAUGES.includes(name)) sample[name] = Number(value);
  }
  return sample;
}

/** Arithmetic mean, used to compare halves of a noisy series. */
function mean(values) {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

const counters = { requests: 0, failures: 0 };

/** Issues read and write traffic until the deadline passes. */
async function worker(deadline) {
  while (Date.now() < deadline) {
    try {
      const [health, claims] = await Promise.all([
        fetch(`${BASE_URL}/health`),
        fetch(`${BASE_URL}/api/v1/intelligence/claims/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'PUBLISHED', pageSize: 50 }),
        }),
      ]);
      counters.requests += 2;
      if (!health.ok || !claims.ok) counters.failures += 1;
    } catch {
      counters.failures += 1;
    }
  }
}

async function main() {
  const deadline = Date.now() + DURATION_SECONDS * 1000;
  const samples = [];
  const started = new Date().toISOString();

  const load = Array.from({ length: CONCURRENCY }, () => worker(deadline));
  const sampler = (async () => {
    while (Date.now() < deadline) {
      samples.push({
        atSeconds: samples.length * (SAMPLE_INTERVAL_MS / 1000),
        ...(await scrape()),
      });
      await delay(SAMPLE_INTERVAL_MS);
    }
  })();

  await Promise.all([...load, sampler]);

  // Comparing the first and last sample is misleading: garbage collection makes
  // resident memory oscillate, so two isolated points can differ by tens of
  // percent while the process is perfectly flat. Comparing the mean of each
  // half is what distinguishes a real leak from the ordinary sawtooth.
  const trend = {};
  for (const gauge of GAUGES) {
    const series = samples.map((sample) => sample[gauge] ?? 0);
    const midpoint = Math.floor(series.length / 2);
    const firstHalf = mean(series.slice(0, midpoint));
    const secondHalf = mean(series.slice(midpoint));
    trend[gauge] = {
      firstHalfMean: firstHalf,
      secondHalfMean: secondHalf,
      driftPercent: firstHalf === 0 ? null : ((secondHalf - firstHalf) / firstHalf) * 100,
      min: Math.min(...series),
      max: Math.max(...series),
    };
  }

  const report = {
    startedAt: started,
    finishedAt: new Date().toISOString(),
    durationSeconds: DURATION_SECONDS,
    concurrency: CONCURRENCY,
    requests: counters.requests,
    failures: counters.failures,
    samples,
    trend,
  };
  writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  process.stdout.write(`requests=${counters.requests} failures=${counters.failures}\n`);
  for (const [gauge, value] of Object.entries(trend)) {
    const drift = value.driftPercent === null ? 'n/a' : `${value.driftPercent.toFixed(1)}%`;
    process.stdout.write(
      `${gauge}: mean ${value.firstHalfMean.toFixed(0)} -> ${value.secondHalfMean.toFixed(0)} ` +
        `(drift ${drift}, range ${value.min.toFixed(0)}..${value.max.toFixed(0)})
`,
    );
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Soak test failed'}\n`);
  process.exitCode = 1;
});
