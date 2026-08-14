# Mobile UX Refinement — Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the seven correctness findings in spec §5 (H4, H5, M6, P2, P6, P12, P17) — a dead-looking tournament tab, a wrong club stat, a raw-text match detail screen, an inconsistent empty-state rule, a mislabeled draw-size card, a data-loss bug in match setup, and a tab that restores the wrong stack — without touching colour, layout system, or anything Phase 4/5/6 own.

**Architecture:** Every finding gets a pure, Jest-testable module under `src/lib/` where the fix is arithmetic or data selection, and a minimal screen/component edit that calls it. Two findings (H4, P12) are diagnosed differently than the spec's original text once the current code was read — both corrections are recorded inline in this plan's task, the way spec §4a corrects §4. No Supabase migration is needed anywhere in this phase: H5's SQL risk (spec §11) evaporates because the matches/games counts were already fixed by a sync feature (`8a3c895`..`cadaf9b`) that landed after the audit; only the "players" number needed a code fix, and it's a same-device roster read.

**Tech Stack:** Expo SDK 54, React Native 0.81.5, TypeScript 5.9, expo-router ~6.0.24 (Tabs built on `@react-navigation/native` ^7, already in `node_modules` as a transitive dependency — no new install), Supabase JS client, Jest 29 + ts-jest. **No new dependency is added by this plan.**

**Spec:** `docs/superpowers/specs/2026-08-13-mobile-ux-refinement-design.md` — §5 is the scope, §9 and §11 bind every phase.
**Audit baseline:** `docs/audit/2026-08-12-ux-audit/AUDIT.md` — H4 (line 79), H5 (84), M6 (135), P2 (180), P6 (184), P12 (190), P17 (195).
**Prior phase:** `docs/superpowers/plans/2026-08-13-mobile-ux-phase-2.md` (merged to `master` at `2de1a11`; this plan branches from there).

## Two corrections to the spec, found reading the current code

**H4.** Spec §context says "`TournamentConfigTab` early-returns at line 101 on `!isAdmin || !isDraft`... the `BottomPanel` opens with empty content." Reading `src/components/TournamentConfigTab.tsx:101-116` today, that branch renders the tournament name, a courts/best-of summary, and two share buttons — not empty. `TournamentPlayersTab` always renders at least the entrant/draw/byes line. The one branch that **is** genuinely empty: `src/components/TournamentScorersTab.tsx` renders nothing at all — no share button (admin-only), no staff rows (empty array), no requests section (admin-only) — for a **non-admin member on a tournament with no scorers assigned yet**. That is the real remaining "dead button." The rest of H4 (Ops button doing nothing) was closed in Phase 2 Task 9, which gave the Ops route a real header; whether the panel itself now visibly opens for Config/Players/Scorers is a claim from stale code reading and gets verified on-device in Task 1 before anything is called done.

**P12.** The existing roster-fill effect (`app/new-match.tsx:110-124`) already guards `n.trim() ? n : players[i]?.name ?? ""` — it does not overwrite a slot that has any text in it, and has since commit `6db6414`, which predates the audit. Statically this should already prevent the loss the audit describes. Task 6 reproduces the audit's exact repro first; if it still reproduces, the fix is a `touchedSlots` flag (a slot the user has ever typed into is never auto-filled again, closing an edge case the trim-check can't: a user who **clears** a slot back to empty on purpose currently gets it silently re-filled from the roster). If it does not reproduce, the finding is recorded closed-by-prior-work with evidence, per the "measure before fixing" lesson from Phase 2.

## Global Constraints

- **Findings closed by this plan:** H4, H5, M6, P2, P6, P12, P17 (spec §5, §12).
- **No migration.** H5 needs no `supabase/migrations/` file — confirmed in Task 2. If any task's on-device verification turns up a genuine server-side data problem, stop and report; do not write a migration file unattended (spec §11, project hard constraint).
- **Test environment is node-only.** `jest.config.js` sets `testEnvironment: "node"`, `roots: ["<rootDir>/tests"]`. No `react-test-renderer`, no `@testing-library/react-native`. Logic that needs a test is extracted into `src/lib/` as a pure function; component behaviour is verified on-device via mobile-mcp in Task 8.
- **`MatchEvent` and `src/engine/types.ts` are read-only in this phase.** M6 reads `MatchEvent[]` via the existing `loadEvents()`; it adds no new event variant.
- **Commit with explicit pathspec.** Never `git add -A`, `git add .`, or `git commit -a`. No `Co-Authored-By` trailer.
- **Existing code style:** double-quoted strings, 2-space indent, `StyleSheet.create` assigned to a const named `s`, comments explain *why* not *what*.
- Run `npx tsc --noEmit` before every commit. It must pass.
- Do not repaint anything for colour reasons and do not touch the 8pt spacing/design-token work — that is Phase 4.

---

## Workspace

Create an isolated worktree before Task 1, via the `superpowers:using-git-worktrees` skill, branched from `master` at `2de1a11`:

```bash
git worktree add .claude/worktrees/mobile-ux-phase-3 -b mobile-ux-phase-3 master
```

The worktree has no `node_modules` and no `.env` (both gitignored). Metro cannot bundle without them:

```bash
cmd //c "mklink /J node_modules ..\..\..\node_modules"
```

Then copy `.env` from the main checkout. When the worktree is later removed, delete the junction with `cmd //c "rmdir .claude\worktrees\mobile-ux-phase-3\node_modules"` — never `rm -rf` it.

## File Structure

**Created:**
- `src/lib/clubHeaderStats.ts` — none; the fix is a one-line JSX data-source swap, not new logic (see Task 2). Test instead covers the boundary condition directly against `getClubStats`.
- `src/lib/matchDetail.ts` — pure date/duration/status/rally-timeline formatting for match detail.
- `src/lib/winRate.ts` — the one win-rate-or-dash rule, shared by Home and Profile.
- `src/lib/entrantLabel.ts` — pure entrant-count pluralisation.
- `src/lib/matchLineup.ts` — pure "which slots may auto-fill" logic for new-match's roster prefill.
- `src/lib/tabReset.ts` — pure "does this tab's nested stack need resetting" check.
- `tests/clubStats.test.ts`, `tests/matchDetail.test.ts`, `tests/winRate.test.ts`, `tests/entrantLabel.test.ts`, `tests/matchLineup.test.ts`, `tests/tabReset.test.ts`
- `docs/audit/verify/phase-3/` — verification evidence and its README.

**Modified:**
- `src/components/TournamentScorersTab.tsx` — real empty state (H4).
- `app/(app)/clubs/[id].tsx` — club header players stat (H5).
- `app/(app)/matches/[id].tsx` — formatted date/duration/status, rally timeline (M6).
- `src/home/dashboard.ts` — `statTileValues` refactored onto the shared `winRate.ts` rule (P2).
- `app/(app)/profile/index.tsx` — Win % uses the shared rule (P2).
- `src/repos/tournamentRepo.ts` — `listAllTournaments` fetches entrant counts (P6).
- `app/(app)/tournaments/index.tsx` — card shows entrant count, not draw size (P6).
- `app/new-match.tsx` — touched-slot tracking (P12, only if Task 6 reproduces the loss).
- `app/(app)/_layout.tsx` — tab-press reset listener on the Cups tab (P17).

---

# H4 — DEAD-LOOKING TOURNAMENT TOOLS

---

### Task 1: Measure, then close the Scorers tab's real empty state

**Files:**
- Modify: `src/components/TournamentScorersTab.tsx:63-71` (root render)

**Interfaces:**
- Consumes: existing props `isAdmin: boolean`, `staff: TournamentStaff[]`, `requests: TournamentJoinRequest[]`.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Reproduce the audit's exact repro on device, as both roles**

Bring up the environment:

```bash
adb reverse tcp:8081 tcp:8081
```

```bash
npx expo start --dev-client --port 8081
```

If mobile-mcp reports no device, recover with `adb kill-server && adb start-server` (AUDIT.md §7).

Sign in as the account the audit used (owner/admin of a club with a **live** tournament — the same one Phase 2 verified against). Open Cups → the live tournament → tap **Config**, then **Players**, then **Scorers**. For each: does the `BottomPanel` visibly open? Is there content in it, or is it blank? Screenshot each. This is the admin case.

Then, if a second, non-admin account/device is available, repeat for **Scorers** specifically as a non-admin on a tournament with no staff assigned yet. If a second account is not available, reason from the code instead (Step 2) and note in the Task 8 verification write-up that the non-admin path was not device-verified, only read-verified.

- [ ] **Step 2: Record what closed already**

`src/components/TournamentConfigTab.tsx:101-116` (the `!isAdmin || !isDraft` branch) renders the tournament name, a courts/best-of summary line, and two share buttons. `src/components/TournamentPlayersTab.tsx:105-142` always renders the `"{entrants.length} entrants → {draw} draw, {byes} byes"` line plus one row per entrant. Neither is empty for any role. If Step 1 confirms both open with that content, Config and Players need no code change — record them closed by Phase 0-2's incidental refactors, not by this task, per the "measure before fixing" lesson (spec's Phase 2 §4a note on the M8 glow).

The one branch with nothing in it: `src/components/TournamentScorersTab.tsx:63-71`. For a **non-admin** viewer (no share button — admin-only at line 65) on a tournament with **zero staff** (`staff.map` renders nothing) and **zero pending requests visible to them** (the requests section is admin-gated at line 84), the `<View style={s.root}>` renders literally nothing. That is a real dead-looking panel and it is this task's fix.

- [ ] **Step 3: Add the empty state**

In `src/components/TournamentScorersTab.tsx`, after the `staff.map(...)` block (currently ending at line 82) and before the admin-only pending-requests block (currently starting at line 84), add:

```typescript
      {staff.length === 0 && !isAdmin ? (
        <Text style={s.empty}>No scorers assigned yet.</Text>
      ) : null}
```

Add the style to the `StyleSheet.create` block:

```typescript
  empty: { color: C.text2, fontFamily: F.body, fontSize: 14, textAlign: "center", paddingVertical: 16 },
```

An admin with zero staff still sees the "Share scorer link" button above this, so the gate is `!isAdmin` — an admin's panel was never empty.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Verify on device**

If a non-admin account is available: open the Scorers panel on a live tournament with no staff as that account. Expected: "No scorers assigned yet." instead of a blank sheet.

If not available, this step is a read-verification only — note that in Task 8.

- [ ] **Step 6: Commit**

```bash
git add src/components/TournamentScorersTab.tsx
git commit -m "fix(tournaments): give the Scorers panel a real empty state

Audit H4. A non-admin viewer of a tournament with no scorers assigned saw
a completely blank BottomPanel — no share button (admin-only), no staff
rows, no requests section (admin-only) — which reads as the button doing
nothing. Config and Players were already non-empty by the time this was
read; Scorers was the one panel with nothing in it."
```

---

# H5 — CLUB HEADER STAT

---

### Task 2: Club header shows roster size, not match-participant count

The header's \`players\` stat currently reads \`stats?.players.length\` — \`SessionStats.players\` (`src/repos/sessionRepo.ts:204-226`) is built only from **completed matches with a recorded winner**; a club with three members and zero finished matches has an empty \`players\` array. That is audit H5's "0 players" against a 3-member roster. The \`matches\`/\`games\` counters use the same \`SessionStats\`, sourced from \`listMatchesForClub\` (`src/repos/matchRepo.ts:186-193`, a plain \`club_id = ?\` query) — and a pull-sync feature landed **after** the audit (commits \`8a3c895\`, \`053ad20\`, \`cadaf9b\`, dated 2026-08-13) specifically to stop a club's local \`matches\` table from being empty for anyone who didn't personally score every match. That already fixes the \`matches\`/\`games\` half; this task verifies that and fixes the \`players\` half, which the sync feature does not touch.

**Files:**
- Modify: `app/(app)/clubs/[id].tsx:1-33` (imports, state, reload), `:107-111` (stat row)
- Test: `tests/clubStats.test.ts`

**Interfaces:**
- Consumes: `listPlayers(clubId)` from `src/repos/clubRepo.ts:152` (already exported, already used by `clubs/players/[id].tsx`).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Write the regression test for the boundary condition**

Create `tests/clubStats.test.ts`:

```typescript
const listMatchesForClub = jest.fn();
jest.mock("../src/repos/matchRepo", () => ({
  listMatchesForClub: (...a: unknown[]) => listMatchesForClub(...a),
}));

import { getClubStats } from "../src/repos/sessionRepo";
import type { MatchRecord } from "../src/repos/matchRepo";

beforeEach(() => {
  listMatchesForClub.mockReset();
});

test("a club with members but zero completed matches reports an empty players array", async () => {
  // This is audit H5's exact shape: SessionStats.players is derived from
  // completed matches with a recorded winner, not from club membership. A
  // 3-member club with no finished matches legitimately has players: [].
  // The UI must not read this array for a roster-size stat — it must read
  // the club's player roster instead (see clubs/[id].tsx).
  listMatchesForClub.mockResolvedValue([]);

  const stats = await getClubStats("club-1");

  expect(stats.matchCount).toBe(0);
  expect(stats.gameCount).toBe(0);
  expect(stats.players).toEqual([]);
});

test("matchCount and gameCount count every completed match regardless of winner", async () => {
  const matches: MatchRecord[] = [
    {
      id: "m1", club_id: "club-1", session_id: null, config: {} as MatchRecord["config"],
      side_a: [{ club_player_id: null, name: "A" }], side_b: [{ club_player_id: null, name: "B" }],
      status: "completed", winner: "A", score_summary: { games: [{ A: 21, B: 10 }, { A: 21, B: 15 }] }, created_at: 1,
    },
    {
      id: "m2", club_id: "club-1", session_id: null, config: {} as MatchRecord["config"],
      side_a: [{ club_player_id: null, name: "A" }], side_b: [{ club_player_id: null, name: "B" }],
      status: "live", winner: null, score_summary: null, created_at: 2,
    },
  ];
  listMatchesForClub.mockResolvedValue(matches);

  const stats = await getClubStats("club-1");

  // Only the completed match counts; the live one is excluded, matching the
  // header's "matches" and "games" tiles.
  expect(stats.matchCount).toBe(1);
  expect(stats.gameCount).toBe(2);
});
```

- [ ] **Step 2: Run test to verify it passes against current code**

Run: `npx jest tests/clubStats.test.ts`
Expected: PASS, 2 tests. `getClubStats`'s `matches`/`games` arithmetic is already correct; this test documents and pins that, and pins the `players` boundary the next step's UI fix depends on.

- [ ] **Step 3: Fetch the roster in the club detail screen**

In `app/(app)/clubs/[id].tsx`, add `listPlayers` and `ClubPlayer` to the existing `clubRepo` import at line 4:

```typescript
import { deleteClub, getClub, leaveClub, listPlayers, type Club, type ClubPlayer } from "../../../src/repos/clubRepo";
```

Add a `roster` state beside `stats` at line 24:

```typescript
  const [roster, setRoster] = useState<ClubPlayer[]>([]);
```

In `reload` (lines 29-33), fetch it alongside `stats`:

```typescript
  const reload = useCallback(async () => {
    if (!id) return;
    setClub(await getClub(id));
    setStats(await getClubStats(id));
    setRoster(await listPlayers(id));
  }, [id]);
```

- [ ] **Step 4: Use the roster count for the "players" tile**

At line 110, replace:

```typescript
              <View style={s.statBox}><Text style={s.statNum}>{stats?.players.length ?? 0}</Text><Text style={s.statLbl}>players</Text></View>
```

with:

```typescript
              {/* Roster size, not stats.players.length — that array is built
                  from completed matches with a recorded winner, so a club
                  with members but no finished matches would read 0 players
                  against a real roster (audit H5). */}
              <View style={s.statBox}><Text style={s.statNum}>{roster.length}</Text><Text style={s.statLbl}>players</Text></View>
```

The leaderboard `FlatList` below (`data={stats?.players ?? []}`) is unchanged — ranking by match history is correct there.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Verify on device**

Open the `Weekend` club (the audit's fixture club, still present per `docs/audit/verify/phase-1/README.md`). Expected: the players tile reads **3** (Soham Deo, UtkarshAgrawal, Utki, per the audit's `18-club-manage-players.png`), and the matches/games tiles are non-zero given the fixture match. If matches/games still read 0, the pull-sync fix has a gap this task did not anticipate — stop and report; do not write a migration to patch it (Global Constraints, spec §11).

- [ ] **Step 7: Commit**

```bash
git add app/\(app\)/clubs/\[id\].tsx tests/clubStats.test.ts
git commit -m "fix(clubs): show roster size in the club header, not match participants

Audit H5. The 'players' tile read stats.players.length, an array built
from completed matches with a recorded winner — a club with members but
no finished matches legitimately has zero of those, so a 3-member roster
showed 0 players. matches/games were already fixed by the sync-pull
feature that landed after the audit; only the players count needed a
code change, and it needs no migration."
```

---

# M6 — MATCH DETAIL

---

### Task 3: Pure match-detail formatting — date, duration, status, rally timeline

**Files:**
- Create: `src/lib/matchDetail.ts`
- Test: `tests/matchDetail.test.ts`

**Interfaces:**
- Consumes: `MatchEvent`, `TeamId` from `src/engine`; `formatElapsed` from `src/lib/elapsed.ts` (Phase 2, already on `master`) is consumed by Task 4's screen code directly, not re-exported here.
- Produces: `formatMatchDate(ms: number): string`, `matchDurationMs(events: MatchEvent[]): number`, `formatMatchStatus(status: "live" | "completed" | "forfeited"): string`, `type RallyTimelineGame = { game: number; rallies: TeamId[] }`, `buildRallyTimeline(events: MatchEvent[]): RallyTimelineGame[]`. Task 4 consumes all four.

- [ ] **Step 1: Write the failing test**

Create `tests/matchDetail.test.ts`:

```typescript
import {
  buildRallyTimeline,
  formatMatchDate,
  formatMatchStatus,
  matchDurationMs,
} from "../src/lib/matchDetail";
import type { MatchConfig, MatchEvent } from "../src/engine";

describe("formatMatchDate", () => {
  it("formats a local calendar date without depending on ICU locale data", () => {
    // Noon UTC keeps this away from a midnight boundary in most timezones.
    const noonUtc = Date.UTC(2026, 7, 12, 12, 0, 0); // Aug 12, 2026
    expect(formatMatchDate(noonUtc)).toMatch(/^Aug 12, 2026$/);
  });
});

describe("formatMatchStatus", () => {
  it("capitalizes the raw enum value", () => {
    expect(formatMatchStatus("completed")).toBe("Completed");
    expect(formatMatchStatus("live")).toBe("Live");
    expect(formatMatchStatus("forfeited")).toBe("Forfeited");
  });
});

describe("matchDurationMs", () => {
  it("is the gap between the first and last event", () => {
    const events: MatchEvent[] = [
      { type: "MATCH_STARTED", config: {} as MatchConfig, at: 1_000 },
      { type: "RALLY_WON", by: "A", at: 5_000 },
      { type: "RALLY_WON", by: "B", at: 9_500 },
    ];
    expect(matchDurationMs(events)).toBe(8_500);
  });

  it("is zero for an empty event list", () => {
    expect(matchDurationMs([])).toBe(0);
  });

  it("never returns a negative value", () => {
    // Defensive against corrupted/out-of-order event logs, same posture as
    // elapsedMs in src/lib/elapsed.ts.
    const events: MatchEvent[] = [
      { type: "MATCH_STARTED", config: {} as MatchConfig, at: 9_000 },
      { type: "RALLY_WON", by: "A", at: 1_000 },
    ];
    expect(matchDurationMs(events)).toBe(0);
  });
});

describe("buildRallyTimeline", () => {
  it("groups rallies by game, starting from game 1", () => {
    const events: MatchEvent[] = [
      { type: "MATCH_STARTED", config: {} as MatchConfig, at: 0 },
      { type: "RALLY_WON", by: "A", at: 1 },
      { type: "RALLY_WON", by: "A", at: 2 },
      { type: "RALLY_WON", by: "B", at: 3 },
      { type: "GAME_STARTED", at: 4 },
      { type: "RALLY_WON", by: "B", at: 5 },
    ];
    expect(buildRallyTimeline(events)).toEqual([
      { game: 1, rallies: ["A", "A", "B"] },
      { game: 2, rallies: ["B"] },
    ]);
  });

  it("drops a trailing empty game (e.g. GAME_STARTED fired but no rally logged yet)", () => {
    const events: MatchEvent[] = [
      { type: "MATCH_STARTED", config: {} as MatchConfig, at: 0 },
      { type: "RALLY_WON", by: "A", at: 1 },
      { type: "GAME_STARTED", at: 2 },
    ];
    expect(buildRallyTimeline(events)).toEqual([{ game: 1, rallies: ["A"] }]);
  });

  it("returns an empty array for a match with no rallies yet", () => {
    const events: MatchEvent[] = [
      { type: "MATCH_STARTED", config: {} as MatchConfig, at: 0 },
    ];
    expect(buildRallyTimeline(events)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/matchDetail.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/matchDetail'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/matchDetail.ts`:

```typescript
import type { MatchEvent, TeamId } from "../engine";

/**
 * Match-detail formatting, pulled out of app/(app)/matches/[id].tsx so it can
 * be unit-tested in the node-only Jest environment.
 *
 * Audit M6: the screen showed "Total rallies: 1" and "Status: completed" as
 * raw key-value strings, with no date, no duration, and no rally-by-rally
 * view despite Home advertising "rally history".
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Local calendar date, spelled out manually rather than via
 *  toLocaleDateString: the latter depends on the runtime's ICU data, which
 *  makes a pure-function test non-deterministic across environments. */
export function formatMatchDate(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function formatMatchStatus(status: "live" | "completed" | "forfeited"): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** Wall-clock span from the first logged event to the last. Feed the result
 *  to formatElapsed (src/lib/elapsed.ts) for a HH:MM:SS string — this module
 *  does not duplicate that formatter. */
export function matchDurationMs(events: MatchEvent[]): number {
  if (events.length === 0) return 0;
  const ms = events[events.length - 1].at - events[0].at;
  return ms > 0 ? ms : 0;
}

export type RallyTimelineGame = { game: number; rallies: TeamId[] };

/** Rally winners grouped by game, in play order — the "rally history" Home
 *  promises. A game with zero logged rallies (a GAME_STARTED with nothing
 *  after it) is dropped rather than shown as an empty row. */
export function buildRallyTimeline(events: MatchEvent[]): RallyTimelineGame[] {
  const games: RallyTimelineGame[] = [{ game: 1, rallies: [] }];
  for (const e of events) {
    if (e.type === "RALLY_WON") {
      games[games.length - 1].rallies.push(e.by);
    } else if (e.type === "GAME_STARTED") {
      games.push({ game: games.length + 1, rallies: [] });
    }
  }
  return games.filter((g) => g.rallies.length > 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/matchDetail.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
```

```bash
git add src/lib/matchDetail.ts tests/matchDetail.test.ts
git commit -m "feat(match): add pure date/duration/status/rally-timeline formatting"
```

---

### Task 4: Apply formatted match detail to the screen

**Files:**
- Modify: `app/(app)/matches/[id].tsx:1-11` (imports), `:19-23` (data load), `:43-48` (meta card render), `:70-86` (styles)

**Interfaces:**
- Consumes: `formatMatchDate`, `formatMatchStatus`, `matchDurationMs`, `buildRallyTimeline`, `type RallyTimelineGame` from Task 3; `formatElapsed` from `src/lib/elapsed.ts`; `loadEvents` from `src/repos/matchRepo.ts:67` (already exported, not currently imported here).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Load the raw event log alongside the replayed state**

In `app/(app)/matches/[id].tsx`, extend the `matchRepo` import at line 4:

```typescript
import { getMatch, loadEvents, MatchRecord, replayMatch } from "../../../src/repos/matchRepo";
```

Add the new imports beside it:

```typescript
import type { MatchEvent } from "../../../src/engine";
import { formatElapsed } from "../../../src/lib/elapsed";
import {
  buildRallyTimeline,
  formatMatchDate,
  formatMatchStatus,
  matchDurationMs,
} from "../../../src/lib/matchDetail";
```

Add an `events` state beside `state` at line 16, and load it in the existing effect (lines 19-23):

```typescript
  const [events, setEvents] = useState<MatchEvent[]>([]);
```

```typescript
  useEffect(() => {
    if (!id) return;
    getMatch(id).then(setMatch);
    replayMatch(id).then(setState);
    loadEvents(id).then(setEvents);
  }, [id]);
```

- [ ] **Step 2: Replace the raw meta card**

Replace the block at lines 43-48:

```typescript
      {state && (
        <View style={s.card}>
          <Text style={s.meta}>Total rallies: {state.rallies.length + state.gameHistory.reduce((n, g) => n + g.score.A + g.score.B, 0)}</Text>
          <Text style={s.meta}>Status: {match.status}</Text>
        </View>
      )}
```

with:

```typescript
      <View style={s.card}>
        <Text style={s.meta}>{formatMatchDate(match.created_at)} · {formatMatchStatus(match.status)}</Text>
        {events.length > 0 && (
          <Text style={s.meta}>Duration {formatElapsed(matchDurationMs(events))}</Text>
        )}
      </View>

      {timeline.length > 0 && (
        <View style={s.card}>
          <Text style={s.timelineTitle}>Rally history</Text>
          {timeline.map((g) => (
            <View key={g.game} style={s.timelineRow}>
              <Text style={s.timelineGame}>Game {g.game}</Text>
              <View style={s.timelineDots}>
                {g.rallies.map((t, i) => (
                  <View key={i} style={[s.timelineDot, { backgroundColor: t === "A" ? C.red : C.blue }]} />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
```

`state` no longer gates the meta card — `match.created_at` and `match.status` come straight off the `MatchRecord`, so the date/status line renders even before the replay resolves. The duration line still needs `events`.

- [ ] **Step 3: Derive the timeline**

Above the `return` statement (after `const onShare = ...` at line 28), add:

```typescript
  const timeline = buildRallyTimeline(events);
```

- [ ] **Step 4: Add the styles**

In the `StyleSheet.create` block, add beside `meta` (line 82):

```typescript
  timelineTitle: { color: C.text, fontSize: 14, fontFamily: F.semibold, marginBottom: 6 },
  timelineRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  timelineGame: { color: C.text2, fontSize: 13, width: 56 },
  timelineDots: { flexDirection: "row", flexWrap: "wrap", gap: 4, flex: 1 },
  timelineDot: { width: 8, height: 8, borderRadius: 4 },
```

`timelineDot`'s size and the red/blue-by-team convention match `MatchScreen.tsx`'s live `rallyDot` (`src/screens/MatchScreen.tsx:525`), so a rally dot means the same thing whether the match is live or being reviewed afterward.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Verify on device**

Open a completed match from Matches (the audit's fixture `Ut / UtkarshAgrawal 1 – 0 Utki / Soham Deo` works). Expected:
- A line reading a real date and "Completed", not `Status: completed`.
- A "Duration" line with a plausible `HH:MM:SS` (Phase 2's `formatElapsed` — a match a few minutes long should not read `00:00:0X`).
- A "Rally history" card with one row per game, each a strip of red/blue dots.

Compare against `33-match-detail.png`.

- [ ] **Step 7: Commit**

```bash
git add app/\(app\)/matches/\[id\].tsx
git commit -m "fix(matches): replace raw match-detail text with formatted date, duration and a rally timeline

Closes audit M6. 'Total rallies: 1' and 'Status: completed' were raw
key-value strings with no date or duration, and there was no rally
history despite Home advertising it."
```

---

# P2 — EMPTY-STATE PARITY

---

### Task 5: One win-rate-or-dash rule, shared by Home and Profile

Home's `statTileValues` (`src/home/dashboard.ts:82-95`) already has the right rule: below `MIN_MATCHES_FOR_RATES` (5) completed matches, win rate shows `"—"`, not a misleading percentage — "0%" reads as "you lose every game," not "not enough data." Profile's Win % stat (`app/(app)/profile/index.tsx:395`) reads `` `${a?.winPct ?? 0}%` `` unconditionally, so it shows literally `"0%"` for the same under-5-matches case, including zero matches. This task extracts Home's rule into a function both screens call, rather than inventing a second rule.

**Files:**
- Create: `src/lib/winRate.ts`
- Modify: `src/home/dashboard.ts:82-95` (refactor onto the shared rule), `app/(app)/profile/index.tsx:1-14` (import), `:395` (render)
- Test: `tests/winRate.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `MIN_MATCHES_FOR_RATES: number`, `formatWinRate(played: number, winPct: number): string`. Both `dashboard.ts` and `profile/index.tsx` consume both.

- [ ] **Step 1: Write the failing test**

Create `tests/winRate.test.ts`:

```typescript
import { formatWinRate, MIN_MATCHES_FOR_RATES } from "../src/lib/winRate";

describe("formatWinRate", () => {
  it("is an em dash below the minimum sample size", () => {
    // Audit P2: Home showed "—" and Profile showed "0%" for the same
    // zero-match condition. This is the one rule both must use.
    expect(formatWinRate(0, 0)).toBe("—");
  });

  it("is an em dash just below the threshold", () => {
    expect(formatWinRate(MIN_MATCHES_FOR_RATES - 1, 100)).toBe("—");
  });

  it("is a real percentage at the threshold", () => {
    expect(formatWinRate(MIN_MATCHES_FOR_RATES, 40)).toBe("40%");
  });

  it("is a real percentage well above the threshold", () => {
    expect(formatWinRate(50, 0)).toBe("0%");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/winRate.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/winRate'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/winRate.ts`:

```typescript
/**
 * The one win-rate-display rule, shared by Home and Profile.
 *
 * Audit P2: Home showed "—" below MIN_MATCHES_FOR_RATES completed matches
 * (win rate is meaningless on a handful of games), Profile showed "0%" for
 * the same condition — "0%" reads as "you lose every game," not "not
 * enough data yet." One rule, applied to both (spec section 5).
 */
export const MIN_MATCHES_FOR_RATES = 5;

export function formatWinRate(played: number, winPct: number): string {
  return played < MIN_MATCHES_FOR_RATES ? "—" : `${winPct}%`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/winRate.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Refactor Home onto the shared rule**

In `src/home/dashboard.ts`, replace the local threshold with the shared one. Add the import beside the existing type-only imports at the top:

```typescript
import { formatWinRate, MIN_MATCHES_FOR_RATES } from "../lib/winRate";
```

Remove the local `export const MIN_MATCHES_FOR_RATES = 5;` block (lines 10-16, including its comment — the comment moves to `winRate.ts`, already written there in Step 3) and change `statTileValues` (lines 82-95) to:

```typescript
export function statTileValues(analytics: PlayerAnalytics | null): {
  matches: string; winRate: string; streak: string; hasRates: boolean;
} {
  const played = analytics?.played ?? 0;
  const hasRates = played >= MIN_MATCHES_FOR_RATES;
  return {
    matches: String(played),
    winRate: formatWinRate(played, analytics?.winPct ?? 0),
    streak: hasRates ? String(analytics!.longestWinStreak) : "—",
    hasRates,
  };
}
```

This is behaviourally identical to the original — same threshold, same em dash, same fields — just routed through the shared function instead of a private inline check.

- [ ] **Step 6: Apply the shared rule to Profile**

In `app/(app)/profile/index.tsx`, add the import beside the existing ones:

```typescript
import { formatWinRate } from "../../../src/lib/winRate";
```

At line 395, replace:

```typescript
        <Stat label="Win %" value={`${a?.winPct ?? 0}%`} accent />
```

with:

```typescript
        <Stat label="Win %" value={formatWinRate(a?.played ?? 0, a?.winPct ?? 0)} accent />
```

- [ ] **Step 7: Run the full suite and typecheck**

```bash
npx jest tests/winRate.test.ts tests/homeDashboard.test.ts
```

Expected: both PASS — `homeDashboard.test.ts` covers `statTileValues` and must still pass unchanged, since Step 5 preserves its behaviour.

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Verify on device**

Open Profile for an account with 0-4 completed matches (a fresh guest or a rarely-used account). Expected: Win % reads `—`, matching Home's Win Rate tile for the same account. Compare `01-home.png` and `13-profile.png`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/winRate.ts tests/winRate.test.ts src/home/dashboard.ts app/\(app\)/profile/index.tsx
git commit -m "fix(profile): apply Home's win-rate-or-dash rule to Profile too

Closes audit P2. Home showed em dash below 5 completed matches; Profile
showed 0% for the same condition, which reads as 'you lose every game'
rather than 'not enough data'. Extracted into one shared rule."
```

---

# P6 — CUPS CARD SHOWS DRAW SIZE, NOT ENTRANT COUNT

---

### Task 6: List tournaments with their entrant count, not their bracket size

`app/(app)/tournaments/index.tsx:66` renders `` `${item.size}-player` ``. `TournamentRow.size` (`src/repos/tournamentRepo.ts:21`) is the **bracket draw size** — the next power of two, set when the tournament starts (`0` while still a draft) — not the number of entrants. The audit's example: a tournament with 6 entrants draws an 8-slot bracket and shows "8-player"; a fresh draft with 0 entrants shows "0-player."

**Files:**
- Create: `src/lib/entrantLabel.ts`
- Modify: `src/repos/tournamentRepo.ts:232-262` (`TournamentListRow`, `listAllTournaments`), `app/(app)/tournaments/index.tsx:1-8` (imports), `:64-67` (card render)
- Test: `tests/entrantLabel.test.ts`

**Interfaces:**
- Consumes: nothing new — `listAllTournaments` already queries Supabase directly.
- Produces: `formatEntrantLabel(count: number): string` from `src/lib/entrantLabel.ts`; `TournamentListRow` gains `entrantCount: number`.

- [ ] **Step 1: Write the failing test for the label**

Create `tests/entrantLabel.test.ts`:

```typescript
import { formatEntrantLabel } from "../src/lib/entrantLabel";

describe("formatEntrantLabel", () => {
  it("is grammatical at zero", () => {
    // Audit P6: an empty draft read as "0-player", which is also awkward
    // grammar on top of being the wrong number.
    expect(formatEntrantLabel(0)).toBe("0 entrants");
  });

  it("is singular at one", () => {
    expect(formatEntrantLabel(1)).toBe("1 entrant");
  });

  it("is plural above one", () => {
    expect(formatEntrantLabel(6)).toBe("6 entrants");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/entrantLabel.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/entrantLabel'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/entrantLabel.ts`:

```typescript
/**
 * Audit P6: the Cups list showed "{size}-player", where size is the drawn
 * bracket's power-of-two slot count (8 for 6 entrants, 0-player for an empty
 * draft) rather than how many people are actually in the tournament.
 */
export function formatEntrantLabel(count: number): string {
  return `${count} entrant${count === 1 ? "" : "s"}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/entrantLabel.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Fetch entrant counts in `listAllTournaments`**

In `src/repos/tournamentRepo.ts`, change `TournamentListRow` (line 232) to:

```typescript
export type TournamentListRow = TournamentRow & { clubName: string; entrantCount: number };
```

Replace `listAllTournaments` (lines 243-262):

```typescript
export async function listAllTournaments(): Promise<TournamentListRow[]> {
  if (!supabase) return [];
  const clubs = await listClubs();
  if (clubs.length === 0) return [];
  const nameOf = new Map(clubs.map((c) => [c.id, c.personal ? "" : c.name]));
  const { data, error } = await supabase
    .from("tournaments")
    .select("*")
    .in("club_id", clubs.map((c) => c.id))
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []).map((row) => toTournamentRow(row as Record<string, unknown>));

  // One extra query for every tournament's entrant count, rather than one
  // per row: a row-per-tournament loop would turn a Cups tab with a dozen
  // tournaments into a dozen round trips.
  const counts = new Map<string, number>();
  if (rows.length > 0) {
    const { data: entrantRows, error: eErr } = await supabase
      .from("tournament_entrants")
      .select("tournament_id")
      .in("tournament_id", rows.map((t) => t.id));
    if (eErr) throw new Error(eErr.message);
    for (const r of entrantRows ?? []) {
      const tid = (r as { tournament_id: string }).tournament_id;
      counts.set(tid, (counts.get(tid) ?? 0) + 1);
    }
  }

  return rows.map((t) => ({
    ...t,
    clubName: nameOf.get(t.clubId) ?? "",
    entrantCount: counts.get(t.id) ?? 0,
  }));
}
```

- [ ] **Step 6: Render the entrant count on the card**

In `app/(app)/tournaments/index.tsx`, add the import beside the existing ones:

```typescript
import { formatEntrantLabel } from "../../../src/lib/entrantLabel";
```

At lines 64-67, replace:

```typescript
                <Text style={s.meta}>
                  {item.clubName ? `${item.clubName} · ` : ""}
                  {item.size}-player
                </Text>
```

with:

```typescript
                <Text style={s.meta}>
                  {item.clubName ? `${item.clubName} · ` : ""}
                  {formatEntrantLabel(item.entrantCount)}
                </Text>
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Verify on device**

Open Cups. Expected: a tournament with 6 entrants (drawing an 8-slot bracket) reads "6 entrants", not "8-player"; an empty draft reads "0 entrants", not "0-player". Compare `06-cups.png` and `08-tournament-players.png`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/entrantLabel.ts tests/entrantLabel.test.ts src/repos/tournamentRepo.ts app/\(app\)/tournaments/index.tsx
git commit -m "fix(tournaments): show entrant count on the Cups card, not draw size

Closes audit P6. TournamentRow.size is the power-of-two bracket slot
count set at start (6 entrants draws 8, an empty draft is 0), not how
many people are in the tournament. Also fixes the '0-player' grammar."
```

---

# P12 — SAVE-SCOPE SWITCH AND TYPED NAMES

---

### Task 7: Reproduce first; fix only if it still reproduces

The roster-fill effect at `app/new-match.tsx:110-124` already guards `n.trim() ? n : players[i]?.name ?? ""`, which should already prevent overwriting a slot with real text in it, and has since before the audit (commit `6db6414`). This task reproduces the audit's exact steps first, per the measure-before-fixing lesson (Phase 2 §4a).

**Files:**
- Create (only if Step 2 reproduces the bug): `src/lib/matchLineup.ts`
- Modify (only if Step 2 reproduces the bug): `app/new-match.tsx:39-40` (state), `:110-124` (fill effect), `:161-162` (`setNameAt`)
- Test (only if Step 2 reproduces the bug): `tests/matchLineup.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (only if the fix is needed): `fillEmptySlots(prev: string[], touched: boolean[], players: { name: string }[]): string[]` from `src/lib/matchLineup.ts`.

- [ ] **Step 1: Bring up the environment**

```bash
adb reverse tcp:8081 tcp:8081
```

```bash
npx expo start --dev-client --port 8081
```

- [ ] **Step 2: Reproduce the audit's exact repro**

Open New match with **Personal** as the save scope (default). Type "Ut" into Player 1. Leave Players 2 and 3 empty. Switch save scope to a club with roster members via `ClubPicker`. Screenshot. This is the audit's `22`→`24` sequence.

**Then repeat with a variant the guard's logic can't cover:** type "Ut" into Player 1, and also type real names into Players 2 and 3 (e.g. "Test2", "Test3"). Switch save scope to a club. Screenshot.

**Then a third variant:** switch to a club, let the roster auto-fill Players 2 and 3, then manually clear Player 2's text back to empty (backspace to nothing), then switch to a *different* club.

- [ ] **Step 3: Branch on what happened**

**If variants 1 and 2 both preserved every typed name** (only ever-empty slots got auto-filled) — the existing guard already closes the bug as described. Skip to Step 8 and record it closed by prior work, with the three screenshots as evidence. No code change.

**If variant 3 showed the deliberately-cleared slot silently repopulated** — that's a real edge case the trim-check can't see (empty is empty, whether the user left it that way or put it there on purpose), and is the residual bug worth fixing even if variants 1/2 are already closed. Continue to Step 4.

**If variant 1 or 2 lost typed text** — the guard is not preventing what it appears to prevent (a build discrepancy from what this plan read, or a code path this plan did not find). Continue to Step 4 regardless of which cause; the fix in Step 4 covers both by construction.

- [ ] **Step 4: Write the failing test**

Create `tests/matchLineup.test.ts`:

```typescript
import { fillEmptySlots } from "../src/lib/matchLineup";

describe("fillEmptySlots", () => {
  it("fills a slot that was never touched", () => {
    const result = fillEmptySlots(["", "", "", ""], [false, false, false, false], [
      { name: "Alice" }, { name: "Bob" }, { name: "Carol" }, { name: "Dan" },
    ]);
    expect(result).toEqual(["Alice", "Bob", "Carol", "Dan"]);
  });

  it("never overwrites a touched slot, even if the user cleared it back to empty", () => {
    // The trim-based guard this replaces could not distinguish "never typed
    // into" from "typed into, then deleted" — both look like "". Audit P12.
    const result = fillEmptySlots(["Ut", "", "", ""], [true, true, false, false], [
      { name: "Alice" }, { name: "Bob" }, { name: "Carol" }, { name: "Dan" },
    ]);
    expect(result).toEqual(["Ut", "", "Carol", "Dan"]);
  });

  it("leaves a slot with no roster player at that index empty", () => {
    const result = fillEmptySlots(["", ""], [false, false], [{ name: "Alice" }]);
    expect(result).toEqual(["Alice", ""]);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx jest tests/matchLineup.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/matchLineup'`

- [ ] **Step 6: Write the implementation and wire it in**

Create `src/lib/matchLineup.ts`:

```typescript
/**
 * Which player-name slots a club-roster switch is allowed to auto-fill.
 *
 * Audit P12: switching save-scope from Personal to a club silently
 * overwrote typed player names. The previous guard treated "empty after
 * trim" as "safe to fill," which cannot tell "the user never touched this
 * slot" apart from "the user typed here, then deleted it" — both are "".
 * `touched` makes that distinction explicit and permanent: once true for a
 * slot, no later roster switch may write to it.
 */
export function fillEmptySlots(
  prev: string[],
  touched: boolean[],
  players: { name: string }[]
): string[] {
  return prev.map((n, i) => (touched[i] ? n : players[i]?.name ?? n));
}
```

In `app/new-match.tsx`, add a `touched` state beside `namesDoubles`/`namesSingles` at line 40:

```typescript
  const [touchedDoubles, setTouchedDoubles] = useState<boolean[]>([false, false, false, false]);
  const [touchedSingles, setTouchedSingles] = useState<boolean[]>([false, false]);
  const touched = doubles ? touchedDoubles : touchedSingles;
  const setTouched = doubles ? setTouchedDoubles : setTouchedSingles;
```

Import `fillEmptySlots` beside the other `src/lib` imports:

```typescript
import { fillEmptySlots } from "../src/lib/matchLineup";
```

Replace the fill effect's `setNames` call at line 117:

```typescript
        setNames((prev) => prev.map((n, i) => (n.trim() ? n : players[i]?.name ?? "")));
```

with:

```typescript
        setNames((prev) => fillEmptySlots(prev, touched, players));
```

Update `setNameAt` (lines 161-162) to mark the slot touched the moment the user types in it, including typing back to empty:

```typescript
  const setNameAt = (index: number, text: string) => {
    setNames((prev) => prev.map((n, i) => (i === index ? text : n)));
    setTouched((prev) => prev.map((t, i) => (i === index ? true : t)));
  };
```

Reset `touched` alongside the names arrays in the lineup-restore effect (the same place `setNamesDoubles`/`setNamesSingles` are called at lines 69-70), so a restored-from-storage lineup starts with a clean slate rather than permanently locking every slot from the previous session:

```typescript
      setNamesDoubles(init.namesDoubles);
      setNamesSingles(init.namesSingles);
      setTouchedDoubles([false, false, false, false]);
      setTouchedSingles([false, false]);
```

- [ ] **Step 7: Run test, typecheck, verify on device**

```bash
npx jest tests/matchLineup.test.ts
```

Expected: PASS, 3 tests.

```bash
npx tsc --noEmit
```

Expected: PASS.

Reload Metro and repeat all three device variants from Step 2. Expected: typed names are preserved in every variant, including the deliberately-cleared slot.

- [ ] **Step 8: Commit**

If Step 3 found the bug already closed:

```bash
git add tests/matchLineup.test.ts
```

(only if a test file was still worth keeping as a regression guard — otherwise there is nothing to commit; say so and move on to Task 8).

If Step 3 required the fix:

```bash
git add src/lib/matchLineup.ts tests/matchLineup.test.ts app/new-match.tsx
git commit -m "fix(new-match): never let a club-roster switch overwrite a touched slot

Closes audit P12. The previous guard treated an empty (post-trim) slot as
safe to auto-fill from the newly-selected club's roster, which cannot
distinguish 'never typed into' from 'typed into, then cleared' — both
read as empty. touched[] makes that permanent once a user edits a slot."
```

---

# P17 — TAB RE-TAP RESTORES THE WRONG STACK

---

### Task 8: Re-tapping the Cups tab resets to the tournament list

**Decision (resolved during planning, not left to spec ambiguity):** re-tapping an already-active tab pops that tab's stack to root. This is the standard iOS/Android tab convention and matches what the audit itself expected ("the tab has no reset-to-root on re-tap"). The alternative — restoring the previous deep stack — is what the app does today and is what the audit is reporting as wrong.

**Files:**
- Create: `src/lib/tabReset.ts`
- Modify: `app/(app)/_layout.tsx:1-6` (imports), `:30` (Cups `Tabs.Screen`)
- Test: `tests/tabReset.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `shouldResetTabStack(nestedStackIndex: number | undefined): boolean`.

- [ ] **Step 1: Write the failing test**

Create `tests/tabReset.test.ts`:

```typescript
import { shouldResetTabStack } from "../src/lib/tabReset";

describe("shouldResetTabStack", () => {
  it("does not reset a stack already at its root", () => {
    expect(shouldResetTabStack(0)).toBe(false);
  });

  it("resets a stack that is anywhere deeper than root", () => {
    expect(shouldResetTabStack(1)).toBe(true);
    expect(shouldResetTabStack(3)).toBe(true);
  });

  it("does not reset a tab that has never been navigated into", () => {
    // expo-router's nested Stack state is undefined before the tab's first
    // visit — that is root, not "unknown, so reset defensively".
    expect(shouldResetTabStack(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/tabReset.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/tabReset'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/tabReset.ts`:

```typescript
/**
 * Whether re-tapping an already-focused tab should pop its nested stack back
 * to root. Audit P17: the Cups tab restored its previous deep stack (the
 * Bracket screen) on re-tap instead of returning to the tournament list —
 * the standard iOS/Android convention, and what the audit itself expected.
 */
export function shouldResetTabStack(nestedStackIndex: number | undefined): boolean {
  return (nestedStackIndex ?? 0) > 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/tabReset.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Wire the listener onto the Cups tab**

In `app/(app)/_layout.tsx`, add the imports:

```typescript
import { CommonActions, type NavigationState, type PartialState } from "@react-navigation/native";
import { shouldResetTabStack } from "../../src/lib/tabReset";
```

Replace the `tournaments` `Tabs.Screen` at line 30:

```typescript
      <Tabs.Screen
        name="tournaments"
        options={{ title: "Cups", tabBarIcon: icon("trophy"), headerShown: false }}
        listeners={({ navigation, route }) => ({
          tabPress: (e) => {
            const state = navigation.getState();
            const tabRoute = state.routes.find((r) => r.name === route.name);
            const isFocused = tabRoute ? state.index === state.routes.indexOf(tabRoute) : false;
            const nested = tabRoute?.state as
              | NavigationState
              | PartialState<NavigationState>
              | undefined;
            if (isFocused && shouldResetTabStack(nested?.index)) {
              e.preventDefault();
              const firstRouteName = nested?.routes?.[0]?.name;
              if (!firstRouteName || !nested) return;
              navigation.dispatch({
                ...CommonActions.reset({ index: 0, routes: [{ name: firstRouteName }] }),
                target: nested.key,
              });
            }
          },
        })}
      />
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. If `@react-navigation/native` types are not resolvable, confirm it is present at `node_modules/@react-navigation/native` (it is a transitive dependency of `expo-router`, already installed, not a new package) — if the import genuinely cannot resolve, fall back to typing `nested` as the minimal local shape `{ index?: number; key: string; routes: { name: string }[] } | undefined` instead of importing `NavigationState`/`PartialState`, and drop the `@react-navigation/native` import to just `CommonActions`.

- [ ] **Step 7: Verify on device**

Reload Metro. Open Cups → a tournament → drill into its Bracket (matching the audit's screenshot 35 sequence), **without switching tabs away**. While still looking at the Bracket screen, tap the **Cups** tab button again — this is the re-tap the `isFocused` check is built for: it fires the reset only when the tab you're tapping is the one you're already on. Expected: lands on the **tournament list**, not the Bracket screen.

Separately confirm the deep stack survives an ordinary tab switch, which is deliberately *not* reset: drill into a Bracket again, switch to Home, then tap Cups to return. Expected: lands back on the **Bracket screen**, unchanged — switching tabs and back is not a re-tap of the active tab, so it must not reset. (This is the opposite of what an earlier draft of this step said; standard iOS/Android convention resets only on a genuine re-tap of the tab you're currently on, not on returning to a tab from elsewhere — see the Decision note above.)

Then tap **Cups** again while already on the tournament list (not deep) — expected: no visible change, still the list (the `isFocused` + `index > 0` guard means this is a no-op, not a forced reload).

- [ ] **Step 8: Commit**

```bash
git add src/lib/tabReset.ts tests/tabReset.test.ts app/\(app\)/_layout.tsx
git commit -m "fix(tabs): pop the Cups tab to its list on re-tap

Closes audit P17. Re-tapping Cups while deep in a tournament's Bracket
screen restored that deep stack instead of returning to the tournament
list, with no way back to the list except the back gesture. Standard
iOS/Android tab convention is pop-to-root on re-tap of the active tab."
```

---

# VERIFICATION

---

### Task 9: Phase 3 verification re-audit

A phase is done when every finding it claims has a paired before/after (spec §10). A finding that did not fully close is a fact to record, not a failure to hide (per this plan's own H4/P12 corrections).

**Files:**
- Create: `docs/audit/verify/phase-3/` and its contents.

- [ ] **Step 1: Bring the environment up**

```bash
adb reverse tcp:8081 tcp:8081
```

```bash
npx expo start --dev-client --port 8081
```

If mobile-mcp reports no device, recover with `adb kill-server && adb start-server`.

- [ ] **Step 2: Check the audit's leftover test data**

Per `docs/audit/verify/phase-1/README.md` and `phase-2/README.md`, the `Weekend` club's fixture match and the free-text player `Ut` are retained. Confirm they are still present (Task 2 depends on the `Weekend` club having exactly the audit's 3-member roster) and do the same thing here.

- [ ] **Step 3: Capture the evidence**

Into `docs/audit/verify/phase-3/`, named after the baseline each answers:

| Finding | Baseline | Capture as | Passes when |
|---|---|---|---|
| H4 | `09-tournament-config.png`, `10-tournament-scorers.png`, `11-tournament-ops.png` | `h4-config.png`, `h4-players.png`, `h4-scorers-admin.png`, `h4-scorers-empty.png` | Config/Players/Scorers panels all show visible content for an admin; the empty-staff case shows "No scorers assigned yet." rather than a blank sheet |
| H5 | `17-club-detail.png`, `18-club-manage-players.png` | `h5-club-detail.png` | `Weekend` club header reads 3 players against the same roster `18-club-manage-players.png` shows, and non-zero matches/games |
| M6 | `33-match-detail.png` | `m6-match-detail.png` | Date, formatted status, duration, and a rally-history timeline are all visible; no raw `Status: completed` string remains |
| P2 | `01-home.png`, `13-profile.png` | `p2-profile-dash.png` | Profile's Win % reads `—` for an account under 5 completed matches, matching Home's Win Rate tile |
| P6 | `06-cups.png`, `08-tournament-players.png` | `p6-cups.png` | Cards read "N entrants", not "N-player" or "0-player" |
| P12 | (no screenshot — `22`→`24` referenced) | `p12-variant1.png`, `p12-variant2.png`, `p12-variant3.png` | All three reproduction variants from Task 7 preserve typed/touched names across a save-scope switch |
| P17 | (no screenshot — `35` referenced) | `p17-before-retap.png`, `p17-after-retap.png` | Re-tapping Cups from a deep Bracket screen lands on the tournament list |

- [ ] **Step 4: Write the verification note**

Create `docs/audit/verify/phase-3/README.md` listing each finding, its baseline, its capture, and pass/fail. Record explicitly:

- Whether H4's Config/Players panels needed any code change, or were already closed by prior refactors (Task 1 Step 2's reading), with the device evidence that confirms or overturns that reading.
- Whether P12 reproduced at all, and if so which variant (1, 2, or 3) — this determines whether `src/lib/matchLineup.ts` exists in the final diff or the task closed with no code change.
- Confirmation that H5's matches/games counts were already correct pre-Task-2 (i.e., the sync-pull fix alone was sufficient for those two, and only `players` needed a code change).
- Anything that did not close, and why.

- [ ] **Step 5: Run the full suite**

```bash
npx jest
```

```bash
npx tsc --noEmit
```

Expected: both PASS. The suite now includes `clubStats`, `matchDetail`, `winRate`, `entrantLabel`, `tabReset`, and — if Task 7 needed it — `matchLineup`, alongside everything from Phases 0-2.

- [ ] **Step 6: Commit**

```bash
git add docs/audit/verify/phase-3
git commit -m "docs(audit): verify phase 3 closes H4, H5, M6, P2, P6, P12, P17"
```

---

## Not in this plan

**H4's Config and Players panels**, if Task 1's device check confirms they already render content for an admin — closed by incidental refactors during Phases 0-2, not by new work in this phase, and recorded as such rather than claimed as this phase's fix.

**P12's fix module**, if Task 7's three reproduction variants all pass against the existing trim-based guard — recorded closed by prior work (commit `6db6414`, which predates the audit), with the reproduction screenshots as the evidence a static reading alone cannot provide.

**Everything else in spec §5's sibling phases** — Phase 4 (design language: M1-M3, M9, P8-P9, P14-P16, H7), Phase 5 (UX states and content: M5, M7, P1, P3, P5, P7, P10-P11, P13, P18), Phase 6 (accessibility sweep: A1-A3, A5-A6, A8) — untouched, per spec §11's "keep Phase 4 attributable" ordering.
