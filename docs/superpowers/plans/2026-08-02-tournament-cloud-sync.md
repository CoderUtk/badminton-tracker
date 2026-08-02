# Tournament Cloud Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move tournament structure (metadata, entrants, bracket cells) from local-SQLite-only to Supabase, so a tournament is visible to every device/account in the club, and bracket advancement is race-free under real concurrency.

**Architecture:** `tournamentRepo.ts` drops all local-SQLite reads/writes for tournament structure and talks to Supabase directly (no cache), mirroring `profileRepo.ts`/`membershipRepo.ts`. Starting a bracket match pushes its underlying `matches` row to Supabase synchronously (required by a foreign key), while point-by-point scoring inside that match stays exactly as offline-capable as today. Finishing a bracket match becomes a single atomic RPC that updates only the specific column two concurrent sibling matches would otherwise race on.

**Tech Stack:** Expo SDK 54, Supabase (Postgres + RLS), Jest. No new dependencies.

## Global Constraints

- `src/engine/*` untouched.
- No new dependencies.
- No local cache for tournament structure — every tournament read/write requires a connection. Point-by-point scoring inside an already-started match is unaffected and stays offline-capable.
- `bracket.ts`'s pure `buildBracket`/`bracketStatus`/`advanceWinner` are not modified — only *how* advancement is persisted changes (server RPC instead of client read-diff-write). `advanceWinner` itself becomes unused by `tournamentRepo.ts` after this plan but is not deleted — it's still exported pure logic another caller could use.
- Clean cutover: no migration of tournaments/entrants/bracket cells already sitting in local SQLite from earlier testing.
- Existing RLS on `tournaments`/`tournament_entrants`/`bracket_matches` (`is_club_member` for read/insert/update) is reused unchanged — this plan does not tighten who can create, browse, or advance a tournament.
- Gate every task on `npx tsc --noEmit && npm test`.

## Global Constraints — user-provided

`supabase/migrations/0006_tournament_sync.sql` must be applied by the user in the Supabase SQL Editor (or `supabase db push`) before Tasks 2–4 work end-to-end. Two-account manual verification (create a tournament, start a bracket match, finish it, confirm the other account sees the advance; finish two sibling semifinals in quick succession and confirm the final shows both entrants) happens after implementation — it cannot be done from this environment. `0005_profile_age_hand.sql` (a separate, already-planned migration) must be applied first if not already — this plan's migration is numbered `0006` assuming that ordering.

---

## Task 1: Schema migration — missing columns + atomic advance RPC

**Files:**
- Create: `supabase/migrations/0006_tournament_sync.sql`

**Interfaces:**
- Produces (callable via `supabase.rpc`): `finish_bracket_match(p_bracket_match_id uuid, p_winner_entrant uuid) -> void`

- [ ] **Step 1: Write the migration.**

```sql
-- supabase/migrations/0006_tournament_sync.sql
-- Adds the Phase-2 tournament columns that exist locally but never reached
-- the server, plus the atomic RPC that advances a bracket cell's winner into
-- its parent cell without a client-side read-modify-write race.

alter table public.tournaments add column if not exists match_type text not null default 'singles';
alter table public.tournaments add column if not exists bestof int not null default 3;
alter table public.tournaments add column if not exists finals_bestof int not null default 3;
alter table public.tournament_entrants add column if not exists club_player_id_2 uuid references public.club_players (id) on delete set null;

-- Single-elimination bracket math is purely positional: a cell at (round, idx)
-- feeds parent cell (round+1, idx/2), landing in entrant_a when idx is even,
-- entrant_b when odd — verified against src/tournament/bracket.ts's
-- advanceWinner, which uses the identical Math.floor(idx/2) + idx%2 rule.
-- Updating only that one column (never the whole row) is what makes two
-- sibling matches finishing seconds apart race-free: neither statement reads
-- the other's column before writing.
create or replace function public.finish_bracket_match(p_bracket_match_id uuid, p_winner_entrant uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tournament_id uuid;
  v_round int;
  v_idx int;
  v_entrant_a uuid;
  v_entrant_b uuid;
  v_club_id uuid;
  v_max_round int;
  v_parent_round int;
  v_parent_idx int;
begin
  select tournament_id, round, idx, entrant_a, entrant_b
    into v_tournament_id, v_round, v_idx, v_entrant_a, v_entrant_b
    from bracket_matches where id = p_bracket_match_id;
  if v_tournament_id is null then
    raise exception 'Bracket match not found';
  end if;

  select club_id into v_club_id from tournaments where id = v_tournament_id;
  if not is_club_member(v_club_id) then
    raise exception 'Not a member of this tournament''s club';
  end if;
  if p_winner_entrant is distinct from v_entrant_a and p_winner_entrant is distinct from v_entrant_b then
    raise exception 'Winner is not one of this match''s entrants';
  end if;

  update bracket_matches set winner_entrant = p_winner_entrant where id = p_bracket_match_id;

  select max(round) into v_max_round from bracket_matches where tournament_id = v_tournament_id;
  if v_round = v_max_round then
    update tournaments set status = 'done' where id = v_tournament_id;
    return;
  end if;

  v_parent_round := v_round + 1;
  v_parent_idx := v_idx / 2;

  if v_idx % 2 = 0 then
    update bracket_matches set entrant_a = p_winner_entrant
      where tournament_id = v_tournament_id and round = v_parent_round and idx = v_parent_idx;
  else
    update bracket_matches set entrant_b = p_winner_entrant
      where tournament_id = v_tournament_id and round = v_parent_round and idx = v_parent_idx;
  end if;

  update tournaments set status = 'live' where id = v_tournament_id;
end $$;
```

- [ ] **Step 2: Apply it.**

Paste the file into the Supabase SQL Editor and run it (or `supabase db push`). Expect "Success. No rows returned."

- [ ] **Step 3: Verify the RPC exists.**

```sql
select proname from pg_proc where proname = 'finish_bracket_match';
```

Expected: one row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0006_tournament_sync.sql
git commit -m "feat(db): tournament sync columns + atomic bracket-advance RPC"
```

---

## Task 2: Rewrite tournament CRUD to Supabase

**Files:**
- Modify: `src/repos/tournamentRepo.ts`

**Interfaces:**
- Consumes: `finish_bracket_match` RPC (Task 1, not called until Task 4).
- Produces (signatures unchanged from the current file, so no caller in `app/(app)/tournaments/*.tsx` needs to change): `createTournament(...)`, `getTournament(id)`, `listTournaments(clubId)` — same shapes as today.

This task rewrites `createTournament`, `getTournament`, `listTournaments`, and the three internal (non-exported) loaders `loadEntrants`, `loadEntrantSides`, `loadBracket`, plus fixes a type mismatch in `toTournamentRow`. It leaves `startBracketMatch`/`finishBracketMatch` calling these same-named, same-signature helpers — the file keeps compiling throughout even though `startBracketMatch`/`finishBracketMatch` aren't rewritten until Tasks 3–4.

- [ ] **Step 1: Add the `supabase` import; remove `getDb` from the top-level import (it's re-added narrowly in Task 3, only for one line).**

At the top of `src/repos/tournamentRepo.ts`, replace:

```typescript
import * as Crypto from "expo-crypto";
import { getDb } from "../db/db";
import { advanceWinner, bracketStatus, buildBracket } from "../tournament/bracket";
```

with:

```typescript
import * as Crypto from "expo-crypto";
import { supabase } from "../lib/supabase";
import { advanceWinner, bracketStatus, buildBracket } from "../tournament/bracket";
```

(`advanceWinner`/`bracketStatus` stay imported — `bracketStatus` is used elsewhere in the app; `advanceWinner` is unused after this plan but left exported per the Global Constraints, so the import can be dropped only from this file if TypeScript flags it as unused — check in Step 6.)

- [ ] **Step 2: Fix `toTournamentRow`'s `created_at` type mismatch.**

Supabase's `created_at` is `timestamptz`, returned by supabase-js as an ISO string — the current `(r.created_at as number) ?? 0` is a type assertion, not a conversion, and would silently hold a string at runtime. Replace `toTournamentRow`:

```typescript
const toTournamentRow = (r: Record<string, unknown>): TournamentRow => ({
  id: r.id as string, clubId: (r.club_id as string) ?? "", name: (r.name as string) ?? "",
  size: (r.size as number) ?? 0, status: (r.status as string) ?? "draft",
  createdAt: r.created_at ? new Date(r.created_at as string).getTime() : 0,
  matchType: ((r.match_type as MatchType) ?? "singles"), bestOf: (r.bestof as number) ?? 3, finalsBestOf: (r.finals_bestof as number) ?? 3,
});
```

- [ ] **Step 3: Rewrite `createTournament`.**

```typescript
export async function createTournament(
  clubId: string,
  name: string,
  size: BracketSize,
  matchType: MatchType,
  bestOf: number,
  finalsBestOf: number,
  entrants: { clubPlayerId: string; clubPlayerId2?: string | null; name: string; seed: number }[],
): Promise<string> {
  if (!supabase) throw new Error("Sign in to create a tournament");
  const tid = Crypto.randomUUID();
  const ents: Entrant[] = entrants.map((e) => ({
    id: Crypto.randomUUID(), clubPlayerId: e.clubPlayerId, name: e.name, seed: e.seed,
  }));
  const bracket = buildBracket(ents, size, tid, () => Crypto.randomUUID());

  const { error: tErr } = await supabase.from("tournaments").insert({
    id: tid, club_id: clubId, name, format: "single_elim", size, status: "draft",
    match_type: matchType, bestof: bestOf, finals_bestof: finalsBestOf,
  });
  if (tErr) throw new Error(tErr.message);

  const { error: eErr } = await supabase.from("tournament_entrants").insert(
    ents.map((e, i) => ({
      id: e.id, tournament_id: tid, club_player_id: e.clubPlayerId, seed: e.seed,
      club_player_id_2: entrants[i].clubPlayerId2 ?? null,
    })),
  );
  if (eErr) throw new Error(eErr.message);

  const { error: bErr } = await supabase.from("bracket_matches").insert(
    bracket.map((m) => bracketMatchToRow(m)),
  );
  if (bErr) throw new Error(bErr.message);

  return tid;
}
```

(`bracketMatchToRow` is unchanged — its output column names, including `idx`, match `bracket_matches` on both local SQLite and Supabase.)

- [ ] **Step 4: Rewrite the three internal loaders.** Replace `loadEntrants`, add a new `loadEntrantNames` helper, and rewrite `loadEntrantSides` and `loadBracket`:

```typescript
async function loadEntrantNames(playerIds: string[]): Promise<Map<string, string>> {
  if (!supabase || playerIds.length === 0) return new Map();
  const { data } = await supabase.from("club_players").select("id, name").in("id", playerIds);
  return new Map((data ?? []).map((p) => [p.id as string, p.name as string]));
}

async function loadEntrants(tournamentId: string): Promise<Entrant[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("tournament_entrants")
    .select("id, club_player_id, club_player_id_2, seed")
    .eq("tournament_id", tournamentId)
    .order("seed");
  const rows = (data ?? []) as EntrantRow[];
  const ids = rows.flatMap((r) => [r.club_player_id, r.club_player_id_2].filter((x): x is string => !!x));
  const names = await loadEntrantNames(ids);
  return rows.map((r) => ({
    id: r.id,
    clubPlayerId: r.club_player_id,
    name: entrantName({ ...r, name1: names.get(r.club_player_id) ?? null, name2: r.club_player_id_2 ? names.get(r.club_player_id_2) ?? null : null }),
    seed: r.seed,
  }));
}

async function loadEntrantSides(tournamentId: string): Promise<Map<string, { club_player_id: string; name: string }[]>> {
  if (!supabase) return new Map();
  const { data } = await supabase
    .from("tournament_entrants")
    .select("id, club_player_id, club_player_id_2")
    .eq("tournament_id", tournamentId);
  const rows = (data ?? []) as EntrantRow[];
  const ids = rows.flatMap((r) => [r.club_player_id, r.club_player_id_2].filter((x): x is string => !!x));
  const names = await loadEntrantNames(ids);
  const map = new Map<string, { club_player_id: string; name: string }[]>();
  for (const r of rows) {
    const players = [{ club_player_id: r.club_player_id, name: names.get(r.club_player_id) ?? "Player" }];
    if (r.club_player_id_2) players.push({ club_player_id: r.club_player_id_2, name: names.get(r.club_player_id_2) ?? "Player" });
    map.set(r.id, players);
  }
  return map;
}

async function loadBracket(tournamentId: string): Promise<BracketMatch[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("bracket_matches")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("round")
    .order("idx");
  return (data ?? []).map((row) => rowToBracketMatch(row as BracketRow));
}
```

`EntrantRow`'s existing type declaration (`{ id, club_player_id, club_player_id_2, seed, name1, name2 }`) already has the right shape for `entrantName`'s input — no change needed to `EntrantRow` or `entrantName` themselves; `loadEntrants` above constructs a compatible object inline.

- [ ] **Step 5: Rewrite `getTournament` and `listTournaments`.**

```typescript
export async function getTournament(
  id: string,
): Promise<{ tournament: TournamentRow; entrants: Entrant[]; bracket: BracketMatch[] }> {
  if (!supabase) return { tournament: toTournamentRow({}), entrants: [], bracket: [] };
  const { data: row } = await supabase.from("tournaments").select("*").eq("id", id).maybeSingle();
  return {
    tournament: toTournamentRow((row as Record<string, unknown>) ?? {}),
    entrants: await loadEntrants(id),
    bracket: await loadBracket(id),
  };
}

export async function listTournaments(clubId: string): Promise<TournamentRow[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("tournaments")
    .select("*")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((row) => toTournamentRow(row as Record<string, unknown>));
}
```

- [ ] **Step 6: Typecheck.**

Run: `npx tsc --noEmit`
Expected: clean. If `advanceWinner` is flagged as an unused import, remove it from this file's import line only (it stays exported from `src/tournament/bracket.ts` for any other caller, per the Global Constraints).

- [ ] **Step 7: Run the full suite.**

Run: `npm test`
Expected: all existing tests pass — `tests/tournamentRepo.test.ts` exercises `src/tournament/rows.ts` directly (pure, unaffected by this rewrite), and no test in this repo mocks Supabase for repos (matching `membershipRepo.ts` having none either).

- [ ] **Step 8: Commit**

```bash
git add src/repos/tournamentRepo.ts
git commit -m "feat(tournaments): read/write tournament structure via Supabase"
```

---

## Task 3: Rewrite `startBracketMatch`

**Files:**
- Modify: `src/repos/tournamentRepo.ts`

**Interfaces:**
- Consumes: `loadEntrantSides`, `loadBracket` (Task 2, unchanged call signatures), `createMatch` from `matchRepo.ts` (unchanged), `getDb` from `db/db.ts` (re-added, narrowly).
- Produces: `startBracketMatch(bracketMatchId: string): Promise<string>` — same signature as today.

- [ ] **Step 1: Replace `startBracketMatch`.**

```typescript
export async function startBracketMatch(bracketMatchId: string): Promise<string> {
  if (!supabase) throw new Error("Sign in to start a match");
  const { data: cellRow } = await supabase.from("bracket_matches").select("*").eq("id", bracketMatchId).maybeSingle();
  const cell = cellRow ? rowToBracketMatch(cellRow as BracketRow) : null;
  if (!cell || !cell.entrantA || !cell.entrantB) throw new Error("Bracket cell missing an entrant");

  const { data: trow } = await supabase
    .from("tournaments")
    .select("club_id, match_type, bestof, finals_bestof")
    .eq("id", cell.tournamentId)
    .maybeSingle();
  if (!trow) throw new Error("Tournament not found");

  const sides = await loadEntrantSides(cell.tournamentId);
  const a = sides.get(cell.entrantA);
  const b = sides.get(cell.entrantB);
  if (!a || !b) throw new Error("Entrant not found");

  const bracket = await loadBracket(cell.tournamentId);
  const maxRound = Math.max(...bracket.map((m) => m.round));
  const matchType = (trow.match_type as MatchType) ?? "singles";
  const bestOf = pickBestOf(cell.round, maxRound, trow.bestof ?? 3, trow.finals_bestof ?? 3) as 1 | 3 | 5;
  const sideA = a.map((p) => ({ club_player_id: p.club_player_id, name: p.name }));
  const sideB = b.map((p) => ({ club_player_id: p.club_player_id, name: p.name }));
  const config = buildTournamentConfig(
    sideA.map((p) => ({ id: p.club_player_id, name: p.name })),
    sideB.map((p) => ({ id: p.club_player_id, name: p.name })),
    matchType, bestOf,
  );

  // Local row first (offline-capable point scoring once the match exists),
  // then push the match's own row to Supabase synchronously — bracket_matches
  // has a foreign key to matches(id), so it must exist there before it can be
  // linked. Only match_events (points) still queue through the regular
  // offline-first sync path in src/sync/runner.ts.
  const matchId = await createMatch(config, sideA, sideB, trow.club_id as string, null);

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Sign in to start a match");
  const { error: mErr } = await supabase.from("matches").insert({
    id: matchId, club_id: trow.club_id, session_id: null,
    config, side_a: sideA, side_b: sideB, status: "live", created_by: uid,
  });
  if (mErr) throw new Error(mErr.message);
  const db = await getDb();
  await db?.runAsync("update matches set synced = 1 where id = ?", matchId);

  const { error: linkErr } = await supabase.from("bracket_matches").update({ match_id: matchId }).eq("id", bracketMatchId);
  if (linkErr) throw new Error(linkErr.message);
  return matchId;
}
```

Add `getDb` back to the top-of-file import, alongside `supabase` (it's needed for exactly the one `synced = 1` line above):

```typescript
import { getDb } from "../db/db";
```

- [ ] **Step 2: Typecheck.**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Run the full suite.**

Run: `npm test`
Expected: unchanged, all pass.

- [ ] **Step 4: Commit**

```bash
git add src/repos/tournamentRepo.ts
git commit -m "feat(tournaments): push a bracket match's row to Supabase synchronously on start"
```

---

## Task 4: Rewrite `finishBracketMatch` to call the RPC

**Files:**
- Modify: `src/repos/tournamentRepo.ts`

**Interfaces:**
- Consumes: `finish_bracket_match` RPC (Task 1).
- Produces: `finishBracketMatch(bracketMatchId: string, winnerEntrant: string): Promise<void>` — same signature as today.

- [ ] **Step 1: Replace `finishBracketMatch`.**

```typescript
export async function finishBracketMatch(bracketMatchId: string, winnerEntrant: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to record a result");
  const { error } = await supabase.rpc("finish_bracket_match", {
    p_bracket_match_id: bracketMatchId, p_winner_entrant: winnerEntrant,
  });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Typecheck and run the full suite.**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/repos/tournamentRepo.ts
git commit -m "feat(tournaments): finish a bracket match via the atomic finish_bracket_match RPC"
```

---

## Self-Review

**Spec coverage:**
- Read/write model, direct-to-Supabase, no local cache → Task 2. ✅
- Starting a bracket match requires signal; match row pushed synchronously to satisfy the FK → Task 3. ✅
- Finishing a bracket match — atomic RPC, targeted single-column update, no full-row overwrite race → Tasks 1, 4. ✅
- Schema migration for the missing Phase 2 columns → Task 1. ✅
- Clean cutover, no data migration → confirmed in Global Constraints; no task attempts one. ✅
- Relationship to the delete spec (tournament delete can later become RLS/RPC-backed) → out of scope here per the spec itself; not a task in this plan.

**Type consistency:** `createTournament`/`getTournament`/`listTournaments`/`startBracketMatch`/`finishBracketMatch` all keep their exact pre-existing signatures, so `app/(app)/tournaments/index.tsx`, `new.tsx`, and `[id].tsx` need zero changes — verified by reading all three callers before writing this plan. `EntrantRow`, `entrantName`, `BracketRow`, `rowToBracketMatch`, `bracketMatchToRow` are reused unchanged from `src/tournament/rows.ts`. The RPC's parent-cell math (`round+1`, `idx/2`, even/odd → `entrant_a`/`entrant_b`) was verified character-by-character against `src/tournament/bracket.ts`'s real `advanceWinner`/`applyInto` implementation, not assumed.

**Placeholder scan:** none — every SQL statement and TypeScript function is written out in full.

**Ordering:** Task 1 must be applied in Supabase before Tasks 2–4 do anything at runtime, though each task still typechecks independently before that. Task 2 precedes Task 3 (consumes the rewritten `loadEntrantSides`/`loadBracket`). Task 3 precedes Task 4 only incidentally (both are independent rewrites of different functions in the same file); either order works.

**A constraint verified, not assumed:** `matches.created_by` is `not null` with no default in `0001_init.sql`. The existing push-sync path (`src/sync/sync.ts`'s `pushAll`) supplies it from the authenticated user's id — Task 3's synchronous insert does the same via `supabase.auth.getUser()`, confirmed necessary by reading the column definition before writing the plan, not assumed from the RLS policy alone.
