# CourtSide — Far-Future Roadmap

**Date:** 2026-08-01
**Status:** Design approved (planning only; no implementation yet)

Follows [future roadmap v2](2026-08-01-future-roadmap-v2-design.md). These are the longer-horizon bets: observability, gamification, avatars, and monetization. Captured so the direction and tool choices are settled; each bucket gets its own spec → plan → build when its turn comes.

## Guiding decisions (apply throughout)

1. **Sentry for observability, not Datadog.** Sentry has a generous free tier, first-class Expo / React Native support (`@sentry/react-native` + the Expo config plugin, source-map upload), and covers crashes, errors, and light performance tracing. Datadog RUM mobile is priced and scoped for teams — overkill for a solo app. **Add Sentry early** (it is independent of Supabase and would catch native crashes now, especially given the reanimated dev-client rebuild).
2. **Notifications local-first.** Inactivity nudges are locally *scheduled* with `expo-notifications` (no server, no cost). Server-triggered push is deferred until there is backend infra and a reason.
3. **Achievements are a pure rules engine** over the existing `statsRepo` output — deterministic, unit-testable, fully local. No backend to earn or display badges.
4. **Avatars ride Supabase Storage.** No local-only interim; the value is a synced picture. Reuses the existing `profiles.avatar_url` column.
5. **Monetization = RevenueCat, last.** RevenueCat (free tier) wraps Play/App Store IAP cross-platform and gates premium analytics. Requires store billing setup — genuinely the final bucket.
6. **Privacy/consent:** crash reporting and any analytics must be disclosed in the privacy policy and, where required, opt-in. Never send PII to Sentry (scrub names/emails from breadcrumbs).

## Buckets and order

| Bucket | Scope | Backend / external | Build when |
| --- | --- | --- | --- |
| **H · Observability** | Sentry crash + error reporting | Sentry cloud (free) | **early — recommend soon** |
| **F · Gamification** | achievements engine (pure) + local inactivity notifications | none | after H (local) |
| **E · Profile picture** | pick → upload → avatar everywhere | Supabase Storage | after Supabase |
| **G · Monetization** | deeper "smart" analytics + RevenueCat paywall | RevenueCat + store billing | last |

**Sequence:** `H (Sentry) → F (gamification) → [Supabase configured] → E (avatar) → G (analytics + paywall)`.

---

## Bucket H — Observability (Sentry)

- Add `@sentry/react-native` with the Expo config plugin; initialize in `app/_layout.tsx` (or a dedicated `src/lib/observability.ts`) with the DSN from an `EXPO_PUBLIC_SENTRY_DSN` env var (disabled cleanly when unset, mirroring the Supabase pattern).
- Capture unhandled JS errors + native crashes; wrap the router with Sentry's routing integration for breadcrumbs. Enable a low `tracesSampleRate` for light performance.
- **Privacy:** `beforeSend` scrubs player names/emails; no message content. Update the privacy policy to mention crash reporting.
- **Source maps:** upload via the Sentry Expo plugin during EAS build so stack traces are readable.
- **Files:** `src/lib/observability.ts`, `app/_layout.tsx`, `app.json` (plugin), `.env` (DSN). User provides: a free Sentry project + DSN.
- **Testable:** the enable/disable gate (DSN present/absent) is unit-testable; the rest is integration, verified by triggering a test error.

## Bucket F — Gamification

### F1. Achievements engine (pure, local)
- `src/achievements/rules.ts`: pure functions mapping a player's `PlayerAnalytics` (from `statsRepo`) to earned badges — e.g. "First win", "10 matches", "5-match win streak", "Century" (100 points in a match), "Giant killer" (beat a higher-rated player). Each rule: `{ id, title, description, earned(analytics): boolean, progress?(analytics): number }`.
- Fully unit-tested; no I/O. Earned state is derived on read (no storage needed initially); optionally cache "first earned at" in `app_settings` for "new badge" toasts.
- **UI:** a badges grid on the Profile screen (earned = colored, locked = dim + progress).

### F2. Inactivity notifications (local)
- `expo-notifications`: request permission (once, contextually), then schedule a local reminder when the user finishes a session/match ("Haven't played in a while? Start a match."). Reschedule on each app open; cancel when they play. Respect a Profile toggle to disable.
- **No server.** Deep-links into the app on tap. **Files:** `src/lib/reminders.ts`, a Profile setting (`settingsRepo`).

## Bucket E — Profile picture

- `expo-image-picker` to pick/crop an image; upload to a Supabase Storage bucket (`avatars/`) with per-user RLS; write the public URL to `profiles.avatar_url`. Display the avatar on Profile, match rows, and friend/circle lists (Bucket C) with initials as the fallback (already the current avatar style).
- **Migration/config:** create the `avatars` storage bucket + policies (owner writes their own path, authenticated read). **Files:** `src/repos/avatarRepo.ts`, Profile edit action. Needs Supabase.

## Bucket G — Monetization (smart analytics + paywall)

- **Smart analytics:** extend `statsRepo` with premium insights — opponent-adjusted rating trend, serve/rally win-rate splits, partner chemistry matrix, form projections. Pure computation over the existing event log + match history.
- **Paywall:** integrate RevenueCat (`react-native-purchases`); define a "CourtSide Pro" entitlement; gate the premium analytics screens behind it. Configure products in Play Console / App Store Connect. Free tier keeps the basic stats already shipped.
- **Order within G:** build the analytics first (usable free during beta), add the paywall only when ready to charge. **Files:** `src/analytics/*`, `src/lib/purchases.ts`, gated screens. Needs store billing + RevenueCat account.

---

## Cross-cutting

- **Testing:** pure logic (achievement rules, analytics computations, Sentry/paywall enable gates) is unit-tested; integrations (Sentry capture, notifications, uploads, purchases) verified manually on device. Gate every plan on `npx tsc --noEmit && npm test`.
- **Engine untouched.** All of this sits above the scoring core.
- **Consent & privacy:** Sentry + any analytics disclosed in the privacy policy; PII scrubbed; notifications opt-in.

## Deferred / out of scope

Server-triggered push notifications; Datadog or other heavyweight APM; social feeds/comments; web dashboard; ads. Revisit only on concrete need.

## Per-bucket build order

1. **H** Sentry (cheap, early, no backend).
2. **F1** achievements engine → **F2** inactivity notifications.
3. **[Supabase configured]**
4. **E** profile picture (Storage).
5. **G** smart analytics → RevenueCat paywall (last).
