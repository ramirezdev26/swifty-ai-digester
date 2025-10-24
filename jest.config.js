export default {
  testEnvironment: 'node', // Especificar solo los tests de register-user.usecase
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  collectCoverageFrom: [
    '**/*.js',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!**/.husky/**',
    '!**/.gitlab-ci.yml',
    '!jest.config.js',
  ],
  // Transformar ESM a CommonJS para Jest

  transform: {},
};
