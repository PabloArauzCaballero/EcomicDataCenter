import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AbiMention } from '../../../src/database/seeds/schemas/abi-news.schema';
import { fold } from './text';

export interface Issuer {
  code: string;
  name: string;
  aliases: string[];
  evidenceUrl: string;
}
// Only distinctive names: bare YPFB, ENDE, Unión, Fortaleza, Sofía and BISA are ambiguous.
const ALIASES: Record<string, string[]> = {
  BUN: ['Banco Unión'],
  BGA: ['Banco Ganadero'],
  BNB: ['Banco Nacional de Bolivia'],
  BME: ['Banco Mercantil Santa Cruz'],
  BIS: ['Banco Bisa'],
  BEC: ['Banco Económico'],
  BTB: ['Banco de Crédito de Bolivia', 'BCP Bolivia'],
  BSO: ['BancoSol', 'Banco Sol', 'Banco Solidario'],
  FIE: ['Banco FIE'],
  FEF: ['Banco Ecofuturo', 'Banco PyME Ecofuturo'],
  FFO: ['Banco Fortaleza'],
  FPR: ['Banco Prodem'],
  FSL: ['Banco Fassil'],
  NFB: ['Banco de Desarrollo Productivo'],
  FAN: ['Fancesa', 'Fábrica Nacional de Cemento'],
  SBC: ['Soboce', 'Sociedad Boliviana de Cemento'],
  PCH: ['YPFB Chaco'],
  EPA: ['YPFB Andina'],
  TRD: ['YPFB Transporte'],
  TRA: ['YPFB Transierra'],
  VAH: ['ENDE Valle Hermoso'],
  TDE: ['ENDE Transmisión'],
  EEO: ['ENDE DeOruro'],
  COR: ['ENDE Corani', 'Empresa Eléctrica Corani'],
  GUA: ['ENDE Guaracachi', 'Empresa Eléctrica Guaracachi'],
  ELF: ['Elfec', 'Empresa de Luz y Fuerza Eléctrica Cochabamba'],
  ELP: ['Delapaz'],
  TCB: ['Telefónica Celular de Bolivia', 'Tigo Bolivia'],
  DIN: ['Droguería Inti'],
  SOF: ['Granja Avícola Integral Sofía', 'Sofía Ltda', 'empresa Sofía'],
  ITA: ['Itacamba'],
  FIN: ['Industrias de Aceite'],
  IOL: ['Industrias Oleaginosas'],
  NUT: ['Nutrioil'],
  GRB: ['Gravetal'],
  AGU: ['Ingenio Sucroalcoholero Aguaí', 'Ingenio Aguaí'],
  EMT: ['Empresa Minera Paititi', 'Emipa'],
  MSL: ['Minera San Lucas'],
  SMI: ['Minera Illapa'],
  FCA: ['Ferroviaria Andina'],
  EFO: ['Ferroviaria Oriental'],
  VUN: ['Valores Unión'],
  BNL: ['BNB Leasing'],
  NVA: ['BNB Valores'],
  SUN: ['SAFI Unión'],
  SNA: ['BNB SAFI'],
  BIL: ['Bisa Leasing'],
  SBI: ['Bisa SAFI'],
  BIA: ['Bisa Agencia de Bolsa'],
  NAT: ['BDP Sociedad de Titularización'],
  BBV: ['Bolsa Boliviana de Valores'],
  TYS: ['Toyosa'],
  OVA: ['Ovando S.A'],
  JSF: ['Jalasoft'],
  PTF: ['Plastiforte'],
  FCZ: ['Farmacia Chávez', 'Farmacias Chávez'],
  NIB: ['Nibol'],
  DTC: ['Datec'],
  HLT: ['Hotel Los Tajibos', 'Sociedad Hotelera Los Tajibos'],
  TAE: ['Tienda Amiga'],
};
export function buildIssuers(): Issuer[] {
  const input = JSON.parse(
    readFileSync(join('src/database/seeds/boot/company-filings-archive.json'), 'utf8'),
  ) as {
    filings: Array<{ filerCode: string; filer: string; url: string }>;
  };
  const catalog = new Map<string, Issuer>();
  for (const row of input.filings) {
    const existing = catalog.get(row.filerCode);
    const shortened = row.filer.replace(/\s+S\.?\s*A\.?\s*$/iu, '').trim();
    const alias = shortened.includes(' ') ? shortened : row.filer;
    if (existing) {
      if (!existing.aliases.includes(alias)) existing.aliases.push(alias);
      continue;
    }
    catalog.set(row.filerCode, {
      code: row.filerCode,
      name: row.filer,
      evidenceUrl: row.url,
      aliases: [...new Set([alias, ...(ALIASES[row.filerCode] ?? [])])],
    });
  }
  return [...catalog.values()].sort((a, b) => a.code.localeCompare(b.code));
}
/** A mention is an observed name, not an assertion about the company's involvement. */
export function matchIssuers(title: string, text: string, issuers: Issuer[]): AbiMention[] {
  const matches: AbiMention[] = [];
  const fields = (
    [
      ['TITLE', title],
      ['BODY', text],
    ] as const
  ).map(([field, source]) => ({ field, source, normalized: fold(source) }));
  for (const issuer of issuers) {
    for (const { field, source, normalized } of fields) {
      let hit: AbiMention | undefined;
      for (const alias of [...issuer.aliases].sort((a, b) => b.length - a.length)) {
        const name = fold(alias);
        if (!name) continue;
        let start = normalized.indexOf(name);
        while (
          start >= 0 &&
          (/[a-z0-9]/u.test(normalized[start - 1] ?? '') ||
            /[a-z0-9]/u.test(normalized[start + name.length] ?? ''))
        )
          start = normalized.indexOf(name, start + 1);
        if (start < 0) continue;
        // Character offsets are measured on original text (Spanish accents preserve length after folding).
        hit = {
          filerCode: issuer.code,
          filer: issuer.name,
          alias,
          field,
          role: field === 'TITLE' ? 'HEADLINE' : 'MENTION',
          start,
          end: start + alias.length,
          evidence: source.slice(Math.max(0, start - 100), start + alias.length + 180),
          method: 'EXACT_ALIAS_V1',
        };
        break;
      }
      if (hit) {
        matches.push(hit);
        break;
      }
    }
  }
  return matches;
}
