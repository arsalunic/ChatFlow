export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  transform: { "^.+\\.(ts|tsx)$": ["ts-jest", { useESM: true }] },
  moduleNameMapper: { "^(.*)\\.js$": "$1" },
};
