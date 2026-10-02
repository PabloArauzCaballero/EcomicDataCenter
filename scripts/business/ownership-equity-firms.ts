import { codeOf, companyIdentity, download } from './business-common';
import { closingEquity, plainFigure } from './ownership-balance';
import { BALANCE_TABLES, SECTOR_OF } from './ownership-balance-tables';
import { OWNERSHIP_DOCUMENTS } from './ownership-documents';
import { EQUITY_PREFIX } from './ownership-equity';
import { pdfRows } from './pdf-rows';
import type { RegisterPoint, RegisterSeries } from '../macro/annual-register-shape';

/**
 * El patrimonio de las empresas que no son bancos, del balance que trae cada
 * prospecto de emisión de bonos en ASFI.
 *
 * `ownership-balance-tables.ts` declara a mano, por documento, la página del
 * cuadro, el mes en que cierra el ejercicio de la empresa y la unidad con que el
 * documento imprime la cifra (miles, millones o bolivianos); el corpus guarda
 * miles.
 *
 * **Una cifra sólo entra si dos cuadros independientes la imprimen.** Los
 * prospectos reexpresan: el mismo cierre sale distinto en la emisión de 2012 y
 * en la de 2014, y un cuadro resumido no siempre coincide con el balance
 * auditado del anexo. Con una sola lectura no hay cómo saber si la unidad, la
 * columna o el cuadro son los correctos, así que ese año queda fuera y se
 * anota en el informe de la corrida. La confirmación atrapa también la unidad
 * mal declarada: una cifra en millones leída como miles no coincide con nadie.
 *
 * Sólo confirman dos lecturas de documentos distintos: dos páginas de un mismo
 * prospecto son el mismo balance. Si una página imprime dos cifras para un mismo cierre
 * —consolidado y separado— esa página no cuenta para ese año.
 */

type Unit = 'miles' | 'millones' | 'bolivianos';
const TO_THOUSAND: Readonly<Record<Unit, number>> = { miles: 1, millones: 1000, bolivianos: 0.001 };

const BASIS =
  'Patrimonio total al cierre del ejercicio de la empresa, del balance de su prospecto de emisión de bonos en ASFI, convertido a miles de bolivianos corrientes y confirmado por un segundo cuadro independiente. Es valor en libros, no valor de mercado ni la fortuna de sus accionistas; si un prospecto posterior reexpresa el cierre, vale el más nuevo de los que coinciden.';

interface Reading {
  readonly issuer: string;
  readonly company: string;
  readonly year: string;
  /** Miles de bolivianos. */
  readonly value: number;
  /** Cuánto puede errar la conversión por el redondeo con que el documento imprime la cifra. */
  readonly rounding: number;
  readonly printed: string;
  readonly unit: Unit;
  readonly page: number;
  readonly column: string;
  readonly line: string;
  readonly url: string;
  readonly label: string;
  readonly asOf: string;
  readonly rowKey: string;
  readonly sha256: string;
  readonly retrievedAt: string;
}

function roundingOf(printed: string, unit: Unit): number {
  const plain = plainFigure(printed);
  const decimals = plain.includes('.') ? plain.length - plain.indexOf('.') - 1 : 0;
  return 0.5 * 10 ** -decimals * TO_THOUSAND[unit];
}

/** Dos lecturas coinciden si difieren menos del 1 % o de lo que el redondeo de la impresión explica. */
function agree(left: Reading, right: Reading): boolean {
  const gap = Math.abs(left.value - right.value);
  return gap <= Math.max(0.01 * Math.max(left.value, right.value), left.rounding + right.rounding);
}

/** Sólo confirma una lectura de OTRO documento: dos páginas de un mismo prospecto repiten el mismo balance. */
function independent(left: Reading, right: Reading): boolean {
  return left.url !== right.url;
}

async function readBalances(gaps: string[]): Promise<Reading[]> {
  const readings: Reading[] = [];
  for (const line of BALANCE_TABLES.trim().split('\n')) {
    const [issuer = '', asOf = '', page = '', month = '', unit = ''] = line.trim().split('|');
    const source = OWNERSHIP_DOCUMENTS.find((one) => one.issuer === issuer && one.asOf === asOf);
    if (!source || !(unit in TO_THOUSAND))
      throw new Error(`renglón de balance mal declarado: ${line}`);
    const document = await download(source.url);
    const rows = await pdfRows(document.bytes, [Number(page)]);
    const figures = closingEquity(rows, Number(month));
    const label = decodeURIComponent(source.url.split('/').at(-1) ?? source.url).replace(
      /\.pdf$/iu,
      '',
    );
    if (figures.length === 0) {
      gaps.push(`${label} p.${page}: sin cierres de mes ${month} en la fila de patrimonio`);
      continue;
    }
    const years = figures.map((figure) => figure.year);
    for (const figure of figures) {
      if (years.filter((year) => year === figure.year).length > 1) {
        gaps.push(
          `${label} p.${page}: imprime dos cifras para ${figure.year}; esa página no cuenta para ese año`,
        );
        continue;
      }
      const value = Number(plainFigure(figure.printed)) * TO_THOUSAND[unit as Unit];
      if (!Number.isFinite(value)) throw new Error(`cifra ilegible: ${figure.printed}`);
      readings.push({
        issuer,
        company: source.company,
        year: figure.year,
        value,
        rounding: roundingOf(figure.printed, unit as Unit),
        printed: figure.printed,
        unit: unit as Unit,
        page: Number(page),
        column: figure.column,
        line: figure.line,
        url: source.url,
        label,
        asOf,
        rowKey: figure.line,
        sha256: document.sha256,
        retrievedAt: document.retrievedAt,
      });
    }
  }
  return readings;
}

const say = (value: number): string => String(Math.round(value * 100) / 100);
const inUnit = (unit: Unit): string =>
  unit === 'bolivianos' ? 'bolivianos' : `${unit} de bolivianos`;

export async function firmEquity(): Promise<{ series: RegisterSeries[]; gaps: string[] }> {
  const gaps: string[] = [];
  const readings = await readBalances(gaps);
  const book = new Map<string, RegisterSeries>();
  const byYear = new Map<string, Reading[]>();
  for (const reading of readings) {
    const key = `${reading.issuer}|${reading.year}`;
    byYear.set(key, [...(byYear.get(key) ?? []), reading]);
  }
  for (const [key, group] of [...byYear].sort(([left], [right]) => left.localeCompare(right))) {
    const newest = [...group].sort(
      (left, right) => right.asOf.localeCompare(left.asOf) || right.page - left.page,
    );
    let chosen: Reading | undefined;
    let confirmer: Reading | undefined;
    for (const candidate of newest) {
      confirmer = newest.find(
        (other) => other !== candidate && independent(candidate, other) && agree(candidate, other),
      );
      if (confirmer) {
        chosen = candidate;
        break;
      }
    }
    if (!chosen || !confirmer) {
      gaps.push(
        `${key.replace('|', ' ')}: ${group.length} lectura(s) y ninguna confirmada por un segundo cuadro; queda fuera`,
      );
      continue;
    }
    const { slug, name } = companyIdentity(chosen.company);
    const code = `${EQUITY_PREFIX}${codeOf(slug, 80 - EQUITY_PREFIX.length)}`;
    const own =
      book.get(code) ??
      ({
        indicatorCode: code,
        name: `${name}: patrimonio {empresa=${slug}; sector=${SECTOR_OF[chosen.issuer] ?? 'Otros'}}`,
        group: slug.slice(0, 60),
        groupLabel: name,
        measure: 'Patrimonio total al cierre del ejercicio',
        level: 'COMPANY',
        unit: 'THOUSAND_BOB',
        basis: BASIS,
        publisher: 'Autoridad de Supervisión del Sistema Financiero (ASFI)',
        frequency: 'ANNUAL',
        points: [],
      } satisfies RegisterSeries);
    const value = say(chosen.value);
    const point: RegisterPoint = {
      period: chosen.year,
      value,
      excerpt: `Prospecto «${chosen.label}», p. ${chosen.page}, columna ${chosen.column}, cifra impresa ${chosen.printed} (en ${inUnit(chosen.unit)}): ${chosen.line}. Convertido a miles de bolivianos: ${value}. Confirmado por «${confirmer.label}», p. ${confirmer.page}, columna ${confirmer.column}: ${confirmer.printed} (en ${inUnit(confirmer.unit)}).`,
      sourceUrl: chosen.url,
      upstreamSha256: chosen.sha256,
      retrievedAt: chosen.retrievedAt,
    };
    own.points.push(point);
    book.set(code, own);
  }
  for (const series of book.values())
    series.points.sort((a, b) => a.period.localeCompare(b.period));
  return { series: [...book.values()], gaps };
}
