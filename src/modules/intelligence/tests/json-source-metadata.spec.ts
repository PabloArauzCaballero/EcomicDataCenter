import { assessPublicationMetadata } from '../publication-metadata';
import { jsonSourceMetadata } from '../json-source-metadata';

describe('json source metadata', () => {
  const body =
    '{"data":{"source":"eldorado","pair":"BOB/USDT","buy":11.65,"sell":11.51,' +
    '"fetched_at":"2026-08-22T23:58:41.358098+00:00"},"cached":true,' +
    '"fetched_at":"2026-08-22T23:58:41.358098+00:00","updated_at":"2026-08-22 23:58:41"}';

  it('reads the instant a market endpoint declares for its quote', () => {
    expect(jsonSourceMetadata(body).publicationDates).toEqual(['2026-08-22T23:58:41.358098+00:00']);
  });

  it('verifies a candidate that cites the declared instant', () => {
    expect(
      assessPublicationMetadata(
        '2026-08-22T23:58:41.358098+00:00',
        jsonSourceMetadata(body).publicationDates,
      ),
    ).toBe('MATCHED');
  });

  it('contradicts a candidate that cites a different instant', () => {
    expect(
      assessPublicationMetadata('2026-08-21T10:00:00Z', jsonSourceMetadata(body).publicationDates),
    ).toBe('CONTRADICTED');
  });

  it('ignores local timestamps that would make the source look self-contradicting', () => {
    expect(jsonSourceMetadata(body).publicationDates).not.toContain('2026-08-22 23:58:41');
  });

  it('ignores timestamp fields that do not state a publication instant', () => {
    expect(
      jsonSourceMetadata('{"expires_at":"2026-08-22T23:58:41Z","note":"x"}').publicationDates,
    ).toEqual([]);
  });

  it('never reports a publisher or a canonical url for a json body', () => {
    const metadata = jsonSourceMetadata(body);

    expect(metadata.publishers).toEqual([]);
    expect(metadata.canonicalUrls).toEqual([]);
  });

  it('leaves an oversized body unparsed instead of scanning it', () => {
    const oversized = `{"fetched_at":"2026-08-22T23:58:41Z","pad":"${'x'.repeat(200_001)}"}`;

    expect(jsonSourceMetadata(oversized).publicationDates).toEqual([]);
  });
});
