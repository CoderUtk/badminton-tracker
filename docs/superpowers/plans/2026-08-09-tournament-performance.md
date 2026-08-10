# Tournament Read Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **STATUS 2026-08-09: Tasks 3-7 were implemented, then reverted.** Migration
> `0037` reached production without its authorisation cases being verified, so it
> was dropped (`0038`) and the client reverted (`a8d5334`). Tasks 1 and 2 remain
> on master, dormant. Before re-running Tasks 3-7, read the "Implementation
> history" section of the spec and verify the five cases in
> `supabase/migrations/0038_drop_tournament_full_view.sql`'s header on a scratch
> database first. Case 4 (non-member must RAISE) is the gate.
>
> Two corrections found while implementing, not yet folded into the task text
> below:
>   * There is a THIRD `getTournament` call site the plan missed:
>     `app/(app)/tournaments/edit/[id].tsx`. It is a form, so it should read
>     network-only, never cache-first.
>   * Task 7 Step 5's `tabContent` gate must be `panelOpen || isDraft`, NOT
>     `panelOpen` alone. The draft branch renders `tabContent` inline with no
>     panel, so gating on `panelOpen` blanks the entire pre-start setup screen.

**Goal:** Make the tournament bracket and ops screens paint instantly from local SQLite instead of waiting on ~7 serial network round trips, and stop re-rendering the whole bracket every 15 seconds.

**Architecture:** Adopt the read/refresh split that `src/repos/clubRepo.ts` already uses everywhere else in the app. Local tournament tables already exist and are migrated (`src/db/schema.ts:3`) — they are simply unused. Add a `tournament_full_view` Postgres RPC that collapses 4-7 serial queries into one, write its result through to those tables, and memoise the bracket renderer.

**Tech Stack:** Expo 54 / React Native 0.81, expo-sqlite, Supabase (postgres + RLS), TypeScript, Jest + ts-jest.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-09-tournament-performance-design.md`. Read it before starting.
- **Expo has changed.** Per `AGENTS.md`, consult https://docs.expo.dev/versions/v57.0.0/ before writing any Expo API code.
- **Commits use explicit pathspecs.** Never `git add -A`, `git add .`, or `git commit -a` — this is a shared checkout. Every commit in this plan lists its exact files.
- **No `Co-Authored-By` trailer** unless `.claude/settings.json` sets `attribution.commit`. It does not.
- **Never edit an applied local migration.** `src/db/db.ts`'s `MIGRATIONS` array is keyed by `pragma user_version`; an applied entry never re-runs. Append only. Documented at `src/db/schema.ts:42`.
- **Writes still require a network connection** and still fail loudly offline. This plan changes reads only.
- **Pure logic goes in files with no native imports** so Jest can load them without a device — the convention `src/tournament/rows.ts` establishes.
- **Files stay under 500 lines.**
- **Run `npx tsc --noEmit` and `npm test` before every commit.**

## File Structure

**Create:**
- `src/tournament/bundle.ts` — pure mappers between the RPC payload, local rows, and the app's `TournamentCore` type. No native imports.
- `src/repos/tournamentCache.ts` — SQLite reads and write-through for tournament core data.
- `supabase/migrations/0037_tournament_full_view.sql` — the RPC.
- `tests/tournamentBundle.test.ts` — unit tests for the pure mappers.

**Modify:**
- `src/repos/tournamentRepo.ts` — replace `getTournament` with `readTournament` / `refreshTournament`; rewrite `startBracketMatch`.
- `src/components/BracketView.tsx` — `StyleSheet.create`, memoised cell component, memoised layout maths.
- `app/(app)/tournaments/[id].tsx` — cache-first reload, memoised derived values, gated tab content.
- `app/(app)/tournaments/ops/[tournamentId].tsx` — cache-first reload.

**Deliberately NOT created:** cache tables for `tournament_staff` or join requests. They are admin-only, small, and not needed for first paint. `readTournament` returns core data only; staff arrives with the refresh.

## Type Contract

Defined in Task 1, used by every later task. Deviates from the spec's single `TournamentBundle` for the reason above.

```ts
// src/tournament/bundle.ts
export type TournamentCore = {
  tournament: TournamentRow;
  entrants: Entrant[];
  bracket: BracketMatch[];
};

export type TournamentStaffBundle = {
  myStaffRole: StaffRole | null;
  staff: TournamentStaff[];
  requests: TournamentJoinRequest[];   // always [] for non-admins
};

export type TournamentFull = TournamentCore & TournamentStaffBundle;
```

---

### Task 1: Pure bundle mappers

**Files:**
- Create: `src/tournament/bundle.ts`
- Create: `tests/tournamentBundle.test.ts`

**Interfaces:**
- Consumes: `TournamentRow`, `MatchType` from `src/repos/tournamentRepo.ts`; `Entrant`, `BracketMatch` from `src/tournament/types.ts`; `rowToBracketMatch`, `BracketRow` from `src/tournament/rows.ts`; `StaffRole`, `TournamentStaff`, `TournamentJoinRequest` from `src/repos/tournamentStaffRepo.ts`.
- Produces: `TournamentCore`, `TournamentStaffBundle`, `TournamentFull` types; `rpcToFull(payload) => TournamentFull`; `entrantRowToEntrant(row) => Entrant`; `tournamentRowFromCache(row) => TournamentRow`.

> `TournamentRow` is currently built by the private `toTournamentRow` in `tournamentRepo.ts:142`. Task 4 exports it. For this task, write `tournamentRowFromCache` as a new independent function — the cache row uses integer `created_at` (milliseconds), whereas `toTournamentRow` parses an ISO string. They are genuinely different and must not be merged.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/tournamentBundle.test.ts
import { rpcToFull, entrantRowToEntrant, tournamentRowFromCache } from "../src/tournament/bundle";

describe("entrantRowToEntrant", () => {
  it("joins a doubles pair into one display name", () => {
    expect(entrantRowToEntrant({
      id: "e1", club_player_id: "p1", club_player_id_2: "p2", seed: 1,
      name1: "Ana", name2: "Bo",
    })).toEqual({
      id: "e1", clubPlayerId: "p1", name: "Ana / Bo", seed: 1, partnerClubPlayerId: "p2",
    });
  });

  it("uses the single name for singles", () => {
    expect(entrantRowToEntrant({
      id: "e1", club_player_id: "p1", club_player_id_2: null, seed: 2, name1: "Ana", name2: null,
    }).name).toBe("Ana");
  });

  it("falls back when a name is missing from the local roster", () => {
    expect(entrantRowToEntrant({
      id: "e1", club_player_id: "p1", club_player_id_2: null, seed: 1, name1: null, name2: null,
    }).name).toBe("Player");
  });

  it("falls back per-side for a partially resolved pair", () => {
    expect(entrantRowToEntrant({
      id: "e1", club_player_id: "p1", club_player_id_2: "p2", seed: 1, name1: "Ana", name2: null,
    }).name).toBe("Ana / P2");
  });
});

describe("tournamentRowFromCache", () => {
  it("reads integer created_at directly and maps snake_case columns", () => {
    expect(tournamentRowFromCache({
      id: "t1", club_id: "c1", name: "Cup", size: 8, status: "live",
      created_at: 1700000000000, match_type: "doubles", bestof: 3,
      finals_bestof: 5, courts: 2,
    })).toEqual({
      id: "t1", clubId: "c1", name: "Cup", size: 8, status: "live",
      createdAt: 1700000000000, matchType: "doubles", bestOf: 3,
      finalsBestOf: 5, courts: 2,
    });
  });

  it("applies defaults for a row written before later migrations", () => {
    const r = tournamentRowFromCache({ id: "t1", club_id: "c1", name: "Cup" });
    expect(r.courts).toBe(4);
    expect(r.matchType).toBe("singles");
    expect(r.bestOf).toBe(3);
    expect(r.finalsBestOf).toBe(3);
    expect(r.status).toBe("draft");
  });
});

describe("rpcToFull", () => {
  const payload = {
    tournament: {
      id: "t1", club_id: "c1", name: "Cup", size: 4, status: "live",
      created_at: "2026-08-09T10:00:00Z", match_type: "singles",
      bestof: 3, finals_bestof: 3, courts: 2,
    },
    entrants: [
      { id: "e1", club_player_id: "p1", club_player_id_2: null, seed: 1, name1: "Ana", name2: null },
      { id: "e2", club_player_id: "p2", club_player_id_2: null, seed: 2, name1: "Bo", name2: null },
    ],
    bracket: [
      { id: "b1", tournament_id: "t1", round: 1, idx: 0, match_id: null,
        entrant_a: "e1", entrant_b: "e2", winner_entrant: null, court: "1", scored_by: null },
    ],
    my_staff_role: "admin",
    staff: [{ id: "s1", tournament_id: "t1", profile_id: "u1", role: "admin", display_name: "Ana" }],
    requests: [{ id: "r1", tournament_id: "t1", profile_id: "u2",
                 display_name: "Bo", created_at: "2026-08-09T09:00:00Z", role: "player" }],
  };

  it("maps every collection", () => {
    const full = rpcToFull(payload);
    expect(full.tournament.clubId).toBe("c1");
    expect(full.tournament.createdAt).toBe(Date.parse("2026-08-09T10:00:00Z"));
    expect(full.entrants.map((e) => e.name)).toEqual(["Ana", "Bo"]);
    expect(full.bracket[0].index).toBe(0);
    expect(full.bracket[0].court).toBe("1");
    expect(full.myStaffRole).toBe("admin");
    expect(full.staff[0].displayName).toBe("Ana");
    expect(full.requests[0].role).toBe("player");
  });

  it("tolerates null collections from a tournament with no bracket yet", () => {
    const full = rpcToFull({ ...payload, entrants: null, bracket: null, staff: null, requests: null });
    expect(full.entrants).toEqual([]);
    expect(full.bracket).toEqual([]);
    expect(full.staff).toEqual([]);
    expect(full.requests).toEqual([]);
  });

  it("returns an empty request list for a non-admin", () => {
    const full = rpcToFull({ ...payload, my_staff_role: null, requests: null });
    expect(full.myStaffRole).toBeNull();
    expect(full.requests).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/tournamentBundle.test.ts`
Expected: FAIL — `Cannot find module '../src/tournament/bundle'`

- [ ] **Step 3: Write the implementation**

```ts
// src/tournament/bundle.ts
//
// Pure mappers for the tournament read path. No native imports (no expo-sqlite,
// no supabase client) so this loads in plain Jest — same rule as rows.ts.
import type { BracketMatch, Entrant } from "./types";
import { rowToBracketMatch, type BracketRow } from "./rows";
import type { MatchType, TournamentRow } from "../repos/tournamentRepo";
import type {
  StaffRole, TournamentJoinRequest, TournamentStaff,
} from "../repos/tournamentStaffRepo";

export type TournamentCore = {
  tournament: TournamentRow;
  entrants: Entrant[];
  bracket: BracketMatch[];
};

export type TournamentStaffBundle = {
  myStaffRole: StaffRole | null;
  staff: TournamentStaff[];
  requests: TournamentJoinRequest[];
};

export type TournamentFull = TournamentCore & TournamentStaffBundle;

/** Entrant row shape shared by the local join and the RPC payload. */
export type EntrantNameRow = {
  id: string;
  club_player_id: string;
  club_player_id_2: string | null;
  seed: number;
  name1: string | null;
  name2: string | null;
};

export function entrantRowToEntrant(r: EntrantNameRow): Entrant {
  // Fallbacks mirror the originals in tournamentRepo.ts:25-26: an unresolved
  // name must never blank the bracket cell.
  const name = r.club_player_id_2
    ? `${r.name1 ?? "P1"} / ${r.name2 ?? "P2"}`
    : (r.name1 ?? "Player");
  return {
    id: r.id,
    clubPlayerId: r.club_player_id,
    name,
    seed: r.seed,
    partnerClubPlayerId: r.club_player_id_2,
  };
}

/**
 * Local cache row -> TournamentRow. Distinct from tournamentRepo's
 * toTournamentRow, which parses an ISO string: the local column is an integer
 * millisecond timestamp and must not be run through Date.parse.
 */
export function tournamentRowFromCache(r: Record<string, unknown>): TournamentRow {
  return {
    id: (r.id as string) ?? "",
    clubId: (r.club_id as string) ?? "",
    name: (r.name as string) ?? "",
    size: (r.size as number) ?? 0,
    status: (r.status as string) ?? "draft",
    createdAt: (r.created_at as number) ?? 0,
    matchType: (r.match_type as MatchType) ?? "singles",
    bestOf: (r.bestof as number) ?? 3,
    finalsBestOf: (r.finals_bestof as number) ?? 3,
    courts: (r.courts as number) ?? 4,
  };
}

export type FullViewPayload = {
  tournament: Record<string, unknown> | null;
  entrants: EntrantNameRow[] | null;
  bracket: BracketRow[] | null;
  my_staff_role: string | null;
  staff: Record<string, unknown>[] | null;
  requests: Record<string, unknown>[] | null;
};

export function rpcToFull(p: FullViewPayload): TournamentFull {
  const t = p.tournament ?? {};
  return {
    tournament: {
      id: (t.id as string) ?? "",
      clubId: (t.club_id as string) ?? "",
      name: (t.name as string) ?? "",
      size: (t.size as number) ?? 0,
      status: (t.status as string) ?? "draft",
      createdAt: t.created_at ? Date.parse(t.created_at as string) : 0,
      matchType: (t.match_type as MatchType) ?? "singles",
      bestOf: (t.bestof as number) ?? 3,
      finalsBestOf: (t.finals_bestof as number) ?? 3,
      courts: (t.courts as number) ?? 4,
    },
    entrants: (p.entrants ?? []).map(entrantRowToEntrant),
    bracket: (p.bracket ?? []).map(rowToBracketMatch),
    myStaffRole: (p.my_staff_role as StaffRole | null) ?? null,
    staff: (p.staff ?? []).map((s) => ({
      id: s.id as string,
      tournamentId: s.tournament_id as string,
      profileId: s.profile_id as string,
      role: s.role as "admin" | "scorer",
      displayName: (s.display_name as string) ?? "",
    })),
    requests: (p.requests ?? []).map((r) => ({
      id: r.id as string,
      tournamentId: r.tournament_id as string,
      profileId: r.profile_id as string,
      displayName: (r.display_name as string) ?? "",
      createdAt: (r.created_at as string) ?? "",
      role: r.role as "player" | "scorer",
    })),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/tournamentBundle.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. If `TournamentRow` or `MatchType` are not exported from `tournamentRepo.ts`, they are — verify at `src/repos/tournamentRepo.ts:15-19`.

- [ ] **Step 6: Commit**

```bash
git add src/tournament/bundle.ts tests/tournamentBundle.test.ts
git commit -m "feat(tournaments): pure mappers for the cached read path"
```

---

### Task 2: Local cache read and write-through

**Files:**
- Create: `src/repos/tournamentCache.ts`

**Interfaces:**
- Consumes: `getDb` from `src/db/db.ts`; `TournamentCore`, `EntrantNameRow`, `entrantRowToEntrant`, `tournamentRowFromCache` from `src/tournament/bundle.ts`; `rowToBracketMatch`, `bracketMatchToRow`, `BracketRow` from `src/tournament/rows.ts`.
- Produces: `readTournamentCore(id) => Promise<TournamentCore | null>`; `writeTournamentCore(core) => Promise<void>`.

> No new tables. `tournaments`, `tournament_entrants`, and `bracket_matches` already exist locally with `tournament_id` indexes (`src/db/schema.ts:3-19`) plus every column added by later migrations. No `MIGRATIONS` entry is needed in this task — verify by reading `src/db/schema.ts` before writing code.

- [ ] **Step 1: Write the implementation**

```ts
// src/repos/tournamentCache.ts
//
// Local SQLite cache for tournament core data (metadata, entrants, bracket).
// The tables have existed since the first tournament migration but went unused
// when tournamentRepo moved to network-only reads; this restores them as a
// latency buffer. Writes still go straight to Supabase — see the P1 spec.
import { getDb } from "../db/db";
import {
  entrantRowToEntrant, tournamentRowFromCache,
  type EntrantNameRow, type TournamentCore,
} from "../tournament/bundle";
import { bracketMatchToRow, rowToBracketMatch, type BracketRow } from "../tournament/rows";

/**
 * Reads one tournament from cache. Entrant names are joined from
 * club_players_cache, which refreshClubs() already populates unfiltered
 * (clubRepo.ts:64) — so no network call is needed to render names.
 * Returns null when this tournament has never been cached on this device.
 */
export async function readTournamentCore(id: string): Promise<TournamentCore | null> {
  const db = await getDb();
  if (!db) return null;

  const trow = await db.getFirstAsync<Record<string, unknown>>(
    "select * from tournaments where id = ?", id
  );
  if (!trow) return null;

  const erows = await db.getAllAsync<EntrantNameRow>(
    `select e.id, e.club_player_id, e.club_player_id_2, e.seed,
            p1.name as name1, p2.name as name2
     from tournament_entrants e
     left join club_players_cache p1 on p1.id = e.club_player_id
     left join club_players_cache p2 on p2.id = e.club_player_id_2
     where e.tournament_id = ? order by e.seed`,
    id
  );

  const brows = await db.getAllAsync<BracketRow>(
    "select * from bracket_matches where tournament_id = ? order by round, idx", id
  );

  return {
    tournament: tournamentRowFromCache(trow),
    entrants: erows.map(entrantRowToEntrant),
    bracket: brows.map(rowToBracketMatch),
  };
}

/**
 * Replaces this tournament's cached rows. Delete-then-insert scoped to one
 * tournament id, inside a transaction, mirroring refreshClubs' shape
 * (clubRepo.ts:73) — a partial write must never leave a half-bracket on screen.
 */
export async function writeTournamentCore(core: TournamentCore): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const t = core.tournament;

  await db.withTransactionAsync(async () => {
    await db.runAsync("delete from tournament_entrants where tournament_id = ?", t.id);
    await db.runAsync("delete from bracket_matches where tournament_id = ?", t.id);
    await db.runAsync("delete from tournaments where id = ?", t.id);

    await db.runAsync(
      `insert into tournaments
         (id, club_id, name, format, size, status, created_at,
          match_type, bestof, finals_bestof, courts)
       values (?, ?, ?, 'single_elim', ?, ?, ?, ?, ?, ?, ?)`,
      t.id, t.clubId, t.name, t.size, t.status, t.createdAt,
      t.matchType, t.bestOf, t.finalsBestOf, t.courts
    );

    for (const e of core.entrants) {
      await db.runAsync(
        `insert into tournament_entrants (id, tournament_id, club_player_id, seed, club_player_id_2)
         values (?, ?, ?, ?, ?)`,
        e.id, t.id, e.clubPlayerId, e.seed, e.partnerClubPlayerId
      );
    }

    for (const m of core.bracket) {
      const r = bracketMatchToRow(m);
      await db.runAsync(
        `insert into bracket_matches
           (id, tournament_id, round, idx, match_id, entrant_a, entrant_b,
            winner_entrant, court, scored_by)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        r.id, r.tournament_id, r.round, r.idx, r.match_id,
        r.entrant_a, r.entrant_b, r.winner_entrant, r.court, r.scored_by
      );
    }
  });
}
```

> Row-at-a-time inserts here are deliberate and acceptable: a bracket is at most 63 cells for a 64-draw. P2 introduces a batching helper for the genuinely large cases (`club_players_cache`, `attendance_cache`); wiring this file to it afterwards is optional and not part of P1.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Run the full suite for regressions**

Run: `npm test`
Expected: PASS. No behaviour has changed yet — nothing calls this module.

- [ ] **Step 4: Commit**

```bash
git add src/repos/tournamentCache.ts
git commit -m "feat(tournaments): local SQLite cache for tournament core data"
```

---

### Task 3: The `tournament_full_view` RPC

**Files:**
- Create: `supabase/migrations/0037_tournament_full_view.sql`

**Interfaces:**
- Produces: `public.tournament_full_view(p_tournament_id uuid)` returning one row with columns `tournament jsonb, entrants jsonb, bracket jsonb, my_staff_role text, staff jsonb, requests jsonb` — exactly the shape `FullViewPayload` in Task 1 parses.

> **Security is the point of this task, not just speed.** Unlike `tournament_spectator_view`, this returns staff and pending join requests. It must refuse non-members and must withhold staff/requests from non-admins. Read `supabase/migrations/0017_tournament_spectator_view.sql` for the house style before writing.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0037_tournament_full_view.sql
--
-- One-call read for the authenticated tournament screens. Replaces 4-7 serial
-- round trips (tournaments, tournament_entrants, club_players, bracket_matches,
-- tournament_staff x2, tournament_join_requests) with a single call.
--
-- NOT the same trust model as tournament_spectator_view: that one is
-- deliberately open to anyone holding the tournament id, because it powers the
-- public spectator link. This one returns staff rows and pending join requests,
-- so it authorises explicitly below.

create or replace function public.tournament_full_view(p_tournament_id uuid)
returns table (
  tournament    jsonb,
  entrants      jsonb,
  bracket       jsonb,
  my_staff_role text,
  staff         jsonb,
  requests      jsonb
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_club_id    uuid;
  v_uid        uuid := auth.uid();
  v_staff_role text;
  v_is_admin   boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select t.club_id into v_club_id
  from public.tournaments t
  where t.id = p_tournament_id;

  if v_club_id is null then
    raise exception 'tournament not found';
  end if;

  select ts.role into v_staff_role
  from public.tournament_staff ts
  where ts.tournament_id = p_tournament_id and ts.profile_id = v_uid;

  -- Club membership OR an explicit staff row. A scorer invited to a
  -- tournament in a club they do not belong to must still be able to read it.
  if not public.is_club_member(v_club_id) and v_staff_role is null then
    raise exception 'not authorised for this tournament';
  end if;

  v_is_admin := public.is_club_admin(v_club_id) or v_staff_role = 'admin';

  return query
  select
    to_jsonb(t.*) as tournament,

    (select coalesce(jsonb_agg(e_row order by e_row->>'seed'), '[]'::jsonb)
     from (
       select jsonb_build_object(
         'id', e.id,
         'club_player_id', e.club_player_id,
         'club_player_id_2', e.club_player_id_2,
         'seed', e.seed,
         'name1', p1.name,
         'name2', p2.name
       ) as e_row
       from public.tournament_entrants e
       left join public.club_players p1 on p1.id = e.club_player_id
       left join public.club_players p2 on p2.id = e.club_player_id_2
       where e.tournament_id = p_tournament_id
       order by e.seed
     ) sub) as entrants,

    (select coalesce(jsonb_agg(to_jsonb(b.*) order by b.round, b.idx), '[]'::jsonb)
     from public.bracket_matches b
     where b.tournament_id = p_tournament_id) as bracket,

    v_staff_role as my_staff_role,

    case when v_is_admin then
      (select coalesce(jsonb_agg(jsonb_build_object(
         'id', ts.id, 'tournament_id', ts.tournament_id,
         'profile_id', ts.profile_id, 'role', ts.role,
         'display_name', pr.display_name
       )), '[]'::jsonb)
       from public.tournament_staff ts
       left join public.profiles pr on pr.id = ts.profile_id
       where ts.tournament_id = p_tournament_id)
    else '[]'::jsonb end as staff,

    case when v_is_admin then
      (select coalesce(jsonb_agg(jsonb_build_object(
         'id', jr.id, 'tournament_id', jr.tournament_id,
         'profile_id', jr.profile_id, 'display_name', pr.display_name,
         'created_at', jr.created_at, 'role', jr.role
       )), '[]'::jsonb)
       from public.tournament_join_requests jr
       left join public.profiles pr on pr.id = jr.profile_id
       where jr.tournament_id = p_tournament_id and jr.status = 'pending')
    else '[]'::jsonb end as requests

  from public.tournaments t
  where t.id = p_tournament_id;
end;
$$;

revoke all on function public.tournament_full_view(uuid) from public, anon;
grant execute on function public.tournament_full_view(uuid) to authenticated;
```

- [ ] **Step 2: Reconcile against the real schema before pushing**

The `tournament_staff` and `tournament_join_requests` column names above are taken from `src/repos/tournamentStaffRepo.ts`, not from the migrations. Confirm each against the source of truth and fix the SQL if it differs:

```bash
grep -rn "create table.*tournament_staff\|create table.*tournament_join_requests" -A 15 supabase/migrations/
```

Specifically verify: does `tournament_join_requests` have a `status` column with a `'pending'` value, and is its role column named `role`? Compare with how `listPendingTournamentRequests` queries it in `src/repos/tournamentStaffRepo.ts`.

- [ ] **Step 3: Push and verify authorisation**

```bash
npx supabase db push
```

Then, in the Supabase SQL editor, run each case and record the result:

1. As a club member who is not an admin: returns rows; `staff` and `requests` are `[]`.
2. As a club owner or admin: returns populated `staff`; `requests` lists pending only.
3. As a `tournament_staff` scorer in a club the user does not belong to: returns rows, `my_staff_role` is `'scorer'`.
4. As an authenticated user with no relationship to the club: raises `not authorised for this tournament`.
5. With a random UUID: raises `tournament not found`.

**Case 4 failing open is a security bug, not a performance one. Do not proceed to Task 4 until it raises.**

- [ ] **Step 4: Compare output against the current code path**

For one real live tournament, confirm the RPC's `entrants` and `bracket` match what `getTournament` returns today — same count, same names, same winners, same courts.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0037_tournament_full_view.sql
git commit -m "feat(tournaments): tournament_full_view RPC replacing serial reads"
```

---

### Task 4: Repo read/refresh split

**Files:**
- Modify: `src/repos/tournamentRepo.ts`

**Interfaces:**
- Consumes: Task 1's `rpcToFull`, `TournamentCore`, `TournamentFull`; Task 2's `readTournamentCore`, `writeTournamentCore`; Task 3's RPC.
- Produces:
  - `readTournament(id) => Promise<TournamentCore | null>`
  - `refreshTournament(id) => Promise<TournamentFull | null>`
  - `export` the existing private `toTournamentRow` (Task 1's note).
  - `getTournament` is **removed**. Task 7 updates both call sites.

- [ ] **Step 1: Add the two functions**

```ts
// Add near getTournament in src/repos/tournamentRepo.ts
import { readTournamentCore, writeTournamentCore } from "./tournamentCache";
import { rpcToFull, type FullViewPayload, type TournamentCore, type TournamentFull }
  from "../tournament/bundle";

/** Cache-only read. Never touches the network. Null when never cached here. */
export async function readTournament(id: string): Promise<TournamentCore | null> {
  return readTournamentCore(id);
}

// One in-flight refresh per tournament id. Two screens (bracket + ops) plus a
// poll tick can all ask at once; without this they stampede the RPC and race
// each other's cache writes. Mirrors the module-level `refreshing` guard in
// clubRepo.ts:54, widened to a per-id map because tournaments are per-entity.
const inFlight = new Map<string, Promise<TournamentFull | null>>();

/**
 * One RPC, written through to the local cache. Returns the full bundle
 * including staff data, which is NOT cached (admin-only, not needed for first
 * paint) — callers hold it in component state.
 */
export async function refreshTournament(id: string): Promise<TournamentFull | null> {
  const existing = inFlight.get(id);
  if (existing) return existing;

  const run = (async (): Promise<TournamentFull | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc("tournament_full_view", {
      p_tournament_id: id,
    });
    if (error) throw new Error(error.message);
    const row = (data as FullViewPayload[] | null)?.[0];
    if (!row) return null;
    const full = rpcToFull(row);
    await writeTournamentCore({
      tournament: full.tournament,
      entrants: full.entrants,
      bracket: full.bracket,
    });
    return full;
  })();

  inFlight.set(id, run);
  try {
    return await run;
  } finally {
    inFlight.delete(id);
  }
}
```

- [ ] **Step 2: Export `toTournamentRow`**

Change `const toTournamentRow = (r: Record<string, unknown>): TournamentRow => ({` at `src/repos/tournamentRepo.ts:142` to `export const toTournamentRow = ...`. `listTournaments` and `listAllTournaments` keep using it unchanged.

- [ ] **Step 3: Delete `getTournament`**

Remove the function at `src/repos/tournamentRepo.ts:227-240`. Also remove `loadEntrants`, `loadEntrantNames`, and `loadBracket` **only if** nothing else references them — `startTournament` at `:72` calls `getTournament`, so fix that first:

```ts
export async function startTournament(id: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to start a tournament");
  // Refresh rather than read: starting a tournament builds the bracket from
  // the entrant list, and building it from a stale cache would seed the draw
  // with entrants who have since been removed.
  const full = await refreshTournament(id);
  if (!full) throw new Error("Tournament not found");
  const { tournament, entrants } = full;
  const size = drawSizeFor(entrants.length);
  const bracket = buildBracket(entrants, size, id, () => Crypto.randomUUID());
  const withCourts = bracket.map((m) =>
    m.round === 1 ? { ...m, court: courtForIndex(m.index, tournament.courts) } : m,
  );
  const { error } = await supabase.rpc("start_tournament", {
    p_tournament_id: id,
    p_bracket: withCourts.map((m) => bracketMatchToRow(m)),
  });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Typecheck to find every remaining caller**

Run: `npx tsc --noEmit`
Expected: errors only in `app/(app)/tournaments/[id].tsx` and `app/(app)/tournaments/ops/[tournamentId].tsx`, both fixed in Task 7. Record the exact list — if any other file appears, it is a caller this plan did not account for; stop and reassess.

- [ ] **Step 5: Commit**

```bash
git add src/repos/tournamentRepo.ts
git commit -m "feat(tournaments): read/refresh split replacing getTournament"
```

> This commit intentionally leaves the two screens failing to typecheck. Task 7 fixes them. If you prefer a green tree at every commit, do Tasks 4 and 7 as one commit.

---

### Task 5: `startBracketMatch` — 7 round trips to 2

**Files:**
- Modify: `src/repos/tournamentRepo.ts`

**Interfaces:**
- Consumes: `readTournament`, `refreshTournament` from Task 4.
- Produces: `startBracketMatch(bracketMatchId)` — unchanged signature and unchanged error messages.

- [ ] **Step 1: Rewrite the function**

```ts
export async function startBracketMatch(bracketMatchId: string): Promise<string> {
  if (!supabase) throw new Error("Sign in to start a match");

  // Everything below the two writes comes from cache. The bracket cell carries
  // its own tournamentId, but we do not know it before finding the cell — so
  // find the cell by scanning the cached bracket rows directly.
  const db = await getDb();
  const cellRow = await db?.getFirstAsync<BracketRow>(
    "select * from bracket_matches where id = ?", bracketMatchId
  );
  if (!cellRow) throw new Error("Bracket cell missing an entrant");
  const cell = rowToBracketMatch(cellRow);

  let core = await readTournament(cell.tournamentId);
  if (!core) {
    const full = await refreshTournament(cell.tournamentId);
    if (!full) throw new Error("Tournament not found");
    core = full;
  }

  if (!cell.entrantA || !cell.entrantB) throw new Error("Bracket cell missing an entrant");

  const byId = new Map(core.entrants.map((e) => [e.id, e]));
  const a = byId.get(cell.entrantA);
  const b = byId.get(cell.entrantB);
  if (!a || !b) throw new Error("Entrant not found");

  // An entrant's "side" is its own player plus, for doubles, its partner.
  // Names come from the cached club_players join; the fallbacks match the
  // originals so a cold roster still produces a startable match.
  const sideOf = (e: typeof a) => {
    const parts = e.name.split(" / ");
    const players = [{ club_player_id: e.clubPlayerId, name: parts[0] ?? "Player" }];
    if (e.partnerClubPlayerId) {
      players.push({ club_player_id: e.partnerClubPlayerId, name: parts[1] ?? "Player" });
    }
    return players;
  };
  const sideA = sideOf(a);
  const sideB = sideOf(b);

  const maxRound = Math.max(...core.bracket.map((m) => m.round));
  const bestOf = pickBestOf(
    cell.round, maxRound, core.tournament.bestOf, core.tournament.finalsBestOf
  ) as 1 | 3 | 5;
  const config = buildTournamentConfig(
    sideA.map((p) => ({ id: p.club_player_id, name: p.name })),
    sideB.map((p) => ({ id: p.club_player_id, name: p.name })),
    core.tournament.matchType, bestOf,
  );

  const matchId = await createMatch(config, sideA, sideB, core.tournament.clubId, null);

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Sign in to start a match");

  // NETWORK 1 of 2. Must precede the link: bracket_matches.match_id has a
  // foreign key to matches(id) (see the 2026-08-02 cloud-sync spec, §2).
  const { error: mErr } = await supabase.from("matches").insert({
    id: matchId, club_id: core.tournament.clubId, session_id: null,
    config, side_a: sideA, side_b: sideB, status: "live", created_by: uid,
  });
  if (mErr) throw new Error(mErr.message);
  await db?.runAsync("update matches set synced = 1 where id = ?", matchId);

  // NETWORK 2 of 2. The .is("match_id", null) guard is a real concurrency
  // check — two admins tapping Start on the same cell must yield one match and
  // one error. Do not remove it.
  const { data: linkedRow, error: linkErr } = await supabase
    .from("bracket_matches")
    .update({ match_id: matchId })
    .eq("id", bracketMatchId)
    .is("match_id", null)
    .select();
  if (linkErr) throw new Error(linkErr.message);
  if (!linkedRow || linkedRow.length === 0) throw new Error("This match was already started");
  return matchId;
}
```

> **Name-splitting caveat.** `Entrant.name` is a pre-joined `"Ana / Bo"` string, so recovering the two players means splitting on `" / "`. A player whose own name contains `" / "` would split wrong. This is already true of the display path today. If it is a concern, the cleaner fix is to have `readTournamentCore` return `name1`/`name2` alongside the joined `name` — do that instead if the split feels fragile during implementation.

- [ ] **Step 2: Remove `loadEntrantSides`**

It has no remaining callers. Delete it from `src/repos/tournamentRepo.ts:113-129`. Confirm with `grep -n "loadEntrantSides" src/`.

- [ ] **Step 3: Typecheck and test**

Run: `npx tsc --noEmit && npm test`
Expected: same known screen errors from Task 4; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/repos/tournamentRepo.ts
git commit -m "perf(tournaments): startBracketMatch from 7 network calls to 2"
```

---

### Task 6: BracketView render cost

**Files:**
- Modify: `src/components/BracketView.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: unchanged public props (`bracket`, `entrants`, `onCellPress`, `liveScores`). Purely internal.

- [ ] **Step 1: Extract a memoised cell component**

Add above `BracketView`, replacing the inline `.map` body at `src/components/BracketView.tsx:79-151`:

```tsx
type CellProps = {
  cell: BracketMatch;
  nameA: string;
  nameB: string;
  top: number;
  left: number;
  maxRound: number;
  liveScore: BracketLiveScore | undefined;
  onPress?: (cell: BracketMatch) => void;
};

const BracketCell = React.memo(function BracketCell({
  cell, nameA, nameB, top, left, maxRound, liveScore, onPress,
}: CellProps) {
  const live = !!cell.matchId && !cell.winnerEntrant;
  const isChampCell = cell.round === maxRound && !!cell.winnerEntrant;
  const games = liveScore?.scoreSummary?.games ?? [];
  const current = liveScore?.scoreSummary?.current;

  return (
    <TouchableOpacity
      disabled={!onPress || (!cell.entrantA && !cell.entrantB)}
      onPress={() => onPress?.(cell)}
      style={[
        s.cell,
        { left, top, borderColor: live ? C.accent : isChampCell ? C.red : C.line },
      ]}
    >
      {cell.court ? (
        <View style={s.courtChip}>
          <Text style={s.courtChipText}>C{cell.court}</Text>
        </View>
      ) : null}
      {(["A", "B"] as const).map((side) => {
        const eid = side === "A" ? cell.entrantA : cell.entrantB;
        const label = side === "A" ? nameA : nameB;
        const won = !!cell.winnerEntrant && cell.winnerEntrant === eid;
        const wonGames = games.length ? gamesWonBy(games, side) : 0;
        return (
          <View key={side} style={s.sideRow}>
            {won && isChampCell ? <Icon name="trophy" color={C.red} size={12} /> : null}
            <Text
              numberOfLines={1}
              style={[s.sideName, won ? s.sideNameWon : s.sideNameLost]}
            >
              {label}
            </Text>
            {wonGames > 0 ? (
              <Text style={[s.gamesPill, won ? s.gamesPillWon : s.gamesPillLost]}>
                {wonGames}
              </Text>
            ) : null}
          </View>
        );
      })}
      {live && current ? (
        <Text style={s.liveScore}>{current.A}-{current.B}</Text>
      ) : null}
      {!live && cell.winnerEntrant && games.length ? (
        <Text numberOfLines={1} style={s.finalScores}>
          {games.map((g) => `${g.A}-${g.B}`).join("  ")}
        </Text>
      ) : null}
      {live ? <View style={s.liveDot} /> : null}
    </TouchableOpacity>
  );
});
```

- [ ] **Step 2: Add the StyleSheet**

At the bottom of the file. Move every static value from the inline objects at lines 93-148; keep only `left`, `top`, and `borderColor` dynamic.

```tsx
const s = StyleSheet.create({
  cell: {
    position: "absolute", width: CELL_W, height: CELL_H,
    backgroundColor: C.card, borderRadius: 10, borderWidth: 1,
    justifyContent: "center", paddingHorizontal: 10, paddingVertical: 8, gap: 2,
  },
  courtChip: {
    position: "absolute", left: 8, top: 6, backgroundColor: C.cardHi,
    borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1,
  },
  courtChipText: { color: C.text2, fontSize: 9, fontFamily: F.semibold },
  sideRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  sideName: { flex: 1, fontSize: 13 },
  sideNameWon: { color: C.text, fontFamily: F.semibold },
  sideNameLost: { color: C.text2, fontFamily: F.body },
  gamesPill: {
    color: C.bg, fontSize: 9, fontFamily: F.semibold, minWidth: 14,
    textAlign: "center", borderRadius: 7, paddingHorizontal: 3,
  },
  gamesPillWon: { backgroundColor: C.red },
  gamesPillLost: { backgroundColor: C.text2 },
  liveScore: { color: C.accent, fontSize: 12, fontFamily: F.semibold, marginTop: 2 },
  finalScores: { color: C.text2, fontSize: 10, marginTop: 2 },
  liveDot: {
    position: "absolute", right: 8, top: 6,
    width: 7, height: 7, borderRadius: 4, backgroundColor: C.red,
  },
});
```

Add `StyleSheet` to the `react-native` import at line 2.

- [ ] **Step 3: Memoise the layout maths**

`BracketView` currently computes on every render. Wrap:

```tsx
const maxRound = useMemo(
  () => (bracket.length ? Math.max(...bracket.map((m) => m.round)) : 0),
  [bracket]
);
const centers = useMemo(() => computeCenters(bracket, maxRound), [bracket, maxRound]);
const nameOf = useMemo(
  () => new Map(entrants.map((e) => [e.id, e.name])),
  [entrants]
);
const lines = useMemo(
  () => bracket.filter((m) => m.round < maxRound),
  [bracket, maxRound]
);
```

Import `useMemo` from React. **Move the `if (bracket.length === 0) return null;` early return at line 49 to *after* all hooks** — a conditional return before hooks violates the rules of hooks and will crash. This is the single most likely bug in this task.

- [ ] **Step 4: Verify unchanged appearance**

Run the app, open a tournament with a started bracket. Confirm: cell size and position unchanged, court chips, live dots, live scores, games-won pills, trophy on the champion, and final per-game score lines all render exactly as before. **This task must produce zero visual difference.**

- [ ] **Step 5: Typecheck and test**

Run: `npx tsc --noEmit && npm test`

- [ ] **Step 6: Commit**

```bash
git add src/components/BracketView.tsx
git commit -m "perf(bracket): memoised cells and StyleSheet instead of inline styles"
```

---

### Task 7: Screens on the cache-first pattern

**Files:**
- Modify: `app/(app)/tournaments/[id].tsx`
- Modify: `app/(app)/tournaments/ops/[tournamentId].tsx`

**Interfaces:**
- Consumes: `readTournament`, `refreshTournament` from Task 4.

- [ ] **Step 1: Rewrite the bracket screen's reload**

Replace `reload` at `app/(app)/tournaments/[id].tsx:62-126`:

```tsx
const epochRef = useRef(0);

const applyCore = useCallback((core: TournamentCore, epoch: number) => {
  if (epoch !== epochRef.current) return;
  setTournament(core.tournament);
  setEntrants(core.entrants);
  setBracket(core.bracket);
}, []);

const reload = useCallback(async () => {
  if (!id) return;
  const epoch = ++epochRef.current;

  // Paint from cache first — zero network. Null on a first-ever open.
  const cached = await readTournament(id);
  if (cached) applyCore(cached, epoch);

  try {
    const full = await refreshTournament(id);
    if (!full || epoch !== epochRef.current) return;
    applyCore(full, epoch);
    setClubRole((await getClub(full.tournament.clubId))?.role ?? null);
    if (epoch !== epochRef.current) return;
    setIsTournamentAdmin(full.myStaffRole === "admin");
    setStaff(full.staff);
    setRequests(full.requests);

    // Reconcile: a cell whose linked match has completed advances the winner.
    const unresolved = full.bracket.filter((c) => c.matchId && !c.winnerEntrant);
    const fetched = await Promise.all(unresolved.map((c) => getMatch(c.matchId!)));
    unresolved.forEach((c, i) => {
      const m = fetched[i];
      if (m) liveMatchesRef.current.set(c.matchId!, m);
    });
    // Finished cells' scores never change, so fetch each only once.
    const finishedNeedingScore = full.bracket.filter(
      (c) => c.matchId && c.winnerEntrant && !liveMatchesRef.current.has(c.matchId)
    );
    const finishedFetched = await Promise.all(
      finishedNeedingScore.map((c) => getMatch(c.matchId!))
    );
    finishedNeedingScore.forEach((c, i) => {
      const m = finishedFetched[i];
      if (m) liveMatchesRef.current.set(c.matchId!, m);
    });
    if (epoch !== epochRef.current) return;
    setLiveMatches(new Map(liveMatchesRef.current));

    let changed = false;
    await Promise.all(unresolved.map(async (cell) => {
      const m = liveMatchesRef.current.get(cell.matchId!);
      if (m && m.status !== "live" && m.winner) {
        const winnerEntrant = m.winner === "A" ? cell.entrantA : cell.entrantB;
        if (winnerEntrant) {
          await finishBracketMatch(cell.id, winnerEntrant);
          changed = true;
        }
      }
    }));
    if (changed) {
      const fresh = await refreshTournament(id);
      if (fresh) applyCore(fresh, epoch);
    }
  } catch (e) {
    // Cached data stays on screen. Silent on the automatic refresh —
    // tournaments/index.tsx:24 sets the precedent that a failed read must not
    // blank data that is already showing. onRefresh below toasts explicitly.
  }
}, [id, applyCore]);
```

`getMatch` reads local SQLite, so the reconciliation fetches cost no network.

- [ ] **Step 2: Keep the focus effect and poll**

Unchanged from `app/(app)/tournaments/[id].tsx:128-134`, plus an epoch bump on cleanup:

```tsx
useFocusEffect(
  useCallback(() => {
    void reload();
    const interval = setInterval(() => { void reload(); }, POLL_MS);
    return () => {
      clearInterval(interval);
      epochRef.current += 1;
    };
  }, [reload])
);
```

The 15s poll stays — the spec defers realtime. It now costs one RPC instead of seven calls, and Task 6 means an unchanged payload causes no cell re-renders.

- [ ] **Step 3: Make `onRefresh` toast on failure**

The automatic path is silent; the explicit one must not be.

```tsx
const onRefresh = async () => {
  setRefreshing(true);
  try {
    const full = await refreshTournament(id!);
    if (full) applyCore(full, epochRef.current);
  } catch (e) {
    toast((e as Error).message || "Could not refresh", "error");
  } finally {
    setRefreshing(false);
  }
};
```

- [ ] **Step 4: Memoise the derived block**

Replace the bare computations at `app/(app)/tournaments/[id].tsx:171-185`:

```tsx
const derived = useMemo(() => {
  const champ = bracketStatus(bracket).champion;
  const maxRound = bracket.length ? Math.max(...bracket.map((m) => m.round)) : 0;
  const finalMatch = bracket.find((m) => m.round === maxRound && m.index === 0);
  const runnerUpId = finalMatch && champ
    ? (finalMatch.entrantA === champ ? finalMatch.entrantB : finalMatch.entrantA)
    : null;
  const nameOf = new Map(entrants.map((e) => [e.id, e.name]));
  return {
    champ,
    champName: champ ? nameOf.get(champ) ?? null : null,
    runnerUpName: runnerUpId ? nameOf.get(runnerUpId) ?? "Runner-up" : "TBD",
  };
}, [bracket, entrants]);

const isAdmin = clubRole === "owner" || clubRole === "admin" || isTournamentAdmin;
// A legacy draft created before the two-phase split can already hold a full
// bracket, and must render that bracket rather than the Start flow.
const isDraft = tournament?.status === "draft" && bracket.length === 0;
const players = entrants.length * ((tournament?.matchType ?? "singles") === "doubles" ? 2 : 1);
const blocker = startBlocker(players, tournament?.matchType ?? "singles");
```

Update the JSX to read `derived.champName` and `derived.runnerUpName`.

- [ ] **Step 5: Gate `tabContent` on `panelOpen`**

At `app/(app)/tournaments/[id].tsx:213`, `tabContent` builds the active tab's element tree on every render even when the sheet is closed. Change:

```tsx
const tabContent = !panelOpen ? null : (
  tab === "config" ? ( /* ...unchanged... */ ) : /* ... */
);
```

Confirm `BottomPanel` tolerates `null` children when closed. If it does not, pass the gate down as a prop instead.

- [ ] **Step 6: Rewrite the ops screen**

`app/(app)/tournaments/ops/[tournamentId].tsx:20-33`:

```tsx
const reload = useCallback(async () => {
  if (!tournamentId) return;
  const cached = await readTournament(tournamentId);
  if (cached) {
    setCourts(cached.tournament.courts);
    setEntrants(cached.entrants);
    setBracket(cached.bracket);
    setLoading(false);
  }
  try {
    const full = await refreshTournament(tournamentId);
    if (!full) return;
    setCourts(full.tournament.courts);
    setEntrants(full.entrants);
    setBracket(full.bracket);
  } catch (e) {
    if (!cached) toast((e as Error).message || "Could not load ops dashboard", "error");
  } finally {
    setLoading(false);
  }
}, [tournamentId]);
```

The `loading` spinner now only appears on a genuinely cold cache.

Also memoise the entrant lookup — `getEntrantName` is a linear `find` per cell per render (`ops/[tournamentId].tsx:35-38`):

```tsx
const nameById = useMemo(() => new Map(entrants.map((e) => [e.id, e.name])), [entrants]);
const getEntrantName = (id: string | null) => (!id ? "TBD" : nameById.get(id) ?? "Unknown");
```

- [ ] **Step 7: Typecheck and test**

Run: `npx tsc --noEmit && npm test`
Expected: fully clean — this closes the errors Task 4 introduced.

- [ ] **Step 8: Manual verification**

1. Open a tournament twice. Second open paints immediately with no spinner.
2. Airplane mode, open a previously-viewed tournament: bracket renders from cache; no crash; no blank screen.
3. Fresh install (wipe app data), open a tournament: loading state, then paint, then instant on reopen.
4. Start a bracket match: navigates to scoring. Confirm exactly 2 network calls in the Supabase logs.
5. Two devices, same cell, tap Start simultaneously: one match created, one `"This match was already started"`.
6. Finish a match, return to the bracket: winner advances within one poll tick.
7. Ops screen: assign a court, claim a scorer — both still work and reflect immediately.
8. Non-admin account: no staff list, no pending requests, no crash.

- [ ] **Step 9: Commit**

```bash
git add "app/(app)/tournaments/[id].tsx" "app/(app)/tournaments/ops/[tournamentId].tsx"
git commit -m "perf(tournaments): cache-first paint on bracket and ops screens"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 read path — `readTournament` / `refreshTournament` | 2, 4 |
| §1 — `tournament_full_view` RPC | 3 |
| §1 — entrant names joined locally | 2 |
| §1 — epoch guard | 7 |
| §1 — RPC security (membership + admin gate) | 3 |
| §2 write path — `startBracketMatch` 7 → 2 | 5 |
| §2 — null-guard preserved | 5 |
| §2 — no optimistic navigation | 5 (unchanged; still awaits) |
| §3 render — `StyleSheet.create` | 6 |
| §3 — memoised `BracketCell` | 6 |
| §3 — memoised `computeCenters` / `nameOf` | 6 |
| §3 — parent derived block | 7 |
| §3 — `tabContent` gated on `panelOpen` | 7 |
| §4 — poll cadence unchanged | 7 |
| States/failure modes table | 3, 7 |

**Known gaps, deliberate:**

- **The spinner on the Start button** (spec §2: "The cell shows a spinner while the two calls run") is not implemented. `doStart` at `[id].tsx:159` currently has no pending state. Add it during Task 7 Step 1 if it is wanted — it is a UX nicety, not a performance requirement, and the action drops from 7 round trips to 2 regardless.
- **Cold-cache paint on the bracket screen** relies on the existing `if (!tournament) return <View .../>` at `[id].tsx:211`, which renders an empty background rather than a spinner. Unchanged from today.
- **`writeTournamentCore` is not batched.** Justified inline in Task 2 — a bracket caps at 63 rows.

**Type consistency:** `TournamentCore` / `TournamentStaffBundle` / `TournamentFull` are defined once in Task 1 and used with those exact names in Tasks 2, 4, 5, and 7. `readTournament` returns `TournamentCore | null`; `refreshTournament` returns `TournamentFull | null`. `rpcToFull` takes `FullViewPayload`. `entrantRowToEntrant` takes `EntrantNameRow`, which Task 2's SQL projects exactly (`id, club_player_id, club_player_id_2, seed, name1, name2`).

**Risk ranking, highest first:**

1. **Task 3's authorisation.** A non-member must get an exception, not rows. Step 3 case 4 is the gate.
2. **Task 3's column names** for `tournament_staff` and `tournament_join_requests` are inferred from TypeScript, not read from migrations. Step 2 exists to catch that.
3. **Task 6's early return before hooks.** Will crash if the `bracket.length === 0` return is not moved below the `useMemo` calls.
4. **Task 5's `" / "` name split.** Fragile; an alternative is given inline.
