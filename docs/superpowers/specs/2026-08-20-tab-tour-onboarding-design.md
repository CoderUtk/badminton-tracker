# Tab Tour Onboarding — Design

## Context

Animated boot splash already exists (`src/components/AnimatedSplash.tsx`) and is out of scope for this work — it's finished. The gap is a first-run tour explaining the app's tabs to new users.

The tab bar (`app/(app)/_layout.tsx`) shows 5 items: Home, Sessions, Matches, Tournaments, Profile. Clubs and Watch are registered with `href: null` (hidden from the tab bar, reached through other navigation) and are excluded from the tour.

## Flow placement

New sign-up already ends at `app/welcome.tsx`, whose `onContinue` calls `completeOnboarding()` (sets display name/age/hand) then routes to `/` (or a pending join target). The tour slots in right there: after `completeOnboarding()` succeeds, check a `hasSeenTabTour` flag — unset routes to `/tour` instead of `/`; already-set keeps today's behavior unchanged.

`completeOnboarding` in `profileRepo.ts` is a different, already-named concept (name/age/hand capture) — the new flag is deliberately named `hasSeenTabTour`, not reusing "onboarding," to avoid confusion between the two.

## Screens

Route: `app/tour.tsx`, plain expo-router screen (same pattern as `welcome.tsx`), not a modal.

6 pages in a horizontal `ScrollView` with `pagingEnabled`:

1. **Welcome** — short framing card: Logo, "Welcome to CourtSide", one-line intro. No tab icon yet.
2. **Home** — Icon `home`, headline, "Your next session and quick stats, at a glance."
3. **Sessions** — Icon `calendar`, "Plan practice, track attendance, run drills."
4. **Matches** — Icon `badminton`, "Score live matches, keep history, see form."
5. **Tournaments** — Icon `trophy`, "Run brackets, track standings, share results."
6. **Profile** — Icon `person`, "Your stats, badges, and account settings."

Each tab screen (2-6): the tab's `Icon` at large size with `glow()` pulse (theme.ts helper, same one the splash uses), headline, one-sentence body, page dots, Next button. Skip button top-right on every screen except the last. Last screen's CTA reads "Get started" using the same `redCTA` gradient button as `welcome.tsx`'s Continue.

Transitions: Reanimated (already a dependency) drives the dot indicator and a per-screen icon/text fade+slide-in keyed to scroll position. No new pager dependency — `ScrollView` + `pagingEnabled` covers paging; Reanimated's `useAnimatedScrollHandler` drives the per-page animation.

Respects `useReducedMotion()` the same way `AnimatedSplash.tsx` does: motion drops out, content still appears.

## Persistence

Reuses the existing SecureStore-as-local-flag pattern already used in `src/lib/lastLineup.ts` and `src/lib/guestMatches.ts` — no new dependency. Key: `hasSeenTabTour`, value `"1"`. Set when the tour's last screen fires "Get started."

## Replay

`app/(app)/profile/index.tsx` gets a new settings row "Show tab tour" that navigates to `/tour`. The tour screen's finish action always routes to `/` regardless of entry point (first-run vs replay) — there's no pending-join-target concern here since replay only happens once a user is already signed in and past that flow.

## Out of scope

- Splash screen — already built, not touched.
- Clubs / Watch tabs — not in the visible tab bar, excluded from the tour.
- Any animation library beyond Reanimated (already installed).
