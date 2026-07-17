import { getEnvironment, resetEnvironmentForTests } from '../environment';

const original = process.env;

describe('environment validation', () => {
  beforeEach(() => {
    process.env = {
      DATABASE_WRITER_URL: 'postgresql://writer:test@localhost/db',
      DATABASE_READER_URL: 'postgresql://reader:test@localhost/db',
    };
    resetEnvironmentForTests();
  });

  afterAll(() => {
    process.env = original;
    resetEnvironmentForTests();
  });

  it('allows disabled auth in development', () => {
    expect(getEnvironment().AUTH_MODE).toBe('disabled');
  });

  it('rejects disabled auth in production', () => {
    process.env.NODE_ENV = 'production';
    resetEnvironmentForTests();
    expect(() => getEnvironment()).toThrow();
  });

  it('requires complete JWKS configuration', () => {
    process.env.AUTH_MODE = 'jwks';
    resetEnvironmentForTests();
    expect(() => getEnvironment()).toThrow();
  });
});
