# ShareCard Redesign

**Goal:** Make the shared match image worth posting. The card users currently
share is a 360×640 capture with two names, a "VS", one score string and a date.
It is neither engaging (soft on upload, no visual hierarchy, no brand presence)
nor informative (the match data already loaded on screen is thrown away).

This spec covers the match card only. Session cards, tournament cards, the badge
share popup, and direct-to-Instagram-Stories intents are out of scope.

## Problem

Two concrete defects, both visible in `src/components/ShareCard.tsx` today:

1. **Resolution.** The card renders and captures at 360×640. Instagram Stories
   is 1080×1920, so every upload is upscaled 3×. Type edges soften, the whole
   image reads as low-effort regardless of layout.
2. **Discarded data.** `app/(app)/matches/[id].tsx` already loads the full
   `MatchEvent[]` timeline, per-game scores, status and config in order to draw
   the rally timeline. The share card consumes none of it — it receives a single
   pre-flattened `scoreLine` string and a date. Duration, rally count, streaks
   and per-game breakdown are all one pure function away and none are shown.

A third, softer defect: the original share-to-story spec
(`docs/superpowers/specs/2026-08-06-share-to-story-design.md`) called for the
`GRAD.court` background, a bottom watermark band and a join link. The shipped
card uses the flat `GRAD.screen` and has no watermark, so a shared image carries
no route back to the app.

## Scope

- Rewrite `src/components/ShareCard.tsx` (layout, props, canvas size).
- Add `src/lib/shareStats.ts` — pure derived-stat functions over `MatchEvent[]`.
- Add `tests/shareStats.test.ts`.
- Raise capture resolution in `src/lib/shareMatch.ts`.
- Gate the share entry point in `app/(app)/matches/[id].tsx` to completed
  matches, and pass structured props instead of a flattened score string.

## Canvas

- Output: **1080×1920** PNG.
- Safe content zone: **1080×1420 centered** — the top and bottom ~250px are
  reserved for Instagram's own UI chrome. All text and the watermark band sit
  inside the safe zone; only the background gradient bleeds to the full canvas.
- Background: `GRAD.court` full bleed, replacing today's `GRAD.screen`.

### Achieving 1080×1920

Preferred (smallest diff): keep the React Native layout authored at 360×640 and
ask `react-native-view-shot` for a scaled output:

```ts
captureRef(ref, { format: "png", quality: 1, width: 1080, height: 1920 });
```

This is a one-line change. It must be verified on a real Android device and a
real iOS device before the work is called done, because `width`/`height` are
documented as output size but have historically been implemented as a crop on
some Android versions.

Fallback if the capture crops rather than scales: introduce a single module-level
`const S = 3` in `ShareCard.tsx`, multiply every layout and type constant by it,
render the card off-screen at true 1080×1920 points, and capture 1:1 with no
resize options. Deterministic on both platforms at the cost of one multiplier
threaded through the StyleSheet.

Do not add a new dependency to solve this.

## Card layout

Top to bottom, all inside the safe zone:

1. **Wordmark band** — existing `Logo` component + "COURTSIDE" wordmark,
   `C.text2`, small. Present but quiet.
2. **Eyebrow** — `MATCH WON`, `C.red`, `F.medium`, letter-spacing 2.
3. **Hero numeral** — the winning side's score in the final game, `F.display`,
   the largest element on the card, `C.text`, with `textGlow(C.accent)`.
4. **Loser numeral** — the losing side's score in that game, roughly 40% of the
   hero size, `C.ghost`, directly beneath. `C.ghost` is decorative-only by theme
   convention and is correct here: this numeral is a visual foil, and the same
   value is repeated accessibly in the game chip strip below.
5. **Hairline rule** — `C.line`, short, centered.
6. **Names** — winner names `F.semibold` `C.text`; below it `def. <loser names>`
   in `F.medium` `C.text2`. Both `numberOfLines={2}`, ellipsized.
7. **Game chip strip** — one chip per completed game showing `A-B` (e.g.
   `21-17`  `19-21`  `21-15`). Chip fill `C.card`, `radius.sm`. Games the winner
   took get a `C.accent` hairline border; games they lost get `C.line`. Values
   use `fontVariant: ["tabular-nums"]`, as the current score line already does.
8. **Stat row** — four tiles, equal width, in a single row:

   | Label | Value | Source |
   |---|---|---|
   | `TIME` | `42′` | `matchDurationMs` (existing) → `formatElapsed` |
   | `RALLIES` | `87` | `totalRallies` (new) |
   | `STREAK` | `7` | `longestStreak` (new), winner side |
   | `LEAD CHANGES` | `5` | `leadChanges` (new) |

   Value in `F.display` `C.text`, caption label beneath in `F.medium` `C.text3`,
   uppercase, letter-spaced. Tile background `C.card`, `radius.md`.

9. **Watermark band** — logo mark + join link, `C.text2`, `F.medium`, centered.
   This is the growth surface the current card is missing entirely.

   The link text is **not** hardcoded. `src/lib/shareJoin.ts` already owns the
   join domain as `process.env.EXPO_PUBLIC_JOIN_LINK_DOMAIN`, and falls back to
   an `expo-linking` `badminton://` custom-scheme URL when that is unset. A
   custom-scheme URL is meaningless to a stranger scrolling a story, so the
   watermark follows this rule:

   - `EXPO_PUBLIC_JOIN_LINK_DOMAIN` set → render that bare domain as the link
     text (no `https://`, no path).
   - Unset → render the "COURTSIDE" wordmark alone, no link text.

   The card must not construct the URL itself. Export the resolved display
   domain from `shareJoin.ts` so there is exactly one place that knows it.

The match date moves from its own subtitle line into the watermark band row, so
the card gains a watermark without gaining a line.

### `LEAD CHANGES` on a blowout

A straight-sets blowout produces `0`, which can read as a rendering bug. The
decision is to show the honest `0`. It is correct, it is legible next to a large
`STREAK` value, and the pair together tells the real story of a one-sided match.
No conditional tile-swapping — a card whose columns change meaning between
matches is harder to read, not easier.

## Props

`ShareCardProps` changes from a pre-flattened string bag to structured data, so
the card owns its own formatting and can be unit-reasoned about:

```ts
export type ShareCardStats = {
  durationMs: number;
  rallies: number;
  streak: number;
  leadChanges: number;
};

export type ShareCardProps = {
  teamA: string;
  teamB: string;
  winner: "A" | "B";        // no longer nullable — see Gating
  games: { A: number; B: number }[];
  stats: ShareCardStats;
  dateLabel: string;
  avatarUrl?: string | null; // reserved; unused until profile pictures ship
};
```

`avatarUrl` is declared and ignored. It costs one optional field now and avoids
a props migration when the profile-picture feature lands, matching the
forward-compat note in the 2026-08-06 spec. No avatar is rendered in this work.

## Derived stats

New module `src/lib/shareStats.ts`, pure functions over `MatchEvent[]`, in the
same style and for the same reason as `src/lib/matchDetail.ts`: they must be
unit-testable in the node-only Jest environment, with no React Native imports.

- `totalRallies(events: MatchEvent[]): number` — count of `RALLY_WON` events.
- `longestStreak(events: MatchEvent[], side: TeamId): number` — the longest run
  of consecutive `RALLY_WON` events with `by === side`. Streaks are counted
  across the whole match, not reset at `GAME_STARTED`: a run that carries from
  the end of one game into the start of the next is real momentum and reads as
  such on the card.
- `leadChanges(events: MatchEvent[]): number` — walk the rallies accumulating a
  per-game running score; count each transition where the sign of `A - B`
  changes from positive to negative or negative to positive. Ties are not lead
  changes; going from a tie to a lead is only a change if the previous non-tied
  lead belonged to the other side. The counter resets at each `GAME_STARTED`,
  since each game starts level and a cross-game "change" is not meaningful.

Duration is not reimplemented here — the call site keeps using the existing
`matchDurationMs` from `src/lib/matchDetail.ts`.

## Gating

`ShareCard` renders a decided match. The share control in
`app/(app)/matches/[id].tsx` is hidden unless `match.status === "completed"`
and `match.winner` is non-null. This removes the null-winner branch from the
card entirely, so there is no half-rendered "no crown" state to design around.

Live and forfeited matches simply have no share affordance in this work.

## Motion

No new animation. The share control keeps the existing `press` token from
`src/theme.ts` via `PressableScale`. The card itself is captured, never
animated.

## Error handling

Unchanged from today: `shareMatchCard` failures are caught at the call site and
surfaced as a `toast("Couldn't share", "error")`. Raising the capture resolution
increases the memory cost of a single capture, so a capture failure is a real
possibility on low-end devices and the existing toast path stays the handler.

## Testing

- `tests/shareStats.test.ts` — unit tests for the three new pure functions:
  - `totalRallies`: empty events, single game, multi-game.
  - `longestStreak`: no rallies for the side, a streak at the start, a streak at
    the end, a streak spanning a `GAME_STARTED` boundary.
  - `leadChanges`: a blowout (expect `0`), a match with ties in it, a match with
    several genuine flips, and a multi-game match confirming the per-game reset.
- Manual verification of the capture path on one physical Android device and one
  physical iOS device, confirming the shared PNG is 1080×1920 and not cropped.
  This is the acceptance gate for the resolution approach; if it fails, switch
  to the `S = 3` fallback and re-verify.
- Visual check that long doubles names (four full names) truncate cleanly rather
  than pushing the stat row out of the safe zone.

## Out of scope

- Session, tournament and badge share cards.
- Avatars and profile pictures (prop reserved only).
- `react-native-share` and direct-to-Instagram-Stories intents; the generic
  `expo-sharing` sheet remains the delivery mechanism.
- Rally-momentum charting.
- Any share affordance for live or forfeited matches.
