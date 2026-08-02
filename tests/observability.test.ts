import { sentryEnabled } from "../src/lib/observability";

test("sentry is enabled only with a non-empty DSN", () => {
  expect(sentryEnabled(undefined)).toBe(false);
  expect(sentryEnabled("")).toBe(false);
  expect(sentryEnabled("https://abc@o1.ingest.sentry.io/1")).toBe(true);
});
