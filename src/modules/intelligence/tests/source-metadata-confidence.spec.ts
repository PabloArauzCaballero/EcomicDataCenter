import { calibrateConfidenceForSourceMetadata } from '../source-metadata-confidence';

describe('calibrateConfidenceForSourceMetadata', () => {
  it('preserves confidence only when date and publisher are source-verified', () => {
    expect(
      calibrateConfidenceForSourceMetadata('HIGH', 0.91, {
        publicationDateVerified: true,
        publisherVerified: true,
      }),
    ).toEqual({
      confidenceLevel: 'HIGH',
      confidenceScore: 0.91,
      adjusted: false,
      reasons: [],
    });
  });

  it.each([
    [false, true, ['UNVERIFIED_PUBLICATION_DATE']],
    [true, false, ['UNVERIFIED_PUBLISHER']],
    [false, false, ['UNVERIFIED_PUBLICATION_DATE', 'UNVERIFIED_PUBLISHER']],
  ] as const)(
    'routes incomplete metadata to review (date=%s publisher=%s)',
    (publicationDateVerified, publisherVerified, reasons) => {
      expect(
        calibrateConfidenceForSourceMetadata('VERY_HIGH', 0.97, {
          publicationDateVerified,
          publisherVerified,
        }),
      ).toEqual({
        confidenceLevel: 'LOW',
        confidenceScore: 0.49,
        adjusted: true,
        reasons,
      });
    },
  );

  it('retains a null score while still exposing the review reason', () => {
    expect(
      calibrateConfidenceForSourceMetadata('LOW', null, {
        publicationDateVerified: true,
        publisherVerified: false,
      }),
    ).toEqual({
      confidenceLevel: 'LOW',
      confidenceScore: null,
      adjusted: false,
      reasons: ['UNVERIFIED_PUBLISHER'],
    });
  });
});
