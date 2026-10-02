import { inflateRawSync } from 'node:zlib';
import { biffSheets, type BiffValue } from './biff-cells';
import { codeOf, companyIdentity, download } from './business-common';
import type { RegisterPoint, RegisterSeries } from '../macro/annual-register-shape';

/**
 * El patrimonio de los bancos al cierre de cada gestión, de los estados
 * financieros por entidad que publica ASFI.
 *
 * Es la otra mitad de la estimación: participación por patrimonio. Para los
 * bancos no hace falta leer cada memoria —ASFI publica cada mes un cuaderno con
 * el balance de todas las entidades de un mismo tipo, una columna por entidad—
 * y se toma el de diciembre: el cierre de gestión, que es el que auditan.
 *
 * Tres familias de cuadernos según la ley que regía: «bancos» hasta julio de
 * 2014, «bancos múltiples» y «bancos PyME» desde entonces. Los fondos
 * financieros privados —FIE, Prodem, Fortaleza antes de ser bancos— publicaban
 * en bolivianos y no en miles, y una serie no puede mezclar unidades: se leen
 * sólo los cuadernos en miles y los demás quedan como hueco en el informe.
 *
 * El cuaderno no nombra a las entidades, sólo su sigla de tres letras; la
 * tabla de siglas de abajo es la que ASFI usa en todos sus boletines.
 */

const FILES = 'https://www.asfi.gob.bo/sites/default/files/estadisticaif/';

/** Cada familia: carpeta, sigla del archivo y gestiones con cierre publicado. */
const FAMILIES = [
  { folder: 'ban_210714', tag: 'BCO', from: 2005, to: 2013 },
  { folder: 'bancos_multiples', tag: 'BMU', from: 2014, to: 2025 },
  { folder: 'bancos_pymes', tag: 'BPY', from: 2014, to: 2025 },
] as const;

const ENTITIES: Readonly<Record<string, string>> = {
  BNB: 'Banco Nacional de Bolivia S.A.',
  BUN: 'Banco Unión S.A.',
  BME: 'Banco Mercantil Santa Cruz S.A.',
  BIS: 'Banco Bisa S.A.',
  BCR: 'Banco de Crédito de Bolivia S.A.',
  BGA: 'Banco Ganadero S.A.',
  BEC: 'Banco Económico S.A.',
  BSO: 'Banco Solidario S.A - BancoSol S.A.',
  BNA: 'Banco de la Nación Argentina',
  BDB: 'Banco do Brasil S.A.',
  BIE: 'Banco FIE S.A.',
  BFO: 'Banco Fortaleza S.A.',
  BFS: 'Banco Fassil S.A.',
  BPR: 'Banco Prodem S.A.',
  BSC: 'Banco Santa Cruz S.A.',
  BCT: 'Citibank N.A. Sucursal Bolivia',
  BLA: 'Banco Los Andes ProCredit S.A.',
  PEF: 'Banco PyME Ecofuturo S.A.',
  PCO: 'Banco PyME de la Comunidad S.A.',
  PLA: 'Banco PyME Los Andes ProCredit S.A.',
};

export const EQUITY_PREFIX = 'OWNER_EQUITY_';

const BASIS =
  'Patrimonio contable al 31 de diciembre según los estados financieros por entidad que publica ASFI, en miles de bolivianos corrientes. Es valor en libros, no valor de mercado ni la fortuna de sus accionistas.';

/** El único libro del zip que ASFI publica, inflado sin biblioteca. */
function onlyEntry(zip: Buffer): Buffer {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error('el zip no tiene directorio central');
  const central = zip.readUInt32LE(end + 16);
  const method = zip.readUInt16LE(central + 10);
  const packed = zip.readUInt32LE(central + 20);
  const local = zip.readUInt32LE(central + 42);
  const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  const data = zip.subarray(start, start + packed);
  return method === 0 ? data : inflateRawSync(data);
}

const text = (value: BiffValue | undefined): string => String(value ?? '').trim();

interface Cell {
  readonly code: string;
  readonly figure: string;
  readonly quote: string;
}

/** Las cifras de la fila «PATRIMONIO», una por sigla de entidad. */
function equityRow(rows: readonly (readonly (BiffValue | undefined)[])[], label: string): Cell[] {
  const head = rows.find((row) => row?.some((value) => text(value) === 'TOTAL SISTEMA'));
  const line = rows.find((row) => text(row?.[0]) === 'PATRIMONIO' || text(row?.[1]) === 'PATRIMONIO');
  const title = rows
    .slice(0, Math.max(0, rows.indexOf(head ?? [])))
    .map((row) => text(row?.find((value) => text(value))))
    .filter(Boolean);
  if (!head || !line) throw new Error(`${label}: sin cabecera de entidades o sin fila PATRIMONIO`);
  return head.flatMap((value, column) => {
    const code = text(value);
    const figure = line[column];
    if (!ENTITIES[code] || typeof figure !== 'number') return [];
    const quote = JSON.stringify({ cuadro: title.join(' · '), entidad: code, fila: 'PATRIMONIO', cifra: String(figure) });
    return [{ code, figure: String(figure), quote }];
  });
}

/** Las series de patrimonio de todos los bancos y los huecos que quedaron. */
export async function bankEquity(): Promise<{ series: RegisterSeries[]; gaps: string[] }> {
  const book = new Map<string, RegisterSeries>();
  const gaps: string[] = [];
  for (const family of FAMILIES) {
    for (let year = family.from; year <= family.to; year += 1) {
      const url = `${FILES}${family.folder}/${year}/12/${year}12_${family.tag}_EstadosFinancieros.zip`;
      const label = `${family.tag} ${year}`;
      const document = await download(url);
      const sheet = biffSheets(onlyEntry(document.bytes)).find((one) => one.rows.length > 20);
      const units = sheet?.rows.slice(0, 8).map((row) => text(row?.find((value) => text(value)))).join(' ') ?? '';
      if (!sheet || !/miles de bolivianos/iu.test(units)) {
        gaps.push(`${label}: el cuaderno no está en miles de bolivianos`);
        continue;
      }
      for (const cell of equityRow(sheet.rows, label)) {
        const { slug, name } = companyIdentity(ENTITIES[cell.code] ?? cell.code);
        const code = `${EQUITY_PREFIX}${codeOf(slug, 80 - EQUITY_PREFIX.length)}`;
        const point: RegisterPoint = {
          period: String(year),
          value: cell.figure,
          excerpt: `Estados financieros por entidad, ${label} (ASFI): ${cell.quote}`,
          sourceUrl: url,
          upstreamSha256: document.sha256,
          retrievedAt: document.retrievedAt,
        };
        const own = book.get(code) ?? {
          indicatorCode: code,
          name: `${name}: patrimonio {empresa=${slug}; sector=Bancos}`,
          group: slug.slice(0, 60),
          groupLabel: name,
          measure: 'Patrimonio total al cierre de gestión',
          level: 'COMPANY',
          unit: 'THOUSAND_BOB',
          basis: BASIS,
          publisher: 'Autoridad de Supervisión del Sistema Financiero (ASFI)',
          frequency: 'ANNUAL',
          points: [],
        };
        if (own.points.some((one) => one.period === point.period)) throw new Error(`${code}: dos cierres en ${year}`);
        own.points.push(point);
        book.set(code, own);
      }
    }
  }
  return { series: [...book.values()], gaps };
}
