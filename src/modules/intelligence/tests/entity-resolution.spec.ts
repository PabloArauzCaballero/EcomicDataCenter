import { normalizeEntityName, resolveMention, type AliasCandidate } from '../entity-resolution';

describe('normalizeEntityName', () => {
  it('folds accents so an outlet that strips them still matches', () => {
    expect(normalizeEntityName('Compañía Minera Andína')).toBe(
      normalizeEntityName('Compania Minera Andina'),
    );
  });

  it('drops legal suffixes', () => {
    expect(normalizeEntityName('Banco Mercantil Santa Cruz S.A.')).toBe(
      'banco mercantil santa cruz',
    );
    expect(normalizeEntityName('Industrias Sucre SRL')).toBe('industrias sucre');
  });

  it('collapses punctuation in acronyms', () => {
    expect(normalizeEntityName('Y.P.F.B.')).toBe('ypfb');
    expect(normalizeEntityName('YPFB')).toBe('ypfb');
  });

  it('collapses repeated whitespace', () => {
    expect(normalizeEntityName('  Empresa   Boliviana  ')).toBe('empresa boliviana');
  });

  it('is idempotent', () => {
    const once = normalizeEntityName('Compañía Boliviana de Energía S.A.');
    expect(normalizeEntityName(once)).toBe(once);
  });
});

describe('resolveMention', () => {
  const candidates: readonly AliasCandidate[] = [
    { economicEntityId: 'entity-ypfb', normalizedAlias: 'ypfb' },
    { economicEntityId: 'entity-bmsc', normalizedAlias: 'banco mercantil santa cruz' },
  ];

  it('resolves an exact normalized alias', () => {
    expect(resolveMention('ypfb', candidates)).toEqual({
      economicEntityId: 'entity-ypfb',
      method: 'EXACT_ALIAS',
      confidence: 1,
    });
  });

  it('resolves a mention that only matches after normalization', () => {
    expect(resolveMention('Y.P.F.B.', candidates)).toEqual({
      economicEntityId: 'entity-ypfb',
      method: 'NORMALIZED_ALIAS',
      confidence: 0.9,
    });
  });

  it('leaves an unknown company unresolved instead of guessing', () => {
    expect(resolveMention('Empresa Desconocida', candidates)).toEqual({
      economicEntityId: null,
      method: 'UNRESOLVED',
      confidence: null,
    });
  });

  it('refuses to choose when two entities share a normalized alias', () => {
    const ambiguous: readonly AliasCandidate[] = [
      { economicEntityId: 'entity-a', normalizedAlias: 'banco union' },
      { economicEntityId: 'entity-b', normalizedAlias: 'banco union' },
    ];
    expect(resolveMention('Banco Unión S.A.', ambiguous).method).toBe('UNRESOLVED');
  });

  it('resolves nothing when no aliases are known', () => {
    expect(resolveMention('YPFB', []).method).toBe('UNRESOLVED');
  });
});
