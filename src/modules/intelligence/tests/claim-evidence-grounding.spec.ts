import { groundClaimToExcerpt } from '../claim-evidence-grounding';

describe('groundClaimToExcerpt', () => {
  it('accepts quantities and entities present together in the cited excerpt', () => {
    expect(
      groundClaimToExcerpt(
        'El INE informó una inflación de 3,2 por ciento.',
        ['INE'],
        'Según el informe, el INE registró una inflación de 3,2%.',
      ),
    ).toEqual({ entityMentions: ['INE'], unsupportedNumbers: [] });
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
    ).toEqual({ entityMentions: [], unsupportedNumbers: ['8,7'] });
    expect(unrelatedPageSection).toContain('8,7');
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
