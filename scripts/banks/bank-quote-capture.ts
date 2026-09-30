import { createHash } from 'node:crypto';
import { OFFERED_SERIES, QUOTE_SERIES } from './bank-sources';
import type { Reading } from './bank-readings';

/**
 * Una cotización que alguien leyó dentro de la aplicación de un banco.
 *
 * Ningún banco publica lo que cobra o paga por cada USDT o USDC fuera de su
 * aplicación, así que esta es la única vía por la que un precio entra a la
 * serie, y por eso viaja marcado: `USER_CAPTURE`, con la descripción de la
 * captura como pasaje y no una página que nadie pudo leer. Los dos lados llegan
 * dichos desde el cliente: lo que paga por comprar y lo que recibe al vender.
 */

export interface QuoteCapture {
  /** El código del banco: BNB, GANADERO, BISA, BCP, FIE o UNION. */
  readonly bank: string;
  /** Bolivianos que el cliente paga por cada ficha. */
  readonly clientBuys: string;
  /** Bolivianos que el cliente recibe por cada ficha. */
  readonly clientSells: string;
  /** El día que se leyó, en La Paz. */
  readonly date: string;
  /** De dónde salió: «captura de BNB Móvil, 15:20». Va tal cual como pasaje. */
  readonly source: string;
  readonly now: Date;
}

const AMOUNT = /^\d{1,3}(?:[.,]\d{1,4})?$/u;

const plain = (value: string): string => value.trim().replace(',', '.');

export function quoteReadings(capture: QuoteCapture): Reading[] {
  const offered = OFFERED_SERIES.find((spec) => spec.bank === capture.bank);
  if (!offered) throw new Error(`no hay un banco «${capture.bank}» entre los que se siguen`);
  if (!/^20\d{2}-\d{2}-\d{2}$/u.test(capture.date)) throw new Error('la fecha va como AAAA-MM-DD');
  if (capture.source.trim().length < 8) throw new Error('hay que decir de dónde salió la cifra');
  const sides = [
    ['CLIENT_BUYS', capture.clientBuys],
    ['CLIENT_SELLS', capture.clientSells],
  ] as const;
  return sides.map(([side, raw]) => {
    if (!AMOUNT.test(raw.trim())) throw new Error(`«${raw}» no es una cifra en bolivianos`);
    const value = plain(raw);
    const series = QUOTE_SERIES.find(
      (spec) => spec.bank === capture.bank && spec.asset === offered.asset && spec.side === side,
    );
    if (!series) throw new Error(`no hay serie de cotización para ${capture.bank}`);
    const excerpt = `${capture.source.trim()}: ${side === 'CLIENT_BUYS' ? 'el cliente compra' : 'el cliente vende'} ${offered.asset} a ${value} Bs (${capture.date})`;
    return {
      indicatorCode: series.indicatorCode,
      point: {
        date: capture.date,
        value,
        basis: 'USER_CAPTURE' as const,
        excerpt,
        sourceUrl: PAGES_URL[capture.bank] ?? 'https://www.asfi.gob.bo/',
        upstreamSha256: createHash('sha256').update(excerpt).digest('hex'),
        retrievedAt: capture.now.toISOString().replace(/\.\d{3}Z$/u, 'Z'),
      },
    };
  });
}

/** La página oficial del servicio, que es a lo que la captura se refiere. */
const PAGES_URL: Readonly<Record<string, string>> = {
  BISA: 'https://www.bisa.com/criptobisa-usdt',
  BCP: 'https://www.bcp.com.bo/USDtCuenta',
  GANADERO: 'https://www.bg.com.bo/ganacripto/',
  FIE: 'https://cuentacripto.bancofie.com.bo/apertura-cripto',
  BNB: 'https://www.bnb.com.bo/PortalBNB/Principal/BancaPersonas',
  UNION: 'https://www.bancounion.com.bo/',
};
