import {
  parallelQuotationAssertion,
  parseBcbQuotationTable,
  parseParallelQuotation,
} from '../daily-indicator-parsers';
import { assessLexicalGrounding } from '../claim-evidence-grounding';
import { ungroundedNumbers } from '../../../common/intelligence/quantitative-grounding';

// Captured verbatim from https://www.bcb.gob.bo/librerias/indicadores/otras/ultimo.php
const bcbTable = `
<p class="style3">FECHA DE LA COTIZACI&Oacute;N:&nbsp; <strong>22 de Agosto 2026</strong></p>
<table class="tabla-cotizacion">
    <tr class="fila1">
        <td>ESTADOS UNIDOS</td>
        <td>D&Oacute;LAR</td>
        <td class="centro">USD</td>
        <td class="numero">11.50</td>
    </tr>
</table>
<table class="tabla-cotizacion">
    <tr class="fila2">
        <td width="190">BOLIVIA (UFV)</td>
        <td width="300">UNIDAD DE FOMENTO DE VIVIENDA</td>
        <td width="110" class="centro">Bs/UFV</td>
        <td width="160" class="numero">3.33384</td>
    </tr>
</table>`;

// Captured verbatim from https://api.dolarbluebolivia.click/v1/eldorado
const venuePayload =
  '{"data":{"source":"eldorado","pair":"BOB/USDT","buy":11.65,"sell":11.51,' +
  '"fetched_at":"2026-08-22T23:58:41.358098+00:00"},"cached":true,' +
  '"fetched_at":"2026-08-22T23:58:41.358098+00:00","updated_at":"2026-08-22 23:58:41",' +
  '"cache_key":"exchange_eldorado"}';

describe('parseBcbQuotationTable', () => {
  it('reads the effective date and both headline values', () => {
    expect(parseBcbQuotationTable(bcbTable)).toEqual({
      effectiveDate: '2026-08-22',
      officialRate: '11.50',
      ufv: '3.33384',
    });
  });

  it('keeps the value exactly as the table writes it', () => {
    // Re-formatting a parsed number would produce a figure the cited excerpt
    // does not contain, and the quantitative grounding check would reject it.
    expect(parseBcbQuotationTable(bcbTable).ufv).toBe('3.33384');
  });

  it('reports a table that lost one of its values instead of inventing it', () => {
    const withoutUfv = bcbTable.slice(0, bcbTable.indexOf('BOLIVIA (UFV)'));

    expect(parseBcbQuotationTable(withoutUfv).ufv).toBeUndefined();
    expect(parseBcbQuotationTable(withoutUfv).officialRate).toBe('11.50');
  });

  it('refuses a page whose effective date it cannot recognize', () => {
    expect(() => parseBcbQuotationTable('<p>sin fecha</p>')).toThrow(/effective date/u);
  });
});

describe('parseParallelQuotation', () => {
  it('quotes the venue payload literally', () => {
    const quotation = parseParallelQuotation(venuePayload);

    expect(quotation.venue).toBe('ELDORADO');
    expect(quotation.instrument).toBe('BOB/USDT');
    expect(quotation.buy).toBe('11.65');
    expect(quotation.sell).toBe('11.51');
    expect(quotation.capturedAt).toBe('2026-08-22T23:58:41.358098+00:00');
    expect(venuePayload).toContain(quotation.excerpt);
  });

  it('refuses a payload missing a price, an instrument or a timestamp', () => {
    expect(() =>
      parseParallelQuotation('{"data":{"source":"eldorado","pair":"BOB/USDT","buy":11.65}}'),
    ).toThrow(/missing a price/u);
    expect(() => parseParallelQuotation('{"error":"down"}')).toThrow(/no quotation object/u);
  });

  it('refuses a timestamp that is not an instant', () => {
    expect(() =>
      parseParallelQuotation(
        '{"data":{"source":"x","pair":"BOB/USDT","buy":1.5,"sell":1.4,"fetched_at":"ayer"}}',
      ),
    ).toThrow(/not an instant/u);
  });
});

describe('parallelQuotationAssertion', () => {
  const quotation = parseParallelQuotation(venuePayload);
  const assertion = parallelQuotationAssertion(quotation);

  it('states both sides of the quotation', () => {
    expect(assertion).toBe(
      'Dolar paralelo BOB/USDT en ELDORADO: buy (compra) 11.65 y sell (venta) 11.51.',
    );
  });

  it('cites no figure the excerpt does not contain', () => {
    expect(ungroundedNumbers(assertion, quotation.excerpt)).toEqual([]);
  });

  it('follows the payload order when the venue writes sell first', () => {
    // The grounding check consumes evidence occurrences in order, so a fixed
    // wording would report a real figure as absent from its own excerpt.
    const sellFirst = parseParallelQuotation(
      '{"data":{"source":"otra","pair":"BOB/USDT","sell":11.51,"buy":11.65,' +
        '"fetched_at":"2026-08-22T23:58:41.358098+00:00"}}',
    );
    const sellFirstAssertion = parallelQuotationAssertion(sellFirst);

    expect(sellFirstAssertion).toContain('sell (venta) 11.51 y buy (compra) 11.65');
    expect(ungroundedNumbers(sellFirstAssertion, sellFirst.excerpt)).toEqual([]);
  });

  it('stays lexically grounded, so the reading is not routed to review', () => {
    // This is the property that decides whether the parallel rate ever
    // publishes: a prose rendering shares too few terms with a JSON body.
    expect(assessLexicalGrounding(assertion, quotation.excerpt).status).toBe('SUPPORTED');
  });
});
