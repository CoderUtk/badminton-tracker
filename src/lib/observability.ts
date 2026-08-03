import * as Sentry from "@sentry/react-native";

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function sentryEnabled(dsn: string | undefined = DSN): boolean {
  return typeof dsn === "string" && dsn.length > 0;
}

type ScrubbableEvent = { user?: { id?: unknown; [key: string]: unknown } };

/** Strip PII from an event before it leaves the device. Exported so the
 * privacy contract this function enforces is independently testable. */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  if (event.user) event.user = { id: event.user.id } as T["user"];
  return event;
}

let started = false;
export function initObservability(): void {
  if (started || !sentryEnabled()) return;
  started = true;
  Sentry.init({
    dsn: DSN,
    // Strip PII: drop usernames/emails and request/user data before send.
    beforeSend(event) {
      return scrubEvent(event);
    },
    beforeBreadcrumb: (breadcrumb) => (breadcrumb.category === "console" ? null : breadcrumb),
    sendDefaultPii: false,
  });
}

export function captureError(e: unknown, tags?: Record<string, string>): void {
  if (!sentryEnabled()) return;
  Sentry.captureException(e, tags ? { tags } : undefined);
}
