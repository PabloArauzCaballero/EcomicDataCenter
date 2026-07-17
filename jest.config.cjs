module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/database/models/**',
    '!src/database/migrations/**',
  ],
  coverageDirectory: 'artifacts/coverage',
  testEnvironment: 'node',
  clearMocks: true,
};
