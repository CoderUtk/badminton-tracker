# New Match Screen — design

**Date:** 2026-08-10
**Status:** approved, ready for implementation plan

## Context

User feedback on the current `app/new-match.tsx`:

- The screen scrolls. Everything should fit on one page.
- The Doubles/Singles toggle is fine.
- The four name `TextInput`s eat too much vertical space. Edit names in the court instead.
- Move the swap buttons into the court — sides swap on the middle of the net divider.
- Pick the first server by tapping a court zone. Badminton always starts the serve
  from the right service court, so tapping a left zone should explain that. This
  removes the whole "First serve" section.
- When a club is selected, names should come from that club's roster; otherwise a
  text field. Move the club selector up.
- "None" reads like the name of a club. Use something else.
- After a match finishes and a new one starts, remember the last 2/4 player names
  locally so the same group can start again with one or two edits.

Today the screen stacks: format toggle, four inputs, "Starting positions" heading,
court preview, swap row, "Points per game", "Games to win", hint, "First serve"
heading + hint + chips, "Save to club" heading + chips, CTA. Roughly twice a
phone screen.

## Target layout

One page, no scroll, top to bottom:

```
[ Doubles | Singles ]        [ Save to: Personal ▾ ]     row 1
┌──────────── COURT (flex: 1, fills remaining) ─────────┐
│  Alice              ⇅     │     Carol            ⇅    │  top boxes
│ ────────────────────────  ⇄  ─────────────────────────│  net: swap sides
│  Bob  ● serve             │     Dave                  │  bottom boxes
└───────────────────────────────────────────────────────┘
Points [ 11 | 15 | 21 ]        Games [ 1 | 2 | 3 ]         row 3
First to 2 games · best of 3                               hint
[               Start scoring               ]              CTA
```

Removed relative to today: the four `TextInput`s, the "Starting positions"
heading, the swap-button row, the entire "First serve" section (heading, hint,
chips), the bottom "Save to club" section, and the "Points per game" /
"Games to win" headings (replaced by small inline captions).

The court takes `flex: 1` so it absorbs whatever height is left; every other row
is fixed height. On a small phone the court shrinks rather than the page growing.

## Court interactions

`src/components/Court.tsx` stays presentational and read-only by default. All new
behaviour arrives through optional props, so the score and watch screens that
already render `<Court state={...} />` are unaffected.

### Zone model

The zone maths lives in a pure module, `src/lib/courtZones.ts`, so it can be unit
tested — the Jest setup runs in a `node` environment that cannot parse React
Native components. `Court.tsx` consumes the same helper, so the rule exists once:

```ts
export type CourtRow = "top" | "bottom";

export type CourtZone = {
  team: TeamId;              // "A" (left half) | "B" (right half)
  row: CourtRow;
  playerIdx: number | null;  // index into state.config.teams[team], null when empty
  isRightCourt: boolean;     // this zone is that team's RIGHT service court
};

export function rightRow(team: TeamId): CourtRow;
export function courtZones(state: MatchState): CourtZone[]; // always 4, reading order
```

Team A occupies the left half and faces right, so its right service court is the
**bottom** box; team B faces left, so its right court is the **top** box. This is
the `rightRow()` logic already inside `Court.tsx`, lifted out so the new-match
screen can hit-test with it instead of duplicating the rule.

Name-slot mapping is deterministic, because `buildConfig` fills `teams.A` from
`names[0..1]` and `teams.B` from `names[2..3]` in doubles, and from `names[0]` /
`names[1]` in singles:

```
doubles: nameIndex = (team === "A" ? 0 : 2) + playerIdx
singles: nameIndex = team === "A" ? 0 : 1
```

The screen always resolves the occupant from the live preview state — it never
assumes which slot stands in which box.

### Tap on the player name

Opens an inline `TextInput` in that zone (`autoFocus`). `returnKeyType="next"`
advances to the next occupied slot in reading order; the last slot uses `"done"`
and dismisses the keyboard. Empty slots render their placeholder
(`Player 1`…`Player 4`, or `Player A` / `Player B` in singles) as the tappable
text, so a name target always exists in doubles.

### Tap on the zone background

- Zone is that team's right service court **and** occupied → set the first server
  to the player standing there.
- Otherwise → `toast("Service must start from the right service court.", "error")`
  and briefly pulse the correct right-court zone of that half.

In singles at 0–0 both players stand in their right courts, so both left zones are
empty and produce the same error. No special case needed.

The first-server selection is pinned to the **slot**, not the person, matching
today's `swapTeam` semantics: swapping a pair moves whoever now stands in the
right court into the serving role.

### Swap controls

Rendered only when the corresponding handler prop is supplied:

- `onSwapSides` → a small circular `⇄` button centred on the net divider. Swaps
  team A and team B halves, exactly today's `swapSides`.
- `onSwapTeam(team)` → a small circular `⇅` button centred on each half's
  horizontal mid-line. Doubles only; swaps that team's two name slots.

Both are ≥44pt touch targets with a translucent background so they stay legible
over the court surface.

## Club picker

`src/components/ClubPicker.tsx` (new). A compact button in row 1, right of the
Doubles/Singles toggle:

- Label: `Save to: <club name>`, defaulting to **Personal** with a person icon.
  The word "None" is gone.
- Tapping opens a sheet: `Personal — not saved to a club` (sets `clubId = null`)
  followed by one row per club.
- Hidden entirely when the session is anonymous (guests never save to a club, and
  the existing code already skips the club fetch for them) or when the user has no
  clubs. With exactly one club, the existing auto-select behaviour stays.

With a club selected, tapping a name still opens the inline field, and a
horizontally scrollable strip of roster chips appears directly under the court,
filtered by what has been typed. Tapping a chip fills the slot and advances to the
next. The strip is an overlay so it does not change the page height. Typing a name
that is not on the roster is allowed and is saved as a plain name (the current
`createMatch` call already passes `club_player_id: null` for every player, so no
data-model change is required).

Selecting a club keeps today's behaviour of prefilling only slots that are still
empty, so a restored lineup is never overwritten.

## Remembered lineup

New module `src/lib/lastLineup.ts`, using the same storage shim as
`src/lib/guestMatches.ts` (expo-secure-store on native, `localStorage` on web —
no new dependency). Key: `last_lineup_v1`.

```ts
export type LastLineup = {
  doubles: boolean;
  namesDoubles: [string, string, string, string];
  namesSingles: [string, string];
  points: 11 | 15 | 21;
  bestOf: 1 | 3 | 5;
  clubId: string | null;
};

export async function saveLastLineup(x: LastLineup): Promise<void>;
export async function loadLastLineup(): Promise<LastLineup | null>;
export async function clearLastLineup(): Promise<void>;

export function resolveInitialLineup(
  params: { clubId?: string; teamA?: string; teamB?: string },
  persisted: LastLineup | null,
  isGuest: boolean,
): LastLineup;
```

Both name arrays are returned, and the screen holds them as separate state, so
toggling Doubles/Singles restores the right group instead of the two modes
fighting over the same slots.

Singles and doubles names are stored separately, so switching the toggle restores
the right group instead of reshuffling four names into two slots.

Written on a successful match start, immediately before navigating to
`/score/<id>`, and failures there are swallowed — a storage error must never block
a match.

`resolveInitialLineup` is pure and holds the precedence rule:

1. Route params (`teamA` / `teamB` / `clubId`, from a session or tournament deep
   link) win outright — including the singles/doubles inference from how many
   names arrive.
2. Otherwise the persisted lineup.
3. Otherwise empty names with today's defaults (doubles, 21 points, best of 3).

For a guest session the persisted `clubId` is forced to `null`.

`clearLastLineup()` is called from the same place as `clearGuestMatchIds()`, so
player names do not leak across accounts on a shared device — the same concern the
existing `clubs_cache` comment in `new-match.tsx` documents.

## Files

| File | Change |
| --- | --- |
| `src/lib/courtZones.ts` | New. Pure zone maths lifted out of `Court.tsx`. |
| `src/components/CourtBox.tsx` | New. One service box: name text, inline field, serve dot, invalid-pick pulse. |
| `src/components/Court.tsx` | Consumes `courtZones`; takes one optional `edit` prop carrying the interaction callbacks and renders the in-court swap buttons. Read-only rendering path unchanged. |
| `src/components/ClubPicker.tsx` | New. Button + selection sheet. |
| `src/components/Icon.tsx` | Add `"chevron-down"` to `IconName`. |
| `src/lib/lastLineup.ts` | New. Storage + `resolveInitialLineup`. |
| `app/new-match.tsx` | Rewritten layout; the removed sections make it shorter than today's 273 lines. |

No database, schema, or Supabase migration changes. No change to `createMatch` or
the scoring engine.

## States and failure modes

- **Names incomplete** — the CTA stays disabled (today's `filled` gate) and empty
  zones show their placeholder. No new error path.
- **Left-zone tap** — toast plus a pulse on the valid zone; the selection does not
  change.
- **Storage read fails / corrupt JSON** — `loadLastLineup` returns `null` and the
  screen falls back to empty defaults.
- **Storage write fails** — ignored; the match still starts.
- **Club roster fetch fails** — the picker still works, the roster strip is simply
  empty, and free-text entry continues to work.
- **Long player names** — zones already clamp to `numberOfLines={1}`.
- **Keyboard open** — the roster strip and the inline field sit above the keyboard;
  the court must remain visible while editing.

## Verification

Unit tests:

- `courtZones` returns the right-court row per team for both singles and doubles,
  and the correct `playerIdx` for occupied and empty boxes.
- `resolveInitialLineup` precedence: params over persisted over defaults; guest
  sessions drop the persisted `clubId`; singles and doubles name sets stay separate.
- `lastLineup` save/load round-trip, including a corrupt-value read returning
  `null`.

Manual checks on a small phone:

- The whole screen fits with no scroll in both singles and doubles.
- Tapping each of the four zones selects or rejects the first server correctly.
- Editing a name in the court updates the preview and the serve highlight.
- Finish a match, start a new one, and confirm the four names come back.

## Out of scope

- Adding a typed name to the club roster from this screen.
- Drag-to-swap players between boxes.
- Any change to the score, watch, or tournament screens.
