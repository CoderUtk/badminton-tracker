# Tournament Formats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add round-robin, double elimination, and groups → knockout tournament formats to CourtSide without changing how existing single-elimination tournaments behave.

**Architecture:** Progression becomes data. Each `bracket_matches` row carries where its winner and loser go (`win_to_match_id` / `win_to_slot`, `loss_to_match_id` / `loss_to_slot`). Format generators are pure TypeScript functions that emit the entire match graph at start, routing edges included. The server stops deriving tree math and instead follows the graph, validating structural invariants only. Everything stays offline-capable because progression is a pure function both sides run over data already on the device.

**Tech Stack:** Expo SDK 54, React Native 0.81, TypeScript, expo-router, expo-sqlite (local cache), Supabase/Postgres (plpgsql RPCs), Jest + ts-jest.

**Spec:** `docs/superpowers/specs/2026-09-13-tournament-formats-design.md`

## Global Constraints

- **Read `AGENTS.md` first.** Expo has changed; consult the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing Expo code.
- **Commit rule:** explicit pathspec always. Never `git add -A`, `git add .`, or `git commit -a`.
- **Commit trailer:** end every commit message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Never commit secrets, credentials, or `.env` files.**
- **`android/` is gitignored prebuild output.** Never commit it.
- **No regression to single elimination.** Every live and historical tournament is `single_elim`. Task 2's regression test is the gate for this and must stay green in every later task.
- **SQLite has no `ADD COLUMN IF NOT EXISTS`** and no multi-column `ADD COLUMN`. `src/db/db.ts:120` splits each migration string on `;` and runs the pieces raw. One `ALTER` per statement.
- **Never fold a new column into an existing migration constant.** `src/db/schema.ts` warns why: editing an applied migration does not re-run it (`user_version` has moved past), so existing installs would never receive the column. Always append a new constant to `MIGRATIONS` in `db.ts`.
- **No column may appear in both `TOURNAMENT_DDL` and an `ALTER`.** SQLite's "duplicate column name" aborts the whole migration and fails the database open on fresh installs.
- **Format id values** are exactly `single_elim`, `double_elim`, `round_robin`, `groups_knockout`.
- **Slot values** are exactly `'a'` and `'b'`.
- **Tiebreak order**, used identically everywhere standings are computed: wins → head-to-head → game difference → point difference → entrant seed → entrant id. The last two never tie.
- **Run `npx tsc --noEmit` and `npm test` before every commit.** Current baseline: 96 suites, 707 tests passing.
- **After finishing all tasks**, run `graphify update .` to refresh the knowledge graph.

---

### Task 1: Data model — types, row mappers, client migration

Foundation only. No behaviour changes; every new field is optional and unset.

**Files:**
- Modify: `src/tournament/types.ts`
- Modify: `src/tournament/rows.ts`
- Modify: `src/db/schema.ts`
- Modify: `src/db/db.ts`
- Test: `tests/schema.tournamentFormats.test.ts` (create)
- Test: `tests/tournamentRows.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `Slot` (`"a" | "b"`), `FormatId`, the seven new `BracketMatch` fields (`winToMatchId`, `winToSlot`, `lossToMatchId`, `lossToSlot`, `groupIdx`, `srcA`, `srcB`), the matching seven `BracketRow` snake_case fields, and `TOURNAMENT_FORMATS_DDL`.

- [ ] **Step 1: Write the failing schema test**

Create `tests/schema.tournamentFormats.test.ts`:

```ts
import { TOURNAMENT_DDL, TOURNAMENT_ALTER_DDL, TOURNAMENT_FORMATS_DDL } from "../src/db/schema";

const statements = TOURNAMENT_FORMATS_DDL.split(";").map((s) => s.trim()).filter(Boolean);

const NEW_COLUMNS = [
  "win_to_match_id", "win_to_slot", "loss_to_match_id", "loss_to_slot",
  "group_idx", "src_a", "src_b", "group_count", "advance_per_group",
];

test("adds every column the format engine needs", () => {
  for (const col of NEW_COLUMNS) {
    expect(TOURNAMENT_FORMATS_DDL).toMatch(new RegExp(`ADD COLUMN ${col}\\b`));
  }
});

test("one ALTER per statement — SQLite has no multi-column ADD COLUMN", () => {
  expect(statements.length).toBe(NEW_COLUMNS.length);
  for (const s of statements) {
    expect(s).toMatch(/^ALTER TABLE \w+ ADD COLUMN \w+ (TEXT|INTEGER)$/);
  }
});

test("no IF NOT EXISTS — SQLite does not support it on ADD COLUMN", () => {
  expect(TOURNAMENT_FORMATS_DDL).not.toMatch(/IF NOT EXISTS/i);
});

// Adding a column that is already in the CREATE TABLE aborts the whole
// migration with "duplicate column name", which fails the database open on
// fresh installs only. Same rule schema.tournaments.test.ts guards for
// TOURNAMENT_ALTER_DDL.
test("no new column is already in the base DDL or an earlier ALTER", () => {
  for (const col of NEW_COLUMNS) {
    expect(TOURNAMENT_DDL).not.toMatch(new RegExp(`\\b${col}\\b`));
    expect(TOURNAMENT_ALTER_DDL).not.toMatch(new RegExp(`\\b${col}\\b`));
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/schema.tournamentFormats.test.ts`
Expected: FAIL — `TOURNAMENT_FORMATS_DDL` is not exported from `src/db/schema.ts`.

- [ ] **Step 3: Add the migration constant**

Append to `src/db/schema.ts`:

```ts
// Routing columns for the format engine: each bracket row records where its
// winner and loser go, so progression is data rather than tree math. Plus the
// group-stage columns.
//
// A SEPARATE migration entry appended to the list in db.ts — editing an applied
// migration does not re-run it, so existing installs would never get these.
//
// One ALTER per statement with no IF NOT EXISTS: SQLite supports neither
// multi-column ADD COLUMN nor IF NOT EXISTS on it, and db.ts splits this string
// on ';'. Every column here MUST be absent from TOURNAMENT_DDL and
// TOURNAMENT_ALTER_DDL above — "duplicate column name" aborts the whole
// migration. Guarded by tests/schema.tournamentFormats.test.ts.
export const TOURNAMENT_FORMATS_DDL = `
ALTER TABLE bracket_matches ADD COLUMN win_to_match_id TEXT;
ALTER TABLE bracket_matches ADD COLUMN win_to_slot TEXT;
ALTER TABLE bracket_matches ADD COLUMN loss_to_match_id TEXT;
ALTER TABLE bracket_matches ADD COLUMN loss_to_slot TEXT;
ALTER TABLE bracket_matches ADD COLUMN group_idx INTEGER;
ALTER TABLE bracket_matches ADD COLUMN src_a TEXT;
ALTER TABLE bracket_matches ADD COLUMN src_b TEXT;
ALTER TABLE tournaments ADD COLUMN group_count INTEGER;
ALTER TABLE tournaments ADD COLUMN advance_per_group INTEGER;
`;
```

- [ ] **Step 4: Append it to the migration list**

In `src/db/db.ts`, add `TOURNAMENT_FORMATS_DDL` to the import from `./schema` (line 4-5), then append it as the **last** entry of the `MIGRATIONS` array (after `PROFILE_ANALYTICS_CACHE_DDL`). Appending is mandatory — inserting it anywhere else renumbers every later migration and re-runs the wrong ones against installs that have already passed that `user_version`.

- [ ] **Step 5: Run the schema test to verify it passes**

Run: `npx jest tests/schema.tournamentFormats.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Write the failing row-mapper test**

Create `tests/tournamentRows.test.ts`:

```ts
import { rowToBracketMatch, bracketMatchToRow, type BracketRow } from "../src/tournament/rows";

const row: BracketRow = {
  id: "m1", tournament_id: "t1", round: 1, idx: 0, match_id: null,
  entrant_a: "e1", entrant_b: "e2", winner_entrant: null,
  court: "1", scored_by: null,
  win_to_match_id: "m9", win_to_slot: "a",
  loss_to_match_id: "m8", loss_to_slot: "b",
  group_idx: 2, src_a: "G1#1", src_b: "G2#2",
};

test("round-trips every routing field", () => {
  expect(bracketMatchToRow(rowToBracketMatch(row))).toEqual(row);
});

// Rows written before this migration have NULL in every new column, and older
// clients keep sending payloads without the keys at all.
test("a legacy row with no routing columns maps to nulls, not undefined", () => {
  const legacy = { ...row } as Record<string, unknown>;
  for (const k of ["win_to_match_id", "win_to_slot", "loss_to_match_id",
                   "loss_to_slot", "group_idx", "src_a", "src_b"]) delete legacy[k];
  const m = rowToBracketMatch(legacy as BracketRow);
  expect(m.winToMatchId).toBeNull();
  expect(m.winToSlot).toBeNull();
  expect(m.lossToMatchId).toBeNull();
  expect(m.groupIdx).toBeNull();
  expect(m.srcA).toBeNull();
  expect(bracketMatchToRow(m).win_to_match_id).toBeNull();
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx jest tests/tournamentRows.test.ts`
Expected: FAIL — `win_to_match_id` is not a known property of `BracketRow`.

- [ ] **Step 8: Extend the types**

In `src/tournament/types.ts`, add above `BracketMatch`:

```ts
export type Slot = "a" | "b";
export type FormatId = "single_elim" | "double_elim" | "round_robin" | "groups_knockout";
```

and add to the `BracketMatch` type:

```ts
  /** Where this match's winner goes. Null on a match that ends the tournament. */
  winToMatchId: string | null;
  winToSlot: Slot | null;
  /** Where this match's loser goes. Only double elimination sets these. */
  lossToMatchId: string | null;
  lossToSlot: Slot | null;
  /** Group stage only: which group this match belongs to. Null elsewhere. */
  groupIdx: number | null;
  /** Groups → knockout only: a standings source token like 'G2#1' for a slot
   *  the seeding gate will fill. Null elsewhere. */
  srcA: string | null;
  srcB: string | null;
```

- [ ] **Step 9: Extend the row mappers**

In `src/tournament/rows.ts`, add the seven snake_case fields to `BracketRow`:

```ts
  win_to_match_id: string | null; win_to_slot: string | null;
  loss_to_match_id: string | null; loss_to_slot: string | null;
  group_idx: number | null; src_a: string | null; src_b: string | null;
```

and map them in both directions, coalescing to null so a legacy row with the
keys absent maps to null rather than undefined:

```ts
export const rowToBracketMatch = (r: BracketRow): BracketMatch => ({
  id: r.id, tournamentId: r.tournament_id, round: r.round, index: r.idx,
  matchId: r.match_id, entrantA: r.entrant_a, entrantB: r.entrant_b,
  winnerEntrant: r.winner_entrant,
  court: r.court ?? null, scoredBy: r.scored_by ?? null,
  winToMatchId: r.win_to_match_id ?? null,
  winToSlot: (r.win_to_slot as Slot | null) ?? null,
  lossToMatchId: r.loss_to_match_id ?? null,
  lossToSlot: (r.loss_to_slot as Slot | null) ?? null,
  groupIdx: r.group_idx ?? null,
  srcA: r.src_a ?? null, srcB: r.src_b ?? null,
});
```

Mirror the same seven fields in `bracketMatchToRow`, each `?? null`. Import `Slot` alongside `BracketMatch`.

- [ ] **Step 10: Run both tests to verify they pass**

Run: `npx jest tests/tournamentRows.test.ts tests/schema.tournamentFormats.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 11: Verify nothing else broke**

Run: `npx tsc --noEmit && npm test`
Expected: types clean; 707 tests still pass. `changedRows` compares with `JSON.stringify` and picks up the new fields automatically.

Fix any call site that constructs a `BracketMatch` literal and now misses the seven fields — `src/tournament/bracket.ts` is the main one; set all seven to `null` there for now. Task 2 replaces that code.

- [ ] **Step 12: Commit**

```bash
git add src/tournament/types.ts src/tournament/rows.ts src/db/schema.ts src/db/db.ts \
        src/tournament/bracket.ts \
        tests/schema.tournamentFormats.test.ts tests/tournamentRows.test.ts
git commit -m "$(cat <<'EOF'
feat(tournaments): routing columns for the format engine

Each bracket row gains where its winner and loser go, plus the group-stage
columns. Nothing reads them yet. New client migration is appended to
MIGRATIONS, one bare ALTER per statement: SQLite supports neither
IF NOT EXISTS nor multi-column ADD COLUMN, and db.ts splits on ';'.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Format module interface and `single_elim` — the regression pin

This is the gate for the whole plan. Once green, it must never go red.

**Files:**
- Create: `src/tournament/formats/types.ts`
- Create: `src/tournament/formats/singleElim.ts`
- Create: `src/tournament/formats/index.ts`
- Test: `tests/tournament.singleElimRegression.test.ts` (create)

**Interfaces:**
- Consumes: `BracketMatch`, `Entrant`, `Slot`, `FormatId`, `BracketSize` from Task 1.
- Produces: `GenOpts`, `Standing`, `MatchScore`, `FormatModule`, `FORMATS`, and `singleElim.build`.

- [ ] **Step 1: Write the interface file**

Create `src/tournament/formats/types.ts`. Pure types plus shared option shapes, no logic:

```ts
import type { BracketMatch, Entrant, FormatId } from "../types";

export type GenOpts = {
  entrants: Entrant[];
  tournamentId: string;
  /** Id factory. Injected so tests can produce deterministic ids. */
  gen: () => string;
  /** groups_knockout only. */
  groupSize?: number;
  advancePerGroup?: number;
};

/** One finished match's score, keyed by BracketMatch.matchId. Absent when the
 *  match has no recorded score, which makes game and point difference
 *  unavailable and pushes standings onto the later tiebreaks. */
export type MatchScore = { gamesA: number; gamesB: number; pointsA: number; pointsB: number };

export type Standing = {
  entrantId: string;
  rank: number;         // 1-based, strictly increasing — never shared
  played: number;
  wins: number;
  losses: number;
  gameDiff: number;
  pointDiff: number;
  /** True when this entrant is level with a neighbour on every sporting
   *  tiebreak and the split came from seed or id. The UI marks these as level;
   *  the ORDER is still total so every device agrees. */
  tied: boolean;
};

export type FormatModule = {
  id: FormatId;
  /** Shown in the picker. */
  label: string;
  /** One plain line under the label. */
  blurb: string;
  /** Match count for N entrants, without building a graph. Powers the live estimate. */
  matchCount(entrants: number, o?: { groupSize?: number; advancePerGroup?: number }): number;
  /** Fewest entrants this format can run with. */
  minEntrants: number;
  /** The whole match graph, routing edges included. Pure. */
  build(o: GenOpts): BracketMatch[];
  standings(bracket: BracketMatch[], entrants: Entrant[], scores?: Map<string, MatchScore>): Standing[];
  status(bracket: BracketMatch[]): { status: "pending" | "live" | "done"; champion: string | null };
};
```

- [ ] **Step 2: Write the failing regression test**

Create `tests/tournament.singleElimRegression.test.ts`. It compares the new generator against the **current** `buildBracket`, which stays in `src/tournament/bracket.ts` untouched for exactly this purpose:

```ts
import { buildBracket, advanceWinner as legacyAdvance } from "../src/tournament/bracket";
import { singleElim } from "../src/tournament/formats/singleElim";
import type { BracketSize, Entrant } from "../src/tournament/types";

const entrantsOf = (n: number): Entrant[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `e${i + 1}`, clubPlayerId: `p${i + 1}`, name: `P${i + 1}`,
    seed: i + 1, partnerClubPlayerId: null,
  }));

// Same counter for both builders, so ids line up and a field-by-field
// comparison is meaningful.
const counter = () => { let n = 0; return () => `m${++n}`; };

const SIZES: BracketSize[] = [4, 8, 16, 32, 64];
const CASES: [number, BracketSize][] = [
  [3, 4], [4, 4], [5, 8], [8, 8], [9, 16], [16, 16], [17, 32], [32, 32], [33, 64], [64, 64],
];

describe.each(CASES)("single_elim with %i entrants in a %i draw", (n, size) => {
  const ents = entrantsOf(n);

  test("emits the same cells the legacy builder did", () => {
    const legacy = buildBracket(ents, size, "t1", counter());
    const next = singleElim.build({ entrants: ents, tournamentId: "t1", gen: counter() });
    expect(next.length).toBe(legacy.length);
    for (let i = 0; i < legacy.length; i++) {
      const { id, round, index, entrantA, entrantB, winnerEntrant, tournamentId } = next[i];
      expect({ id, round, index, entrantA, entrantB, winnerEntrant, tournamentId })
        .toEqual({
          id: legacy[i].id, round: legacy[i].round, index: legacy[i].index,
          entrantA: legacy[i].entrantA, entrantB: legacy[i].entrantB,
          winnerEntrant: legacy[i].winnerEntrant, tournamentId: legacy[i].tournamentId,
        });
    }
  });

  test("every edge points where idx/2 used to", () => {
    const next = singleElim.build({ entrants: ents, tournamentId: "t1", gen: counter() });
    const maxRound = Math.max(...next.map((m) => m.round));
    for (const m of next) {
      if (m.round === maxRound) {
        // A null win edge is what "this ends the tournament" means now.
        expect(m.winToMatchId).toBeNull();
        expect(m.winToSlot).toBeNull();
        continue;
      }
      const parent = next.find((p) => p.round === m.round + 1 && p.index === Math.floor(m.index / 2))!;
      expect(m.winToMatchId).toBe(parent.id);
      expect(m.winToSlot).toBe(m.index % 2 === 0 ? "a" : "b");
      // Single elimination never routes a loser.
      expect(m.lossToMatchId).toBeNull();
    }
  });

  test("matchCount agrees with the graph it builds", () => {
    expect(singleElim.matchCount(n)).toBe(size - 1);
  });
});

test("byes resolve exactly as they did — 5 entrants in an 8 draw", () => {
  const ents = entrantsOf(5);
  const legacy = buildBracket(ents, 8, "t1", counter());
  const next = singleElim.build({ entrants: ents, tournamentId: "t1", gen: counter() });
  const legacyByes = legacy.filter((m) => m.round === 1 && m.winnerEntrant).map((m) => m.winnerEntrant);
  const nextByes = next.filter((m) => m.round === 1 && m.winnerEntrant).map((m) => m.winnerEntrant);
  expect(nextByes).toEqual(legacyByes);
  expect(nextByes.length).toBe(3);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx jest tests/tournament.singleElimRegression.test.ts`
Expected: FAIL — cannot resolve `../src/tournament/formats/singleElim`.

- [ ] **Step 4: Implement `singleElim`**

Create `src/tournament/formats/singleElim.ts`. It **delegates to the existing tested `buildBracket`** and stamps edges on afterwards, which is what makes the regression test structurally certain to pass rather than coincidentally:

```ts
import { buildBracket } from "../bracket";
import { drawSizeFor } from "../draw";
import type { BracketMatch, Entrant } from "../types";
import type { FormatModule, GenOpts, MatchScore, Standing } from "./types";
import { recordStandings } from "./standings";

/** Stamp win edges onto a tree built by buildBracket. The parent of (round r,
 *  index i) is (r+1, floor(i/2)), and i's parity picks the slot — exactly the
 *  math finish_bracket_match used to do inline. The final has no parent, and
 *  its null edge is now what marks the end of the tournament. */
export function stampTreeEdges(bracket: BracketMatch[]): BracketMatch[] {
  const byKey = new Map(bracket.map((m) => [`${m.round}:${m.index}`, m]));
  return bracket.map((m) => {
    const parent = byKey.get(`${m.round + 1}:${Math.floor(m.index / 2)}`);
    return parent
      ? { ...m, winToMatchId: parent.id, winToSlot: (m.index % 2 === 0 ? "a" : "b") as const }
      : { ...m, winToMatchId: null, winToSlot: null };
  });
}

export const singleElim: FormatModule = {
  id: "single_elim",
  label: "Knockout",
  blurb: "Lose once, you're out",
  minEntrants: 3,
  matchCount: (entrants) => drawSizeFor(entrants) - 1,
  build: ({ entrants, tournamentId, gen }: GenOpts) =>
    stampTreeEdges(buildBracket(entrants, drawSizeFor(entrants.length), tournamentId, gen)),
  standings: (bracket, entrants, scores?: Map<string, MatchScore>): Standing[] =>
    recordStandings(bracket, entrants, scores),
  status: (bracket) => {
    if (bracket.length === 0) return { status: "pending", champion: null };
    const final = bracket.find((m) => m.winToMatchId === null)!;
    if (final.winnerEntrant) return { status: "done", champion: final.winnerEntrant };
    const anyPlayed = bracket.some((m) => m.matchId || (m.winnerEntrant && m.round === 1));
    return { status: anyPlayed ? "live" : "pending", champion: null };
  },
};
```

`recordStandings` does not exist yet — Task 4 writes it. For this task, create a temporary `src/tournament/formats/standings.ts` containing only:

```ts
import type { BracketMatch, Entrant } from "../types";
import type { MatchScore, Standing } from "./types";

// Replaced in full by Task 4.
export function recordStandings(
  _bracket: BracketMatch[], _entrants: Entrant[], _scores?: Map<string, MatchScore>,
): Standing[] {
  return [];
}
```

- [ ] **Step 5: Create the format registry**

Create `src/tournament/formats/index.ts`:

```ts
import type { FormatId } from "../types";
import type { FormatModule } from "./types";
import { singleElim } from "./singleElim";

/** The only lookup table. The picker renders Object.values(FORMATS); adding a
 *  format later is one file plus one entry here. Insertion order is the order
 *  the picker shows, so Knockout stays first and remains the default. */
export const FORMATS: Record<FormatId, FormatModule> = {
  single_elim: singleElim,
} as Record<FormatId, FormatModule>;

export const formatOrDefault = (id: string | null | undefined): FormatModule =>
  FORMATS[(id ?? "single_elim") as FormatId] ?? FORMATS.single_elim;

export * from "./types";
```

`formatOrDefault` is what every read path uses: a row with a `format` this build does not know about renders as knockout rather than crashing.

- [ ] **Step 6: Run the regression test to verify it passes**

Run: `npx jest tests/tournament.singleElimRegression.test.ts`
Expected: PASS, 31 tests.

- [ ] **Step 7: Run the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: clean; 707 + new tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/tournament/formats tests/tournament.singleElimRegression.test.ts
git commit -m "$(cat <<'EOF'
feat(tournaments): format module interface, single_elim behind it

singleElim delegates to the existing tested buildBracket and stamps win edges
on afterwards, so its output is identical to what ships today. The regression
test pins that: same cells, same byes, and every edge pointing where idx/2
used to. It is the gate for the three formats that follow.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Format-agnostic advance

Replaces the `idx/2` math in `advanceWinner` with edge following.

**Files:**
- Modify: `src/tournament/bracket.ts`
- Test: `tests/tournamentBracket.test.ts` (modify if it exists; otherwise create `tests/tournament.advance.test.ts`)

**Interfaces:**
- Consumes: `BracketMatch`, `Slot` (Task 1); `stampTreeEdges`, `singleElim` (Task 2).
- Produces: `advanceWinner(bracket, bracketMatchId, winnerEntrant): BracketMatch[]` — same signature as today, now edge-driven. `route(bracket, targetId, slot, entrantId): void`.

- [ ] **Step 1: Write the failing test**

Create `tests/tournament.advance.test.ts`:

```ts
import { advanceWinner } from "../src/tournament/bracket";
import { singleElim } from "../src/tournament/formats/singleElim";
import type { BracketMatch, Entrant } from "../src/tournament/types";

const ents: Entrant[] = Array.from({ length: 4 }, (_, i) => ({
  id: `e${i + 1}`, clubPlayerId: `p${i + 1}`, name: `P${i + 1}`,
  seed: i + 1, partnerClubPlayerId: null,
}));
const build = () => {
  let n = 0;
  return singleElim.build({ entrants: ents, tournamentId: "t1", gen: () => `m${++n}` });
};

test("the winner lands in the slot the edge names", () => {
  const b = build();
  const first = b.find((m) => m.round === 1 && m.index === 0)!;
  const after = advanceWinner(b, first.id, first.entrantA!);
  const parent = after.find((m) => m.id === first.winToMatchId)!;
  expect(parent.entrantA).toBe(first.entrantA);
  expect(after.find((m) => m.id === first.id)!.winnerEntrant).toBe(first.entrantA);
});

test("index 1 fills slot b, not slot a", () => {
  const b = build();
  const second = b.find((m) => m.round === 1 && m.index === 1)!;
  const after = advanceWinner(b, second.id, second.entrantB!);
  expect(after.find((m) => m.id === second.winToMatchId)!.entrantB).toBe(second.entrantB);
});

test("a loss edge routes the loser", () => {
  const b = build();
  const first = b.find((m) => m.round === 1 && m.index === 0)!;
  // Hand-attach a loss edge; double elimination emits these for real in Task 6.
  const consolation: BracketMatch = {
    ...first, id: "cons", round: 1, index: 99,
    entrantA: null, entrantB: null, winnerEntrant: null,
    winToMatchId: null, winToSlot: null, lossToMatchId: null, lossToSlot: null,
  };
  const withLoss = [...b.map((m) =>
    m.id === first.id ? { ...m, lossToMatchId: "cons", lossToSlot: "a" as const } : m), consolation];
  const after = advanceWinner(withLoss, first.id, first.entrantA!);
  expect(after.find((m) => m.id === "cons")!.entrantA).toBe(first.entrantB);
});

test("a null edge advances nobody and mutates nothing else", () => {
  const b = build();
  const final = b.find((m) => m.winToMatchId === null)!;
  const seeded = b.map((m) => m.id === final.id ? { ...m, entrantA: "e1", entrantB: "e2" } : m);
  const after = advanceWinner(seeded, final.id, "e1");
  expect(after.find((m) => m.id === final.id)!.winnerEntrant).toBe("e1");
  expect(after.filter((m) => m.winnerEntrant).length).toBe(
    seeded.filter((m) => m.winnerEntrant).length + 1);
});

test("does not mutate the input array", () => {
  const b = build();
  const first = b.find((m) => m.round === 1 && m.index === 0)!;
  const snapshot = JSON.stringify(b);
  advanceWinner(b, first.id, first.entrantA!);
  expect(JSON.stringify(b)).toBe(snapshot);
});

test("an unknown match id is a no-op", () => {
  const b = build();
  expect(advanceWinner(b, "nope", "e1")).toBe(b);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/tournament.advance.test.ts`
Expected: FAIL on "a loss edge routes the loser" — the current `advanceWinner` ignores loss edges entirely.

- [ ] **Step 3: Rewrite `advanceWinner`**

In `src/tournament/bracket.ts`, replace `advanceWinner` (keep `buildBracket` and `seedOrder` exactly as they are — the regression test in Task 2 compares against them):

```ts
import type { BracketMatch, Slot } from "./types";

function route(bracket: BracketMatch[], targetId: string | null, slot: Slot | null, entrantId: string | null): void {
  if (!targetId || !slot || !entrantId) return;
  const target = bracket.find((m) => m.id === targetId);
  if (!target) return;
  if (slot === "a") target.entrantA = entrantId;
  else target.entrantB = entrantId;
}

/**
 * Record a winner and route both entrants along this match's edges.
 *
 * Formerly computed the parent as (round + 1, floor(index / 2)). That math only
 * described single elimination; now the row says where its winner and loser go,
 * so one function serves every format and the server follows the same graph
 * instead of re-deriving it.
 */
export function advanceWinner(
  bracket: BracketMatch[], bracketMatchId: string, winnerEntrant: string,
): BracketMatch[] {
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

Leave `bracketStatus` in place for now; Task 12 removes its last caller.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/tournament.advance.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Run the regression pin and the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: clean; Task 2's regression test still passes, proving the new advance lands where `idx/2` did.

- [ ] **Step 6: Commit**

```bash
git add src/tournament/bracket.ts tests/tournament.advance.test.ts
git commit -m "$(cat <<'EOF'
feat(tournaments): advance by following edges, not tree math

advanceWinner reads win_to/loss_to off the row instead of computing
(round+1, idx/2). One function now serves every format, and the server will
follow the same graph rather than re-deriving it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Standings with a total order

The gate's correctness rests entirely on this. Ties must be impossible.

**Files:**
- Modify: `src/tournament/formats/standings.ts` (replace the Task 2 stub)
- Test: `tests/tournament.standings.test.ts` (create)

**Interfaces:**
- Consumes: `BracketMatch`, `Entrant`, `MatchScore`, `Standing`.
- Produces: `recordStandings(bracket, entrants, scores?): Standing[]` — ranks 1..n, strictly increasing, never shared.

- [ ] **Step 1: Write the failing test**

Create `tests/tournament.standings.test.ts`:

```ts
import { recordStandings } from "../src/tournament/formats/standings";
import type { BracketMatch, Entrant } from "../src/tournament/types";
import type { MatchScore } from "../src/tournament/formats/types";

const ents = (n: number): Entrant[] => Array.from({ length: n }, (_, i) => ({
  id: `e${i + 1}`, clubPlayerId: `p${i + 1}`, name: `P${i + 1}`,
  seed: i + 1, partnerClubPlayerId: null,
}));

const played = (id: string, a: string, b: string, winner: string, matchId = id): BracketMatch => ({
  id, tournamentId: "t1", round: 1, index: 0, matchId,
  entrantA: a, entrantB: b, winnerEntrant: winner,
  court: null, scoredBy: null,
  winToMatchId: null, winToSlot: null, lossToMatchId: null, lossToSlot: null,
  groupIdx: null, srcA: null, srcB: null,
});

test("ranks by wins", () => {
  const s = recordStandings(
    [played("m1", "e1", "e2", "e1"), played("m2", "e1", "e3", "e1"), played("m3", "e2", "e3", "e2")],
    ents(3));
  expect(s.map((x) => x.entrantId)).toEqual(["e1", "e2", "e3"]);
  expect(s.map((x) => x.rank)).toEqual([1, 2, 3]);
  expect(s[0]).toMatchObject({ wins: 2, losses: 0, played: 2 });
});

test("head-to-head breaks a tie on wins", () => {
  // e1 and e2 both 1-1; e2 beat e1, so e2 is ahead.
  const s = recordStandings(
    [played("m1", "e2", "e1", "e2"), played("m2", "e1", "e3", "e1"), played("m3", "e2", "e3", "e3")],
    ents(3));
  expect(s.slice(0, 2).map((x) => x.entrantId)).toEqual(["e2", "e1"]);
});

test("game difference breaks a tie when head-to-head does not", () => {
  const scores = new Map<string, MatchScore>([
    ["m1", { gamesA: 2, gamesB: 0, pointsA: 42, pointsB: 20 }],
    ["m2", { gamesA: 2, gamesB: 1, pointsA: 55, pointsB: 48 }],
  ]);
  // e1 and e2 never met; both 1-0. e1 won 2-0, e2 won 2-1.
  const s = recordStandings([played("m1", "e1", "e3", "e1"), played("m2", "e2", "e4", "e2")],
    ents(4), scores);
  expect(s.slice(0, 2).map((x) => x.entrantId)).toEqual(["e1", "e2"]);
  expect(s[0].gameDiff).toBe(2);
});

// Two devices offline must produce byte-identical standings or a
// groups → knockout draw forks. No tie may survive to the caller.
test("a total order survives entrants who are level on everything", () => {
  const s = recordStandings([], ents(4));
  expect(s.map((x) => x.rank)).toEqual([1, 2, 3, 4]);
  expect(new Set(s.map((x) => x.rank)).size).toBe(4);
  expect(s.map((x) => x.entrantId)).toEqual(["e1", "e2", "e3", "e4"]); // seed order
  expect(s.every((x) => x.tied)).toBe(true);
});

test("seed order is used before id, and id only when seeds collide", () => {
  const same = ents(2).map((e) => ({ ...e, seed: 7 }));
  const s = recordStandings([], same);
  expect(s.map((x) => x.entrantId)).toEqual(["e1", "e2"]); // id ascending
});

test("the same input in any order gives the same output", () => {
  const ms = [played("m1", "e1", "e2", "e1"), played("m2", "e3", "e4", "e3"),
              played("m3", "e1", "e3", "e3")];
  const a = recordStandings(ms, ents(4));
  const b = recordStandings([...ms].reverse(), ents(4));
  expect(a).toEqual(b);
});

test("unplayed matches are ignored", () => {
  const pending = { ...played("m9", "e1", "e2", "e1"), winnerEntrant: null, matchId: null };
  const s = recordStandings([pending], ents(2));
  expect(s.every((x) => x.played === 0)).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/tournament.standings.test.ts`
Expected: FAIL — the stub returns `[]`.

- [ ] **Step 3: Implement `recordStandings`**

Replace `src/tournament/formats/standings.ts` entirely:

```ts
import type { BracketMatch, Entrant } from "../types";
import type { MatchScore, Standing } from "./types";

type Acc = {
  entrantId: string; seed: number;
  played: number; wins: number; losses: number;
  gameDiff: number; pointDiff: number;
};

/**
 * Rank entrants from finished matches.
 *
 * The comparator MUST be a total order. Two phones can be offline in the same
 * hall, both finish the last group match, both run the seeding gate, and both
 * sync. Identical inputs have to produce byte-identical fills or the knockout
 * draw forks. Seed and id are the final two keys: they are not sporting
 * tiebreaks and the UI marks entrants split by them as level, but they
 * guarantee no tie reaches the caller.
 *
 * `scores` is optional because BracketMatch carries only the winner — game and
 * point difference live in the matches table. Without it, those two keys are
 * zero for everyone and the order falls through to seed.
 */
export function recordStandings(
  bracket: BracketMatch[], entrants: Entrant[], scores?: Map<string, MatchScore>,
): Standing[] {
  const acc = new Map<string, Acc>(entrants.map((e) => [e.id, {
    entrantId: e.id, seed: e.seed, played: 0, wins: 0, losses: 0, gameDiff: 0, pointDiff: 0,
  }]));
  // entrantId -> set of entrants it has beaten, for head-to-head.
  const beat = new Map<string, Set<string>>(entrants.map((e) => [e.id, new Set()]));

  for (const m of bracket) {
    if (!m.winnerEntrant || !m.entrantA || !m.entrantB) continue;
    const a = acc.get(m.entrantA);
    const b = acc.get(m.entrantB);
    if (!a || !b) continue;
    const loserId = m.winnerEntrant === m.entrantA ? m.entrantB : m.entrantA;
    a.played++; b.played++;
    acc.get(m.winnerEntrant)!.wins++;
    acc.get(loserId)!.losses++;
    beat.get(m.winnerEntrant)!.add(loserId);

    const sc = m.matchId ? scores?.get(m.matchId) : undefined;
    if (sc) {
      a.gameDiff += sc.gamesA - sc.gamesB;
      b.gameDiff += sc.gamesB - sc.gamesA;
      a.pointDiff += sc.pointsA - sc.pointsB;
      b.pointDiff += sc.pointsB - sc.pointsA;
    }
  }

  // Win RATE, not win count: groups differ in size by up to one, and counting
  // raw wins would penalise the entrant with the longer schedule.
  const rate = (x: Acc) => (x.played === 0 ? 0 : x.wins / x.played);

  const rows = [...acc.values()].sort((x, y) => {
    if (rate(y) !== rate(x)) return rate(y) - rate(x);
    const xBeatY = beat.get(x.entrantId)!.has(y.entrantId);
    const yBeatX = beat.get(y.entrantId)!.has(x.entrantId);
    if (xBeatY !== yBeatX) return xBeatY ? -1 : 1;
    if (y.gameDiff !== x.gameDiff) return y.gameDiff - x.gameDiff;
    if (y.pointDiff !== x.pointDiff) return y.pointDiff - x.pointDiff;
    if (x.seed !== y.seed) return x.seed - y.seed;
    return x.entrantId < y.entrantId ? -1 : 1;
  });

  const sporting = (x: Acc) => `${rate(x)}|${x.gameDiff}|${x.pointDiff}`;
  return rows.map((x, i) => ({
    entrantId: x.entrantId, rank: i + 1,
    played: x.played, wins: x.wins, losses: x.losses,
    gameDiff: x.gameDiff, pointDiff: x.pointDiff,
    tied:
      (i > 0 && sporting(rows[i - 1]) === sporting(x)) ||
      (i < rows.length - 1 && sporting(rows[i + 1]) === sporting(x)),
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/tournament.standings.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: clean, all pass.

- [ ] **Step 6: Commit**

```bash
git add src/tournament/formats/standings.ts tests/tournament.standings.test.ts
git commit -m "$(cat <<'EOF'
feat(tournaments): standings with a guaranteed total order

Wins (as a rate, so uneven groups are fair) then head-to-head, game diff,
point diff, seed, id. The last two never tie, which is what lets two offline
devices compute the same knockout draw from the same results.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Round-robin

**Files:**
- Create: `src/tournament/formats/roundRobin.ts`
- Modify: `src/tournament/formats/index.ts`
- Test: `tests/tournament.roundRobin.test.ts` (create)

**Interfaces:**
- Consumes: `FormatModule`, `GenOpts`, `recordStandings`.
- Produces: `roundRobin`, and `circleRounds(ids: string[]): [string, string][][]` exported for testing.

- [ ] **Step 1: Write the failing test**

Create `tests/tournament.roundRobin.test.ts`:

```ts
import { roundRobin, circleRounds } from "../src/tournament/formats/roundRobin";
import type { Entrant } from "../src/tournament/types";

const ents = (n: number): Entrant[] => Array.from({ length: n }, (_, i) => ({
  id: `e${i + 1}`, clubPlayerId: `p${i + 1}`, name: `P${i + 1}`,
  seed: i + 1, partnerClubPlayerId: null,
}));
const build = (n: number) => {
  let k = 0;
  return roundRobin.build({ entrants: ents(n), tournamentId: "t1", gen: () => `m${++k}` });
};

test.each([[3, 3], [4, 6], [5, 10], [6, 15], [8, 28]])(
  "%i entrants produce %i matches", (n, expected) => {
    expect(build(n).length).toBe(expected);
    expect(roundRobin.matchCount(n)).toBe(expected);
  });

test("every pairing appears exactly once", () => {
  const b = build(6);
  const seen = b.map((m) => [m.entrantA, m.entrantB].sort().join("~"));
  expect(new Set(seen).size).toBe(seen.length);
  expect(seen.length).toBe(15);
});

test("no match routes anywhere — standings decide, not edges", () => {
  for (const m of build(6)) {
    expect(m.winToMatchId).toBeNull();
    expect(m.lossToMatchId).toBeNull();
    expect(m.srcA).toBeNull();
  }
});

test("nobody plays twice in the same round", () => {
  const b = build(8);
  const rounds = new Map<number, string[]>();
  for (const m of b) {
    const list = rounds.get(m.round) ?? [];
    list.push(m.entrantA!, m.entrantB!);
    rounds.set(m.round, list);
  }
  for (const [, ids] of rounds) expect(new Set(ids).size).toBe(ids.length);
});

test("with odd entrants the bye rotates and no bye match is created", () => {
  const b = build(5);
  expect(b.every((m) => m.entrantA && m.entrantB)).toBe(true);
  const sits = new Map<string, number>();
  const rounds = new Set(b.map((m) => m.round));
  for (const r of rounds) {
    const playing = new Set(b.filter((m) => m.round === r).flatMap((m) => [m.entrantA!, m.entrantB!]));
    for (const e of ents(5)) if (!playing.has(e.id)) sits.set(e.id, (sits.get(e.id) ?? 0) + 1);
  }
  expect([...sits.values()]).toEqual([1, 1, 1, 1, 1]);
});

test("circleRounds covers all pairings for an even count", () => {
  const rounds = circleRounds(["a", "b", "c", "d"]);
  expect(rounds.length).toBe(3);
  expect(rounds.flat().length).toBe(6);
});

test("status is done only when every match has a winner", () => {
  const b = build(3);
  expect(roundRobin.status(b).status).toBe("pending");
  const all = b.map((m) => ({ ...m, winnerEntrant: m.entrantA }));
  const done = roundRobin.status(all);
  expect(done.status).toBe("done");
  expect(done.champion).toBe("e1");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/tournament.roundRobin.test.ts`
Expected: FAIL — cannot resolve `roundRobin`.

- [ ] **Step 3: Implement `roundRobin`**

Create `src/tournament/formats/roundRobin.ts`:

```ts
import type { BracketMatch } from "../types";
import type { FormatModule, GenOpts, MatchScore, Standing } from "./types";
import { recordStandings } from "./standings";

const BYE = "__bye__";

/**
 * Circle method. Fix the first entrant, rotate the rest; each rotation is one
 * scheduling round in which nobody appears twice. An odd count gets a sentinel
 * whose pairing is dropped, so the bye rotates fairly and no bye match is ever
 * created as a row.
 */
export function circleRounds(ids: string[]): [string, string][][] {
  const list = ids.length % 2 === 0 ? [...ids] : [...ids, BYE];
  const n = list.length;
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a !== BYE && b !== BYE) pairs.push([a, b]);
    }
    rounds.push(pairs);
    // Rotate everything except the first slot.
    list.splice(1, 0, list.pop()!);
  }
  return rounds;
}

export const roundRobin: FormatModule = {
  id: "round_robin",
  label: "Round-robin",
  blurb: "Everyone plays everyone",
  minEntrants: 3,
  matchCount: (entrants) => (entrants * (entrants - 1)) / 2,
  build: ({ entrants, tournamentId, gen }: GenOpts): BracketMatch[] => {
    const out: BracketMatch[] = [];
    circleRounds(entrants.map((e) => e.id)).forEach((pairs, r) => {
      pairs.forEach(([a, b], i) => {
        out.push({
          id: gen(), tournamentId, round: r + 1, index: i, matchId: null,
          entrantA: a, entrantB: b, winnerEntrant: null,
          court: null, scoredBy: null,
          // No edges: nothing advances, standings decide the winner.
          winToMatchId: null, winToSlot: null, lossToMatchId: null, lossToSlot: null,
          groupIdx: null, srcA: null, srcB: null,
        });
      });
    });
    return out;
  },
  standings: (bracket, entrants, scores?: Map<string, MatchScore>): Standing[] =>
    recordStandings(bracket, entrants, scores),
  status: (bracket) => {
    if (bracket.length === 0) return { status: "pending", champion: null };
    const done = bracket.every((m) => m.winnerEntrant);
    if (!done) {
      return { status: bracket.some((m) => m.winnerEntrant || m.matchId) ? "live" : "pending", champion: null };
    }
    const entrantIds = [...new Set(bracket.flatMap((m) => [m.entrantA, m.entrantB]))]
      .filter((x): x is string => !!x);
    const table = recordStandings(bracket, entrantIds.map((id, i) => ({
      id, clubPlayerId: "", name: "", seed: i + 1, partnerClubPlayerId: null,
    })));
    return { status: "done", champion: table[0]?.entrantId ?? null };
  },
};
```

Note: `status` reconstructs minimal entrants from the bracket because it takes no entrant list, matching `FormatModule`. Seeds are positional there, which only affects the champion when every sporting key ties — and Task 12 passes real entrants to `standings()` for anything the user sees.

- [ ] **Step 4: Register it**

In `src/tournament/formats/index.ts`, import `roundRobin` and add `round_robin: roundRobin` to `FORMATS`, after `single_elim`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest tests/tournament.roundRobin.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 6: Run the full suite, then commit**

Run: `npx tsc --noEmit && npm test`

```bash
git add src/tournament/formats/roundRobin.ts src/tournament/formats/index.ts \
        tests/tournament.roundRobin.test.ts
git commit -m "$(cat <<'EOF'
feat(tournaments): round-robin format

Circle-method scheduling so nobody plays twice in a round, with a rotating
bye for odd counts and no bye rows. No routing edges — standings decide.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Double elimination

**Files:**
- Create: `src/tournament/formats/doubleElim.ts`
- Modify: `src/tournament/formats/index.ts`
- Test: `tests/tournament.doubleElim.test.ts` (create)

**Interfaces:**
- Consumes: `buildBracket` (`src/tournament/bracket.ts`), `drawSizeFor` (`src/tournament/draw.ts`), `FormatModule`, `GenOpts`, `recordStandings`, `Slot`.
- Produces: `doubleElim`. Winners-bracket rows keep `groupIdx === null`; losers-bracket rows are identified by `round > winnersMaxRound`.

- [ ] **Step 1: Write the failing test**

Create `tests/tournament.doubleElim.test.ts`:

```ts
import { doubleElim } from "../src/tournament/formats/doubleElim";
import { advanceWinner } from "../src/tournament/bracket";
import type { Entrant } from "../src/tournament/types";

const ents = (n: number): Entrant[] => Array.from({ length: n }, (_, i) => ({
  id: `e${i + 1}`, clubPlayerId: `p${i + 1}`, name: `P${i + 1}`,
  seed: i + 1, partnerClubPlayerId: null,
}));
const build = (n: number) => {
  let k = 0;
  return doubleElim.build({ entrants: ents(n), tournamentId: "t1", gen: () => `m${++k}` });
};

test.each([[4, 6], [8, 14], [16, 30]])(
  "%i entrants produce %i matches", (n, expected) => {
    expect(build(n).length).toBe(expected);
    expect(doubleElim.matchCount(n)).toBe(expected);
  });

test("exactly one match ends the tournament", () => {
  const b = build(8);
  expect(b.filter((m) => m.winToMatchId === null).length).toBe(1);
});

test("every winners match routes its loser somewhere", () => {
  const b = build(8);
  const grandFinal = b.find((m) => m.winToMatchId === null)!;
  const winners = b.filter((m) => m.lossToMatchId !== null);
  // Every winners-bracket match except the grand final sheds a loser.
  expect(winners.length).toBeGreaterThan(0);
  for (const m of winners) {
    expect(b.some((x) => x.id === m.lossToMatchId)).toBe(true);
    expect(m.id).not.toBe(grandFinal.id);
  }
});

test("every edge target exists and no match points at itself", () => {
  const b = build(16);
  const ids = new Set(b.map((m) => m.id));
  for (const m of b) {
    for (const t of [m.winToMatchId, m.lossToMatchId]) {
      if (t) { expect(ids.has(t)).toBe(true); expect(t).not.toBe(m.id); }
    }
  }
});

test("the graph is acyclic", () => {
  const b = build(8);
  const by = new Map(b.map((m) => [m.id, m]));
  for (const start of b) {
    const seen = new Set<string>();
    let cur: string | null = start.id;
    while (cur) {
      expect(seen.has(cur)).toBe(false);
      seen.add(cur);
      cur = by.get(cur)?.winToMatchId ?? null;
    }
  }
});

test("a first-round loser reappears in the losers bracket", () => {
  const b = build(4);
  const first = b.find((m) => m.round === 1 && m.index === 0)!;
  const after = advanceWinner(b, first.id, first.entrantA!);
  const target = after.find((m) => m.id === first.lossToMatchId)!;
  expect([target.entrantA, target.entrantB]).toContain(first.entrantB);
});

// Deliberate: the losers-bracket winner beating the winners-bracket winner in
// the grand final ends it. No reset match. See the spec.
test("there is no bracket reset after the grand final", () => {
  const b = build(8);
  const grandFinal = b.find((m) => m.winToMatchId === null)!;
  expect(b.filter((m) => m.winToMatchId === grandFinal.id).length).toBe(2);
  expect(doubleElim.blurb).toMatch(/two lives/i);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/tournament.doubleElim.test.ts`
Expected: FAIL — cannot resolve `doubleElim`.

- [ ] **Step 3: Implement `doubleElim`**

Create `src/tournament/formats/doubleElim.ts`:

```ts
import { buildBracket } from "../bracket";
import { drawSizeFor } from "../draw";
import type { BracketMatch, Slot } from "../types";
import type { FormatModule, GenOpts, MatchScore, Standing } from "./types";
import { recordStandings } from "./standings";

/**
 * Winners bracket exactly as single elimination, plus a losers bracket fed by
 * every winners match's loss edge, plus a grand final.
 *
 * Losers-bracket rounds are numbered above the winners bracket so `round`
 * stays a single ascending axis the tree renderer can group by. A losers round
 * alternates: "minor" rounds absorb fresh losers from the winners bracket,
 * "major" rounds play the survivors off against each other.
 *
 * No bracket reset: if the losers-bracket winner beats the winners-bracket
 * winner in the grand final, they win. The reset doubles the explaining for a
 * minority of finals and a club night cannot absorb an unscheduled match.
 */
export const doubleElim: FormatModule = {
  id: "double_elim",
  label: "Double elimination",
  blurb: "Two lives — one loss isn't the end",
  minEntrants: 4,
  // A double-elimination draw of size S plays (S-1) winners matches, (S-2)
  // losers matches, and 1 grand final.
  matchCount: (entrants) => 2 * drawSizeFor(entrants) - 2,
  build: ({ entrants, tournamentId, gen }: GenOpts): BracketMatch[] => {
    const size = drawSizeFor(entrants.length);
    const winners = buildBracket(entrants, size, tournamentId, gen);
    const wMaxRound = Math.max(...winners.map((m) => m.round));

    const blank = (round: number, index: number): BracketMatch => ({
      id: gen(), tournamentId, round, index, matchId: null,
      entrantA: null, entrantB: null, winnerEntrant: null,
      court: null, scoredBy: null,
      winToMatchId: null, winToSlot: null, lossToMatchId: null, lossToSlot: null,
      groupIdx: null, srcA: null, srcB: null,
    });

    // Losers rounds: for a size-S draw there are 2*(log2(S)-1) of them,
    // alternating minor (absorb) and major (play off). Widths halve each pair.
    const losers: BracketMatch[][] = [];
    let width = size / 4;
    let round = wMaxRound + 1;
    while (width >= 1) {
      losers.push(Array.from({ length: width }, (_, i) => blank(round, i)));       // minor
      round++;
      losers.push(Array.from({ length: width }, (_, i) => blank(round, i)));       // major
      round++;
      width = width / 2;
    }
    const grandFinal = blank(round, 0);

    const all = [...winners, ...losers.flat(), grandFinal];
    const byId = new Map(all.map((m) => [m.id, m]));
    const set = (m: BracketMatch, k: "win" | "loss", target: BracketMatch | null, slot: Slot) => {
      const row = byId.get(m.id)!;
      if (k === "win") { row.winToMatchId = target?.id ?? null; row.winToSlot = target ? slot : null; }
      else { row.lossToMatchId = target?.id ?? null; row.lossToSlot = target ? slot : null; }
    };

    // Winners bracket: winners advance up the tree; final winner goes to the
    // grand final's slot a.
    for (const m of winners) {
      const parent = winners.find((p) => p.round === m.round + 1 && p.index === Math.floor(m.index / 2));
      if (parent) set(m, "win", parent, m.index % 2 === 0 ? "a" : "b");
      else set(m, "win", grandFinal, "a");
    }

    // Winners-bracket losers drop in. Round 1 losers pair off into the first
    // minor round; each later winners round feeds the minor round that follows
    // its own depth.
    for (const m of winners) {
      if (m.round === 1) {
        const target = losers[0][Math.floor(m.index / 2)];
        set(m, "loss", target, m.index % 2 === 0 ? "a" : "b");
      } else {
        const minorIdx = (m.round - 1) * 2 - 1;
        const target = losers[minorIdx]?.[m.index];
        if (target) set(m, "loss", target, "b");
      }
    }

    // Inside the losers bracket: minor round winners go to the major round at
    // the same index (slot a); major round winners go to the next minor round,
    // halving the index.
    losers.forEach((rows, r) => {
      const next = losers[r + 1];
      for (const m of rows) {
        if (!next) { set(m, "win", grandFinal, "b"); continue; }
        const isMinor = r % 2 === 0;
        const target = isMinor ? next[m.index] : next[Math.floor(m.index / 2)];
        set(m, "win", target, isMinor ? "a" : (m.index % 2 === 0 ? "a" : "b"));
      }
    });

    return all;
  },
  standings: (bracket, entrants, scores?: Map<string, MatchScore>): Standing[] =>
    recordStandings(bracket, entrants, scores),
  status: (bracket) => {
    if (bracket.length === 0) return { status: "pending", champion: null };
    const final = bracket.find((m) => m.winToMatchId === null)!;
    if (final.winnerEntrant) return { status: "done", champion: final.winnerEntrant };
    const anyPlayed = bracket.some((m) => m.matchId || (m.winnerEntrant && m.round === 1));
    return { status: anyPlayed ? "live" : "pending", champion: null };
  },
};
```

If the losers-bracket wiring does not satisfy the acyclicity and edge-target tests on the first run, fix the index math rather than relaxing the tests — those two tests are what the server's structural validation will also enforce in Task 9.

- [ ] **Step 4: Register it**

In `src/tournament/formats/index.ts`, import `doubleElim` and add `double_elim: doubleElim` to `FORMATS`, between `single_elim` and `round_robin`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest tests/tournament.doubleElim.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 6: Run the full suite, then commit**

Run: `npx tsc --noEmit && npm test`

```bash
git add src/tournament/formats/doubleElim.ts src/tournament/formats/index.ts \
        tests/tournament.doubleElim.test.ts
git commit -m "$(cat <<'EOF'
feat(tournaments): double elimination

Winners bracket as single elim plus a losers bracket fed by loss edges, and
one grand final. No bracket reset — the losers-bracket winner taking the
grand final ends it, which a club night can actually schedule.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Groups → knockout, and the seeding gate

The one place edges are insufficient: a knockout slot is fed by a standings
outcome, not one match's winner.

**Files:**
- Create: `src/tournament/formats/groupsKnockout.ts`
- Create: `src/tournament/formats/gate.ts`
- Modify: `src/tournament/formats/index.ts`
- Test: `tests/tournament.groupsKnockout.test.ts` (create)
- Test: `tests/tournament.gate.test.ts` (create)

**Interfaces:**
- Consumes: `circleRounds` (Task 5), `recordStandings` (Task 4), `FormatModule`, `GenOpts`.
- Produces: `groupsKnockout`; `assignGroups(entrants, groupSize): Entrant[][]`; `SlotFill = { matchId: string; slot: Slot; entrantId: string }`; `settleGroups(bracket, entrants, scores?): SlotFill[]`; `srcToken(group, rank): string`; `parseSrc(token): { group: number; rank: number } | null`.

- [ ] **Step 1: Write the failing generator test**

Create `tests/tournament.groupsKnockout.test.ts`:

```ts
import { groupsKnockout } from "../src/tournament/formats/groupsKnockout";
import { parseSrc } from "../src/tournament/formats/gate";
import type { Entrant } from "../src/tournament/types";

const ents = (n: number): Entrant[] => Array.from({ length: n }, (_, i) => ({
  id: `e${i + 1}`, clubPlayerId: `p${i + 1}`, name: `P${i + 1}`,
  seed: i + 1, partnerClubPlayerId: null,
}));
const build = (n: number, groupSize = 4, advancePerGroup = 2) => {
  let k = 0;
  return groupsKnockout.build({
    entrants: ents(n), tournamentId: "t1", gen: () => `m${++k}`, groupSize, advancePerGroup,
  });
};

test("12 entrants in groups of 4 make 3 groups", () => {
  const b = build(12);
  const groups = new Set(b.filter((m) => m.groupIdx !== null).map((m) => m.groupIdx));
  expect(groups.size).toBe(3);
});

test("group sizes differ by at most one when the count does not divide", () => {
  const b = build(13);
  const counts = new Map<number, Set<string>>();
  for (const m of b) {
    if (m.groupIdx === null) continue;
    const s = counts.get(m.groupIdx) ?? new Set<string>();
    s.add(m.entrantA!); s.add(m.entrantB!);
    counts.set(m.groupIdx, s);
  }
  const sizes = [...counts.values()].map((s) => s.size).sort();
  expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  expect(sizes.reduce((a, b2) => a + b2, 0)).toBe(13);
});

test("group matches carry no edges; knockout slots carry source tokens", () => {
  const b = build(12);
  const group = b.filter((m) => m.groupIdx !== null);
  const knockout = b.filter((m) => m.groupIdx === null);
  for (const m of group) expect(m.winToMatchId).toBeNull();
  const firstKo = knockout.filter((m) => m.srcA || m.srcB);
  expect(firstKo.length).toBeGreaterThan(0);
  for (const m of firstKo) {
    if (m.srcA) expect(parseSrc(m.srcA)).not.toBeNull();
    if (m.srcB) expect(parseSrc(m.srcB)).not.toBeNull();
  }
});

test("the knockout half is a tree with exactly one ending match", () => {
  const b = build(12);
  const knockout = b.filter((m) => m.groupIdx === null);
  expect(knockout.filter((m) => m.winToMatchId === null).length).toBe(1);
});

test("entrants from the same group do not meet in the first knockout round", () => {
  const b = build(16, 4, 2);
  const ko = b.filter((m) => m.groupIdx === null && (m.srcA || m.srcB));
  for (const m of ko) {
    const a = parseSrc(m.srcA!)!;
    const bb = parseSrc(m.srcB!)!;
    expect(a.group).not.toBe(bb.group);
  }
});

test("matchCount agrees with the graph it builds", () => {
  for (const n of [8, 12, 13, 16, 20]) {
    expect(groupsKnockout.matchCount(n, { groupSize: 4, advancePerGroup: 2 }))
      .toBe(build(n).length);
  }
});
```

- [ ] **Step 2: Write the failing gate test**

Create `tests/tournament.gate.test.ts`:

```ts
import { settleGroups, srcToken } from "../src/tournament/formats/gate";
import { groupsKnockout } from "../src/tournament/formats/groupsKnockout";
import type { BracketMatch, Entrant } from "../src/tournament/types";

const ents = (n: number): Entrant[] => Array.from({ length: n }, (_, i) => ({
  id: `e${i + 1}`, clubPlayerId: `p${i + 1}`, name: `P${i + 1}`,
  seed: i + 1, partnerClubPlayerId: null,
}));
const build = (n = 12) => {
  let k = 0;
  return groupsKnockout.build({
    entrants: ents(n), tournamentId: "t1", gen: () => `m${++k}`,
    groupSize: 4, advancePerGroup: 2,
  });
};
// Lower entrant number always wins, so standings are deterministic by hand.
const playAll = (b: BracketMatch[], groupIdx?: number): BracketMatch[] =>
  b.map((m) => {
    if (m.groupIdx === null) return m;
    if (groupIdx !== undefined && m.groupIdx !== groupIdx) return m;
    const [a, c] = [m.entrantA!, m.entrantB!];
    const winner = Number(a.slice(1)) < Number(c.slice(1)) ? a : c;
    return { ...m, winnerEntrant: winner, matchId: m.id };
  });

test("no fills while a group is unfinished", () => {
  expect(settleGroups(build(), ents(12))).toEqual([]);
});

test("a complete group fills only its own dependent slots", () => {
  const b = playAll(build(), 0);
  const fills = settleGroups(b, ents(12));
  expect(fills.length).toBe(2); // advancePerGroup
  for (const f of fills) {
    const target = b.find((m) => m.id === f.matchId)!;
    const token = f.slot === "a" ? target.srcA : target.srcB;
    expect(token).toBe(srcToken(0, token === srcToken(0, 1) ? 1 : 2));
  }
});

// Two phones offline, same results, must produce identical fills or the
// knockout draw forks on sync.
test("fills are deterministic across repeated and shuffled input", () => {
  const b = playAll(build());
  const once = settleGroups(b, ents(12));
  const twice = settleGroups(b, ents(12));
  const shuffled = settleGroups([...b].reverse(), [...ents(12)].reverse());
  expect(twice).toEqual(once);
  expect([...shuffled].sort((x, y) => x.matchId.localeCompare(y.matchId)))
    .toEqual([...once].sort((x, y) => x.matchId.localeCompare(y.matchId)));
});

test("is idempotent — a slot already filled is not filled again", () => {
  const b = playAll(build());
  const fills = settleGroups(b, ents(12));
  const applied = b.map((m) => {
    const f = fills.find((x) => x.matchId === m.id);
    if (!f) return m;
    return f.slot === "a" ? { ...m, entrantA: f.entrantId } : { ...m, entrantB: f.entrantId };
  });
  expect(settleGroups(applied, ents(12))).toEqual([]);
});

test("every filled entrant actually played in the group it came from", () => {
  const b = playAll(build());
  const fills = settleGroups(b, ents(12));
  for (const f of fills) {
    const target = b.find((m) => m.id === f.matchId)!;
    const token = f.slot === "a" ? target.srcA! : target.srcB!;
    const group = Number(token.slice(1, token.indexOf("#")));
    const inGroup = new Set(b.filter((m) => m.groupIdx === group)
      .flatMap((m) => [m.entrantA!, m.entrantB!]));
    expect(inGroup.has(f.entrantId)).toBe(true);
  }
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `npx jest tests/tournament.groupsKnockout.test.ts tests/tournament.gate.test.ts`
Expected: FAIL — neither module resolves.

- [ ] **Step 4: Implement the gate**

Create `src/tournament/formats/gate.ts`:

```ts
import type { BracketMatch, Entrant, Slot } from "../types";
import type { MatchScore } from "./types";
import { recordStandings } from "./standings";

export type SlotFill = { matchId: string; slot: Slot; entrantId: string };

/** 'G2#1' — first place in group 2. Groups are 0-based, ranks 1-based. */
export const srcToken = (group: number, rank: number): string => `G${group}#${rank}`;

export function parseSrc(token: string): { group: number; rank: number } | null {
  const m = /^G(\d+)#(\d+)$/.exec(token);
  return m ? { group: Number(m[1]), rank: Number(m[2]) } : null;
}

/**
 * Fill knockout slots whose feeding group has finished.
 *
 * A knockout slot is fed by "whoever finishes first in group 2" — a standings
 * outcome, not one match's winner, so no routing edge can express it. This is
 * the only place the edge model needs help.
 *
 * MUST be deterministic: two devices offline in the same hall can both finish
 * the last group match and both run this before syncing. recordStandings
 * guarantees a total order, which is what makes their answers identical.
 * Returns only slots that are still empty, so it is safe to run after every
 * result.
 */
export function settleGroups(
  bracket: BracketMatch[], entrants: Entrant[], scores?: Map<string, MatchScore>,
): SlotFill[] {
  const groups = new Map<number, BracketMatch[]>();
  for (const m of bracket) {
    if (m.groupIdx === null) continue;
    groups.set(m.groupIdx, [...(groups.get(m.groupIdx) ?? []), m]);
  }

  const rankings = new Map<number, string[]>();
  for (const [g, matches] of groups) {
    if (!matches.every((m) => m.winnerEntrant)) continue; // group unfinished
    const ids = new Set(matches.flatMap((m) => [m.entrantA, m.entrantB])
      .filter((x): x is string => !!x));
    const inGroup = entrants.filter((e) => ids.has(e.id));
    rankings.set(g, recordStandings(matches, inGroup, scores).map((s) => s.entrantId));
  }

  const fills: SlotFill[] = [];
  for (const m of bracket) {
    for (const slot of ["a", "b"] as const) {
      const token = slot === "a" ? m.srcA : m.srcB;
      const occupied = slot === "a" ? m.entrantA : m.entrantB;
      if (!token || occupied) continue;
      const src = parseSrc(token);
      if (!src) continue;
      const entrantId = rankings.get(src.group)?.[src.rank - 1];
      if (entrantId) fills.push({ matchId: m.id, slot, entrantId });
    }
  }
  // Sorted so two devices emit the same array, not merely the same set.
  return fills.sort((x, y) => x.matchId.localeCompare(y.matchId) || x.slot.localeCompare(y.slot));
}
```

- [ ] **Step 5: Implement `groupsKnockout`**

Create `src/tournament/formats/groupsKnockout.ts`:

```ts
import { circleRounds } from "./roundRobin";
import type { BracketMatch, Entrant } from "../types";
import type { FormatModule, GenOpts, MatchScore, Standing } from "./types";
import { recordStandings } from "./standings";
import { srcToken } from "./gate";

const DEFAULTS = { groupSize: 4, advancePerGroup: 2 };

/** Group sizes differ by at most one: 13 entrants in groups of 4 becomes
 *  4/3/3/3. Snake assignment by seed keeps strong entrants apart. */
export function assignGroups(entrants: Entrant[], groupSize: number): Entrant[][] {
  const count = Math.max(1, Math.round(entrants.length / groupSize));
  const groups: Entrant[][] = Array.from({ length: count }, () => []);
  const bySeed = [...entrants].sort((a, b) => a.seed - b.seed);
  bySeed.forEach((e, i) => {
    const row = Math.floor(i / count);
    const col = i % count;
    groups[row % 2 === 0 ? col : count - 1 - col].push(e);
  });
  return groups;
}

const nextPowerOfTwo = (n: number): number => {
  let p = 2;
  while (p < n) p *= 2;
  return p;
};

export const groupsKnockout: FormatModule = {
  id: "groups_knockout",
  label: "Groups → knockout",
  blurb: "Group stage, then a knockout",
  minEntrants: 6,
  matchCount: (entrants, o) => {
    const groupSize = o?.groupSize ?? DEFAULTS.groupSize;
    const advance = o?.advancePerGroup ?? DEFAULTS.advancePerGroup;
    const count = Math.max(1, Math.round(entrants / groupSize));
    const base = Math.floor(entrants / count);
    const bigger = entrants % count;
    let group = 0;
    for (let g = 0; g < count; g++) {
      const size = base + (g < bigger ? 1 : 0);
      group += (size * (size - 1)) / 2;
    }
    return group + nextPowerOfTwo(count * advance) - 1;
  },
  build: ({ entrants, tournamentId, gen, groupSize, advancePerGroup }: GenOpts): BracketMatch[] => {
    const size = groupSize ?? DEFAULTS.groupSize;
    const advance = advancePerGroup ?? DEFAULTS.advancePerGroup;
    const groups = assignGroups(entrants, size);
    const out: BracketMatch[] = [];

    const blank = (round: number, index: number): BracketMatch => ({
      id: gen(), tournamentId, round, index, matchId: null,
      entrantA: null, entrantB: null, winnerEntrant: null,
      court: null, scoredBy: null,
      winToMatchId: null, winToSlot: null, lossToMatchId: null, lossToSlot: null,
      groupIdx: null, srcA: null, srcB: null,
    });

    // Group stage: a round-robin per group, no edges.
    let round = 1;
    let maxGroupRound = 1;
    groups.forEach((members, g) => {
      circleRounds(members.map((e) => e.id)).forEach((pairs, r) => {
        pairs.forEach(([a, b], i) => {
          out.push({
            ...blank(round + r, i), entrantA: a, entrantB: b, groupIdx: g,
          });
        });
        maxGroupRound = Math.max(maxGroupRound, round + r);
      });
    });

    // Knockout: a standard tree over count * advance slots, rounds numbered
    // above the group stage so `round` stays one ascending axis.
    const slots = nextPowerOfTwo(groups.length * advance);
    const koRounds: BracketMatch[][] = [];
    let width = slots / 2;
    let koRound = maxGroupRound + 1;
    while (width >= 1) {
      koRounds.push(Array.from({ length: width }, (_, i) => blank(koRound, i)));
      koRound++;
      width = width / 2;
    }

    // Wire the tree.
    koRounds.forEach((rows, r) => {
      const next = koRounds[r + 1];
      for (const m of rows) {
        if (!next) continue; // the final: null edge ends the tournament
        m.winToMatchId = next[Math.floor(m.index / 2)].id;
        m.winToSlot = m.index % 2 === 0 ? "a" : "b";
      }
    });

    // Seed the first knockout round from standings tokens. Winner of group g
    // meets a runner-up from a different group: pair g with the last group and
    // walk inwards, which is the standard cross-group bracket.
    const first = koRounds[0];
    const pairs: [string | null, string | null][] = [];
    for (let g = 0; g < groups.length; g++) {
      const other = groups.length - 1 - g;
      if (g >= other && !(groups.length === 1 && g === 0)) break;
      for (let r = 1; r <= advance; r++) {
        pairs.push([srcToken(g, r), srcToken(other, advance + 1 - r)]);
      }
    }
    first.forEach((m, i) => {
      const p = pairs[i];
      if (!p) return; // a bye slot in an over-sized knockout draw
      m.srcA = p[0]; m.srcB = p[1];
    });

    return [...out, ...koRounds.flat()];
  },
  standings: (bracket, entrants, scores?: Map<string, MatchScore>): Standing[] =>
    recordStandings(bracket.filter((m) => m.groupIdx !== null), entrants, scores),
  status: (bracket) => {
    if (bracket.length === 0) return { status: "pending", champion: null };
    const final = bracket.find((m) => m.groupIdx === null && m.winToMatchId === null);
    if (final?.winnerEntrant) return { status: "done", champion: final.winnerEntrant };
    const anyPlayed = bracket.some((m) => m.matchId || m.winnerEntrant);
    return { status: anyPlayed ? "live" : "pending", champion: null };
  },
};
```

- [ ] **Step 6: Register it**

In `src/tournament/formats/index.ts`, import `groupsKnockout` and add `groups_knockout: groupsKnockout` as the last `FORMATS` entry.

- [ ] **Step 7: Run both tests to verify they pass**

Run: `npx jest tests/tournament.groupsKnockout.test.ts tests/tournament.gate.test.ts`
Expected: PASS, 11 tests. If the cross-group pairing test fails, fix `pairs` construction — two entrants from one group meeting in the first knockout round is a real defect, not a test artefact.

- [ ] **Step 8: Run the full suite, then commit**

Run: `npx tsc --noEmit && npm test`

```bash
git add src/tournament/formats/groupsKnockout.ts src/tournament/formats/gate.ts \
        src/tournament/formats/index.ts \
        tests/tournament.groupsKnockout.test.ts tests/tournament.gate.test.ts
git commit -m "$(cat <<'EOF'
feat(tournaments): groups into a knockout, with the seeding gate

Group matches carry no edges; knockout slots carry standings tokens like
'G2#1' that a gate resolves once a group finishes. The gate is deterministic
because recordStandings is a total order — that is what lets two offline
devices compute the same knockout draw.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Cost estimate

The anti-confusion mechanism: an unplayable choice must look unplayable before
the host commits.

**Files:**
- Create: `src/tournament/estimate.ts`
- Test: `tests/tournament.estimate.test.ts` (create)

**Interfaces:**
- Consumes: `FORMATS`, `FormatModule`.
- Produces: `estimateMinutes(matches, bestOf, courts): number`; `formatEstimate(format, entrants, bestOf, courts, o?): { matches: number; minutes: number; long: boolean }`; `formatDuration(minutes): string`; `LONG_THRESHOLD_MINUTES = 180`.

- [ ] **Step 1: Write the failing test**

Create `tests/tournament.estimate.test.ts`:

```ts
import {
  estimateMinutes, formatEstimate, formatDuration, LONG_THRESHOLD_MINUTES,
} from "../src/tournament/estimate";
import { FORMATS } from "../src/tournament/formats";

test("match counts match hand-computed values", () => {
  expect(FORMATS.round_robin.matchCount(6)).toBe(15);
  expect(FORMATS.double_elim.matchCount(8)).toBe(14);
  expect(FORMATS.single_elim.matchCount(8)).toBe(7);
  expect(FORMATS.single_elim.matchCount(5)).toBe(7); // 8-draw with byes
});

test("more courts finish sooner", () => {
  expect(estimateMinutes(28, 3, 4)).toBeLessThan(estimateMinutes(28, 3, 2));
});

test("best-of-5 takes longer than best-of-3", () => {
  expect(estimateMinutes(10, 5, 4)).toBeGreaterThan(estimateMinutes(10, 3, 4));
});

test("zero matches takes zero minutes, and courts never divide by zero", () => {
  expect(estimateMinutes(0, 3, 4)).toBe(0);
  expect(estimateMinutes(10, 3, 0)).toBeGreaterThan(0);
});

test("a long round-robin is flagged, a knockout of the same size is not", () => {
  const rr = formatEstimate(FORMATS.round_robin, 16, 3, 4);
  const ko = formatEstimate(FORMATS.single_elim, 16, 3, 4);
  expect(rr.matches).toBe(120);
  expect(rr.long).toBe(true);
  expect(ko.long).toBe(false);
  expect(rr.minutes).toBeGreaterThan(LONG_THRESHOLD_MINUTES);
});

test("durations read the way a human would say them", () => {
  expect(formatDuration(50)).toBe("~50m");
  expect(formatDuration(100)).toBe("~1h40");
  expect(formatDuration(120)).toBe("~2h");
  expect(formatDuration(0)).toBe("~0m");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/tournament.estimate.test.ts`
Expected: FAIL — cannot resolve `../src/tournament/estimate`.

- [ ] **Step 3: Implement it**

Create `src/tournament/estimate.ts`:

```ts
import type { FormatModule } from "./formats/types";

/** Rough minutes for one match. A best-of-3 to 21 runs about 25 minutes on a
 *  club court including the changeover; each extra game adds about 10. */
const BASE_MINUTES = 15;
const PER_GAME_MINUTES = 5;

/** Above this, the picker marks the option as long for one night. */
export const LONG_THRESHOLD_MINUTES = 180;

/**
 * Deliberately rough, and always presented with a '~'. Its job is not accuracy;
 * it is to make an unplayable choice visibly unplayable BEFORE the host commits,
 * rather than after they have started a 120-match round-robin.
 */
export function estimateMinutes(matches: number, bestOf: number, courts: number): number {
  if (matches <= 0) return 0;
  const perMatch = BASE_MINUTES + PER_GAME_MINUTES * bestOf;
  return Math.round((matches * perMatch) / Math.max(1, courts));
}

export function formatEstimate(
  format: FormatModule, entrants: number, bestOf: number, courts: number,
  o?: { groupSize?: number; advancePerGroup?: number },
): { matches: number; minutes: number; long: boolean } {
  const matches = entrants <= 0 ? 0 : format.matchCount(entrants, o);
  const minutes = estimateMinutes(matches, bestOf, courts);
  return { matches, minutes, long: minutes > LONG_THRESHOLD_MINUTES };
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `~${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `~${h}h` : `~${h}h${String(m).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/tournament.estimate.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Run the full suite, then commit**

Run: `npx tsc --noEmit && npm test`

```bash
git add src/tournament/estimate.ts tests/tournament.estimate.test.ts
git commit -m "$(cat <<'EOF'
feat(tournaments): live match-count and duration estimate

Rough by design and always shown with a '~'. Its job is to make an unplayable
format visibly unplayable before the host commits, not to be accurate.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Server migration 0053

**Files:**
- Create: `supabase/migrations/0053_tournament_formats.sql`
- Test: `tests/schema.0053.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks (SQL only).
- Produces: `start_tournament(p_tournament_id uuid, p_bracket jsonb)` accepting every format; `finish_bracket_match(p_bracket_match_id uuid, p_winner_entrant uuid, p_slot_fills jsonb default '[]')`.

**Read before writing:** `supabase/migrations/0012_tournament_staff_seed.sql` (the current `start_tournament`) and `supabase/migrations/0006_tournament_sync.sql` (the current `finish_bracket_match`). Both functions are replaced whole; every existing guard must be carried over verbatim unless this task says otherwise.

- [ ] **Step 1: Write the failing test**

Create `tests/schema.0053.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";

const sql = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "0053_tournament_formats.sql"), "utf8");

const COLUMNS = ["win_to_match_id", "win_to_slot", "loss_to_match_id", "loss_to_slot",
                 "group_idx", "src_a", "src_b"];

test("adds every routing column re-runnably", () => {
  for (const c of COLUMNS) {
    expect(sql).toMatch(new RegExp(`add column if not exists ${c}\\b`));
  }
  expect(sql).toMatch(/add column if not exists group_count int/);
  expect(sql).toMatch(/add column if not exists advance_per_group int/);
});

// A foreign key here is checked per row, and start_tournament inserts the whole
// bracket in one statement from jsonb_array_elements, where a round-1 row
// references a round-2 row in the same batch with no ordering guarantee. The FK
// would fail the first insert and kill every tournament start.
test("the routing columns carry no foreign key", () => {
  const alter = sql.slice(sql.indexOf("alter table public.bracket_matches"),
                          sql.indexOf("update public.bracket_matches"));
  expect(alter).not.toMatch(/references/i);
});

test("slots are constrained to a and b", () => {
  expect(sql).toMatch(/win_to_slot\s+text\s+check \(win_to_slot in \('a','b'\)\)/);
  expect(sql).toMatch(/loss_to_slot\s+text\s+check \(loss_to_slot in \('a','b'\)\)/);
});

test("the backfill only touches rows that have no edge yet", () => {
  const backfill = sql.slice(sql.indexOf("update public.bracket_matches"));
  expect(backfill).toMatch(/m\.win_to_match_id is null/);
  expect(backfill).toMatch(/p\.idx\s*=\s*m\.idx \/ 2/);
});

test("finish_bracket_match follows edges and no longer does tree math", () => {
  const fn = sql.slice(sql.indexOf("function public.finish_bracket_match"),
                       sql.indexOf("function public.start_tournament"));
  expect(fn).toMatch(/v_win_to/);
  expect(fn).toMatch(/p_slot_fills jsonb default/);
  expect(fn).not.toMatch(/v_idx \/ 2/);
  expect(fn).toMatch(/security definer/);
  expect(fn).toMatch(/set search_path = public/);
  // Carried over from 0006 verbatim.
  expect(fn).toMatch(/if not is_club_member\(v_club_id\) then/);
  expect(fn).toMatch(/Winner is not one of this match''s entrants/);
});

test("a slot already holding the same entrant is success, a different one is not", () => {
  const fn = sql.slice(sql.indexOf("function public.finish_bracket_match"),
                       sql.indexOf("function public.start_tournament"));
  expect(fn).toMatch(/Slot already filled by a different entrant/);
});

test("start_tournament keeps the single_elim size check exactly", () => {
  const fn = sql.slice(sql.indexOf("function public.start_tournament"));
  expect(fn).toMatch(/v_draw - 1/);
  expect(fn).toMatch(/v_format/);
  // Every guard from 0012 survives.
  expect(fn).toMatch(/is_club_admin\(v_club\) or is_tournament_admin\(p_tournament_id\)/);
  expect(fn).toMatch(/This tournament has already started/);
  expect(fn).toMatch(/This tournament already has a bracket/);
  expect(fn).toMatch(/Bracket references entrants from another tournament/);
});

test("start_tournament validates routing structurally", () => {
  const fn = sql.slice(sql.indexOf("function public.start_tournament"));
  expect(fn).toMatch(/Bracket routing references a match outside this tournament/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/schema.0053.test.ts`
Expected: FAIL — `ENOENT`, the migration does not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0053_tournament_formats.sql`:

```sql
-- Tournament formats: progression becomes data.
--
-- Each bracket row now records where its winner and loser go, so the server
-- follows the graph the client's format generator laid down instead of
-- re-deriving single-elimination tree math. That removes the duplicated draw
-- logic 0012 warns must stay "byte-identical" — there is nothing left to keep
-- in step — and it is what lets round-robin, double elimination and
-- groups-into-a-knockout share one advance path.
--
-- NO FOREIGN KEY on the routing columns, deliberately: start_tournament inserts
-- the whole bracket in ONE statement from jsonb_array_elements, and a round-1
-- row references a round-2 row in the same batch. A per-row FK check would fail
-- the first insert and kill every tournament start. Rows already cascade from
-- tournaments, so the constraint bought nothing.

alter table public.bracket_matches
  add column if not exists win_to_match_id  uuid,
  add column if not exists win_to_slot      text check (win_to_slot in ('a','b')),
  add column if not exists loss_to_match_id uuid,
  add column if not exists loss_to_slot     text check (loss_to_slot in ('a','b')),
  add column if not exists group_idx        int,
  add column if not exists src_a            text,
  add column if not exists src_b            text;

alter table public.tournaments
  add column if not exists group_count       int,
  add column if not exists advance_per_group int;

-- Backfill: describe the routing existing tournaments were already doing, so
-- live brackets keep advancing mid-flight. Finals get null edges, which is
-- exactly right — a null win edge is now what "this ends the tournament" means.
update public.bracket_matches m set
  win_to_match_id = p.id,
  win_to_slot     = case when m.idx % 2 = 0 then 'a' else 'b' end
from public.bracket_matches p
where p.tournament_id = m.tournament_id
  and p.round = m.round + 1
  and p.idx   = m.idx / 2
  and m.win_to_match_id is null;

-- Replaces 0006's version. Every authorisation and validation guard there is
-- carried over unchanged; only the advance changed.
create or replace function public.finish_bracket_match(
  p_bracket_match_id uuid,
  p_winner_entrant uuid,
  p_slot_fills jsonb default '[]'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_tournament_id uuid;
  v_entrant_a uuid;
  v_entrant_b uuid;
  v_club_id uuid;
  v_win_to uuid;
  v_win_slot text;
  v_loss_to uuid;
  v_loss_slot text;
  v_loser uuid;
  v_fill jsonb;
  v_current uuid;
begin
  select tournament_id, entrant_a, entrant_b,
         win_to_match_id, win_to_slot, loss_to_match_id, loss_to_slot
    into v_tournament_id, v_entrant_a, v_entrant_b,
         v_win_to, v_win_slot, v_loss_to, v_loss_slot
    from bracket_matches where id = p_bracket_match_id;
  if v_tournament_id is null then
    raise exception 'Bracket match not found';
  end if;

  select club_id into v_club_id from tournaments where id = v_tournament_id;
  if not is_club_member(v_club_id) then
    raise exception 'Not a member of this tournament''s club';
  end if;
  if p_winner_entrant is null then
    raise exception 'Winner entrant is required';
  end if;
  if p_winner_entrant is distinct from v_entrant_a and p_winner_entrant is distinct from v_entrant_b then
    raise exception 'Winner is not one of this match''s entrants';
  end if;

  update bracket_matches set winner_entrant = p_winner_entrant where id = p_bracket_match_id;

  v_loser := case when p_winner_entrant = v_entrant_a then v_entrant_b else v_entrant_a end;

  if v_win_to is not null then
    if v_win_slot = 'a' then
      update bracket_matches set entrant_a = p_winner_entrant where id = v_win_to;
    else
      update bracket_matches set entrant_b = p_winner_entrant where id = v_win_to;
    end if;
  end if;

  if v_loss_to is not null and v_loser is not null then
    if v_loss_slot = 'a' then
      update bracket_matches set entrant_a = v_loser where id = v_loss_to;
    else
      update bracket_matches set entrant_b = v_loser where id = v_loss_to;
    end if;
  end if;

  -- Seeding-gate results. The server does NOT recompute standings: duplicating
  -- that math in plpgsql is exactly the drift this design removes. It validates
  -- structurally instead. Two devices offline will submit identical fills
  -- because recordStandings is a total order, so a slot that already holds the
  -- same entrant is success, not a conflict.
  for v_fill in select * from jsonb_array_elements(p_slot_fills) loop
    if (v_fill->>'entrantId')::uuid not in (
      select id from tournament_entrants where tournament_id = v_tournament_id) then
      raise exception 'Slot fill references an entrant from another tournament';
    end if;
    if not exists (select 1 from bracket_matches
                   where id = (v_fill->>'matchId')::uuid and tournament_id = v_tournament_id) then
      raise exception 'Slot fill references a match outside this tournament';
    end if;

    if v_fill->>'slot' = 'a' then
      select entrant_a into v_current from bracket_matches where id = (v_fill->>'matchId')::uuid;
    else
      select entrant_b into v_current from bracket_matches where id = (v_fill->>'matchId')::uuid;
    end if;

    if v_current is not null and v_current is distinct from (v_fill->>'entrantId')::uuid then
      raise exception 'Slot already filled by a different entrant';
    end if;

    if v_current is null then
      if v_fill->>'slot' = 'a' then
        update bracket_matches set entrant_a = (v_fill->>'entrantId')::uuid
          where id = (v_fill->>'matchId')::uuid;
      else
        update bracket_matches set entrant_b = (v_fill->>'entrantId')::uuid
          where id = (v_fill->>'matchId')::uuid;
      end if;
    end if;
  end loop;

  -- Done is now "this match had nowhere to send its winner", which the backfill
  -- already made true of every existing final. Replaces round = max(round).
  if v_win_to is null and not exists (
    select 1 from bracket_matches
    where tournament_id = v_tournament_id and winner_entrant is null
      and win_to_match_id is null and id <> p_bracket_match_id
  ) then
    update tournaments set status = 'done' where id = v_tournament_id;
    return;
  end if;

  update tournaments set status = 'live' where id = v_tournament_id;
end $$;

-- Replaces 0012's version. Its authorisation check and every guard are carried
-- over verbatim; the size check becomes format-aware and routing is validated.
create or replace function public.start_tournament(
  p_tournament_id uuid,
  p_bracket jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_club uuid;
  v_status text;
  v_type text;
  v_format text;
  v_entrants int;
  v_players int;
  v_draw int;
  v_size int;
begin
  select club_id, status, match_type, coalesce(format, 'single_elim')
    into v_club, v_status, v_type, v_format
  from tournaments where id = p_tournament_id;

  if v_club is null then
    raise exception 'Tournament not found';
  end if;
  if not (is_club_admin(v_club) or is_tournament_admin(p_tournament_id)) then
    raise exception 'Only an admin can start this tournament';
  end if;
  if v_status <> 'draft' then
    raise exception 'This tournament has already started';
  end if;
  if exists (select 1 from bracket_matches where tournament_id = p_tournament_id) then
    raise exception 'This tournament already has a bracket';
  end if;

  select count(*) into v_entrants from tournament_entrants
  where tournament_id = p_tournament_id;

  v_players := v_entrants * (case when v_type = 'doubles' then 2 else 1 end);
  if v_type = 'doubles' and v_players < 6 then
    raise exception 'Add at least 6 players to start';
  end if;
  if v_type <> 'doubles' and v_players < 4 then
    raise exception 'Add at least 4 players to start';
  end if;
  if v_entrants > 64 then
    raise exception 'A tournament holds at most 64 entrants';
  end if;

  v_draw := 4;
  while v_draw < v_entrants loop v_draw := v_draw * 2; end loop;

  -- Format-aware payload size. single_elim keeps 0012's exact expression so its
  -- behaviour is unchanged; the others are checked by range rather than by
  -- re-deriving each generator's math, which is the duplication this design
  -- removes.
  if v_format = 'single_elim' then
    if jsonb_array_length(p_bracket) <> v_draw - 1 then
      raise exception 'Bracket does not match the draw size';
    end if;
    v_size := v_draw;
  elsif v_format = 'round_robin' then
    if jsonb_array_length(p_bracket) <> (v_entrants * (v_entrants - 1)) / 2 then
      raise exception 'Bracket does not match the draw size';
    end if;
    v_size := v_entrants;
  elsif v_format = 'double_elim' then
    if jsonb_array_length(p_bracket) <> 2 * v_draw - 2 then
      raise exception 'Bracket does not match the draw size';
    end if;
    v_size := v_draw;
  elsif v_format = 'groups_knockout' then
    if jsonb_array_length(p_bracket) < v_entrants
       or jsonb_array_length(p_bracket) > v_entrants * v_entrants then
      raise exception 'Bracket does not match the draw size';
    end if;
    v_size := v_draw;
  else
    raise exception 'Unknown tournament format';
  end if;

  -- Every non-null entrant id in the payload must belong to this tournament.
  if exists (
    select 1
    from jsonb_array_elements(p_bracket) e
    cross join lateral (values
      (e->>'entrant_a'), (e->>'entrant_b'), (e->>'winner_entrant')
    ) as ids(entrant_id)
    where ids.entrant_id is not null
      and ids.entrant_id::uuid not in (
        select id from tournament_entrants where tournament_id = p_tournament_id)
  ) then
    raise exception 'Bracket references entrants from another tournament';
  end if;

  -- Structural validation of the routing graph. The server no longer re-derives
  -- format math; it checks that every edge lands inside this payload and that
  -- nothing points at itself.
  if exists (
    select 1
    from jsonb_array_elements(p_bracket) e
    cross join lateral (values (e->>'win_to_match_id'), (e->>'loss_to_match_id')) as t(target)
    where t.target is not null
      and (t.target = e->>'id'
           or t.target not in (select x->>'id' from jsonb_array_elements(p_bracket) x))
  ) then
    raise exception 'Bracket routing references a match outside this tournament';
  end if;

  insert into bracket_matches (
    id, tournament_id, round, idx, match_id, entrant_a, entrant_b, winner_entrant,
    court, scored_by, win_to_match_id, win_to_slot, loss_to_match_id, loss_to_slot,
    group_idx, src_a, src_b)
  select
    (e->>'id')::uuid, p_tournament_id, (e->>'round')::int, (e->>'idx')::int,
    null, (e->>'entrant_a')::uuid, (e->>'entrant_b')::uuid,
    (e->>'winner_entrant')::uuid, null, null,
    (e->>'win_to_match_id')::uuid, e->>'win_to_slot',
    (e->>'loss_to_match_id')::uuid, e->>'loss_to_slot',
    (e->>'group_idx')::int, e->>'src_a', e->>'src_b'
  from jsonb_array_elements(p_bracket) e;

  update tournaments set size = v_size, status = 'live' where id = p_tournament_id;
end;
$$;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/schema.0053.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Apply to production and verify**

Apply the migration the same way `0048`–`0052` were applied in this project. Then verify against production:

```sql
select column_name from information_schema.columns
 where table_name = 'bracket_matches' and column_name like '%_to_%';
-- expect: win_to_match_id, win_to_slot, loss_to_match_id, loss_to_slot

select count(*) from bracket_matches where win_to_match_id is null;
-- expect: one row per tournament (the finals), not zero and not all of them
```

If the second query returns every row, the backfill did not run. If it returns zero, something added an edge to the finals and `finish_bracket_match` will never mark a tournament done.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0053_tournament_formats.sql tests/schema.0053.test.ts
git commit -m "$(cat <<'EOF'
feat(db): 0053 — routing columns, and progression by edge

finish_bracket_match follows win_to/loss_to instead of computing idx/2, and
"done" becomes a null win edge — which the backfill already made true of every
existing final, so live brackets keep advancing. start_tournament's size check
becomes format-aware with single_elim keeping its exact expression, and it
validates routing structurally rather than re-deriving each format's math.

No FK on the routing columns: start_tournament inserts the bracket in one
statement and forward edges would fail a per-row check.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Repo wiring

**Files:**
- Modify: `src/repos/tournamentRepo.ts`
- Modify: `src/repos/tournamentCache.ts`
- Modify: `src/tournament/bundle.ts`
- Modify: `src/tournament/draw.ts`
- Test: `tests/tournamentRepo.test.ts` (extend)
- Test: `tests/tournament.startBlocker.test.ts` (create)

**Interfaces:**
- Consumes: `FORMATS`, `formatOrDefault`, `settleGroups`, `SlotFill`.
- Produces: `createTournament(..., format: FormatId, groupSize?, advancePerGroup?)`; `TournamentRow.format`, `.groupCount`, `.advancePerGroup`; `finishBracketMatch(bracketMatchId, winnerEntrant, fills?)`; `startBlocker(players, matchType, format)`.

- [ ] **Step 1: Write the failing `startBlocker` test**

Create `tests/tournament.startBlocker.test.ts`:

```ts
import { startBlocker } from "../src/tournament/draw";

test("knockout keeps today's minimums exactly", () => {
  expect(startBlocker(3, "singles", "single_elim")).toMatch(/at least 4/);
  expect(startBlocker(4, "singles", "single_elim")).toBeNull();
  expect(startBlocker(5, "doubles", "single_elim")).toMatch(/at least 6/);
  expect(startBlocker(6, "doubles", "single_elim")).toBeNull();
});

test("round-robin runs with three", () => {
  expect(startBlocker(3, "singles", "round_robin")).toBeNull();
  expect(startBlocker(2, "singles", "round_robin")).toMatch(/at least 3/);
});

test("groups need enough entrants to make groups", () => {
  expect(startBlocker(5, "singles", "groups_knockout")).toMatch(/at least 6/);
  expect(startBlocker(6, "singles", "groups_knockout")).toBeNull();
});

test("pairing and the 64-entrant ceiling still apply to every format", () => {
  expect(startBlocker(7, "doubles", "round_robin")).toMatch(/Pair every player/);
  expect(startBlocker(130, "singles", "round_robin")).toMatch(/at most 64/);
});

test("an unknown format falls back to knockout rather than crashing", () => {
  expect(startBlocker(4, "singles", "nonsense" as never)).toBeNull();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/tournament.startBlocker.test.ts`
Expected: FAIL — `startBlocker` takes two arguments.

- [ ] **Step 3: Make `startBlocker` format-aware**

In `src/tournament/draw.ts`, replace `startBlocker`:

```ts
import { formatOrDefault } from "./formats";
import type { FormatId } from "./types";

/**
 * Why this tournament cannot start yet, or null when it can. Shared by the
 * Start button and the start_tournament guard so the UI and the database
 * cannot disagree about the rule.
 *
 * `players` counts people, not entrants: a doubles entrant is two players.
 * Minimums are per format — round-robin is fine with three, a knockout is not.
 */
export function startBlocker(
  players: number, matchType: MatchType, format: FormatId = "single_elim",
): string | null {
  const perEntrant = matchType === "doubles" ? 2 : 1;
  const mod = formatOrDefault(format);
  const minEntrants = Math.max(mod.minEntrants, matchType === "doubles" ? 3 : mod.minEntrants);
  const min = minEntrants * perEntrant;
  if (players < min) return `Add at least ${min} players to start`;
  if (players % perEntrant !== 0) return "Pair every player to start";
  if (players / perEntrant > 64) return "A tournament holds at most 64 entrants";
  return null;
}
```

Check the resulting numbers against the test: `single_elim.minEntrants` is 3, so singles knockout requires 4 — set `singleElim.minEntrants = 4` if the arithmetic does not land on today's values. **The knockout minimums must not change**; adjust `minEntrants` per format until the first test passes without touching its expectations.

- [ ] **Step 4: Run it, then extend the repo**

Run: `npx jest tests/tournament.startBlocker.test.ts` — expect PASS.

In `src/repos/tournamentRepo.ts`:

1. Add to `TournamentRow`: `format: FormatId; groupCount: number | null; advancePerGroup: number | null;`
2. Map them in `toTournamentRow`, defaulting `format` to `"single_elim"` so a row written before 0053 behaves as it always did.
3. Extend `createTournament` with `format: FormatId = "single_elim"`, `groupSize?: number`, `advancePerGroup?: number` as **trailing optional** parameters, and write them into the insert, replacing the hardcoded `format: "single_elim"`:

```ts
    id: tid, club_id: club.id, name, format, size: 0, status: "draft",
    match_type: matchType, bestof: bestOf, finals_bestof: finalsBestOf, courts,
    group_count: format === "groups_knockout" && groupSize
      ? Math.max(1, Math.round(entrants.length / groupSize)) : null,
    advance_per_group: format === "groups_knockout" ? (advancePerGroup ?? 2) : null,
```

4. Replace the body of `startTournament`'s bracket construction:

```ts
  const mod = formatOrDefault(tournament.format);
  const bracket = mod.build({
    entrants, tournamentId: id, gen: () => Crypto.randomUUID(),
    groupSize: tournament.groupCount
      ? Math.round(entrants.length / tournament.groupCount) : undefined,
    advancePerGroup: tournament.advancePerGroup ?? undefined,
  });
  // Courts go to whatever can be played immediately: a knockout's round 1, or
  // every group-stage and round-robin match in the first scheduling round.
  const firstRound = Math.min(...bracket.map((m) => m.round));
  const withCourts = bracket.map((m) =>
    m.round === firstRound ? { ...m, court: courtForIndex(m.index, tournament.courts) } : m,
  );
```

leaving the `supabase.rpc("start_tournament", ...)` call unchanged — `bracketMatchToRow` now carries the routing fields automatically.

5. Extend `finishBracketMatch`:

```ts
/** Record a bracket-cell winner: advance the bracket via atomic RPC.
 *  `fills` carries seeding-gate results for groups → knockout; every other
 *  format passes none and hits identical behaviour. */
export async function finishBracketMatch(
  bracketMatchId: string, winnerEntrant: string, fills: SlotFill[] = [],
): Promise<void> {
  if (!supabase) throw new Error("Sign in to record a result");
  const { error } = await supabase.rpc("finish_bracket_match", {
    p_bracket_match_id: bracketMatchId, p_winner_entrant: winnerEntrant,
    p_slot_fills: fills,
  });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 5: Update the cache write**

In `src/repos/tournamentCache.ts`, replace the hardcoded `'single_elim'` with a bound parameter and add the new columns to both inserts:

```ts
    await db.runAsync(
      `insert into tournaments
         (id, club_id, name, format, size, status, created_at,
          match_type, bestof, finals_bestof, courts, group_count, advance_per_group)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      t.id, t.clubId, t.name, t.format, t.size, t.status, t.createdAt,
      t.matchType, t.bestOf, t.finalsBestOf, t.courts, t.groupCount, t.advancePerGroup
    );
```

and for `bracket_matches`, add the seven routing columns to the column list and
bind `r.win_to_match_id, r.win_to_slot, r.loss_to_match_id, r.loss_to_slot, r.group_idx, r.src_a, r.src_b`.

Do the same for the read in `readTournamentCore` — select the new columns explicitly if it names columns, and extend `TournamentCore`'s tournament shape in `src/tournament/bundle.ts` with `format`, `groupCount`, `advancePerGroup`.

- [ ] **Step 6: Extend `rpcToFull`**

In `src/tournament/bundle.ts`, add to the `tournament` object:

```ts
      format: ((t.format as FormatId) ?? "single_elim"),
      groupCount: (t.group_count as number) ?? null,
      advancePerGroup: (t.advance_per_group as number) ?? null,
```

`tournament_full_view` already returns bracket rows via `to_jsonb(b.*)`, so the routing columns arrive without a server-side change, and `rpcToFull` reads named keys so old payloads missing them map to null.

- [ ] **Step 7: Run the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: clean. Fix any `createTournament` or `startBlocker` call site the new parameters broke — they are all in `app/(app)/tournaments/`.

- [ ] **Step 8: Commit**

```bash
git add src/repos/tournamentRepo.ts src/repos/tournamentCache.ts \
        src/tournament/bundle.ts src/tournament/draw.ts \
        tests/tournament.startBlocker.test.ts tests/tournamentRepo.test.ts
git commit -m "$(cat <<'EOF'
feat(tournaments): wire the format engine through the repo layer

createTournament takes a format, startTournament builds through the chosen
generator, finishBracketMatch forwards seeding-gate fills, and startBlocker
carries per-format minimums so the Start button and the server guard still
cannot disagree. Format defaults to single_elim everywhere a row predates 0053.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Create screen — match type rename, format picker, live estimate

**Files:**
- Modify: `app/(app)/tournaments/new.tsx`
- Create: `src/components/FormatPicker.tsx`
- Test: `tests/formatPicker.test.tsx` (create)

**Interfaces:**
- Consumes: `FORMATS`, `formatEstimate`, `formatDuration`, `startBlocker`, `createTournament`.
- Produces: `<FormatPicker value onPick entrants bestOf courts groupSize advancePerGroup onGroupSize onAdvance />`.

- [ ] **Step 1: Write the failing test**

Create `tests/formatPicker.test.tsx`. Check how existing component tests in this repo render (look at any `tests/*.test.tsx`); if none exist, assert on a pure helper instead and move the copy logic into `src/tournament/estimate.ts`:

```tsx
import { render } from "@testing-library/react-native";
import FormatPicker from "../src/components/FormatPicker";

const noop = () => {};

test("shows every format with its blurb", () => {
  const { getByText } = render(
    <FormatPicker value="single_elim" onPick={noop} entrants={8} bestOf={3} courts={4}
      groupSize={4} advancePerGroup={2} onGroupSize={noop} onAdvance={noop} />);
  getByText("Knockout");
  getByText("Lose once, you're out");
  getByText("Round-robin");
  getByText("Everyone plays everyone");
  getByText("Double elimination");
  getByText("Groups → knockout");
});

test("a long option is flagged and names the cheaper one", () => {
  const { getByText } = render(
    <FormatPicker value="single_elim" onPick={noop} entrants={16} bestOf={3} courts={4}
      groupSize={4} advancePerGroup={2} onGroupSize={noop} onAdvance={noop} />);
  getByText(/120 matches/);
  getByText(/Long for one night/);
});

test("group controls appear only for groups → knockout", () => {
  const hidden = render(
    <FormatPicker value="round_robin" onPick={noop} entrants={12} bestOf={3} courts={4}
      groupSize={4} advancePerGroup={2} onGroupSize={noop} onAdvance={noop} />);
  expect(hidden.queryByText(/top 2 advance/)).toBeNull();

  const shown = render(
    <FormatPicker value="groups_knockout" onPick={noop} entrants={12} bestOf={3} courts={4}
      groupSize={4} advancePerGroup={2} onGroupSize={noop} onAdvance={noop} />);
  shown.getByText(/3 groups of 4, top 2 advance/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/formatPicker.test.tsx`
Expected: FAIL — cannot resolve `FormatPicker`.

- [ ] **Step 3: Build `FormatPicker`**

Create `src/components/FormatPicker.tsx`. Follow the styling already in `new.tsx` — import `C`, `F`, `press`, `selected`, `selectedText` from `src/theme` and match the `Segmented` and `s.h` idiom rather than inventing new visual language. Structure:

```tsx
// One row per format: label, blurb, and a live "≈ N matches · ~Xh" computed
// from the current entrant and court counts.
//
// The estimate is the anti-confusion mechanism. Four formats on one screen is
// only safe if an unplayable choice LOOKS unplayable before the host commits —
// otherwise they find out a 16-player round-robin is 120 matches after starting
// it. Above LONG_THRESHOLD_MINUTES the row is flagged and names the cheaper
// option by its own estimate.
```

For each `Object.values(FORMATS)`:
- `label` and `blurb` from the module.
- `formatEstimate(mod, entrants, bestOf, courts, { groupSize, advancePerGroup })` for the numbers, rendered as `≈ ${matches} matches · ${formatDuration(minutes)} on ${courts} courts`.
- When `long`, render the warning line: find the non-long format with the smallest `minutes` and show `Long for one night — ${other.label} finishes in about ${formatDuration(other.minutes)}.`
- `accessibilityRole="radio"`, `accessibilityState={{ selected: value === mod.id }}`, and `accessibilityLabel` combining label, blurb and estimate so the row reads as one thing.

When `value === "groups_knockout"`, render below the list: a `Segmented` for group size (3/4/5), a `Segmented` for advance (1/2), and a derived plain-text line
`${count} groups of ${size}, top ${advance} advance → ${count * advance} in the knockout`.
`count` is `Math.max(1, Math.round(entrants / size))`. Never ask for the group count.

- [ ] **Step 4: Wire it into `new.tsx`**

1. **Rename the existing control.** Line 156, `<Text style={s.h}>Format</Text>` above the singles/doubles `Segmented`, becomes `<Text style={s.h}>Match type</Text>`. That word is now taken, and `match_type` is what the column has been called since `0012`.
2. Add state: `const [format, setFormat] = useState<FormatId>("single_elim");` plus `groupSize` (4) and `advancePerGroup` (2).
3. Render `<FormatPicker …/>` under the match-type control.
4. Replace the draw line at 176 — `{entrantCount} → {drawSizeFor(entrantCount)} draw` — with the chosen format's estimate, so the entrants tab and the config tab agree.
5. Pass `format` through to `startBlocker(picked.length, matchType, format)` at line 52 and to `createTournament(...)` at line 70 as the new trailing arguments.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest tests/formatPicker.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 6: Verify on device**

Run the app. On the create screen confirm: the first control now reads **Match type**; four format rows render with live numbers; changing the entrant count changes every row's estimate; selecting Groups → knockout reveals exactly two extra controls and the derived line; a 16-entrant round-robin shows the warning.

- [ ] **Step 7: Run the full suite, then commit**

Run: `npx tsc --noEmit && npm test`

```bash
git add app/\(app\)/tournaments/new.tsx src/components/FormatPicker.tsx \
        tests/formatPicker.test.tsx
git commit -m "$(cat <<'EOF'
feat(tournaments): format picker with a live cost estimate

Renames the singles/doubles control to "Match type" — that label said "Format",
which is now the actual format's name and the worst available confusion.

Each format row shows a live match count and duration from the current entrant
and court counts, and a long option is flagged with the cheaper alternative
named. Four choices are only safe if an unplayable one looks unplayable before
the host commits.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Rendering — standings table and format-aware view

**Files:**
- Create: `src/components/StandingsTable.tsx`
- Create: `src/components/TournamentView.tsx`
- Modify: `app/(app)/tournaments/[id].tsx`
- Modify: `app/join/tournament/[id]/spectator.tsx`
- Test: `tests/standingsTable.test.tsx` (create)

**Interfaces:**
- Consumes: `FORMATS`, `formatOrDefault`, `recordStandings`, `settleGroups`, `BracketView`, `Standing`.
- Produces: `<StandingsTable standings entrants onPressEntrant? />`, `<TournamentView format bracket entrants onCellPress liveScores />`.

- [ ] **Step 1: Write the failing test**

Create `tests/standingsTable.test.tsx`:

```tsx
import { render } from "@testing-library/react-native";
import StandingsTable from "../src/components/StandingsTable";
import type { Standing } from "../src/tournament/formats/types";
import type { Entrant } from "../src/tournament/types";

const entrants: Entrant[] = [
  { id: "e1", clubPlayerId: "p1", name: "Ana", seed: 1, partnerClubPlayerId: null },
  { id: "e2", clubPlayerId: "p2", name: "Bo", seed: 2, partnerClubPlayerId: null },
];
const standings: Standing[] = [
  { entrantId: "e1", rank: 1, played: 2, wins: 2, losses: 0, gameDiff: 3, pointDiff: 20, tied: false },
  { entrantId: "e2", rank: 2, played: 2, wins: 1, losses: 1, gameDiff: 0, pointDiff: 2, tied: false },
];

test("shows rank, name and record", () => {
  const { getByText } = render(<StandingsTable standings={standings} entrants={entrants} />);
  getByText("Ana");
  getByText("2–0");
  getByText("Bo");
  getByText("1–1");
});

test("level entrants are marked as level, not silently ordered", () => {
  const tied = standings.map((s) => ({ ...s, tied: true }));
  const { getAllByLabelText } = render(<StandingsTable standings={tied} entrants={entrants} />);
  expect(getAllByLabelText(/level/i).length).toBe(2);
});

test("an entrant with no standing row does not crash the table", () => {
  const { queryByText } = render(
    <StandingsTable standings={[standings[0]]} entrants={entrants} />);
  queryByText("Ana");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/standingsTable.test.tsx`
Expected: FAIL — cannot resolve `StandingsTable`.

- [ ] **Step 3: Build `StandingsTable`**

Create `src/components/StandingsTable.tsx`. Columns: rank, name, `W–L`, game difference (signed, `+3` / `−1`). Style with `C` / `F` from `src/theme` and `CarvedCard` to match the surrounding screens.

For a row with `tied: true`, render a small "level" marker and give the row `accessibilityLabel` ending in `"level with the next player"`. The order is total so every device agrees, but a split that came from seed or id is not a sporting result and must not be presented as one.

- [ ] **Step 4: Add the awaiting-gate slot label**

A knockout slot whose group has not finished currently renders as an empty cell,
which reads as a bug. Give it a name.

In `src/tournament/bracketLabel.ts` — a plain `.ts` module precisely so it is
unit testable, per its own header comment — add:

```ts
const ORDINAL = ["", "1st", "2nd", "3rd", "4th"];

/**
 * Human name for a knockout slot the seeding gate has not filled yet.
 * 'G1#2' becomes "2nd, Group B". Returns null for a slot with no source token,
 * which is every format except groups → knockout.
 */
export function srcSlotLabel(token: string | null): string | null {
  const m = token ? /^G(\d+)#(\d+)$/.exec(token) : null;
  if (!m) return null;
  const rank = Number(m[2]);
  return `${ORDINAL[rank] ?? `${rank}th`}, Group ${String.fromCharCode(65 + Number(m[1]))}`;
}
```

and use it in `bracketCellLabel`'s final branch, so the accessibility label
matches what is drawn:

```ts
  // Falls through to "Empty match slot" for every format that has no gate.
  return srcSlotLabel(srcA) ?? srcSlotLabel(srcB) ?? "Empty match slot";
```

widening `bracketCellLabel`'s first parameter to
`Pick<BracketMatch, "entrantA" | "entrantB" | "winnerEntrant" | "srcA" | "srcB">`.
Add to `tests/tournament.bracketLabel.test.ts` (or create it):

```ts
test("a slot awaiting its group is named, not blank", () => {
  expect(srcSlotLabel("G1#2")).toBe("2nd, Group B");
  expect(srcSlotLabel("G0#1")).toBe("1st, Group A");
  expect(srcSlotLabel(null)).toBeNull();
  expect(srcSlotLabel("nonsense")).toBeNull();
});
```

`BracketView` reads the same helper when a cell has no entrant, so the drawn
text and the spoken label cannot disagree.

- [ ] **Step 5: Build `TournamentView`**

Create `src/components/TournamentView.tsx`:

```tsx
import { Text, View } from "react-native";
import BracketView, { type BracketLiveScore } from "./BracketView";
import StandingsTable from "./StandingsTable";
import { formatOrDefault } from "../tournament/formats";
import type { BracketMatch, Entrant, FormatId } from "../tournament/types";

// Picks a renderer by format. BracketView stays a pure tree renderer and gains
// no format knowledge — everything that is not a tree is handled here, so
// adding a format later touches this file and not that one.
type Props = {
  format: FormatId;
  bracket: BracketMatch[];
  entrants: Entrant[];
  onCellPress: (cell: BracketMatch) => void;
  liveScores?: BracketLiveScore[];
};

export default function TournamentView({ format, bracket, entrants, onCellPress, liveScores }: Props) {
  const mod = formatOrDefault(format);
  const tree = (rows: BracketMatch[]) => (
    <BracketView bracket={rows} entrants={entrants} onCellPress={onCellPress} liveScores={liveScores} />
  );

  if (format === "round_robin") {
    return <StandingsTable standings={mod.standings(bracket, entrants)} entrants={entrants} />;
  }

  if (format === "groups_knockout") {
    const groups = [...new Set(bracket.map((m) => m.groupIdx))]
      .filter((g): g is number => g !== null).sort((a, b) => a - b);
    const knockout = bracket.filter((m) => m.groupIdx === null);
    return (
      <View>
        {groups.map((g) => {
          const rows = bracket.filter((m) => m.groupIdx === g);
          const ids = new Set(rows.flatMap((m) => [m.entrantA, m.entrantB]));
          const inGroup = entrants.filter((e) => ids.has(e.id));
          return (
            <View key={g}>
              <Text accessibilityRole="header">{`GROUP ${String.fromCharCode(65 + g)}`}</Text>
              <StandingsTable standings={mod.standings(rows, inGroup)} entrants={inGroup} />
            </View>
          );
        })}
        {knockout.length > 0 ? tree(knockout) : null}
      </View>
    );
  }

  if (format === "double_elim") {
    // The winners bracket is the tree that reaches the grand final by win
    // edges from round 1; everything numbered above it is the losers bracket.
    // Rounds are one ascending axis by construction (see doubleElim.build).
    const rounds = [...new Set(bracket.map((m) => m.round))].sort((a, b) => a - b);
    const wMax = Math.max(...bracket.filter((m) => m.lossToMatchId !== null).map((m) => m.round), rounds[0]);
    return (
      <View>
        <Text accessibilityRole="header">WINNERS</Text>
        {tree(bracket.filter((m) => m.round <= wMax))}
        <Text accessibilityRole="header">LOSERS</Text>
        {tree(bracket.filter((m) => m.round > wMax))}
      </View>
    );
  }

  return tree(bracket);
}
```

Style the headings with `C` / `F` from `src/theme` to match `roundName`'s
existing column headings rather than introducing new typography.

- [ ] **Step 6: Wire the detail screen**

In `app/(app)/tournaments/[id].tsx`:

1. Replace `<BracketView …/>` at line 368 with `<TournamentView format={tournament.format} …/>`, forwarding the same props.
2. Replace `bracketStatus(bracket).champion` at line 218 with `formatOrDefault(tournament?.format).status(bracket).champion`.
3. In the handler that calls `finishBracketMatch`, compute gate fills first and pass them:

```tsx
const fills = settleGroups(advanceWinner(bracket, cellId, winner), entrants);
await finishBracketMatch(cellId, winner, fills);
```

Running `settleGroups` over the **post-advance** bracket matters: the gate must see the result that just completed the group. For every format other than `groups_knockout` it returns `[]` and the call is unchanged.

- [ ] **Step 7: Wire the spectator screen**

In `app/join/tournament/[id]/spectator.tsx`, swap `BracketView` for `TournamentView`, passing the format from the payload. Every format becomes spectatable with no further change.

- [ ] **Step 8: Run the tests**

Run: `npx jest tests/standingsTable.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 9: Run everything**

Run: `npx tsc --noEmit && npm test`
Expected: clean, all pass, including Task 2's regression pin.

- [ ] **Step 10: Verify on device — the offline check that matters**

This is the check the whole design rests on and it cannot be automated:

1. Create an 8-entrant round-robin. Put the phone in airplane mode. Score every match. Confirm standings update offline and the champion resolves.
2. Create a 12-entrant groups → knockout on **two** phones signed into the same club. Put both in airplane mode. Score the same group's matches on both. Reconnect both.
3. Both must show the **same standings** and the **same knockout draw**. If they differ, `recordStandings` is not a total order — stop and fix it before release.
4. Score the knockout to completion; confirm the champion card appears.
5. Open the spectator link for each format and confirm it renders.

- [ ] **Step 11: Commit**

```bash
git add src/components/StandingsTable.tsx src/components/TournamentView.tsx \
        app/\(app\)/tournaments/\[id\].tsx app/join/tournament/\[id\]/spectator.tsx \
        tests/standingsTable.test.tsx \n        src/tournament/bracketLabel.ts tests/tournament.bracketLabel.test.ts
git commit -m "$(cat <<'EOF'
feat(tournaments): standings table and format-aware rendering

BracketView stays a pure tree renderer; TournamentView picks by format and
handles everything that is not a tree. The detail screen computes seeding-gate
fills over the post-advance bracket and forwards them, so a group completing
seeds the knockout in the same round trip.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 12: Refresh the knowledge graph**

```bash
graphify update .
```

---

## Done when

- `npm test` is green, including `tests/tournament.singleElimRegression.test.ts`.
- `npx tsc --noEmit` is clean.
- An existing single-elimination tournament created before 0053 still advances and still shows its champion.
- The two-phone offline groups → knockout check in Task 12 Step 10 produces identical draws.
- `0053` is applied to production and the two verification queries in Task 9 Step 5 return what that step says they should.
