import { createHash } from 'node:crypto';
import { verifyStoredEvidenceBlob } from '../storage-integrity';

describe('verifyStoredEvidenceBlob', () => {
  const original = Buffer.from('evidencia económica verificable');
  const sha256 = createHash('sha256').update(original).digest('hex');

  it('accepts the exact blob returned by durable storage', () => {
    expect(() =>
      verifyStoredEvidenceBlob(
        { content: original.toString('base64'), encoding: 'base64', size: original.length },
        sha256,
        original.length,
      ),
    ).not.toThrow();
  });

  it('rejects altered bytes even when their size is unchanged', () => {
    const altered = Buffer.from(original);
    altered[0] = altered[0] === 1 ? 2 : 1;

    expect(() =>
      verifyStoredEvidenceBlob(
        { content: altered.toString('base64'), encoding: 'base64', size: altered.length },
        sha256,
        original.length,
      ),
    ).toThrow('Stored evidence SHA-256 does not match');
  });

  it('rejects missing content, invalid encoding and size mismatches', () => {
    expect(() => verifyStoredEvidenceBlob({}, sha256, original.length)).toThrow(
      'not available as base64',
    );
    expect(() =>
      verifyStoredEvidenceBlob(
        { content: original.toString('base64'), encoding: 'base64', size: original.length + 1 },
        sha256,
        original.length,
      ),
    ).toThrow('Stored evidence size does not match');
  });
});
