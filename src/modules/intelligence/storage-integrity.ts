import { createHash } from 'node:crypto';

export interface GitHubBlobPayload {
  content?: string;
  encoding?: string;
  size?: number;
}

export function verifyStoredEvidenceBlob(
  payload: GitHubBlobPayload,
  expectedSha256: string,
  expectedSize: number,
): void {
  if (payload.encoding !== 'base64' || typeof payload.content !== 'string') {
    throw new Error('Stored evidence blob is not available as base64');
  }
  const compactContent = payload.content.replace(/\s+/gu, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(compactContent)) {
    throw new Error('Stored evidence blob contains invalid base64');
  }
  const bytes = Buffer.from(compactContent, 'base64');
  if (payload.size !== expectedSize || bytes.length !== expectedSize) {
    throw new Error('Stored evidence size does not match the downloaded source');
  }
  const storedSha256 = createHash('sha256').update(bytes).digest('hex');
  if (storedSha256 !== expectedSha256) {
    throw new Error('Stored evidence SHA-256 does not match the downloaded source');
  }
}
