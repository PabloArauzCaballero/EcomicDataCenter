import { isUntracedTarget, redactQueryString, redactUrlCredentials } from '../telemetry.redaction';

describe('isUntracedTarget', () => {
  it.each(['/health', '/ready', '/metrics', '/favicon.ico', '/docs', '/docs/openapi.json'])(
    'excludes the infrastructure probe %s',
    (target) => {
      expect(isUntracedTarget(target)).toBe(true);
    },
  );

  it('excludes a probe that carries a query string', () => {
    expect(isUntracedTarget('/metrics?format=text')).toBe(true);
  });

  it('traces business endpoints', () => {
    expect(isUntracedTarget('/api/v1/intelligence/daily-analysis')).toBe(false);
    expect(isUntracedTarget('/api/v1/data/observations')).toBe(false);
  });

  it('does not exclude a path that merely starts with an excluded name', () => {
    expect(isUntracedTarget('/healthcheck-report')).toBe(false);
    expect(isUntracedTarget('/metrics-export')).toBe(false);
  });

  it('handles a missing target', () => {
    expect(isUntracedTarget(undefined)).toBe(false);
  });
});

describe('redactQueryString', () => {
  it('replaces filter values while keeping the path', () => {
    expect(redactQueryString('/api/v1/data/observations?entityCode=NIT-12345')).toBe(
      '/api/v1/data/observations?<redacted>',
    );
  });

  it('leaves a target without a query untouched', () => {
    expect(redactQueryString('/api/v1/data/observations')).toBe('/api/v1/data/observations');
    expect(redactQueryString(undefined)).toBeUndefined();
  });
});

describe('redactUrlCredentials', () => {
  it('removes credentials embedded in the authority', () => {
    expect(redactUrlCredentials('https://user:s3cret@identity.example.test/jwks.json')).toBe(
      'https://<redacted>@identity.example.test/jwks.json',
    );
  });

  it('leaves a credential-free URL untouched', () => {
    expect(redactUrlCredentials('https://identity.example.test/jwks.json')).toBe(
      'https://identity.example.test/jwks.json',
    );
  });
});
