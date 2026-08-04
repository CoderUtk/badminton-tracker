# Tournament Roles & UI (B2) — Design

**Date:** 2026-08-03
**Status:** Design approved (planning only; no implementation yet)

Give a tournament two kinds of invite link — join as a player, join as a
scorer — make the admin the first scorer, restructure the tournament screen into
Config / Players / Scorers subtabs, and assign courts automatically at start.

## Context

B1 split a tournament into `draft` and `live`: creating inserts entrants and no
bracket, and `start_tournament` builds the bracket sized to the entrants who
turned up. B2 is how those entrants and scorers actually arrive, and how the
screen exposes it.

**The approval flow B2 builds on is currently dead.** Phase 3 shipped
`tournament_join_requests`, `tournament_staff`, and the
`request_tournament_join` / `approve_tournament_join` / `deny_tournament_join`
RPCs. Every one of those gates requires a `tournament_staff` row with
`role = 'admin'` (`0007_tournament_live_ops.sql:30,73,86`) — and **nothing in
the codebase or in any migration ever inserts into `tournament_staff`**.
Consequently:

- `approve_tournament_join` and `deny_tournament_join` always raise.
- The "admins read tournament queue" policy is always false, so the pending
  requests screen renders empty for everyone, including the creator.

Making the creator a staff admin is therefore not a nicety in B2 — it is the
load-bearing fix that turns Phase 3 from dead code into a working feature, and
it must land before anything else here is testable.

## Scope

In: staff seeding and backfill, the two invite links, role-aware approval,
editable entrants with doubles pairing, the three subtabs, the courts stepper,
and random court assignment.

Out: live scores on the bracket (realtime fan-out across every in-progress
match — its own spec), attaching a tournament to a real club rather than the
personal one, and claiming a guest entrant with a real account.

## 1. Staff seeding — the unblocking fix

**Migration `0012_tournament_staff_seed.sql`:**

- Insert a `tournament_staff` row with `role = 'admin'` for the creator whenever
  a tournament is created. The creator is not recorded on `tournaments` today —
  there is no `created_by` column — so add one, defaulted from `auth.uid()`, and
  seed staff from it. A trigger on `tournaments` insert keeps this atomic with
  creation rather than relying on a second client call that can fail
  independently.
- **Backfill** every existing tournament: a staff admin row for each club admin
  of the owning club. Without it, tournaments created before this migration keep
  their dead approval flow forever.
- The admin is also the first **scorer** by definition. Rather than inserting two
  rows, every permission check treats `role = 'admin'` as implying scorer
  rights. Two rows per person invites them to disagree.

**Consequence for `start_tournament`:** it currently authorises via
`is_club_admin(club_id)`. That stays — club admins may start — but staff admins
must also qualify, or someone made a tournament admin cannot start their own
tournament. The guard becomes `is_club_admin(club_id) OR is_tournament_admin(id)`,
with `is_tournament_admin` a new helper mirroring `is_club_admin`.

## 2. Two invite links

`buildTournamentJoinPath(id)` stays as-is and continues to mean **player**, so
links already shared keep working. A second builder produces the scorer path.

- Player: `join/tournament/<id>`
- Scorer: `join/tournament/<id>/scorer`

The role is a **path segment, not a query parameter**, because `parseJoinTarget`
strips the query string before parsing (`src/lib/joinLink.ts`) — a `?role=`
would be silently discarded and every scorer link would quietly invite a player.

`parseJoinTarget` returns an optional `role: "player" | "scorer"`, defaulting to
`"player"` when the segment is absent. Its existing tests are extended rather
than replaced.

**Schema:** `tournament_join_requests` gains
`role text not null default 'player' check (role in ('player','scorer'))`.
`request_tournament_join` takes the role and records it. Defaulting to
`'player'` means in-flight requests created before the migration stay valid.

## 3. Role-aware approval

`approve_tournament_join` branches on the request's role:

- **player** — unchanged: insert a `tournament_entrants` row.
- **scorer** — insert a `tournament_staff` row with `role = 'scorer'` and no
  entrant.

Approving a player still requires a `club_player_id`, since entrants reference
`club_players`. A requester who is not yet a club player needs one created
first; the RPC creates it from their profile display name when absent, so the
admin is not forced to pre-register everyone by hand.

**Both roles keep requiring admin approval.** A link is a secret, not an
authorisation, and the queue already exists.

Joining is refused once `status <> 'draft'`: a bracket sized at start cannot
absorb a late entrant. Scorers, by contrast, may join at any time — they do not
affect the draw.

## 4. Entrants become editable

B1 deliberately left entrants fixed at creation, which made a too-small
tournament unstartable with no in-app escape. The Players tab fixes that: while
`draft`, an admin may add a guest, remove an entrant, and reorder seeds.

Removal is a plain delete of the `tournament_entrants` row. No bracket exists
during `draft`, so nothing references it.

## 5. Doubles pairing

Players join individually; the admin pairs them on the Players tab before
starting. `tournament_entrants.club_player_id_2` already carries the partner, so
this is UI over existing schema.

An unpaired player in a doubles tournament blocks the start.
`startBlocker` already has a "Pair every player to start" branch that is
currently unreachable — the Players tab is what finally reaches it, since it can
produce an odd player count.

## 6. Subtabs

The tournament screen becomes three tabs over one loaded tournament, not three
routes that each refetch.

- **Config** — name, courts stepper, both share links, and the Start button with
  `startBlocker`'s reason shown. Admin-only controls; members see a read-only
  summary.
- **Players** — entrant list with live "N entrants → M draw, K byes", add guest,
  remove, pair for doubles, and pending player requests inline.
- **Scorers** — staff list with roles, the scorer share link, and pending scorer
  requests inline.

The separate `tournaments/requests/[tournamentId]` screen is retired; its queue
splits by role into the two tabs where each belongs.

Once `live`, Config and Players become read-only and the bracket appears above
the tabs.

## 7. Courts stepper

`tournaments.courts` already exists (`0009`). The B1 segmented control
`[1,2,3,4,6,8]` is replaced by a **stepper, minimum 1, maximum 10**, matching
how a venue is actually booked. Values above 10 are refused rather than clamped.

## 8. Random court assignment

`start_tournament` assigns each **round-1** match a court, cycling `1..courts`
in bracket order rather than sampling randomly — "random" in the request means
"the admin should not have to do it by hand", and a deterministic spread avoids
double-booking a court in the same round, which random assignment would do
routinely.

Later rounds are left null and are assigned from Live Ops when their feeders
resolve.

A court may be changed by an admin or the match's scorer **until the match
starts** — once `bracket_matches.match_id` is set, the court is fixed.
`assignBracketMatchCourt` gains that guard; it currently permits a change at any
time.

## Testing

- Pure and unit-tested: `parseJoinTarget`'s role segment including the absent
  default and a legacy player link; the round-1 court cycle; the draw/byes
  summary shown on Players.
- The RPC guards are the part worth asserting deliberately, because each fails
  silently if wrong: a non-admin cannot approve, a scorer request creates staff
  and not an entrant, a player request after start is refused, and a court
  cannot be changed once the match has started.
- The staff backfill must be verified against a tournament created before
  `0012`, since that is the case that is currently broken and the one no new
  test would otherwise cover.
- Screens are `tsc`-gated and checked on device.
- Gate every task on `npx tsc --noEmit && npm test`.

## Manual verification

1. On a tournament created **before** `0012`, the pending-requests queue now
   loads instead of rendering empty — the dead-flow fix.
2. Share the player link; a second account requests; the admin sees it under
   Players and approves; the entrant appears.
3. Share the scorer link; a third account requests; the admin sees it under
   Scorers and approves; they appear as staff with no entrant.
4. A doubles tournament with an unpaired player refuses to start, naming the
   reason.
5. Starting with 3 courts spreads round-1 matches across courts 1, 2, 3, 1, …
6. A scorer claims an unclaimed match, changes its court, starts it — and can no
   longer change the court afterwards.
7. A player request sent after the tournament started is refused.
