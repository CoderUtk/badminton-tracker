# Home Screen — First-Run State

Date: 2026-08-12
Surface: `app/(app)/index.tsx`, `src/home/dashboard.ts`
Status: design approved, not yet planned

## Problem

User feedback: the opening screen is confusing — people land on Home and do not
know what to do next.

Home is a dashboard (see `2026-08-08-home-dashboard-design.md`). It is built for
an account that has data. An account with none sees:

- `WELCOME BACK` — to a user who has never been here.
- `START A MATCH`.
- `Your clubs` with a `Create or join a club` card, which is the only other
  call to action on screen and therefore reads as a prerequisite.
- `Recent performance` showing `0 / — / —`.

Three of the four blocks below the greeting are empty, misleading, or both.

The club block is the sharpest problem. A club is **not** required to score a
match: `app/new-match.tsx` defaults `clubId` to `null` (Personal), and only a
deep-link param preselects a club. The screen implies setup work that does not
exist.

Nothing on the screen says what scoring actually involves, either — that it is
tap-per-rally, that history and stats accrue from it.

## Approach

Home gains a first-run state. While the account has no matches and no clubs, the
blocks below the CTA are replaced by content that names the next step. At the
first match or first club, Home becomes the existing dashboard permanently.

This is not a new screen or a new route, and it is not an onboarding flow with
its own navigation. It is one branch inside the existing screen, driven by data
Home already fetches.

Rejected alternatives:

- **Copy fixes only** (reword the greeting, label the club block optional,
  replace the empty tiles with a sentence). Lower risk, but the new user still
  scrolls past two dead sections. Symptom, not cause.
- **A get-started checklist card** with tickable steps. Adds persisted progress
  state and risks nagging, and two of its three steps are not needed to get
  value from the app.

## State model

One predicate, in `src/home/dashboard.ts` beside the existing pure helpers:

```ts
export function isFirstRun(
  analytics: PlayerAnalytics | null,
  clubs: Club[],
  loaded: boolean
): boolean;
```

True when `loaded && (analytics?.played ?? 0) === 0 && clubs.length === 0`.

The threshold is zero matches **and** zero clubs, not the existing
`MIN_MATCHES_FOR_RATES` of 5. A user with one club or one played match has a
shape to their account, and the dashboard is true for them. The feature copy
already gated at `< 5` matches (`shouldShowFeatureCopy`) is unchanged and still
serves the 1–4 match user in the dashboard state.

Both inputs are already fetched by `reload()`. No new query.

### The `loaded` gate

`analytics` and `clubs` start empty, so without a gate an established user would
render the first-run state for a frame on every focus. `loaded` is a new piece
of state on Home, set once the first cache read resolves.

The greeting row and the `START A MATCH` CTA are identical in both states and
render immediately. Only the content below the CTA waits on `loaded`, so there
is no visible flash and no spinner.

### Guests

Anonymous sessions (`session.user.is_anonymous`) never reach `(app)/index`; they
use the separate `/guest` stack. Out of scope.

## First-run layout

Top to bottom. Everything below the CTA replaces the dashboard blocks.

| Block | Content | Height |
| --- | --- | --- |
| Greeting row | Eyebrow `WELCOME`, name unchanged | 44 |
| START A MATCH | Unchanged: 96pt, `GRAD.redCTA`, `glow(C.red, 18, 0.5)` | 96 |
| CTA subtitle | `Set the court, tap to score. No club needed.` | 20 |
| How it works | Three numbered rows | ~110 |
| Club line | `Play with a regular group? Create or join a club` | 44 |

Plus gaps: roughly 330pt total, no scrolling.

### Greeting

The eyebrow reads `WELCOME` in the first-run state and `WELCOME BACK`
otherwise. Same style, same position; only the string changes.

### CTA subtitle

Replaces `shouldShowFeatureCopy`'s line in this state only. `C.text2`, 13pt,
centred, matching the existing `featureCopy` style.

> Set the court, tap to score. No club needed.

The second sentence is the point of the block. It answers the question the old
layout provoked — *must I set up a club first?* — at the moment it is asked.

### How it works

Three numbered rows, `C.text2` 13pt, no card and no illustration:

1. Name the players and pick the format
2. Tap the side that won each rally
3. History and stats build up as you play

Rows, not a horizontal three-column strip: at 13pt these wrap badly in three
columns on a narrow device, and the sequence reads top-to-bottom anyway.

This is the only place in the app that says scoring is tap-per-rally.

### Club line

One row, no section header, no card, no `+` button:

> Play with a regular group? Create or join a club

Opens the existing `ClubSheet` — same component, same `onChanged={reload}`
wiring as today. `accessibilityRole="button"`.

Demoted rather than deleted: clubs are how the app becomes useful for a regular
group, but they are not a step on the way to a first match.

### Blocks not rendered in this state

- `Your clubs` section header and its empty-state card.
- `Recent performance` heading and the three `StatTile`s.

The next-session card already renders nothing when there is no session, so it
needs no change.

## Implementation

| File | Change |
| --- | --- |
| `src/home/dashboard.ts` | Add `isFirstRun`. Pure, no React, no database. |
| `src/components/FirstRunPanel.tsx` | New. Owns the subtitle, the three steps, and the club line. Props: `onCreateClub: () => void`. |
| `app/(app)/index.tsx` | Add `loaded` state, the eyebrow string, and one ternary below the CTA. |
| `tests/homeDashboard.test.ts` | Cases for `isFirstRun`. |

`FirstRunPanel` is extracted rather than inlined because `index.tsx` is already
253 lines; inlining the branch pushes it past 320 with no gain.

### Error handling

`reload()` currently chains `getPlayerAnalytics` inside `loadFromCache`, and a
throw anywhere lands in the outer `.catch`, which deliberately leaves the last
good state on screen. With a `loaded` gate that becomes a hazard: a failing
analytics call would leave `loaded` false forever and blank everything below the
CTA.

So the analytics call gets its own `try`/`catch` resolving to `null`, and
`loaded` is set unconditionally after the cache read completes. An established
user whose analytics fetch fails still sees the dashboard, because `isFirstRun`
also requires `clubs.length === 0`.

The outer `.catch` on the refresh chain is otherwise unchanged.

## Verification

Unit tests on `isFirstRun`:

- zero matches, zero clubs, loaded → true
- zero matches, one club → false
- one match, zero clubs → false
- not loaded → false regardless of inputs

Manual:

- Fresh account: first-run layout, no stat tiles, no club section header.
- Existing account: dashboard, and no first-run flash when navigating back to
  Home from another tab.
- Creating a club from the first-run line: sheet opens, and on success Home
  reloads into the dashboard state.
