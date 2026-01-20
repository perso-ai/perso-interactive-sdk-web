/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts", "**/?(*.)+(spec|test).ts"],
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
      },
    ],
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  setupFiles: ["<rootDir>/src/__tests__/setup/test-env.ts"],
  clearMocks: true,
};

module.exports = config;
