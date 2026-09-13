# Tournament formats: round-robin, double elimination, groups → knockout

Date: 2026-09-13
Status: approved design, not yet planned

## Problem

CourtSide runs tournaments today, but only one format. `tournaments.format`
exists as a column and is written `'single_elim'` at both call sites
(`src/repos/tournamentRepo.ts:46`, `src/repos/tournamentCache.ts:79`). Clubs
that want everyone to keep playing after a loss, or that have twelve people and
three hours, have no option that fits.

Competing club platforms ship five or six formats. Formats are the one
tournament gap that costs users outright: a club whose regular night is a
round-robin cannot use the tournament feature at all.

## Scope

This spec covers three new formats plus the engine change that makes them
possible:

- **Double elimination** — two lives, one loss is not the end.
- **Round-robin** — everyone plays everyone, ranked by standings.
- **Groups → knockout** — round-robin groups feeding a knockout bracket.

Deliberately **out of scope**, each to its own later spec:

- **Swiss** — pairings depend on prior results, so a round cannot be generated
  up front. It fits the engine designed here (a round of edge-free matches,
  appended per round) but needs its own offline story.
- **Americano** — partners rotate every round and scoring is per player, so the
  `Entrant` model (a fixed player or fixed pair) does not hold. That is a model
  change, not a format.
- **Ladder** — an ongoing club ranking with no end state. Arguably belongs next
  to the existing rating system rather than inside `tournaments/`.

## Constraints

1. **Full offline parity.** Round-robin and double elimination must run offline
   exactly as knockout does today: matches generated at start, standings
   computed locally, results synced later.
2. **No regression to single elimination.** Live and historical tournaments are
   all `single_elim` and must be unaffected — during migration, during play, and
   in the UI.
3. **Old clients keep working.** Users on 1.6.x continue to hit the same server.
   Every server change is additive.
4. **The host must not be able to start an unplayable tournament by accident.**

## Approach: progression as data

The rejected alternative was one format module per format on the client plus a
matching reimplementation of each format's advance logic in plpgsql, so the
server could validate independently. That is today's pattern, and today's
pattern already hurts: `0012_tournament_staff_seed.sql` carries the comment

> This is 0011's function reproduced with ONE line changed (the authorisation
> check). Every other guard is byte-identical and must stay that way.

The draw math lives twice. Four formats would make it eight copies required to
stay byte-identical. They drift, and the drift surfaces as a live tournament
where the phone and the server disagree about who plays next.

Instead, **the progression graph is data**. Each `bracket_matches` row carries
where its winner and loser go. Format generators are pure functions that emit
the whole graph at start, routing included. The server stops deriving
progression and instead follows the graph, so there is no second implementation
to drift from the first.

| Format | Graph it emits |
|---|---|
| `single_elim` | win edges only, `idx/2` tree — byte-identical to today's output |
| `double_elim` | win edges plus loss edges into a losers tree |
| `round_robin` | every pairing, no edges; standings derived |
| `groups_knockout` | group matches with no edges, plus a seeding gate (below) |

The server still validates, structurally rather than by format math: every
entrant appears the expected number of times, every edge target exists inside
this tournament, no cycles, no slot written twice. Those invariants are what
protect the table. Re-deriving the bracket only ever protected it from a client
that got the math wrong — and that client is the one shipping the format.

A third option, moving all generation and progression into Postgres, was ruled
out by constraint 1.

## Data model

### Server — `supabase/migrations/0053_tournament_formats.sql`

All additive.

```sql
alter table public.bracket_matches
  add column if not exists win_to_match_id  uuid,
  add column if not exists win_to_slot      text check (win_to_slot  in ('a','b')),
  add column if not exists loss_to_match_id uuid,
  add column if not exists loss_to_slot     text check (loss_to_slot in ('a','b')),
  add column if not exists group_idx        int,
  add column if not exists src_a            text,
  add column if not exists src_b            text;

alter table public.tournaments
  add column if not exists group_count       int,
  add column if not exists advance_per_group int;
```

`format` already exists (`0002_tournaments.sql`, default `'single_elim'`). New
accepted values: `double_elim`, `round_robin`, `groups_knockout`.

**The routing columns carry no foreign key, deliberately.** `start_tournament`
inserts the entire bracket in one statement from
`jsonb_array_elements(p_bracket)`. Routing edges point forward — a round-1 row
references a round-2 row in the same batch — and a plain foreign key is checked
per row, immediately, with no ordering guarantee from `jsonb_array_elements`.
The first insert would fail and every tournament start would die. Rows already
cascade from `tournaments`, so the constraint bought nothing it was going to be
allowed to keep.

### Backfill

One statement, describing the routing existing tournaments were already doing:

```sql
update public.bracket_matches m set
  win_to_match_id = p.id,
  win_to_slot     = case when m.idx % 2 = 0 then 'a' else 'b' end
from public.bracket_matches p
where p.tournament_id = m.tournament_id
  and p.round = m.round + 1
  and p.idx   = m.idx / 2
  and m.win_to_match_id is null;
```

Finals get null edges, which is exactly right: a null win edge is what "this
ends the tournament" means from here on, replacing `finish_bracket_match`'s
current `round = max(round)` test. Live tournaments keep running mid-flight.

### Client — `src/db/schema.ts`

A new `TOURNAMENT_FORMATS_DDL` constant appended to `MIGRATIONS` in `db.ts`.
Never folded into an existing constant: editing an applied migration does not
re-run it, so existing installs would never receive the columns.

```sql
ALTER TABLE bracket_matches ADD COLUMN win_to_match_id TEXT;
ALTER TABLE bracket_matches ADD COLUMN win_to_slot TEXT;
ALTER TABLE bracket_matches ADD COLUMN loss_to_match_id TEXT;
ALTER TABLE bracket_matches ADD COLUMN loss_to_slot TEXT;
ALTER TABLE bracket_matches ADD COLUMN group_idx INTEGER;
ALTER TABLE bracket_matches ADD COLUMN src_a TEXT;
ALTER TABLE bracket_matches ADD COLUMN src_b TEXT;
ALTER TABLE tournaments ADD COLUMN group_count INTEGER;
ALTER TABLE tournaments ADD COLUMN advance_per_group INTEGER;
```

One `ALTER` per statement, with no `IF NOT EXISTS`: SQLite supports neither
`ADD COLUMN IF NOT EXISTS` nor multiple `ADD COLUMN` clauses in one statement,
and `db.ts:120` splits the migration string on `;` and runs each piece raw. None
of these columns may also appear in `TOURNAMENT_DDL` — the duplicate-column
error aborts the whole migration and fails the database open on fresh installs,
as the comment in `schema.ts` already warns.

`BracketRow`, `BracketMatch`, `rowToBracketMatch` and `bracketMatchToRow` in
`src/tournament/rows.ts` gain the seven new fields.

**No standings table.** Standings are a pure function over finished matches,
recomputed on render. Nothing to sync, nothing to invalidate, nothing extra to
cache offline.

### Verified unaffected

- `tournament_full_view` builds its bracket array with `to_jsonb(b.*)`
  (`0040_restore_tournament_full_view.sql:90`), so it picks up new columns
  automatically, and `rpcToFull` (`src/tournament/bundle.ts:89`) reads **named
  keys** — extra keys are ignored. Clients on 1.6.x keep working against the new
  server.
- Brackets do not go through `src/sync/runner.ts`; they use `tournamentCache`
  plus direct RPC. There is no sync column list to update.
- `tournamentCache.ts:79` inserts an explicit column list, so new local columns
  default to NULL on existing rows.
- Every new column is nullable with no default. The backfill is the only write
  to existing rows, and it only touches rows where `win_to_match_id is null`.

## Format engine

`src/tournament/formats/`, one module per format. All pure, no native imports,
so they unit-test in plain Jest exactly as `rows.ts` and `bracket.ts` do.

```ts
export type FormatId = "single_elim" | "double_elim" | "round_robin" | "groups_knockout";

export type FormatModule = {
  id: FormatId;
  label: string;   // "Round-robin"
  blurb: string;   // "Everyone plays everyone"
  /** Match count for N entrants. Cheap — powers the live estimate without building a graph. */
  matchCount(entrants: number, o?: GroupOpts): number;
  /** The whole match graph, routing edges included. Pure. */
  build(o: GenOpts): BracketMatch[];
  standings(bracket: BracketMatch[], entrants: Entrant[]): Standing[];
  status(bracket: BracketMatch[]): { status: "pending" | "live" | "done"; champion: string | null };
};
```

`FORMATS: Record<FormatId, FormatModule>` is the only lookup table. The picker
renders `Object.values(FORMATS)`. Adding Swiss later is one file plus one map
entry.

### Advance

`advanceWinner` in `src/tournament/bracket.ts` loses its `idx/2` math and
becomes format-agnostic:

```ts
export function advanceWinner(bracket, bracketMatchId, winnerEntrant) {
  const copy = bracket.map((m) => ({ ...m }));
  const m = copy.find((x) => x.id === bracketMatchId);
  if (!m) return bracket;
  m.winnerEntrant = winnerEntrant;
  const loser = m.entrantA === winnerEntrant ? m.entrantB : m.entrantA;
  route(copy, m.winToMatchId, m.winToSlot, winnerEntrant);
  route(copy, m.lossToMatchId, m.lossToSlot, loser);
  return copy;
}
```

The `single_elim` generator is today's `buildBracket` with edges stamped on
afterwards: same ids, rounds, indices, bye resolution. `advanceWinner` following
those edges lands in the same slot `idx/2` did. The existing bracket tests run
unchanged against the new engine, which is the check that the refactor preserved
behaviour.

### Round-robin

Every pairing, with `round` set from circle-method rotation so a host can run
them in a sane order. No edges. Done when all matches are done; champion is
`standings[0]`. Odd entrant counts use a rotating bye; bye matches are never
created as rows, and nobody sits twice before everyone has sat once.

### Double elimination

Winners tree with win edges exactly as single elimination, plus a losers tree,
with each winners match also carrying a loss edge into it. Grand final has null
edges.

**No bracket reset.** If the losers-bracket winner beats the winners-bracket
winner in the grand final, they win; there is no decider match. The full
double-elimination reset doubles the explaining for a case that arises in a
minority of finals, and a club night cannot absorb an unscheduled extra match.
This is stated in the format blurb.

### Groups → knockout, and the seeding gate

A knockout slot in this format is fed by *"whoever finishes first in group 2"* —
a standings outcome, not one match's winner. No edge can express that. This is
the one place pure edge routing is insufficient.

The generator stamps `src_a` / `src_b` with a source token (`'G2#1'`) on
knockout slots at build time. A **gate** function — format-agnostic, pure, run
after any finish — finds groups that are complete whose dependent slots are
still null, computes that group's standings, and fills them.

Group sizes differ by at most one when entrants do not divide evenly (13
entrants in groups of 4 becomes 4/3/3/3). Whenever group sizes differ within a
tournament, standings compare **win rate** rather than win count, so the entrant
in the larger group is not penalised for a longer schedule.

### Server: `start_tournament`

Two changes, both confined to non-knockout formats.

Its payload size check is hard-wired to single elimination:

```sql
if jsonb_array_length(p_bracket) <> v_draw - 1 then
  raise exception 'Bracket does not match the draw size';
```

`v_draw - 1` is the single-elimination match count. Round-robin with 6 entrants
is 15 matches, not 7. This becomes a per-format expected count, and the
`single_elim` branch keeps this exact expression so existing behaviour is
unchanged. The function reads `tournaments.format` (already set at creation) to
choose the branch.

It also sets `size = v_draw` on start. `tournaments.size` is `NOT NULL` from
`0002` and means "draw size", which only knockout formats have. For
`round_robin` it is set to the entrant count; for `groups_knockout` to the
knockout draw size (`group_count × advance_per_group`, rounded up to a power of
two). No column changes, and `size` keeps meaning "how many slots the bracket
half holds" for every format that has a bracket half.

It gains the structural validation described under Approach: every edge target
must resolve to a row in the same payload, and the graph must be acyclic.

### Server: `finish_bracket_match`

Loses its tree math entirely. Instead of computing `v_parent_idx := v_idx / 2`,
it reads the finished row's routing columns and writes the winner into the named
slot, and the loser into `loss_to` when present. "Done" becomes
`win_to_match_id is null` on the finished match, which the backfill already made
true of every existing final.

It gains `p_slot_fills jsonb default '[]'` for gate results. The server does
**not** recompute standings. It validates structurally: the target slot is
currently null, the entrant belongs to this tournament, and the cited group is
actually complete. That is sufficient — a host who wanted to advance the wrong
player could already do so by scoring matches however they like. The invariants
worth enforcing are the ones that protect the table, and duplicating standings
math in plpgsql is precisely the drift this design exists to avoid.

Single-elimination callers pass no fills and hit identical behaviour.

## UI

### Naming collision

`app/(app)/tournaments/new.tsx:156` currently labels singles/doubles as
**"Format"**. That word is now taken. Rename that control to **"Match type"**,
which is what the column has been called since `0012` (`match_type`), so code
and UI finally agree. This is a one-word change that removes the worst source of
confusion before anything is added.

### Format picker

Rows, not a segmented control — four options do not fit a segment, and the
descriptions are the point.

```
Format
┌──────────────────────────────────────────┐
│ ● Knockout                               │
│   Lose once, you're out                  │
│   ≈ 7 matches · ~50m on 4 courts         │
├──────────────────────────────────────────┤
│ ○ Double elimination                     │
│   Two lives — one loss isn't the end     │
│   ≈ 14 matches · ~1h40 on 4 courts       │
├──────────────────────────────────────────┤
│ ○ Round-robin                            │
│   Everyone plays everyone                │
│   ≈ 28 matches · ~3h20 on 4 courts  ⚠︎    │
├──────────────────────────────────────────┤
│ ○ Groups → knockout                      │
│   Group stage, then a knockout           │
│   ≈ 18 matches · ~2h10 on 4 courts       │
└──────────────────────────────────────────┘
```

The estimate is live off the current entrant count and court count, from
`matchCount()`, with no graph built. Duration is
`matches × bestOf-aware minutes ÷ courts` from one shared helper, deliberately
rough and labelled `~`. Above a threshold (default 3h) the row gets a warning
marker and a line naming the cheaper option: *"Long for one night — Groups →
knockout finishes in about 2h."*

This is the anti-confusion mechanism. An unplayable choice looks unplayable
**before** the host commits, rather than after.

Two sub-controls appear only for `groups_knockout`: group size (3/4/5, default
4) and how many advance (1/2, default 2). `group_count` is derived and shown as
plain text — *"5 groups of 4, top 2 advance → 10 in the knockout"* — rather than
asked for.

`startBlocker` in `src/tournament/draw.ts` becomes format-aware: minimums differ
(round-robin is fine with 3 entrants, knockout is not). It remains the single
rule the Start button and the server guard both read, as its comment requires.

### Rendering

`BracketView` stays exactly as it is, a tree renderer, and gains no format
knowledge. A new `TournamentView` picks by format:

| Format | Renders |
|---|---|
| `single_elim` | `BracketView` (unchanged path) |
| `double_elim` | `BracketView` twice, "Winners" / "Losers" headers |
| `round_robin` | `StandingsTable` plus fixture list |
| `groups_knockout` | `StandingsTable` per group, then `BracketView` once the gate fires |

`StandingsTable` is new: rank, name, W–L, game difference, one tap through to
the fixture. Knockout slots awaiting the gate show `"1st, Group B"`;
`src/lib/entrantLabel.ts` already renders this kind of placeholder for bracket
slots, so it extends rather than duplicates.

`app/(app)/tournaments/[id].tsx:218` calls `bracketStatus(bracket)` for the
champion; that becomes `FORMATS[format].status(bracket)`. Same shape, so the
champion card and `TournamentResultCard` need no change.

`app/join/tournament/[id]/spectator.tsx` swaps `BracketView` for
`TournamentView` — the same one-line change — and every format becomes
spectatable at no extra cost.

### What an upgrading user sees

Nothing changes. Existing tournaments are `single_elim`, render through the
unchanged path, and the picker defaults to Knockout with the same copy it has
today. The new formats are opt-in at creation only.

## Edge cases and error handling

### Determinism is load-bearing

Two phones can be offline in the same hall, both finish the last group match,
both run the gate, and both sync. Identical inputs must produce byte-identical
fills or the tournament forks. So `standings()` ends in a total order with no
ties possible:

wins → head-to-head → game difference → point difference → **entrant seed** →
**entrant id**

The last two never tie. They are not sporting tiebreaks and are not presented as
such: the UI shows genuinely level entrants as level and marks the split as
arbitrary. But the ordering is fixed, so every device agrees. A gate that can
return two answers is the one bug in this design that silently corrupts a live
event.

### Concurrent gate fills

The server validates that the target slot is currently null, so a second
device's update matches zero rows. That is **not an error** — it is what two
devices agreeing looks like. `finish_bracket_match` treats a fill whose target
already holds the same entrant as success, and raises only when the target holds
a *different* entrant, which means determinism has broken and the tournament
must stop rather than diverge silently.

### Start-time failures

These surface as they do today. `startBlocker` is the single rule, so the Start
button is disabled with the reason visible rather than failing at the server.

New server exceptions (`'Bracket routing references a match outside this
tournament'`, `'Slot already filled by a different entrant'`) indicate
structural-invariant violations — bugs or tampering, not user states — and are
surfaced verbatim.

## Testing

Written first, and pinned:

**`tests/tournament.singleElimRegression.test.ts`** — for every draw size
4/8/16/32/64 and entrant counts in between, the new `single_elim` generator's
output must equal today's `buildBracket` output on every field the old one set:
same ids given the same `gen`, same rounds, indices, bye resolution. Then
`advanceWinner` following edges must land in the same slot the old `idx/2` math
did, for every match in every size. If this passes, the refactor did not change
the shipped format.

| Test | Asserts |
|---|---|
| `tournament.formats.test.ts` | per format: `matchCount` equals `build().length`; every entrant appears the right number of times; no cycles; every edge target exists |
| `tournament.standings.test.ts` | tiebreak order; total order with no ties possible under adversarial equal records; win rate used when group sizes differ |
| `tournament.gate.test.ts` | gate is deterministic across repeated and shuffled input; fires only on complete groups; idempotent |
| `tournament.roundRobin.test.ts` | circle rotation covers all pairings exactly once; bye rotates fairly with odd entrants |
| `tournament.estimate.test.ts` | match counts against hand-computed values (6 entrants round-robin = 15; 8 entrants double elim = 14) |
| `schema.tournamentFormats.test.ts` | new columns absent from `TOURNAMENT_DDL`; one `ALTER` per statement; no `IF NOT EXISTS` on the SQLite side |
| `schema.0053.test.ts` | migration text: no foreign key on the routing columns; backfill bounded by `win_to_match_id is null`; `finish_bracket_match` contains no `idx / 2`; `start_tournament` retains the literal `v_draw - 1` check on its `single_elim` branch |

All pure-function testing in plain Jest, no native modules. Roughly 60 tests
added to the current 707.

### Manual verification before release

Run an 8-entrant round-robin and a 12-entrant groups → knockout to completion,
fully offline, in airplane mode on two phones. Reconnect. Both must show the
same standings and the same knockout draw.

## Open questions

None. Swiss, Americano and ladder are explicitly deferred to their own specs,
as recorded under Scope.
