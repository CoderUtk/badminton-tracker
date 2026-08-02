/** Tests cover the pure engine only; UI is exercised in the app. */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  // The real @sentry/react-native ships ESM that ts-jest can't parse under
  // node test env; tests only need the env-gated logic around it.
  moduleNameMapper: {
    "^@sentry/react-native$": "<rootDir>/tests/__mocks__/sentry-react-native.ts",
  },
};
