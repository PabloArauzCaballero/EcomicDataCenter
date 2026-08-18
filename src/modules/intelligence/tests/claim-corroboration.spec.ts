import { consolidateCorroboratingClaims, type CorroboratedClaimItem } from '../claim-corroboration';

function item(overrides: Partial<CorroboratedClaimItem['claim']> = {}): CorroboratedClaimItem {
  const index = overrides.confidenceLevel === 'LOW' ? '2' : '1';
  const source = {
    title: `Informe ${index}`,
    publisher: `Fuente ${index}`,
    url: `https://example.com/${index}`,
    discoveredUrl: `https://example.com/${index}`,
    sha256: index.repeat(64),
    storageUri: `https://storage.example/${index}`,
    publishedAt: index === '1' ? '2026-08-18T10:00:00Z' : '2026-08-18T11:00:00Z',
  };
  return {
    rawPayload: { ...source, sources: [source] },
    claim: {
      claimType: 'FACT',
      assertion: 'La inflación anual llegó a 3,2 por ciento.',
      eventDate: '2026-08-18',
      publishedAt: source.publishedAt,
      confidenceLevel: 'HIGH',
      confidenceScore: 0.9,
      impactLevel: 'MEDIUM',
      timeHorizon: 'SHORT_TERM',
      entityMentions: ['INE'],
      evidence: [
        {
          sourceArtifactId: `92000000-0000-4000-8000-00000000000${index}`,
          excerpt: `Evidencia verificable ${index} sobre inflación anual de 3,2%.`,
          locator: source.url,
          retrievedAt: '2026-08-18T12:00:00Z',
        },
      ],
      ...overrides,
    },
  };
}

describe('consolidateCorroboratingClaims', () => {
  it('combines identical claims while preserving every source and evidence piece', () => {
    const first = item();
    const second = item({
      assertion: '  LA inflación anual llegó a 3,2 por ciento. ',
      confidenceLevel: 'LOW',
      confidenceScore: 0.45,
      impactLevel: 'HIGH',
      entityMentions: ['BCB'],
    });

    const consolidated = consolidateCorroboratingClaims([first, second]);

    expect(consolidated).toHaveLength(1);
    expect(consolidated[0]?.claim).toMatchObject({
      confidenceLevel: 'LOW',
      confidenceScore: 0.45,
      impactLevel: 'HIGH',
      entityMentions: ['INE', 'BCB'],
    });
    expect(consolidated[0]?.claim.publishedAt).toBeUndefined();
    expect(consolidated[0]?.claim.evidence).toHaveLength(2);
    expect(consolidated[0]?.rawPayload.sources).toHaveLength(2);
  });

  it('keeps claims separate when their event date changes', () => {
    expect(
      consolidateCorroboratingClaims([item(), item({ eventDate: '2026-08-17' })]),
    ).toHaveLength(2);
  });

  it('does not mutate its input items', () => {
    const first = item();
    const second = item({ confidenceLevel: 'LOW' });

    consolidateCorroboratingClaims([first, second]);

    expect(first.claim.evidence).toHaveLength(1);
    expect(first.rawPayload.sources).toHaveLength(1);
  });
});
