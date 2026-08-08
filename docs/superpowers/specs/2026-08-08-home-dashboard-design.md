# Home Screen — Launcher to Dashboard

Date: 2026-08-08
Surface: `app/(app)/index.tsx`
Status: design approved, not yet planned

## Problem

The home screen is a launcher. It offers one action (START A MATCH), a list of
clubs, and two inline forms. Nothing on it gives a returning user a reason to
open the app between matches, and nothing tells a new user what the app can
actually do — live scoring, serve orientation, rally history and set points are
all invisible from here.

A mockup was proposed that reframes home as a dashboard: performance stats, an
upcoming session, richer club rows. The direction is right. This spec keeps the
mockup's structure and drops its decoration.

## What this is not

The app's visual theme is unchanged. `src/theme.ts` — surfaces, the action-red
primary, the Russo One / Chakra Petch pairing, the glow presets — is the
incumbent identity and stays exactly as it is. This is a layout and content
change on one screen.

## Layout

Single `ScrollView` on `C.bg`, padding 16, gap 12. The clubs list renders inline
(mapped, not `AnimatedList`) because it no longer owns the scroll.

Section order, top to bottom:

1. Greeting row — unchanged
2. START A MATCH — enlarged
3. Next Session — conditional
4. Your Clubs — list + sheet trigger
5. Recent Performance — three stat tiles

The order is driven by expiry. The session card is the only element with a
clock on it, so it sits highest. Clubs are the navigation spine and sit in the
middle. Stats are the least urgent and sit last, where they absorb leftover
height without reading as padding — so a user with one club doesn't see a hole.

Vertical budget on an iPhone-class device (~630pt usable after safe areas and
the tab bar):

| Block | Height |
| --- | --- |
| Greeting row | 44 |
| START A MATCH | 96 |
| Next Session card | 76 |
| Your Clubs header + 2 rows | 180 |
| Recent Performance header + tiles | 112 |
| Gaps (5 × 12) | 60 |
| **Total** | **568** |

Fits without scrolling at typical club counts. Beyond ~4 clubs the screen
scrolls, which is correct.

## Blocks

### START A MATCH

Grows from 62pt to 96pt, label from 19 to 22. Gradient (`GRAD.redCTA`), radius
16, and `glow(C.red, 18, 0.5)` are unchanged.

The old height was inherited, not chosen — it matched a text input. This is the
most-used control on the most-visited screen and should be sized like it.

No card wrapper, no border, no eyebrow chip, no headline. The mockup wrapped
this button in a red-outlined card with a `LIVE SCORING & STATS` chip and a
`Ready for a Game?` headline above it. That is four elements saying *start a
match*, and the red outline competes with the red button it contains for
primary emphasis. The button is the headline.

### Feature copy — self-retiring

Directly under the button, while the user's completed match count is **under 5**:

```
Track points, serve orientation, rally history, and set points — live.
```

Two lines, `C.text2`, 13pt. No card, no chip, no illustration. ~36pt.

This solves the discovery gap the mockup identified: nothing currently tells
anyone what the scoring engine does. But the person who needs that sentence has
played zero matches, and the person who has played thirty would be paying ~36pt
of permanent home-screen height for something they learned in week one. So it
retires itself at the same threshold that gates the stat tiles — one threshold,
not two.

Above 5 matches the block is absent and the layout closes up.

### Next Session

A card, no section header. Calendar icon, club name as title, meta line beneath.

- **Source:** `listSessions()` with no `clubId` (already returns every session
  across all clubs). Filter to `starts_at > Date.now()` and status not
  cancelled, then take the earliest. Note the repo sorts `starts_at desc`, so
  the earliest upcoming session is the *last* match, not the first — re-sort
  ascending rather than taking `[0]`.
- **Title:** club name, resolved from `session.club_id` against the clubs
  already loaded on this screen. There is no session title field —
  `ClubSession` (`src/repos/sessionRepo.ts:13`) has `starts_at`, `ends_at`,
  `location`, `courts`, `status`. The mockup's "Doubles Practice Session" does
  not exist and is not being added.
- **Meta:** relative day + time, then `location`. When `location` is null, fall
  back to `${courts} courts`.
- **Tap:** `/(app)/sessions/[id]`.
- **Empty:** renders nothing. A session is an event; "you have no events" is
  noise, and the absence of a header means the block disappears cleanly.

### Your Clubs

Section header with a `+` button on the right, opening the club sheet. Rows keep
their current shape — icon, name, `role · code XXXX`, chevron — plus a `Live`
pill when that club has a session with status `live`. The pill reuses the
session fetch already performed for the Next Session card; no extra query.

Zero clubs: the list slot becomes a single full-width "Create or join a club"
button opening the same sheet. Nothing else shifts position.

### Recent Performance

Section header, then three tiles in a `gap: 8` row, each `flex: 1` on `C.card`.
Label above, value below. Values in `F.display`, matching how the app already
renders numerals.

| Tile | Value | Colour |
| --- | --- | --- |
| Matches | `played` | `C.text` |
| Win Rate | `winPct` | `C.green` |
| Longest Streak | `longestWinStreak` | `C.amber` |

Below 5 completed matches, Win Rate and Longest Streak render `—` in `C.text2`;
Matches renders its true count. `0%` reads as *you lose every game*; `—` reads
as *not enough data yet*. The tile row keeps its shape either way, so the
structure itself tells a new user what the app will eventually show them.

## Club sheet

One sheet, two actions: Create Club and Join with Code. Reuses the existing
sheet component (the one fixed in `450d657` to scroll long contents).

The `onCreate` and `onJoin` bodies move over verbatim from `index.tsx`, along
with `validateName` and the touched/error state. Nothing about the logic
changes; it relocates.

This is load-bearing, not cosmetic. Today those inputs live in the clubs list
footer specifically so React Native scrolls the focused input into view — see
the comment at `app/(app)/index.tsx:69`, which notes that a
`KeyboardAvoidingView` was a no-op on Android and that the footer placement is
what makes `softwareKeyboardLayoutMode: "resize"` work. Putting stats *below*
the clubs list destroys that arrangement. A sheet sizes to its own content and
solves the keyboard problem more directly than the footer ever did.

Cost: creating a club becomes two taps instead of one. Accepted — creation is
rare, and home is a daily surface.

## Data

Most of this already exists.

`getPlayerAnalytics(name)` in `src/repos/statsRepo.ts` returns `played`,
`winPct`, and `winStreak` computed over full lifetime history via
`listAllMatches()`. It keys on player **name**, matching against
`SidePlayer.name` on both sides, so the question of "which side was I on" is
already answered upstream — no `club_player_id` resolution needed.

**One gap:** `winStreak` is the *current* streak (`src/analytics/player.ts:40`),
not the longest. `longestWinStreak` must be added to `PlayerAnalytics` and to
the existing reducer in `playerAnalytics()`. It is a running maximum alongside
the counter that is already there — a few lines inside the loop that already
walks matches in order.

Everything else on this screen is composition over `clubRepo`, `sessionRepo`,
and `profileRepo` as they stand.

## Which name identifies the user

`getPlayerAnalytics` takes a player name. Resolve it from
`club_players_cache` where `profile_id` equals the signed-in profile, falling
back to the profile's `displayName`.

Assumption, stated because it is load-bearing: the user appears in their own
match records under a name that matches one of these. If someone sets up
matches under a nickname that matches neither their club-player name nor their
display name, all three tiles read as no-data. The club-players lookup makes
this unlikely — that name is the one the club knows them by, and it is the one
match setup draws from — but it is not impossible.

## States

| State | Result |
| --- | --- |
| New user — 0 clubs, 0 matches, no session | Greeting, big CTA, feature copy, "Create or join a club" button, stat tiles reading `0 / — / —` |
| Clubs, no upcoming session | Session card absent; clubs and stats close up |
| Under 5 matches | Feature copy present; Win Rate and Longest Streak show `—` |
| Steady state | Feature copy gone; all tiles populated; session card present when one is scheduled |

## Two corrections made along the way

**Contrast.** Stat tile labels use `C.text2` (`#9BA3B2`, ~6.4:1 on `C.bg`), not
`C.text3` (`#5C6472`, ~2.9:1 — below AA). The existing `WELCOME BACK` eyebrow
already has this problem; it is not being propagated to three new labels. The
eyebrow itself is out of scope here.

**Motion.** No entrance or stagger animation on this screen. Home is opened many
times a day, and staggered entrance on a daily surface reads as lag rather than
polish. Press feedback only, via the existing `press` token in `src/theme.ts`.

## Open question for implementation

Whether Matches should count matches the user recorded but did not play in
(e.g. scoring for others). `getPlayerAnalytics` counts only matches where the
user's name appears on a side, which is the correct reading of "your
performance" — this spec assumes that behaviour and changes nothing about it.
Flagged only because the tile is labelled "Matches", which a user could read as
"matches I've tracked".
