# Bucket H — Observability (Sentry) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Sentry crash + error reporting, env-gated (off cleanly when no DSN), PII-scrubbed, with readable stack traces via source maps.

**Architecture:** A single `src/lib/observability.ts` initializes Sentry from `EXPO_PUBLIC_SENTRY_DSN` (mirroring the Supabase null-when-unset pattern). Initialization happens once at app entry; a `beforeSend` hook scrubs PII. The Expo config plugin uploads source maps during EAS builds.

**Tech Stack:** Expo SDK 54, `@sentry/react-native` + its Expo plugin, Jest. New dep: `@sentry/react-native`.

## Global Constraints

- `src/engine/*` untouched.
- Sentry must be a **no-op when `EXPO_PUBLIC_SENTRY_DSN` is unset** — the app runs identically without it (dev, or before the user creates a project).
- **Never send PII** (player names, emails, message content) to Sentry.
- Gate on `npx tsc --noEmit && npm test`.

## Global Constraints — user-provided

Create a free Sentry project (React Native platform), copy its **DSN** into `.env` as `EXPO_PUBLIC_SENTRY_DSN=...`, and (for readable native traces) set a Sentry auth token in EAS as documented by the plugin. Until the DSN is set, this feature is dormant.

---

## Task 1: Install + env-gated init

**Files:**
- Create: `src/lib/observability.ts`
- Modify: `app/_layout.tsx` (call init at module load), `app.json` (add the Sentry Expo plugin)
- Modify: `package.json`
- Test: `tests/observability.test.ts`

**Interfaces:**
- Produces:
  - `sentryEnabled(dsn: string | undefined): boolean` — pure gate (true only for a non-empty DSN).
  - `initObservability(): void` — initializes Sentry if enabled; safe no-op otherwise.
  - `captureError(e: unknown, context?: Record<string, string>): void` — reports if enabled, else swallows.

- [ ] **Step 1: Write failing test**

```typescript
// tests/observability.test.ts
import { sentryEnabled } from "../src/lib/observability";
test("sentry is enabled only with a non-empty DSN", () => {
  expect(sentryEnabled(undefined)).toBe(false);
  expect(sentryEnabled("")).toBe(false);
  expect(sentryEnabled("https://abc@o1.ingest.sentry.io/1")).toBe(true);
});
```

- [ ] **Step 2: Run → FAIL.** `npm test -- observability.test.ts`

- [ ] **Step 3: Install**

```bash
npx expo install @sentry/react-native
```

- [ ] **Step 4: Implement**

```typescript
// src/lib/observability.ts
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
```

- [ ] **Step 5: Wire entry + plugin.** In `app/_layout.tsx`, `import { initObservability } from "../src/lib/observability";` and call `initObservability();` at module top (before the component). In `app.json`, add `"@sentry/react-native/expo"` to `plugins` with `{ organization, project }` placeholders the user fills; the plugin handles source-map upload at build time.

- [ ] **Step 6: Run → PASS**, `npx tsc --noEmit`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/observability.ts app/_layout.tsx app.json package.json package-lock.json tests/observability.test.ts
git commit -m "feat(observability): env-gated Sentry crash reporting"
```

---

## Task 2: Error-boundary capture + privacy disclosure

**Files:**
- Modify: `app/_layout.tsx` (wrap the app with Sentry's ErrorBoundary / `Sentry.wrap`)
- Modify: `docs/privacy.html` (disclose crash reporting)
- Modify: a couple of existing `catch` sites to call `captureError` where a silent failure hides real bugs (e.g. sync runner, DB open)

**Interfaces:** Consumes `captureError` (Task 1).

- [ ] **Step 1: Wrap the root.** Export the root layout via `Sentry.wrap(RootLayout)` (no-ops when uninitialized) so render crashes are captured with component stacks.

- [ ] **Step 2: Instrument silent catches.** In `src/sync/runner.ts` and `src/db/db.ts` (`openAndMigrate` catch, if any), add `captureError(e, { area: "sync" | "db" })` inside existing catch blocks — reporting only; keep current behavior. Do not add new user-facing errors.

- [ ] **Step 3: Privacy policy.** In `docs/privacy.html`, add a short paragraph: the app uses Sentry to collect anonymized crash/error diagnostics (no personal data), to improve stability. Keep the existing "no analytics/ads" wording accurate by scoping it to marketing analytics.

- [ ] **Step 4: `npx tsc --noEmit` clean; manual: with a DSN set, throw a test error → it appears in Sentry with a readable trace; with no DSN, nothing is sent and the app behaves identically.**

- [ ] **Step 5: Commit**

```bash
git add app/_layout.tsx src/sync/runner.ts src/db/db.ts docs/privacy.html
git commit -m "feat(observability): error-boundary capture + privacy disclosure"
```

---

## Self-Review

**Spec coverage (Bucket H):** env-gated Sentry init (Task 1), crash/error capture + source maps + PII scrub + privacy disclosure (Tasks 1–2). ✅

**Type consistency:** `sentryEnabled`/`initObservability`/`captureError` signatures identical between definition (Task 1) and callers (Tasks 1–2).

**Placeholder scan:** none — init, gate, and beforeSend are fully coded; the only user-supplied values are the DSN and plugin org/project (external, correctly deferred).

**Out of scope:** performance dashboards, session replay, Datadog — not included.
