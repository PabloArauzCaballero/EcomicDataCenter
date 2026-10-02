import { BANK_DOCUMENTS } from './ownership-bank-documents';
import { FIRM_DOCUMENTS } from './ownership-firm-documents';
import type { OwnershipDocument } from './ownership-sources';

/**
 * Los documentos que el colector lee, ya armados desde sus tablas declaradas.
 */

const ASFI_FILES = 'https://www.asfi.gob.bo/sites/default/files/';

/**
 * La razón social de cada emisor, escrita como la escriben Impuestos y la Bolsa
 * para que `companyIdentity` dé el mismo código que en los ránkings.
 */
const ISSUER_NAMES: Readonly<Record<string, string>> = {
  BEC: 'Banco Económico S.A.',
  BGA: 'Banco Ganadero S.A.',
  BIS: 'Banco Bisa S.A.',
  BME: 'Banco Mercantil Santa Cruz S.A.',
  BNB: 'Banco Nacional de Bolivia S.A.',
  BPC: 'Compañía Boliviana de Energía Eléctrica S.A.',
  BSO: 'Banco Solidario S.A - BancoSol S.A.',
  BTB: 'Banco de Crédito de Bolivia S.A.',
  BUN: 'Banco Unión S.A.',
  CMI: 'CAMSA Industria y Comercio S.A.',
  DIN: 'Droguería Inti S.A.',
  DMT: 'Distribuidora Mayorista de Tecnología S.A.',
  DTC: 'Datec Ltda.',
  EFO: 'Ferroviaria Oriental S.A.',
  ELF: 'Empresa de Luz y Fuerza Eléctrica Cochabamba S.A.',
  ELP: 'Distribuidora de Electricidad La Paz S.A.',
  EMT: 'Empresa Minera Paititi S.A.',
  EPE: 'Equipo Petrolero S.A.',
  FCO: 'Banco PyME de la Comunidad S.A.',
  FCZ: 'Farmacia Chávez S.A.',
  FEF: 'Banco PyME Ecofuturo S.A.',
  FFO: 'Banco Fortaleza S.A.',
  FIE: 'Banco FIE S.A.',
  FIN: 'Industrias de Aceite S.A.',
  FSL: 'Banco Fassil S.A.',
  GRB: 'Gravetal Bolivia S.A.',
  GYE: 'Gas & Electricidad S.A.',
  IEL: 'Import Export Las Lomas Ltda.',
  IOL: 'Industrias Oleaginosas S.A.',
  LAP: 'Banco Los Andes ProCredit S.A.',
  MER: 'Merinco S.A.',
  NUT: 'Sociedad Agroindustrial Nutrioil S.A.',
  NXS: 'Comercializadora Nexolider S.A.',
  PAP: 'La Papelera S.A.',
  PIL: 'PIL Andina S.A.',
  POL: 'Procesadora de Oleaginosas PROLEGA S.A.',
  SBC: 'Sociedad Boliviana de Cemento S.A.',
  SOF: 'Granja Avícola Integral Sofía Ltda.',
  TAE: 'Tienda Amiga ER S.A.',
  TSM: 'Industria Textil TSM S.A.',
  TYS: 'Toyosa S.A.',
};

/** Un renglón de las tablas declaradas, convertido en documento. */
function documentOf(line: string): OwnershipDocument {
  const [issuer = '', path = '', pages = '', asOf = '', rows = '', company, anchor, flag] =
    line.split('|');
  const name = company || ISSUER_NAMES[issuer];
  if (!name || !/^\d{4}-\d{2}-\d{2}$/u.test(asOf)) throw new Error(`renglón mal declarado: ${line}`);
  return {
    issuer,
    company: name,
    url: `${ASFI_FILES}${path}`,
    kind: 'prospecto',
    pages: pages.split(',').map(Number),
    asOf,
    rows: Number(rows),
    ...(anchor ? { layout: { anchor: new RegExp(anchor, 'iu') } } : {}),
    ...(flag === 'sin-acciones' ? { units: false as const } : {}),
  };
}

const parse = (table: string): OwnershipDocument[] =>
  table
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(documentOf);

export const OWNERSHIP_DOCUMENTS: readonly OwnershipDocument[] = [
  ...parse(BANK_DOCUMENTS),
  ...parse(FIRM_DOCUMENTS),
];

/**
 * Las fichas de la Bolsa y cuántas filas trae hoy su cuadro de accionistas.
 *
 * Quedan fuera las de cooperativas, instituciones financieras de desarrollo y
 * municipios, que no tienen accionistas; la de COBEE, cuyo único accionista
 * ocupa la fila en que la ficha pone el total; y la de Inversiones Irala, cuyas
 * cuotas suman más de cien. La Bolsa reescribe las fichas cada mes: si un
 * conteo deja de cuadrar, la corrida se detiene y se revisa la ficha.
 */
const FICHA_ROWS = `
AGU:10 ALG:7 ALI:9 BEC:11 BGA:11 BIA:3 BIL:10 BIO:5 BIS:11 BIT:5 BME:11 BNB:11 BNL:11 BSG:10
BSO:10 BTB:5 BUN:11 BVC:9 CAC:3 CAI:7 CBA:3 CGU:3 CMI:3 COR:11 CPE:3 CRU:8 CTM:8 DIN:9 DMT:4
DTC:2 EEO:5 EFO:3 ELF:11 ELP:4 EMT:11 EPA:11 EPE:8 FAN:3 FBF:3 FCA:10 FCO:10 FCZ:4 FEF:11
FFO:8 FIE:11 FIN:3 FLE:7 FPR:11 FSL:5 GFB:11 GNI:10 GRB:3 GUA:2 GYE:11 HLT:5 ICT:3 IEL:2
IMQ:2 IOL:4 ITA:3 JSF:2 LSP:4 LVI:10 MDS:10 MSL:3 NFB:2 NIB:4 NSP:3 NUT:9 NVA:11 NXS:5 OVA:6
PAN:8 PAR:4 PCH:11 PIN:11 PLR:6 POL:5 PTF:5 RAI:5 SBC:2 SBI:3 SCF:3 SIS:11 SMI:3 SNA:3 SOC:5
SOF:2 SSC:4 SZS:4 TAE:4 TCB:4 TDE:11 TRD:11 TSM:5 TYS:3 VAH:2 VID:11 VUN:3`;

export const BBV_FICHAS: Readonly<Record<string, number>> = Object.fromEntries(
  FICHA_ROWS.trim()
    .split(/\s+/u)
    .map((pair) => {
      const [code = '', rows = ''] = pair.split(':');
      return [code, Number(rows)];
    }),
);

/**
 * Fichas cuyas acciones no cuadran con el porcentaje que imprimen: la del BISA
 * da cuotas sobre un total distinto del que suma la columna, la de Paititi
 * mezcla series. Se leen igual —el porcentaje es el que la ficha publica— sin la
 * comprobación de alineación.
 */
export const FICHAS_WITHOUT_UNITS: ReadonlySet<string> = new Set(['BIS', 'EMT']);
