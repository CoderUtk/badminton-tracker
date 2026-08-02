import * as Sentry from "@sentry/react-native";

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function sentryEnabled(dsn: string | undefined = DSN): boolean {
  return typeof dsn === "string" && dsn.length > 0;
}

let started = false;
export function initObservability(): void {
  if (started || !sentryEnabled()) return;
  started = true;
  Sentry.init({
    dsn: DSN,
    tracesSampleRate: 0.1,
    // Strip PII: drop usernames/emails and request/user data before send.
    beforeSend(event) {
      if (event.user) event.user = { id: event.user.id };
      return event;
    },
    sendDefaultPii: false,
  });
}

export function captureError(e: unknown, context?: Record<string, string>): void {
  if (!sentryEnabled()) return;
  Sentry.captureException(e, context ? { tags: context } : undefined);
}
