module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverageFrom: ['src/**/*.ts', 'app.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
