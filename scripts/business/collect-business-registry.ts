import { DEPARTMENTS, SeriesBook, codeOf, download, writeSeed, type Downloaded } from './business-common';
import { pdfRows } from './pdf-rows';
import {
  SEPREC_PUBLISHER,
  SEPREC_STOCK_REPORT,
  SIIP_CUT,
  SIIP_LAST_YEAR,
  SIIP_PAGE,
  SIIP_PLACES,
  SIIP_PUBLISHER,
  SIIP_URL,
  activity,
  legalForm,
} from './registry-sources';
import { activityTable, legalFormColumns, pageWith, placeBars, tableTotal } from './seprec-report';
import type { RegisterSeries } from '../macro/annual-register-shape';

/**
 * La base empresarial de Bolivia: cuántas empresas hay, de qué tipo, dónde y
 * de qué viven, de 2008 a 2025.
 *
 * `registry-sources` explica por qué la serie junta dos publicaciones del mismo
 * registro y dónde corta cada una. Aquí está el cómo: el SIIP se consulta por
 * cada combinación de cuadro y departamento que su página ofrece, el reporte
 * del SEPREC se lee por posición, y cada cifra se contrasta con un total que
 * la misma fuente publica antes de entrar a la semilla.
 *
 * Se corre con `yarn business:registry` (`--fresh` para no usar la copia local).
 */

interface SiipBlock {
  readonly name: string | null;
  readonly datos: readonly number[];
}

type Level = RegisterSeries['level'];

const book = new SeriesBook();
const OWNER_MEASURE = 'Empresas vigentes según quién las encabeza';
const COUNT_BASIS =
  'Unidades económicas con matrícula de comercio vigente al cierre de la gestión. Vigente no es activa: incluye matrículas que no se renovaron.';

function place(key: string): string {
  return key === 'BOLIVIA' ? 'Bolivia' : (DEPARTMENTS[key] ?? key);
}

function addCount(
  code: string,
  label: string,
  level: Level,
  group: string,
  period: string,
  cifra: string,
  evidence: { excerpt: string; url: string; doc: Downloaded; publisher: string; basis: string },
  measure = 'Empresas con matrícula vigente',
): void {
  book.add(
    {
      indicatorCode: code,
      name: `Base empresarial: ${label}`,
      group,
      groupLabel: label,
      measure,
      level,
      unit: 'COUNT',
      basis: evidence.basis,
      publisher: evidence.publisher,
    },
    {
      period,
      value: cifra,
      excerpt: evidence.excerpt,
      sourceUrl: evidence.url,
      upstreamSha256: evidence.doc.sha256,
      retrievedAt: evidence.doc.retrievedAt,
    },
  );
}

async function siip(flag: string, departamento: string): Promise<{ blocks: SiipBlock[]; doc: Downloaded }> {
  const body = new URLSearchParams({ flag, departamento, ...SIIP_CUT }).toString();
  const doc = await download(SIIP_URL, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const blocks = JSON.parse(doc.bytes.toString('utf-8')) as SiipBlock[];
  if (blocks[0]?.name !== 'gestiones') throw new Error(`SIIP ${flag}/${departamento}: forma inesperada`);
  return { blocks, doc };
}

/** Una consulta del SIIP convertida en series: un bloque por categoría, un punto por cierre. */
async function siipSeries(
  flag: string,
  departamento: string,
  describe: (name: string) => { code: string; label: string; level: Level; group: string } | null,
): Promise<Map<string, Map<string, number>>> {
  const { blocks, doc } = await siip(flag, departamento);
  const years = blocks[0]!.datos;
  const totals = new Map<string, Map<string, number>>();
  for (const block of blocks.slice(1)) {
    /*
     * El SIIP rellena con bloques sin nombre y todo en cero los tipos que un
     * departamento no tiene. Si uno trajera cifras sería una categoría que no
     * se sabe nombrar, y eso detiene la corrida.
     */
    if (block.name === null) {
      if (block.datos.some((cifra) => cifra !== 0)) throw new Error(`SIIP ${flag}/${departamento}: bloque sin nombre con cifras`);
      continue;
    }
    const series = describe(block.name);
    if (!series) continue;
    years.forEach((year, index) => {
      const cifra = block.datos[index];
      if (year > SIIP_LAST_YEAR || cifra === undefined) return;
      const excerpt = JSON.stringify({ flag, departamento, name: block.name, gestion: year, cifra });
      addCount(series.code, series.label, series.level, series.group, String(year), String(cifra), {
        excerpt,
        url: SIIP_PAGE,
        doc,
        publisher: SIIP_PUBLISHER,
        basis: COUNT_BASIS,
      });
      const byYear = totals.get(series.group) ?? new Map<string, number>();
      byYear.set(String(year), (byYear.get(String(year)) ?? 0) + cifra);
      totals.set(series.group, byYear);
    });
  }
  return totals;
}

/** La serie larga del SIIP, de 2008 al último cierre que el SEPREC sostiene. */
async function collectSiip(): Promise<void> {
  const national = await siipSeries('BEUltimosAnios', 'BOLIVIA', () => ({
    code: 'FIRMS_STOCK_TOTAL_BOLIVIA',
    label: 'total del país',
    level: 'COUNTRY',
    group: 'BOLIVIA',
  }));
  await siipSeries('BEdeptos', 'BOLIVIA', (name) => {
    if (name === 'TOTAL') return null;
    const key = SIIP_PLACES[name];
    if (!key) throw new Error(`SIIP: departamento desconocido «${name}»`);
    return { code: `FIRMS_STOCK_DEPT_${key}`, label: place(key), level: 'DEPARTMENT', group: key };
  });
  for (const [departamento, key] of Object.entries(SIIP_PLACES)) {
    const geo = place(key);
    const forms = await siipSeries('BETipoSocietario', departamento, (name) => {
      const form = legalForm(name);
      const code = key === 'BOLIVIA' ? `FIRMS_STOCK_FORM_${form.key}` : `FIRMS_STOCK_DEPTFORM_${key}__${form.key}`;
      return { code, label: `${form.label} · ${geo}`, level: 'LEGAL_FORM', group: key };
    });
    const sections = await siipSeries('BEActividad', departamento, (name) => {
      const found = activity(name);
      const code = key === 'BOLIVIA' ? `FIRMS_STOCK_CIIU_${found.key}` : `FIRMS_STOCK_DEPTCIIU_${key}__${found.key}`;
      return { code, label: `${found.label} · ${geo}`, level: 'ACTIVITY', group: key };
    });
    if (key === 'BOLIVIA') {
      for (const [year, total] of national.get('BOLIVIA') ?? []) {
        for (const [what, sums] of [['tipos', forms], ['actividades', sections]] as const) {
          const sum = sums.get('BOLIVIA')?.get(year);
          if (sum !== total) console.warn(`  aviso: ${year} la suma de ${what} da ${sum} y el total ${total}`);
        }
      }
    }
  }
  await siipSeries('BEActividadTipo', 'BOLIVIA', (name) => ({
    code: `FIRMS_STOCK_SECTOR_${codeOf(name, 30)}`,
    label: `${name.replace(/silv\./u, 'silvicultura')} (gran sector)`,
    level: 'ACTIVITY',
    group: 'BOLIVIA',
  }));
}

/** El cierre de 2025, del reporte del propio registro. */
async function collectSeprec(): Promise<string[]> {
  const report = SEPREC_STOCK_REPORT;
  const doc = await download(report.url);
  const rows = await pdfRows(doc.bytes);
  const gaps: string[] = [];
  const evidence = (quote: string) => ({
    excerpt: `${quote} — SEPREC, Información estadística: base empresarial a ${report.cut}`,
    url: report.url,
    doc,
    publisher: SEPREC_PUBLISHER,
    basis: `${COUNT_BASIS} El punto de ${report.period} es el corte a ${report.cut}, del reporte del SEPREC.`,
  });
  const tablePage = pageWith(rows, /seg.n ac.+vidad econ.mica/u);
  const total = tableTotal(rows, tablePage);
  if (total !== report.total) throw new Error(`SEPREC: el total es ${total} y se esperaba ${report.total}`);
  addCount('FIRMS_STOCK_TOTAL_BOLIVIA', 'total del país', 'COUNTRY', 'BOLIVIA', report.period, total,
    evidence(`TOTAL ${total.replace(/\B(?=(\d{3})+(?!\d))/gu, '.')}`));
  const check = (what: string, readings: readonly { cifra: string }[]): void => {
    const sum = readings.reduce((all, one) => all + Number(one.cifra), 0);
    if (String(sum) !== total) throw new Error(`SEPREC ${what}: suma ${sum}, total ${total}`);
  };
  const sections = activityTable(rows, tablePage);
  check('actividades', sections);
  for (const one of sections) {
    addCount(`FIRMS_STOCK_CIIU_${one.key}`, `${one.label} · Bolivia`, 'ACTIVITY', 'BOLIVIA', report.period, one.cifra, evidence(one.quote));
  }
  const forms = legalFormColumns(rows, pageWith(rows, /seg.n .+po societario/u));
  check('tipos societarios', forms);
  for (const one of forms) {
    addCount(`FIRMS_STOCK_FORM_${one.key}`, `${one.label} · Bolivia`, 'LEGAL_FORM', 'BOLIVIA', report.period, one.cifra, evidence(one.quote));
  }
  /*
   * El gráfico por departamento trae una errata: Oruro y Potosí con la misma
   * cifra, y los nueve suman más que el total. El gráfico por grupo etario lo
   * desempata —adultos más jóvenes de cada departamento—, así que un
   * departamento entra sólo si sus dos lecturas coinciden.
   */
  const places = placeBars(rows, pageWith(rows, /seg.n departamento, noviembre/u), 'one');
  const ages = placeBars(rows, pageWith(rows, /grupo etario seg.n departamento/u), 'two');
  const genders = placeBars(rows, pageWith(rows, /genero seg.n departamento/u), 'two');
  const industry = placeBars(rows, pageWith(rows, /industria manufacturera por departamento/u), 'one');
  for (const one of places) {
    const age = ages.find((candidate) => candidate.key === one.key)!;
    if (Number(age.above) + Number(age.below ?? 0) !== Number(one.above)) {
      gaps.push(`${one.key}: el gráfico dice ${one.above} y adultos más jóvenes dan otra cifra; queda fuera`);
    } else {
      addCount(`FIRMS_STOCK_DEPT_${one.key}`, place(one.key), 'DEPARTMENT', one.key, report.period, one.above, evidence(one.quote));
    }
    addCount(`FIRMS_OWNER_ADULT_DEPT_${one.key}`, `al frente de adultos · ${place(one.key)}`, 'DEPARTMENT', one.key, report.period, age.above, evidence(age.quote), OWNER_MEASURE);
    addCount(`FIRMS_OWNER_YOUTH_DEPT_${one.key}`, `al frente de jóvenes · ${place(one.key)}`, 'DEPARTMENT', one.key, report.period, age.below ?? '', evidence(age.quote), OWNER_MEASURE);
    const gender = genders.find((candidate) => candidate.key === one.key)!;
    addCount(`FIRMS_OWNER_MEN_DEPT_${one.key}`, `al frente de hombres · ${place(one.key)}`, 'DEPARTMENT', one.key, report.period, gender.above, evidence(gender.quote), OWNER_MEASURE);
    addCount(`FIRMS_OWNER_WOMEN_DEPT_${one.key}`, `al frente de mujeres · ${place(one.key)}`, 'DEPARTMENT', one.key, report.period, gender.below ?? '', evidence(gender.quote), OWNER_MEASURE);
    const made = industry.find((candidate) => candidate.key === one.key)!;
    addCount(`FIRMS_STOCK_DEPTCIIU_${one.key}__C`, `Industria manufacturera · ${place(one.key)}`, 'ACTIVITY', one.key, report.period, made.above, evidence(made.quote));
  }
  return gaps;
}

async function main(): Promise<void> {
  console.log('\nbusiness-registry.json');
  await collectSiip();
  const gaps = await collectSeprec();
  for (const gap of gaps) console.warn(`  hueco: ${gap}`);
  writeSeed('business-registry.json', book.all());
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : 'la base empresarial falló'}\n`);
  process.exitCode = 1;
});
