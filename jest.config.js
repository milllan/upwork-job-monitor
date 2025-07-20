/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['jest-webextension-mock'],
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@background/(.*)$': '<rootDir>/src/background/$1',
    '^@popup/(.*)$': '<rootDir>/src/popup/$1',
    '^@storage/(.*)$': '<rootDir>/src/storage/$1',
    '^@utils/(.*)$': '<rootDir>/src/$1',
    '^@api/(.*)$': '<rootDir>/src/api/$1',
    '^@types/(.*)$': '<rootDir>/src/types/$1',
  },
};
