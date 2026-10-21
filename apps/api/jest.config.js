/** Two projects: fast unit tests and API end-to-end tests against a real PostgreSQL test DB. */
const base = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
};
module.exports = {
  projects: [
    { ...base, displayName: 'unit', testMatch: ['<rootDir>/src/**/*.spec.ts'] },
    {
      ...base,
      displayName: 'e2e',
      testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
      globalSetup: '<rootDir>/test/global-setup.ts',
      setupFiles: ['<rootDir>/test/env.ts'],
    },
  ],
};
