import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Inventario de archivos locales. No consulta la base ni valida las cifras contra el publicador.
const here = dirname(fileURLToPath(import.meta.url));
const boot = resolve(here, '../../../src/database/seeds/boot');
const cutoff = process.argv[2] ?? '2026-10-04';
const files = ['exogenous-prices.json', 'exogenous-customs.json', ...readdirSync(resolve(boot, 'exogenous-currencies')).filter(f => f.endsWith('.json')).sort().map(f => `exogenous-currencies/${f}`)];
const counts = values => Object.fromEntries([...new Set(values)].sort().map(k => [k, values.filter(v => v === k).length]));
const rows = files.map(file => {
  const raw = readFileSync(resolve(boot, file));
  const { series } = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''));
  const points = series.flatMap(s => s.points);
  const periods = points.map(p => p.period).sort();
  return {
    file, sha256:createHash('sha256').update(raw).digest('hex'), series: series.length, points: points.length,
    start: periods[0], end: periods.at(-1), groups: counts(series.map(s => s.group)),
    scopes: counts(series.map(s => s.scope)),
    pointsDatedAfterCutoff: points.filter(p => p.period.length === 10 && p.period > cutoff).length,
    detail: series.map(s => ({code:s.indicatorCode, group:s.group, product:s.product, kind:s.kind, scope:s.scope, frequency:s.frequency, points:s.points.length, start:s.points.map(p=>p.period).sort()[0], end:s.points.map(p=>p.period).sort().at(-1), duplicatePeriods:s.points.length-new Set(s.points.map(p=>p.period)).size})),
  };
});
const result = {cutoff, scope:'Archivos locales del árbol de trabajo; no equivale a producción ni a cobertura completa', totals:{series:rows.reduce((a,r)=>a+r.series,0),points:rows.reduce((a,r)=>a+r.points,0),pointsDatedAfterCutoff:rows.reduce((a,r)=>a+r.pointsDatedAfterCutoff,0)},files:rows};
writeFileSync(resolve(here, 'inventario_actual.json'), `${JSON.stringify(result,null,2)}\n`, 'utf8');
console.log(JSON.stringify({cutoff, ...result.totals,files:rows.length}));
