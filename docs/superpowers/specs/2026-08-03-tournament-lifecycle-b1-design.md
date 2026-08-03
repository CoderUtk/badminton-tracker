# Tournament Lifecycle (B1) — Design

**Date:** 2026-08-03
**Status:** Design approved (planning only; no implementation yet)

Make a tournament a two-phase thing: a `draft` that exists in the cloud and
collects entrants, and a `live` tournament whose bracket is built at start time
and sized to however many entrants actually turned up. Also gives every user a
hidden personal club so a tournament never has to be attached to a real one.

## Context

Two problems make the current model wrong for how tournaments are actually run.

**The bracket is built too early.** `createTournament` calls `buildBracket` and
inserts every bracket row during creation, sized by a draw size the user picks
up front. If the draw size is to be derived from the number of players who join,
it cannot be known at creation.

**Tournaments require a club.** `tournaments.club_id` is `not null`, and every
RLS policy on `tournaments`, `tournament_entrants`, and `bracket_matches`
resolves access through `is_club_member(club_id)`. Creating a one-off tournament
therefore forces the user to create a club first, and the club picker added
earlier today makes that prompt explicit and confusing.

`status` already exists on `tournaments`, defaulting to `'draft'`, but **nothing
in the codebase ever writes it** — there are no transitions. Every existing row
is `'draft'`, which is exactly the correct pre-start state, so the lifecycle
introduced here needs no status backfill.

## Scope

In: the personal club, the `draft` → `live` transition, `start_tournament`,
derived draw size, and the minimum-players rule.

Out, and specified separately as B2: player vs scorer invite links, role-aware
approval, admin-as-first-scorer, the Config/Players/Scorers subtabs, the courts
stepper, and random court assignment. Out entirely for now: live scores on the
bracket screen.

## 1. Hidden personal club

Every user gets one auto-created club that owns their standalone tournaments.
The club is never shown, so from the UI a tournament has no club; internally
every existing RLS policy, `club_players` row, and match insert keeps working
untouched.

- **Migration** `0010_personal_clubs.sql`:
  - `alter table public.clubs add column personal boolean not null default false`
  - extend `handle_new_user` to insert a personal club plus its `club_members`
    owner row after the profile insert. The function is already
    `security definer`, so RLS does not block it, and `clubs.created_by`
    references `profiles (id)` — the profile must be inserted first, in the same
    function.
  - **Backfill**: create a personal club and owner membership for every existing
    profile that lacks one. Without this, anyone who signed up before this
    migration has no personal club and standalone tournament creation fails for
    them. This is the part most easily forgotten and most visibly broken.
  - Name it `"Personal"`. It is never displayed, so the value only matters for
    debugging.

- **Hidden everywhere it would otherwise appear**: Home's club list, the Cups
  club picker, and any club selector filter on `personal = false`.
  `listClubs()` gains a `personal` field so callers can filter; it deliberately
  keeps returning personal clubs, because `listAllTournaments` must still query
  them.

- **Consequence — the club picker goes away.** Creating a tournament no longer
  asks for a club: it uses the personal club. The picker added in the list-fix
  change is removed, since with personal clubs `clubs.length` would exceed one
  for everybody and the prompt would reappear for every user.

Attaching a tournament to a *real* club is not part of B1. Every tournament
created here belongs to the creator's personal club.

## 2. Draft and live

`draft` and `live` become real states with one transition between them.

**Creating** inserts the tournament row and its entrants, and **builds no
bracket**. `createTournament` stops calling `buildBracket` and stops inserting
`bracket_matches`. It also stops taking a `size`.

**Starting** is `start_tournament(p_tournament_id uuid)`, a `security definer`
RPC with a pinned `search_path`, which in one transaction:

1. asserts the caller is a club admin for the tournament's club, raising
   otherwise;
2. asserts `status = 'draft'`, so a second call cannot rebuild a live bracket
   and destroy played results;
3. counts entrants and asserts the minimum (below), raising with the reason;
4. computes the draw size, builds the bracket rows, and inserts them;
5. sets `size` and flips `status` to `'live'`.

Atomicity matters: a half-started tournament with some bracket rows and a
`draft` status would be unrecoverable through the UI.

The bracket-building itself is the existing seeding logic. `buildBracket`
already resolves byes correctly — a slot with only one entrant sets
`winnerEntrant` immediately and propagates the winner forward — so odd entrant
counts auto-advance with no change. That behaviour is already covered by
`tests/bracket.test.ts`.

Because the SQL RPC must build the same bracket the TypeScript does, the seeding
order is reimplemented in SQL rather than shared. This duplication is the main
cost of doing the transition atomically, and the two must agree; the alternative
(build in TS, insert from the client) cannot be atomic and leaves the half-built
state above reachable. The SQL implementation is verified against the same
fixtures `tests/bracket.test.ts` uses.

**`done`** is out of scope. Nothing sets it today and nothing in B1 needs it;
the list screen already renders it if it ever appears.

## 3. Derived draw size and the minimum

New pure module `src/tournament/draw.ts`:

- `drawSizeFor(entrants: number): BracketSize` — the next power of two at or
  above `entrants`. 6 entrants gives 8, with 2 byes. The floor is **4**, not 2:
  `BracketSize` is `4 | 8 | 16 | 32 | 64` and has no 2, and the minimums below
  guarantee at least 3 entrants anyway.
- `startBlocker(players: number, matchType: MatchType): string | null` — returns
  why the tournament cannot start, or null. Used both to disable the Start
  button and to phrase its explanation, so the UI and the RPC agree on the rule.
  It rejects **more than 64 entrants** as well as too few: 64 is the largest
  `BracketSize`, and silently capping would drop entrants who had already
  joined.

**Minimum**: 4 players in singles (a 4-draw). In doubles, 4 players is 2 pairs,
which produces a bracket consisting of a single final — legal but almost
certainly not intended, so doubles requires **6 players (3 pairs)**.

> This doubles minimum is an assumption, raised during design and not
> explicitly confirmed. Allowing the 2-pair case is a one-line change to
> `startBlocker` and the RPC's guard if that is preferred.

Entrant count means *entrants*, not people: one entrant is a player in singles
and a pair in doubles. `tournament_entrants.club_player_id_2` already carries
the partner.

## 4. Screens

**Create** loses its draw-size control entirely — the value is derived. It keeps
name, format, games-per-match, and entrant selection, and produces a `draft`.

**Bracket screen** branches on status. While `draft`, there is no bracket to
render: it shows the entrant list, the draw size those entrants imply, and a
**Start tournament** button for admins, disabled with `startBlocker`'s reason
shown when the minimum is not met. While `live`, it renders exactly as it does
today.

Editing entrants after creation is B2's Players tab. In B1 entrants are chosen
at creation; the draft state exists so the bracket is built at start, not so
entrants can be edited yet.

## Testing

- `drawSizeFor` and `startBlocker` are pure and unit-tested: exact powers of two
  pass through unchanged, the 6-to-8 bye case, the floor at 4, both minimums
  including the doubles rule, and rejection above 64.
- `start_tournament`'s guards are the part worth asserting deliberately —
  non-admin rejected, second call on a `live` tournament rejected, below-minimum
  rejected. Each must raise rather than silently no-op, the failure mode that
  has bitten this project twice.
- Existing `tests/bracket.test.ts` continues to cover bye propagation.
- Screens are `tsc`-gated and verified on device.
- Gate every task on `npx tsc --noEmit && npm test`.

## Manual verification

1. A brand-new account can create a tournament without ever seeing a club.
2. An account that existed before the migration can too — the backfill case.
3. Creating leaves it in `draft` with no bracket rows.
4. Start is refused below the minimum, with the reason shown.
5. Starting 6 entrants produces an 8-draw in which two entrants advance
   unopposed.
6. Starting twice is refused and does not rebuild the bracket.
7. A non-admin cannot start.
