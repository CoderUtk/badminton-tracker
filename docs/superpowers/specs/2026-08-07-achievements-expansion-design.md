# Achievement System Expansion

## Problem

The app has a working achievement/badge system: `src/achievements/rules.ts`'s
pure `evaluateBadges(analytics)` produces `EarnedBadge[]` (id/title/
description/icon/earned/progress) from a `PlayerAnalytics` summary already
computed once per profile view in `src/analytics/player.ts`, rendered by
`src/components/BadgeGrid.tsx` on the Profile screen. It currently defines 5
badges (First Win, Regular, Contender, On Fire, Sharp).

The request asked for 18 new achievements across 5 categories. Three of
them — Challenger (match invitations), Social Butterfly (friend network),
Good Sport (opponent endorsements) — need entirely new subsystems (invite
flow, friends table, endorsements/likes) that don't exist anywhere in this
app today. Per user decision, this design scopes to the 15 achievements
buildable from data the app already stores (`matches`, `profiles`,
`sessions`), extending the existing pattern rather than replacing it. The
three social achievements are deferred to their own future brainstorm once
a friends/invites/endorsements system is wanted as a product decision in
its own right.

## Design

### 1. Extend `PlayerAnalytics` with the new derived facts

`playerAnalytics(matches, name)` (`src/analytics/player.ts`) already does a
single pass over the player's full match history. Add these fields,
computed in that same pass — no second scan of `matches`:

```typescript
export interface PlayerAnalytics {
  // ...existing fields unchanged...
  dayStreak: number;          // consecutive local calendar days with >=1 match, ending today or yesterday
  weekendWarrior: boolean;    // some Saturday and its adjacent Sunday both have a match
  earlyBird: boolean;         // any match created before 08:00 local time
  nightOwl: boolean;          // any match created at/after 20:00 local time
  maxMatchesInMonth: number;  // largest count of matches sharing a local (year, month)
  maxMatchesInDay: number;    // largest count of matches sharing a local calendar day
  winStreak: number;          // current win streak over full history (not capped like `form`)
  doublesPlayed: number;      // completed matches where config.matchType === "doubles"
  flawlessVictory: boolean;   // any won game where the loser scored < 5
  nailBiter: boolean;         // any won game whose winning score > that match's pointsToWin
  comebackKid: boolean;       // won the match after losing game 1
  venues: Set<string>;        // distinct non-empty session locations, from sessionLocations param
}
```

`winStreak` is a new full-history scan distinct from the existing capped
`form` array (`form` stays capped at 8 for display purposes — Unstoppable
needs to detect streaks past that cap, so it can't reuse `form`).

`venues` needs each match's session location, which matches don't carry
directly (only an optional `session_id`). `playerAnalytics` gains a second,
optional parameter:

```typescript
export function playerAnalytics(
  matches: MatchRecord[],
  name: string,
  sessionLocations: Map<string, string> = new Map()
): PlayerAnalytics
```

`playerAnalytics` itself stays pure — no I/O. The caller (`profile.tsx`,
which already does I/O) is responsible for building `sessionLocations`.

### 2. `getSessionLocations` — new small repo function

`src/repos/sessionRepo.ts` gains:

```typescript
/** Non-empty locations for the given session ids, keyed by session id. Used
 *  by achievements (Explorer) to count distinct venues without matches
 *  needing to carry their own venue field. */
export async function getSessionLocations(sessionIds: string[]): Promise<Map<string, string>>
```

Implemented as a single batched query against the local `sessions_cache`
table (`where id in (...)`), matching the existing offline-first read
pattern used everywhere else in this file. Returns only sessions whose
`location` is non-null/non-empty. `profile.tsx` collects the distinct
`session_id`s off the player's matches, calls this once, and passes the
resulting map into `playerAnalytics`.

### 3. `evaluateBadges` gains a `profile` parameter

"Setting Up Shop" needs profile completeness, which isn't a match-derived
stat. `evaluateBadges` signature becomes:

```typescript
export function evaluateBadges(
  a: PlayerAnalytics,
  profile: { age: number | null; hand: Hand | null; avatarUrl: string | null }
): EarnedBadge[]
```

`Profile` (from `src/repos/profileRepo.ts`) already has all three fields
(`age`, `hand`, `avatarUrl`), so `profile.tsx` passes its existing loaded
profile straight through — no new fetch.

### 4. The 15 new achievement rules

Appended to the existing 5 in `evaluateBadges`, each following the current
`{ id, title, description, icon, earned, progress }` shape:

| id | Title | Rule | progress |
|---|---|---|---|
| `weekend_warrior` | Weekend Warrior | `a.weekendWarrior` | boolean → 0 or 1 |
| `early_bird` | Early Bird | `a.earlyBird` | boolean → 0 or 1 |
| `night_owl` | Night Owl | `a.nightOwl` | boolean → 0 or 1 |
| `streak_7` | The Streak | `a.dayStreak >= 7` | `dayStreak / 7` |
| `monthly_15` | Monthly Regular | `a.maxMatchesInMonth >= 15` | `maxMatchesInMonth / 15` |
| `doubles_10` | Dynamic Duo | `a.doublesPlayed >= 10` | `doublesPlayed / 10` |
| `flawless` | Flawless Victory | `a.flawlessVictory` | boolean → 0 or 1 |
| `comeback` | Comeback Kid | `a.comebackKid` | boolean → 0 or 1 |
| `nail_biter` | Nail Biter | `a.nailBiter` | boolean → 0 or 1 |
| `streak_10` | Unstoppable | `a.winStreak >= 10` | `winStreak / 10` |
| `played_100` | Centurion | `a.played >= 100` | `played / 100` |
| `wins_100` | Court Legend | `a.wins >= 100` | `wins / 100` |
| `venues_3` | Explorer | `a.venues.size >= 3` | `venues.size / 3` |
| `iron_man` | Iron Man | `a.maxMatchesInDay >= 5` | `maxMatchesInDay / 5` |
| `profile_complete` | Setting Up Shop | `profile.avatarUrl && profile.age !== null && profile.hand !== null` | fraction of the 3 fields set |
| `scribe_20` | The Scribe | `a.played >= 20` | `played / 20` |

All boolean-rule progress values are 0 (not yet true) or 1 (true) — there's
no partial credit for a single-occurrence achievement, matching how the
existing `first_win` badge already works (`clamp01(a.wins / 1)`).

Icons: reuse existing `IconName` values where a fit exists (e.g. `trophy`
for Court Legend, `flag` for Unstoppable/streak-based ones, `badminton` for
Dynamic Duo); introduce a small number of new ones only where nothing fits
(e.g. a sun/moon-style icon for Early Bird/Night Owl) — exact icon choices
are a Task-level implementation detail, not a design decision.

**Nail Biter and format-relativity:** fires when a won game's score exceeds
*that match's own* `config.pointsToWin` (11/15/21), not a fixed ">21" —
correctly covers deuce games in every point format, per your confirmation.

### 5. UI — three visual states (`BadgeGrid.tsx`)

Currently the component only distinguishes earned (red icon/title) vs.
locked (dim icon/title, always-visible progress bar). Adding the
in-progress middle state:

- **Locked** (`progress === 0`): icon and title stay `C.text3`/`C.text2`
  (unchanged), progress bar visible but empty.
- **In progress** (`0 < progress < 1`): icon renders in the standard
  `C.text` color (not dimmed, not accented) with the progress bar filled
  proportionally in an active color.
- **Unlocked** (`earned === true`): icon in `C.red`, plus a glow effect via
  the existing `glow()` theme helper (already used elsewhere for
  serving/live-state emphasis) on the chip, and a small checkmark badge
  overlay in the corner. Progress bar hidden (game already won) — matches
  current behavior where the bar only renders `!b.earned`.

The checkmark needs one new `IconName` entry in `src/components/Icon.tsx`
(`checkmark-circle`, an existing Ionicons glyph) — the only Icon.tsx change
this design requires.

## Testing

`tests/achievements.test.ts` (existing) gets new cases for all 15 rules,
each asserting the boundary (just-under vs. just-at-threshold) using
hand-built `PlayerAnalytics` fixtures — matching the existing test style
for `first_win`/`played_10`/etc. `src/analytics/player.ts` needs new tests
in its own test file (check for an existing `player.test.ts` at
implementation time) covering `dayStreak`, `weekendWarrior`, `earlyBird`/
`nightOwl`, `maxMatchesInMonth`/`maxMatchesInDay`, `winStreak` (verifying it
correctly exceeds the 8-entry `form` cap), `doublesPlayed`,
`flawlessVictory`/`nailBiter`/`comebackKid`, and `venues` (via the
`sessionLocations` param). `getSessionLocations` gets a repo-level test
following the existing `tests/removeClubPlayer.test.ts`-style mocked-db
pattern.

## Out of scope

- Challenger, Social Butterfly, Good Sport (need new invites/friends/
  endorsements systems — separate future features).
- Any backend/schema change — every new fact is derived from data already
  stored (`matches.created_at`, `matches.score_summary`,
  `matches.config.matchType`, `matches.config.pointsToWin`,
  `sessions.location`, `profiles.age`/`hand`/`avatar_url`).
- Push notifications or any other "you unlocked X" moment-of-unlock UI —
  this design only covers the Achievements tab's own display. Badges are
  computed fresh on every profile view, same as today.
- A venue field on matches themselves (Explorer reuses session location
  per your decision; quick matches with no session simply can't
  contribute to it).
