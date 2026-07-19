import { getEnvironment, resetEnvironmentForTests } from '../environment';

const originalEnvironment = process.env;

describe('environment validation', () => {
  beforeEach(() => {
    process.env = {
      DATABASE_WRITER_URL: 'postgresql://writer:test@localhost/db',
      DATABASE_READER_URL: 'postgresql://reader:test@localhost/db',
    };
    resetEnvironmentForTests();
  });

  afterAll(() => {
    process.env = originalEnvironment;
    resetEnvironmentForTests();
  });

  it('allows disabled auth in development', () => {
    expect(getEnvironment().AUTH_MODE).toBe('disabled');
  });

  it('applies bounded resource defaults', () => {
    const environment = getEnvironment();
    expect(environment.HTTP_REQUEST_TIMEOUT_MS).toBe(30_000);
    expect(environment.DATABASE_CONNECT_TIMEOUT_MS).toBe(5000);
    expect(environment.BODY_LIMIT_BYTES).toBe(1_048_576);
  });

  it('rejects disabled auth in production', () => {
    process.env.NODE_ENV = 'production';
    resetEnvironmentForTests();
    expect(() => getEnvironment()).toThrow();
  });

  it('rejects Swagger in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_MODE = 'jwks';
    process.env.AUTH_JWKS_URI = 'https://identity.example.test/jwks';
    process.env.AUTH_ISSUER = 'https://identity.example.test/';
    process.env.AUTH_AUDIENCE = 'observatory';
    process.env.DATABASE_MIGRATOR_URL = 'postgresql://migrator:test@localhost/db';
    process.env.SWAGGER_ENABLED = 'true';
    resetEnvironmentForTests();
    expect(() => getEnvironment()).toThrow();
  });

  it('requires complete JWKS configuration', () => {
    process.env.AUTH_MODE = 'jwks';
    resetEnvironmentForTests();
    expect(() => getEnvironment()).toThrow();
  });
});
