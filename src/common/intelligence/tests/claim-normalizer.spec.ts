import {
  claimContentHash,
  claimSubject,
  evidenceHash,
  isComparableSubject,
  rawPayloadHash,
  type ClaimContent,
} from '../claim-normalizer';

const content: ClaimContent = {
  claimType: 'FACT',
  assertion: 'La inflación mensual de junio de 2026 fue 0,4 %.',
  eventDate: '2026-06-30',
  statisticalDomainId: '11111111-1111-4111-8111-111111111111',
  geographicUnitId: '22222222-2222-4222-8222-222222222222',
  economicEntityId: null,
};

describe('claimContentHash', () => {
  it('is stable across whitespace and casing differences', () => {
    const spaced: ClaimContent = {
      ...content,
      assertion: '  La   INFLACIÓN mensual de junio de 2026 fue 0,4 %.  ',
    };
    expect(claimContentHash(spaced)).toBe(claimContentHash(content));
  });

  it('changes when the asserted content changes', () => {
    const different: ClaimContent = { ...content, assertion: 'La inflación mensual fue 0,9 %.' };
    expect(claimContentHash(different)).not.toBe(claimContentHash(content));
  });

  it('changes when the subject changes', () => {
    const elsewhere: ClaimContent = { ...content, eventDate: '2026-05-31' };
    expect(claimContentHash(elsewhere)).not.toBe(claimContentHash(content));
  });

  it('produces a lower case hexadecimal digest the column constraint accepts', () => {
    expect(claimContentHash(content)).toMatch(/^[a-f0-9]{64}$/u);
  });
});

describe('claimSubject and isComparableSubject', () => {
  it('normalizes missing identifiers to null', () => {
    expect(claimSubject({ claimType: 'FACT', assertion: 'x' })).toEqual({
      statisticalDomainId: null,
      geographicUnitId: null,
      economicEntityId: null,
      eventDate: null,
    });
  });

  it('treats a dated subject with at least one identifier as comparable', () => {
    expect(isComparableSubject(claimSubject(content))).toBe(true);
  });

  it('refuses to compare a claim without an event date', () => {
    expect(isComparableSubject(claimSubject({ ...content, eventDate: undefined }))).toBe(false);
  });

  it('refuses to compare a claim with no domain, territory or entity', () => {
    const vague = claimSubject({
      claimType: 'FACT',
      assertion: 'x',
      eventDate: '2026-06-30',
    });
    expect(isComparableSubject(vague)).toBe(false);
  });
});

describe('evidenceHash and rawPayloadHash', () => {
  it('treats reflowed evidence as the same quotation', () => {
    expect(evidenceHash('El BCB\n informó   un aumento')).toBe(
      evidenceHash('El BCB informó un aumento'),
    );
  });

  it('hashes a payload independently of key order so retries deduplicate', () => {
    expect(rawPayloadHash({ a: 1, b: { c: 2, d: 3 } })).toBe(
      rawPayloadHash({ b: { d: 3, c: 2 }, a: 1 }),
    );
  });

  it('distinguishes payloads that differ in value', () => {
    expect(rawPayloadHash({ a: 1 })).not.toBe(rawPayloadHash({ a: 2 }));
  });
});
