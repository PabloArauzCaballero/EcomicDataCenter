import { codeOf, companyIdentity, download } from './business-common';
import { closingEquity, plainFigure } from './ownership-balance';
import { EQUITY_PREFIX } from './ownership-equity';
import { pdfRows } from './pdf-rows';
import type { RegisterPoint, RegisterSeries } from '../macro/annual-register-shape';

/**
 * El patrimonio de las empresas que no son bancos, del balance resumido que
 * trae cada prospecto de emisión de bonos en ASFI.
 *
 * Cada renglón declara a mano el documento, la página del cuadro, el mes en que
 * cierra el ejercicio de esa empresa y la unidad con que el documento imprime
 * la cifra: un prospecto usa miles, millones o bolivianos, y el corpus guarda
 * miles. Sólo están las empresas cuyo cuadro se leyó entero y cuadra con las
 * cifras de otros documentos de la misma empresa; las demás quedan como hueco
 * en el informe de la corrida y no con una cifra dudosa.
 *
 * Cuando dos prospectos traen el mismo cierre —las empresas reexpresan— manda
 * el más nuevo: la lista va de lo más antiguo a lo más reciente.
 */

const ASFI_FILES = 'https://www.asfi.gob.bo/sites/default/files/2025-08/';

type Unit = 'miles' | 'millones' | 'bolivianos';
const TO_THOUSAND: Readonly<Record<Unit, number>> = { miles: 1, millones: 1000, bolivianos: 0.001 };

interface BalanceDocument {
  readonly company: string;
  readonly file: string;
  readonly page: number;
  /** El mes en que cierra el ejercicio de la empresa. */
  readonly closingMonth: number;
  readonly unit: Unit;
  readonly sector: string;
}

const FIRM_BALANCES: readonly BalanceDocument[] = [
  {
    company: 'Toyosa S.A.',
    file: 'Bonos%20Toyosa%20I%20-%20Emisi%C3%B3n%201.pdf',
    page: 68,
    closingMonth: 12,
    unit: 'miles',
    sector: 'Automotriz',
  },
  {
    company: 'Toyosa S.A.',
    file: 'Bonos%20TOYOSA%20I%20%20-%20Emisi%C3%B3n%202.pdf',
    page: 91,
    closingMonth: 12,
    unit: 'miles',
    sector: 'Automotriz',
  },
  {
    company: 'Toyosa S.A.',
    file: 'Bonos%20TOYOSA%20II%20-%20Emisi%C3%B3n%201.pdf',
    page: 92,
    closingMonth: 12,
    unit: 'millones',
    sector: 'Automotriz',
  },
  {
    company: 'Industrias Oleaginosas S.A.',
    file: 'Bonos%20IOL%20I%20-%20Emisi%C3%B3n%201.pdf',
    page: 51,
    closingMonth: 3,
    unit: 'miles',
    sector: 'Agroindustria',
  },
  {
    company: 'Industrias Oleaginosas S.A.',
    file: 'Bonos%20IOL%20I%20-%20Emisi%C3%B3n%202.pdf',
    page: 58,
    closingMonth: 3,
    unit: 'miles',
    sector: 'Agroindustria',
  },
  {
    company: 'Droguería Inti S.A.',
    file: 'Bonos%20INTI%20IV%20-%20Emisi%C3%B3n%201.pdf',
    page: 52,
    closingMonth: 3,
    unit: 'miles',
    sector: 'Farmacéutica',
  },
  {
    company: 'Droguería Inti S.A.',
    file: 'Bonos%20INTI%20V%20-%20Emisi%C3%B3n%201%20%28Serie%20A%2CB%2CC%2CD%2CE%29.pdf',
    page: 81,
    closingMonth: 3,
    unit: 'millones',
    sector: 'Farmacéutica',
  },
  {
    company: 'Droguería Inti S.A.',
    file: 'Bonos%20INTI%20VI.pdf',
    page: 88,
    closingMonth: 3,
    unit: 'millones',
    sector: 'Farmacéutica',
  },
  {
    company: 'Sociedad Boliviana de Cemento S.A.',
    file: 'Bonos%20SOBOCE%20VII%20-%20Emisi%C3%B3n%201.pdf',
    page: 92,
    closingMonth: 3,
    unit: 'millones',
    sector: 'Cemento',
  },
  {
    company: 'Gravetal Bolivia S.A.',
    file: 'Bonos%20GRAVETAL%202011%20BOLIVIA.pdf',
    page: 15,
    closingMonth: 6,
    unit: 'miles',
    sector: 'Agroindustria',
  },
  {
    company: 'Gravetal Bolivia S.A.',
    file: 'Bonos%20Gravetal%201.pdf',
    page: 78,
    closingMonth: 6,
    unit: 'bolivianos',
    sector: 'Agroindustria',
  },
];

const BASIS =
  'Patrimonio total al cierre del ejercicio de la empresa, del balance resumido que trae su prospecto de emisión de bonos en ASFI, convertido a miles de bolivianos corrientes. Es valor en libros, no valor de mercado ni la fortuna de sus accionistas; si un prospecto posterior reexpresa el cierre, vale el más nuevo.';

/** Un número en miles con dos decimales, sin notación científica. */
function thousands(printed: string, unit: Unit): string {
  const value = Number(plainFigure(printed)) * TO_THOUSAND[unit];
  if (!Number.isFinite(value)) throw new Error(`cifra ilegible: ${printed}`);
  return String(Math.round(value * 100) / 100);
}

export async function firmEquity(): Promise<{ series: RegisterSeries[]; gaps: string[] }> {
  const gaps: string[] = [];
  const book = new Map<string, RegisterSeries>();
  for (const spec of FIRM_BALANCES) {
    const url = `${ASFI_FILES}${spec.file}`;
    const document = await download(url);
    const rows = await pdfRows(document.bytes, [spec.page]);
    const figures = closingEquity(rows, spec.closingMonth);
    const label = decodeURIComponent(spec.file).replace(/\.pdf$/iu, '');
    if (figures.length === 0) {
      gaps.push(
        `${label} p.${spec.page}: sin cierres de mes ${spec.closingMonth} en la fila «Total patrimonio»`,
      );
      continue;
    }
    const { slug, name } = companyIdentity(spec.company);
    const code = `${EQUITY_PREFIX}${codeOf(slug, 80 - EQUITY_PREFIX.length)}`;
    const own =
      book.get(code) ??
      ({
        indicatorCode: code,
        name: `${name}: patrimonio {empresa=${slug}; sector=${spec.sector}}`,
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
    for (const figure of figures) {
      const value = thousands(figure.printed, spec.unit);
      const point: RegisterPoint = {
        period: figure.year,
        value,
        excerpt: `Prospecto «${label}», p. ${spec.page}, columna ${figure.column}, cifra impresa ${figure.printed} (en ${spec.unit === 'bolivianos' ? 'bolivianos' : `${spec.unit} de bolivianos`}): ${figure.line}. Convertido a miles de bolivianos: ${value}`,
        sourceUrl: url,
        upstreamSha256: document.sha256,
        retrievedAt: document.retrievedAt,
      };
      const at = own.points.findIndex((one) => one.period === point.period);
      if (at >= 0) own.points[at] = point;
      else own.points.push(point);
    }
    book.set(code, own);
  }
  for (const series of book.values())
    series.points.sort((a, b) => a.period.localeCompare(b.period));
  return { series: [...book.values()], gaps };
}
