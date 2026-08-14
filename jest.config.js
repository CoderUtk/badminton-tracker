/** Tests cover the pure engine only; UI is exercised in the app. */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  // The real @sentry/react-native ships ESM that ts-jest can't parse under
  // node test env; tests only need the env-gated logic around it.
  moduleNameMapper: {
    "^react-native$": "<rootDir>/tests/__mocks__/react-native.ts",
    "^@sentry/react-native$": "<rootDir>/tests/__mocks__/sentry-react-native.ts",
    // Same reason: expo-crypto is ESM-only, and tournamentRepo imports it at
    // module scope, so any test touching that module needs it stubbed.
    "^expo-crypto$": "<rootDir>/tests/__mocks__/expo-crypto.ts",
    "^expo-secure-store$": "<rootDir>/tests/__mocks__/expo-secure-store.ts",
  },
};
