import {
  documentStatedPublication,
  undatedOfficialIndicator,
  verifiedSource,
} from '../verified-source-registry';

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

  it('establishes the departmental statistics office apart from the national one', () => {
    expect(verifiedSource('https://ice.santacruz.gob.bo/publicaciones')).toEqual({
      publisher: 'INSTITUTO CRUCENO DE ESTADISTICA',
      tier: 'OFFICIAL',
    });
  });

  it('reads a multilateral compiler from its domain rather than from a redistributor', () => {
    expect(verifiedSource('https://www.imf.org/external/datamapper/NGDP_RPCH/BOL')?.publisher).toBe(
      'FONDO MONETARIO INTERNACIONAL',
    );
    expect(verifiedSource('https://comtradeapi.un.org/public/v1/preview/C/A/HS')?.publisher).toBe(
      'NACIONES UNIDAS',
    );
  });

  it('attributes a trade body without ranking it as a statistics office', () => {
    expect(verifiedSource('https://ibce.org.bo/informacion-estadisticas-bolivia.php')).toEqual({
      publisher: 'INSTITUTO BOLIVIANO DE COMERCIO EXTERIOR',
      tier: 'SECTOR',
    });
    expect(verifiedSource('https://cadecocruz.org.bo/indicadores')?.tier).toBe('SECTOR');
    expect(verifiedSource('https://www.cainco.org.bo/estudios')?.tier).toBe('SECTOR');
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

  it('never waives the publication date for a trade body either', () => {
    expect(
      undatedOfficialIndicator({
        recordType: 'DAILY_INDICATOR',
        publishedAt: null,
        publicationDateAssessment: 'UNAVAILABLE',
        source: { publisher: 'INSTITUTO BOLIVIANO DE COMERCIO EXTERIOR', tier: 'SECTOR' },
      }),
    ).toBe(false);
  });
  it('attributes a research compiler on the same terms as a trade body', () => {
    expect(verifiedSource('https://www.kantar.com/latin-america/moda-en-bolivia')).toEqual({
      publisher: 'KANTAR WORLDPANEL',
      tier: 'SECTOR',
    });
    expect(verifiedSource('https://inesad.edu.bo/estudio')?.tier).toBe('SECTOR');
  });

  it('does not register a social platform at all', () => {
    // ADR 0025. A platform domain is the one address that establishes nothing:
    // it serves whatever an account posted, and 39% of the accounts spreading
    // content in the May 2026 conflict presented themselves as newsrooms
    // without being any. Leaving it unregistered is what keeps a URL served
    // from one from ever resolving to a publisher.
    for (const url of [
      'https://www.tiktok.com/@cuenta/video/123',
      'https://www.facebook.com/RedUnotv',
      'https://www.instagram.com/alguna-cuenta',
      'https://x.com/alguna-cuenta',
    ]) {
      expect(verifiedSource(url)).toBeUndefined();
    }
    // The outlet being imitated stays registered under its own domain.
    expect(verifiedSource('https://www.reduno.com.bo/nota')?.tier).toBe('PRESS');
  });

  it('never admits an unregistered domain to the checks that feed a series', () => {
    expect(documentStatedPublication({ statedInDocument: true, source: undefined })).toBe(false);
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
