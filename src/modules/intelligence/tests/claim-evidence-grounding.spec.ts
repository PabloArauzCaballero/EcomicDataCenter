import {
  assessLexicalGrounding,
  calibrateConfidenceForGrounding,
  groundClaimToExcerpt,
} from '../claim-evidence-grounding';

describe('groundClaimToExcerpt', () => {
  it('accepts quantities and entities present together in the cited excerpt', () => {
    expect(
      groundClaimToExcerpt(
        'El INE informó una inflación de 3,2 por ciento.',
        ['INE'],
        'Según el informe, el INE registró una inflación de 3,2%.',
      ),
    ).toMatchObject({
      entityMentions: ['INE'],
      unsupportedNumbers: [],
      lexicalGrounding: { status: 'SUPPORTED' },
    });
  });

  it('rejects a figure found elsewhere in the page but absent from the cited excerpt', () => {
    const excerpt = 'El informe confirmó que la actividad económica aumentó durante julio.';
    const unrelatedPageSection = 'Otra tabla contiene el valor 8,7 por ciento.';

    expect(
      groundClaimToExcerpt(
        'La actividad económica aumentó 8,7 por ciento durante julio.',
        ['Banco Central'],
        excerpt,
      ),
    ).toMatchObject({ entityMentions: [], unsupportedNumbers: ['8,7'] });
    expect(unrelatedPageSection).toContain('8,7');
  });

  it('identifies an assertion with no substantive lexical support in its citation', () => {
    expect(
      assessLexicalGrounding(
        'Las exportaciones mineras alcanzaron un récord histórico.',
        'La resolución amplía el plazo para presentar declaraciones tributarias.',
      ),
    ).toEqual({
      status: 'UNSUPPORTED',
      assertionTermCount: 5,
      matchedTermCount: 0,
      matchedTerms: [],
      coverage: 0,
    });
  });

  it('reports an explainable overlap without requiring identical accents', () => {
    expect(
      assessLexicalGrounding(
        'La inflación mensual aumentó durante julio.',
        'El informe señala que la inflacion mensual aumentó en julio.',
      ),
    ).toMatchObject({
      status: 'SUPPORTED',
      matchedTerms: ['inflacion', 'mensual', 'aumento', 'julio'],
      matchedTermCount: 4,
    });
  });

  it('requires material coverage rather than two incidental matching terms', () => {
    expect(
      assessLexicalGrounding(
        'Las exportaciones mineras privadas alcanzaron un récord histórico nacional.',
        'Las exportaciones mineras bajaron.',
      ),
    ).toMatchObject({
      status: 'LIMITED',
      matchedTerms: ['exportaciones', 'mineras'],
      matchedTermCount: 2,
      coverage: 0.2857,
    });
  });

  it('routes unsupported assertions to low confidence without inventing a score', () => {
    const unsupported = assessLexicalGrounding(
      'Las exportaciones mineras alcanzaron un récord.',
      'El plazo tributario fue ampliado.',
    );

    expect(calibrateConfidenceForGrounding('VERY_HIGH', 0.94, unsupported)).toEqual({
      confidenceLevel: 'LOW',
      confidenceScore: 0.49,
      adjusted: true,
    });
    expect(calibrateConfidenceForGrounding('HIGH', null, unsupported)).toEqual({
      confidenceLevel: 'LOW',
      confidenceScore: null,
      adjusted: true,
    });
  });

  it.each([
    assessLexicalGrounding('La inflación mensual cambió abruptamente.', 'La inflación fue menor.'),
    assessLexicalGrounding('3,2%', 'El índice fue 3,2%.'),
  ])('routes %s lexical grounding to review', (grounding) => {
    expect(calibrateConfidenceForGrounding('HIGH', 0.9, grounding)).toEqual({
      confidenceLevel: 'LOW',
      confidenceScore: 0.49,
      adjusted: true,
    });
  });

  it('drops entities that are present on the page but not in the retained evidence', () => {
    expect(
      groundClaimToExcerpt(
        'La medida entrará en vigencia este mes.',
        ['Ministerio de Economía'],
        'La medida entrará en vigencia este mes, según la resolución publicada.',
      ).entityMentions,
    ).toEqual([]);
  });
});
