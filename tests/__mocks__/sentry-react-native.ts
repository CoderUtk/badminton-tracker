// Jest manual mock: the real @sentry/react-native package ships ESM that
// ts-jest cannot parse under this project's node test environment, and tests
// never need to exercise the real SDK — only the env-gated logic around it.
export function init(..._args: unknown[]): void {}
export function captureException(..._args: unknown[]): void {}
