import type { BankSeries } from '../../src/database/seeds/schemas/bank-virtual-assets.schema';

/**
 * Qué se lee, y dónde, de cada banco que ofrece dólar digital.
 *
 * Casi ningún banco publica su cotización fuera de la aplicación autenticada:
 * de esos se lee si la página oficial sigue anunciando el servicio y qué
 * límites declara. La excepción es Banco BISA, que sirve compra y venta de
 * USDT en bolivianos en un XML público que alimenta su propia portada
 * (`QUOTE_FEEDS`). Banco Unión no aparece en `PAGES`: su sitio de Yasta
 * rechaza (403) las consultas automáticas, y esa serie solo tiene su fecha de
 * arranque, sin lectura diaria.
 */

export type SeriesSpec = Pick<
  BankSeries,
  'indicatorCode' | 'bank' | 'bankName' | 'product' | 'asset' | 'kind' | 'unit' | 'note'
> & { readonly limit?: string; readonly side?: 'CLIENT_BUYS' | 'CLIENT_SELLS' };

const offered = (
  bank: string,
  bankName: string,
  product: string,
  asset: 'USDT' | 'USDC',
  note: string,
): SeriesSpec => ({
  indicatorCode: `VASP_${bank}_${asset}_OFFERED`,
  bank,
  bankName,
  product,
  asset,
  kind: 'OFFERED',
  unit: 'BOOLEAN',
  note,
});

export const OFFERED_SERIES: readonly SeriesSpec[] = [
  offered(
    'BISA',
    'Banco BISA',
    'CriptoBISA',
    'USDT',
    'Custodia, compra y venta de USDT; el primer banco en ofrecerla.',
  ),
  offered(
    'BCP',
    'Banco de Crédito de Bolivia (BCP)',
    'USDT en la aplicación del BCP',
    'USDT',
    'Convierte bolivianos a USDT para transferencias internacionales y para recargar la tarjeta prepago.',
  ),
  offered(
    'GANADERO',
    'Banco Ganadero',
    'GanaCripto',
    'USDC',
    'El único banco que ofrece USDC; los demás ofrecen USDT.',
  ),
  offered(
    'FIE',
    'Banco FIE',
    'Cuenta Cripto FIE',
    'USDT',
    'Compra, venta, recepción y envío de USDT; liquida en bolivianos.',
  ),
  offered(
    'UNION',
    'Banco Unión',
    'Billetera Yasta con USDT',
    'USDT',
    'Sin lectura diaria: el sitio de Yasta rechaza las consultas automáticas (403).',
  ),
  offered(
    'BNB',
    'Banco Nacional de Bolivia (BNB)',
    'Cuenta Cripto BNB',
    'USDT',
    'El banco nunca dijo cuándo empezó: el punto inicial es la fecha de su primer documento oficial.',
  ),
];

const limit = (
  code: string,
  limitName: string,
  what: string,
  bankName = 'Banco Ganadero',
): SeriesSpec => ({
  indicatorCode: `VASP_GANADERO_USDC_${code}`,
  bank: 'GANADERO',
  bankName,
  product: 'GanaCripto',
  asset: 'USDC',
  kind: 'LIMIT',
  limit: limitName,
  unit: 'USDC',
  note: what,
});

export const LIMIT_SERIES: readonly SeriesSpec[] = [
  limit('TRADE_MIN', 'TRADE_MIN', 'Mínimo por operación de compra o venta de USDC.'),
  limit('TRADE_MAX_DAY', 'TRADE_MAX_DAY', 'Máximo por día de compra o venta de USDC.'),
  limit('TRANSFER_MIN', 'TRANSFER_MIN', 'Mínimo por giro internacional en USDC.'),
  limit('TRANSFER_MAX_DAY', 'TRANSFER_MAX_DAY', 'Máximo por día de giros internacionales en USDC.'),
];

const quote = (spec: SeriesSpec, side: 'CLIENT_BUYS' | 'CLIENT_SELLS'): SeriesSpec => ({
  indicatorCode: `VASP_${spec.bank}_${spec.asset}_QUOTE_${side}`,
  bank: spec.bank,
  bankName: spec.bankName,
  product: spec.product,
  asset: spec.asset,
  kind: 'QUOTE',
  side,
  unit: 'BOB',
  note:
    side === 'CLIENT_BUYS'
      ? `Bolivianos que el cliente paga por cada ${spec.asset} en ${spec.bankName}.`
      : `Bolivianos que el cliente recibe por cada ${spec.asset} en ${spec.bankName}.`,
});

/**
 * Lo que cada banco cobra y paga por ficha. BISA y el BCP lo publican (`QUOTE_FEEDS`);
 * en los demás estas series se cargan a mano desde una captura de la aplicación,
 * y quedan sin puntos —y por tanto fuera de la semilla— hasta que llega la primera.
 */
export const QUOTE_SERIES: readonly SeriesSpec[] = OFFERED_SERIES.flatMap((spec) => [
  quote(spec, 'CLIENT_BUYS'),
  quote(spec, 'CLIENT_SELLS'),
]);

/**
 * Un banco que publica su cotización de la ficha en su sitio, sin sesión.
 *
 * Dos formas:
 *
 * - `XML`: el archivo de BISA, el mismo que lee la portada de bisa.com (CORS
 *   abierto, sin cookie ni token). `ValorCompra` es lo que el BANCO compra y
 *   `ValorVenta` lo que VENDE; el lector los invierte a los lados del cliente.
 * - `TICKER`: la cinta «Cotizaciones» de la portada del BCP, que viene en el
 *   HTML del servidor («USDT Venta: 12.20 | USDT Compra: 11.90»). La página del
 *   servicio (`/USDtCuenta`) dice que el precio «es visible dentro de la app» y
 *   no trae la cinta: hay que leer la portada. «Venta» es lo que el banco vende,
 *   o sea lo que el cliente paga. Hasta mayo de 2026 la cinta sólo traía la
 *   venta; un lado que falta no se escribe.
 *
 * Los dos se actualizan durante el día y la semilla guarda el último valor de
 * cada día.
 */
export type QuoteFeed =
  | {
      readonly bank: string;
      readonly url: string;
      readonly format: 'XML';
      /** La moneda y contra qué se cotiza, como las nombra el archivo: `UST` contra `BOB`. */
      readonly currency: string;
      readonly against: string;
    }
  | {
      readonly bank: string;
      readonly url: string;
      readonly format: 'TICKER';
      /** Cómo nombra la cinta a la ficha: «USDT Venta», «USDT Compra». */
      readonly label: string;
    };

export const QUOTE_FEEDS: readonly QuoteFeed[] = [
  {
    bank: 'BISA',
    url: 'https://sjoven.bisa.com/assets/cotizaciones.xml',
    format: 'XML',
    currency: 'UST',
    against: 'BOB',
  },
  {
    bank: 'BCP',
    url: 'https://www.bcp.com.bo/',
    format: 'TICKER',
    label: 'USDT',
  },
];

export interface LimitReading {
  readonly indicatorCode: string;
  /** Debe tener dos grupos: el mínimo y el máximo, en ese orden. */
  readonly pattern: RegExp;
  readonly group: 1 | 2;
}

export interface BankPage {
  readonly bank: string;
  readonly url: string;
  /** Sin esto en el texto, la página no es la del banco y no se lee nada. */
  readonly identity: RegExp;
  /** El pasaje que anuncia el servicio. */
  readonly marker: RegExp;
  /** `html` cuando el anuncio es una imagen y solo existe en el marcado. */
  readonly haystack: 'text' | 'html';
  readonly limits?: readonly LimitReading[];
}

const GANADERO_TRADE =
  /Compra\/Venta:\s*De\s+([\d.,]+)\s+USDC\s+a\s+([\d.,]+)\s+USDC\s+por\s+d.{1,2}a/iu;
const GANADERO_TRANSFER =
  /Giros Internacionales:\s*De\s+([\d.,]+)\s+USDC\s+a\s+([\d.,]+)\s+USDC\s+por\s+d.{1,2}a/iu;

export const PAGES: readonly BankPage[] = [
  {
    bank: 'BISA',
    url: 'https://www.bisa.com/criptobisa-usdt',
    identity: /Banco BISA/iu,
    marker: /servicio de custodia, compra y venta de USDT/iu,
    haystack: 'text',
  },
  {
    bank: 'BCP',
    url: 'https://www.bcp.com.bo/USDtCuenta',
    identity: /Transacciona con USDT/iu,
    marker: /Ya puedes comprar USDT desde nuestra App/iu,
    haystack: 'text',
  },
  {
    bank: 'GANADERO',
    url: 'https://www.bg.com.bo/ganacripto/',
    identity: /Banco Ganadero/iu,
    marker: /comprar, vender y custodiar USDC/iu,
    haystack: 'text',
    limits: [
      { indicatorCode: 'VASP_GANADERO_USDC_TRADE_MIN', pattern: GANADERO_TRADE, group: 1 },
      { indicatorCode: 'VASP_GANADERO_USDC_TRADE_MAX_DAY', pattern: GANADERO_TRADE, group: 2 },
      { indicatorCode: 'VASP_GANADERO_USDC_TRANSFER_MIN', pattern: GANADERO_TRANSFER, group: 1 },
      {
        indicatorCode: 'VASP_GANADERO_USDC_TRANSFER_MAX_DAY',
        pattern: GANADERO_TRANSFER,
        group: 2,
      },
    ],
  },
  {
    bank: 'FIE',
    url: 'https://cuentacripto.bancofie.com.bo/apertura-cripto',
    identity: /BANCO FIE/iu,
    marker: /Compra, vende, recibe y env.{1,2}a USDT/iu,
    haystack: 'text',
  },
  {
    // El anuncio es un cartel: solo su texto alternativo lo nombra.
    bank: 'BNB',
    url: 'https://www.bnb.com.bo/PortalBNB/Principal/BancaPersonas',
    identity: /PortalBNB/u,
    marker: /alt="Cuenta Cripto"/u,
    haystack: 'html',
  },
];
