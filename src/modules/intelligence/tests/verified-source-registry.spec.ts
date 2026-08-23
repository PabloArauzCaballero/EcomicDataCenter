import { undatedOfficialIndicator, verifiedSource } from '../verified-source-registry';

describe('verified source registry', () => {
  it('establishes the publisher of an institutional domain without page metadata', () => {
    expect(verifiedSource('https://www.bcb.gob.bo/librerias/indicadores/otras/ultimo.php')).toEqual(
      {
        publisher: 'BANCO CENTRAL DE BOLIVIA',
        tier: 'OFFICIAL',
      },
    );
  });

  it('matches registered subdomains and ignores letter case', () => {
    expect(verifiedSource('https://WWW.INE.GOB.BO/indice')?.publisher).toBe(
      'INSTITUTO NACIONAL DE ESTADISTICA',
    );
  });

  it('separates a market venue from an institutional publisher', () => {
    expect(verifiedSource('https://api.dolarbluebolivia.click/v1/eldorado')?.tier).toBe('MARKET');
  });

  it('does not let an unregistered domain impersonate a registered one', () => {
    expect(verifiedSource('https://bcb.gob.bo.attacker.example/tabla')).toBeUndefined();
    expect(verifiedSource('https://notbcb.gob.bo.evil.test/tabla')).toBeUndefined();
  });

  it('refuses a domain reached without transport security', () => {
    expect(verifiedSource('http://www.bcb.gob.bo/tabla')).toBeUndefined();
  });

  it('returns nothing for an unregistered domain or an unparsable url', () => {
    expect(verifiedSource('https://example.com/nota')).toBeUndefined();
    expect(verifiedSource('not a url')).toBeUndefined();
  });

  it('accepts an official indicator table that declares no publication date', () => {
    expect(
      undatedOfficialIndicator({
        recordType: 'DAILY_INDICATOR',
        publishedAt: null,
        publicationDateAssessment: 'UNAVAILABLE',
        source: { publisher: 'BANCO CENTRAL DE BOLIVIA', tier: 'OFFICIAL' },
      }),
    ).toBe(true);
  });

  it('never waives the publication date for news, market data or a claimed date', () => {
    const official = { publisher: 'BANCO CENTRAL DE BOLIVIA', tier: 'OFFICIAL' } as const;

    expect(
      undatedOfficialIndicator({
        recordType: 'NEWS',
        publishedAt: null,
        publicationDateAssessment: 'UNAVAILABLE',
        source: official,
      }),
    ).toBe(false);
    expect(
      undatedOfficialIndicator({
        recordType: 'DAILY_INDICATOR',
        publishedAt: '2026-08-22T10:00:00Z',
        publicationDateAssessment: 'UNAVAILABLE',
        source: official,
      }),
    ).toBe(false);
    expect(
      undatedOfficialIndicator({
        recordType: 'DAILY_INDICATOR',
        publishedAt: null,
        publicationDateAssessment: 'UNAVAILABLE',
        source: { publisher: 'DOLAR BLUE BOLIVIA', tier: 'MARKET' },
      }),
    ).toBe(false);
    expect(
      undatedOfficialIndicator({
        recordType: 'DAILY_INDICATOR',
        publishedAt: null,
        publicationDateAssessment: 'UNAVAILABLE',
        source: undefined,
      }),
    ).toBe(false);
  });
});
