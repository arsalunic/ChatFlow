import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest/presets/default-esm", // ensures ESM + TS
  extensionsToTreatAsEsm: [".ts"],
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  testMatch: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/seed/**"
  ],
  testTimeout: 20000, // bump a little since you're doing DB + supertest
  detectOpenHandles: true,
  forceExit: true,
  clearMocks: true,
  restoreMocks: true,
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1"
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      { useESM: true }
    ]
  }
};

export default config;
