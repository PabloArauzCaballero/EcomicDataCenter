import { createHash } from 'node:crypto';
import { assessSourceContentDigest } from '../source-content-digest';

const bytes = Buffer.from('evidencia verificable');
const digest = createHash('sha256').update(bytes).digest('base64');

describe('assessSourceContentDigest', () => {
  it('matches an RFC 9530 sha-256 dictionary member', () => {
    const response = new Response(null, {
      headers: { 'content-digest': `sha-512=:YWJj:, sha-256=:${digest}:` },
    });

    expect(assessSourceContentDigest(response, bytes)).toEqual({
      algorithm: 'sha-256',
      expectedBase64: digest,
      actualBase64: digest,
      status: 'MATCHED',
    });
  });

  it('detects a contradictory valid sha-256 digest', () => {
    const other = createHash('sha256').update('otro contenido').digest('base64');
    const response = new Response(null, {
      headers: { 'content-digest': `sha-256=:${other}:` },
    });

    expect(assessSourceContentDigest(response, bytes)).toMatchObject({
      expectedBase64: other,
      status: 'MISMATCHED',
    });
  });

  it('does not compare encoded transfer bytes with a decoded fetch body', () => {
    const response = new Response(null, {
      headers: { 'content-digest': `sha-256=:${digest}:`, 'content-encoding': 'gzip' },
    });

    expect(assessSourceContentDigest(response, bytes)).toMatchObject({
      expectedBase64: digest,
      status: 'ENCODED_NOT_COMPARABLE',
    });
  });

  it('distinguishes absent, unsupported and malformed fields', () => {
    expect(assessSourceContentDigest(new Response(null), bytes).status).toBe('UNDECLARED');
    expect(
      assessSourceContentDigest(
        new Response(null, { headers: { 'content-digest': 'sha-512=:YWJj:' } }),
        bytes,
      ).status,
    ).toBe('UNSUPPORTED');
    expect(
      assessSourceContentDigest(
        new Response(null, { headers: { 'content-digest': 'sha-256=not-a-byte-sequence' } }),
        bytes,
      ).status,
    ).toBe('INVALID');
    expect(
      assessSourceContentDigest(
        new Response(null, {
          headers: { 'content-digest': `sha-256=:${digest}: trailing-junk` },
        }),
        bytes,
      ).status,
    ).toBe('INVALID');
    expect(
      assessSourceContentDigest(
        new Response(null, {
          headers: { 'content-digest': `sha-256=:${digest}:, sha-256=:${digest}:` },
        }),
        bytes,
      ).status,
    ).toBe('INVALID');
  });
});
