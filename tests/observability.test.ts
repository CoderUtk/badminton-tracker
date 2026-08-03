import { scrubEvent, sentryEnabled } from "../src/lib/observability";

test("sentry is enabled only with a non-empty DSN", () => {
  expect(sentryEnabled(undefined)).toBe(false);
  expect(sentryEnabled("")).toBe(false);
  expect(sentryEnabled("https://abc@o1.ingest.sentry.io/1")).toBe(true);
});

test("scrubEvent strips PII fields, keeping only the user id", () => {
  const event = { user: { id: "abc", email: "a@b.com", username: "player1", ip_address: "1.2.3.4" } };
  expect(scrubEvent(event as never)).toEqual({ user: { id: "abc" } });
});

test("scrubEvent leaves an event with no user untouched", () => {
  const event = { message: "test" };
  expect(scrubEvent(event as never)).toEqual({ message: "test" });
});
