import { SeriesBook, codeOf, download, writeSeed } from './business-common';
import type { RegisterSeries } from '../macro/annual-register-shape';

/**
 * Las empresas por tamaño: la única foto pública que lo dice.
 *
 * El Ministerio de Desarrollo Productivo publica, con datos del SEPREC, la base
 * empresarial abierta por tamaño —micro, pequeña, mediana, gran empresa— y la
 * cruza con el gran sector, el tipo societario, el departamento y el empleo que
 * cada empresa declara. Es un corte (julio de 2025), no una serie: ninguna
 * fuente pública cuenta empresas por tramo de facturación año a año, y el
 * padrón de Impuestos, que sí es anual, clasifica por categoría tributaria y no
 * por ventas. El tablero muestra las dos cosas, cada una con su nombre.
 *
 * Dos bases y no una. «Vigentes» es toda matrícula no cancelada; «activas» son
 * las que se inscribieron o renovaron, que es lo más parecido a una empresa
 * funcionando. Tres de cada cuatro vigentes no declaran tamaño, y entre las
 * activas la proporción baja a una de cada tres: el tamaño se lee mejor sobre
 * las activas, y el tablero lo dice.
 *
 * La página no publica el criterio con que se asigna el tamaño; se presenta
 * como «tamaño declarado al registro». Se corre con `yarn business:size`.
 */

const PAGE = 'https://data-bolivia.produccion.gob.bo/informacion-empresarial';
const PUBLISHER = 'Ministerio de Desarrollo Productivo y Economía Plural, con datos del SEPREC';
const BASES = [
  { slug: 'empresas-vigentes', key: 'VIG', label: 'vigentes' },
  { slug: 'empresas-activas', key: 'ACT', label: 'activas' },
] as const;
const SIZES: Readonly<Record<string, string>> = {
  'Gran Empresa': 'GRAN',
  'Mediana Empresa': 'MEDIANA',
  'Pequeña Empresa': 'PEQUENA',
  'Micro Empresa': 'MICRO',
  'Sin designar': 'SIN_DESIGNAR',
  Total: 'TOTAL',
};
const FORMS: Readonly<Record<string, string>> = {
  'Empresa Unipersonal': 'UNIPERSONAL',
  'S.R.L.': 'SRL',
  'Sociedad Anónima': 'SA',
  Otros: 'OTROS',
  Total: 'TOTAL',
};

type Cell = string | number | null;
type Level = RegisterSeries['level'];

/** Las tablas que la página escribe como variables de JavaScript con un JSON entre comillas. */
function tables(html: string): Map<string, Cell[][] | string[]> {
  const found = new Map<string, Cell[][] | string[]>();
  for (const match of html.matchAll(/var (\w+) = '(\[[^']*\])'/gu)) {
    found.set(match[1]!, JSON.parse(match[2]!) as Cell[][] | string[]);
  }
  return found;
}

function rowKey(table: string, label: string): string {
  if (table.includes('depto')) return label === 'Total' ? 'BOLIVIA' : codeOf(label);
  if (table.includes('tipo_societario')) return FORMS[label] ?? codeOf(label);
  if (table.includes('tipo_actividad')) return codeOf(label, 24);
  const size = SIZES[label];
  if (!size) throw new Error(`tamaño desconocido: «${label}»`);
  return size;
}

function columnKey(table: string, label: string): string {
  if (table.startsWith('ts_')) return `FORM_${FORMS[label] ?? codeOf(label)}`;
  return label === 'Total' ? 'TOTAL' : `SECTOR_${codeOf(label, 24)}`;
}

async function main(): Promise<void> {
  console.log('\nbusiness-size.json');
  const book = new SeriesBook();
  for (const base of BASES) {
    const url = `${PAGE}/${base.slug}/`;
    const doc = await download(url);
    const html = doc.bytes.toString('utf-8');
    const all = tables(html);
    const cut = /a (\w+ de 20\d{2})'/u.exec(html)?.[1];
    if (!cut || !/2025/u.test(cut)) throw new Error(`${base.slug}: corte inesperado «${cut ?? ''}»`);
    const point = (table: string, row: string, column: string, cifra: number) => ({
      period: '2025',
      value: String(cifra),
      excerpt: JSON.stringify({ base: base.slug, corte: cut, tabla: table, fila: row, columna: column, cifra }),
      sourceUrl: url,
      upstreamSha256: doc.sha256,
      retrievedAt: doc.retrievedAt,
    });
    const crossings: readonly [string, Level, string][] = [
      ['empresas_tamanio', 'SIZE', 'Empresas por tamaño y gran sector'],
      ['empresas_depto', 'DEPARTMENT', 'Empresas por departamento y gran sector'],
      ['ts_empresas_tamanio', 'SIZE', 'Empresas por tamaño y tipo societario'],
      ['ts_empresas_depto', 'DEPARTMENT', 'Empresas por departamento y tipo societario'],
    ];
    for (const [table, level, measure] of crossings) {
      const rows = all.get(table) as Cell[][] | undefined;
      const head = all.get(table.startsWith('ts_') ? `ts_col_${table.slice(3)}` : `col_${table}`) as string[] | undefined;
      if (!rows || !head) throw new Error(`${base.slug}: falta la tabla ${table}`);
      for (const row of rows) {
        const label = String(row[0]);
        const dimension = table.includes('depto') ? 'DEPT' : 'SIZE';
        row.slice(1).forEach((cifra, index) => {
          if (typeof cifra !== 'number') return;
          const column = head[index + 1] ?? '';
          const code = `FIRMS_${dimension}_${base.key}_${rowKey(table, label)}__${columnKey(table, column)}`;
          book.add(
            {
              indicatorCode: code,
              name: `Empresas ${base.label}: ${label} · ${column}`,
              group: rowKey(table, label),
              groupLabel: label,
              measure,
              level,
              unit: 'COUNT',
              basis: `Empresas ${base.label} según el tamaño declarado al registro, a ${cut}. La fuente no publica el criterio del tamaño; no es un tramo de facturación.`,
              publisher: PUBLISHER,
            },
            point(table, label, column, cifra),
          );
        });
      }
    }
    for (const dimension of ['tamanio', 'tipo_societario', 'tipo_actividad', 'depto']) {
      const rows = all.get(`data_empleo_${dimension}`) as Cell[][] | undefined;
      const head = all.get(`col_empleo_${dimension}`) as string[] | undefined;
      if (!rows || !head) throw new Error(`${base.slug}: falta el empleo por ${dimension}`);
      const table = `data_empleo_${dimension}`;
      for (const row of rows) {
        const label = String(row[0]);
        const jobs: readonly [number, string][] = [[1, 'PERMANENT'], [2, 'TEMPORARY'], [3, 'TOTAL']];
        for (const [index, kind] of jobs) {
          const cifra = row[index];
          if (typeof cifra !== 'number') continue;
          const key = rowKey(table, label);
          book.add(
            {
              indicatorCode: `FIRMS_JOBS_${base.key}_${codeOf(dimension, 8)}_${key}_${kind}`.slice(0, 80),
              name: `Empleo declarado en empresas ${base.label}: ${label} · ${head[index] ?? kind}`,
              group: key,
              groupLabel: label,
              measure: `Personas empleadas (${head[index] ?? kind})`,
              level: dimension === 'depto' ? 'DEPARTMENT' : dimension === 'tamanio' ? 'SIZE' : dimension === 'tipo_societario' ? 'LEGAL_FORM' : 'ACTIVITY',
              unit: 'COUNT',
              basis: `Personal que las empresas ${base.label} declaran al registro, a ${cut}. Es lo declarado por cada empresa, no una encuesta de empleo.`,
              publisher: PUBLISHER,
            },
            point(table, label, head[index] ?? kind, cifra),
          );
        }
      }
    }
  }
  writeSeed('business-size.json', book.all());
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : 'el tamaño falló'}\n`);
  process.exitCode = 1;
});
