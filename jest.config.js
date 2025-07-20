/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['jest-webextension-mock'],
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.spec.ts'],
  moduleNameMapper: {
    // This rule handles relative imports that end in .js, stripping the extension
    // so Jest can find the corresponding .ts file.
    '^(\\.{1,2}/.*)\\.js$': '$1',

    // These rules handle aliases. The `(.*?)(\\.js)?$` pattern correctly handles
    // imports with or without the .js extension.
    '^@background/(.*?)(\\.js)?$': '<rootDir>/src/background/$1',
    '^@popup/(.*?)(\\.js)?$': '<rootDir>/src/popup/$1',
    '^@storage/(.*?)(\\.js)?$': '<rootDir>/src/storage/$1',
    '^@utils/(.*?)(\.js)?$': '<rootDir>/src/$1',
    '^@api/(.*?)(\\.js)?$': '<rootDir>/src/api/$1',
    '^@types/(.*?)(\\.js)?$': '<rootDir>/src/types/$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.test.json',
        useESM: true,
      },
    ],
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleFileExtensions: ['ts', 'js', 'mjs', 'cjs', 'jsx', 'tsx', 'json', 'node'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
