# Fix Share Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn all four share links (club join, tournament player, tournament scorer,
new tournament spectator) into real tappable HTTPS Android App Links instead of the
non-clickable `badminton://` custom scheme, and add a spectator role that opens a
read-only bracket view with no approval step.

**Architecture:** `src/lib/joinLink.ts` gains a `spectator` role and a shared
route-building helper. `src/lib/shareJoin.ts` builds `https://courtside-links.vercel.app/...`
URLs (env-driven, falls back to the old custom scheme if unset). A new Supabase RPC
`tournament_spectator_view` returns bracket + entrant data to anyone with the link, no
membership required. A new screen renders it read-only. `app.json` gets an Android
`intentFilters` entry so those HTTPS links open the app directly when installed. A new
`web/` directory holds a minimal static Vercel site: `.well-known/assetlinks.json` for
App Link verification, plus a generic fallback page for when the app isn't installed.

**Tech Stack:** Expo Router, React Native, TypeScript, Supabase (Postgres + RLS + RPC),
Jest, static HTML (no framework) for the Vercel site.

## Global Constraints

- Domain: `courtside-links.vercel.app` (confirmed Vercel project name: `courtside-links`).
- iOS Universal Links are explicitly out of scope for this plan.
- Never run `npx supabase db push` — the human operator applies migrations.
- The Play App Signing SHA-256 fingerprint for `assetlinks.json` cannot be derived by
  the assistant; it ships as a labeled placeholder the user must replace.
- Stage only the explicit files each task lists — never `git add -A`.
- `npx tsc --noEmit && npm test` must stay green after every task.

---

### Task 1: `joinLink.ts` spectator role + shared route helper

**Files:**
- Modify: `src/lib/joinLink.ts`
- Test: `tests/joinLink.test.ts`

**Interfaces:**
- Consumes: nothing new — pure module, no dependencies.
- Produces: `buildTournamentSpectatorJoinPath(tournamentId: string): string`;
  `JoinRole = "player" | "scorer" | "spectator"`; `parseJoinTarget` returns
  `role: "spectator"` for a trailing `/spectator` segment; new
  `joinRouteFor(target: { kind: "club" | "tournament"; id: string; role: JoinRole }): string`
  returning the in-app route (e.g. `/join/tournament/t-1/scorer`) — used by Task 5 to
  replace two duplicated ternaries in `app/_layout.tsx` and `app/welcome.tsx`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/joinLink.test.ts`:

```ts
test("builds a tournament spectator path", () => {
  expect(buildTournamentSpectatorJoinPath("t-1")).toBe("join/tournament/t-1/spectator");
});

test("parses the spectator role segment", () => {
  expect(parseJoinTarget("badminton://join/tournament/t-1/spectator"))
    .toEqual({ kind: "tournament", id: "t-1", role: "spectator" });
  expect(parseJoinTarget("https://join.example.com/tournament/t-1/spectator"))
    .toEqual({ kind: "tournament", id: "t-1", role: "spectator" });
});

test("joinRouteFor builds the in-app route for each role", () => {
  expect(joinRouteFor({ kind: "tournament", id: "t-1", role: "player" })).toBe("/join/tournament/t-1");
  expect(joinRouteFor({ kind: "tournament", id: "t-1", role: "scorer" })).toBe("/join/tournament/t-1/scorer");
  expect(joinRouteFor({ kind: "tournament", id: "t-1", role: "spectator" })).toBe("/join/tournament/t-1/spectator");
  expect(joinRouteFor({ kind: "club", id: "c-1", role: "player" })).toBe("/join/club/c-1");
});
```

Update the import at the top of the file:
```ts
import { buildClubJoinPath, buildTournamentScorerJoinPath, buildTournamentSpectatorJoinPath, joinRouteFor, parseJoinTarget } from "../src/lib/joinLink";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- joinLink`
Expected: FAIL — `buildTournamentSpectatorJoinPath is not a function`, `joinRouteFor is not a function`, and the spectator-role test asserts `role: "player"` instead of `"spectator"`.

- [ ] **Step 3: Implement**

In `src/lib/joinLink.ts`, change:
```ts
export type JoinRole = "player" | "scorer";
```
to:
```ts
export type JoinRole = "player" | "scorer" | "spectator";
```

Add after `buildTournamentScorerJoinPath`:
```ts
export function buildTournamentSpectatorJoinPath(tournamentId: string): string {
  return `join/tournament/${tournamentId}/spectator`;
}
```

In `parseJoinTarget`, change:
```ts
      const role: JoinRole = parts[at + 3] === "scorer" ? "scorer" : "player";
```
to:
```ts
      const role: JoinRole =
        parts[at + 3] === "scorer" ? "scorer" : parts[at + 3] === "spectator" ? "spectator" : "player";
```

Add at the end of the file:
```ts
/** In-app route for a parsed join target — the single place that maps a role to its route suffix. */
export function joinRouteFor(target: { kind: "club" | "tournament"; id: string; role: JoinRole }): string {
  const suffix = target.role === "scorer" ? "/scorer" : target.role === "spectator" ? "/spectator" : "";
  return `/join/${target.kind}/${target.id}${suffix}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- joinLink`
Expected: PASS, all cases including the pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/joinLink.ts tests/joinLink.test.ts
git commit -m "feat: add tournament spectator join role and joinRouteFor helper"
```

---

### Task 2: `shareJoin.ts` real HTTPS URLs

**Files:**
- Modify: `src/lib/shareJoin.ts`
- Modify: `.env.example`
- Test: `tests/shareJoin.test.ts` (new)

**Interfaces:**
- Consumes: nothing (env var `EXPO_PUBLIC_JOIN_LINK_DOMAIN`).
- Produces: `shareJoinLink(path: string, message: string): Promise<void>` — same
  signature as before; only the URL it builds changes. Task 5's `TournamentConfigTab`
  button call is unaffected.

- [ ] **Step 1: Write the failing tests**

Create `tests/shareJoin.test.ts`:

```ts
const share = jest.fn().mockResolvedValue({});
jest.mock("react-native", () => ({ Share: { share: (...a: unknown[]) => share(...a) } }));

const createURL = jest.fn((p: string) => `badminton://${p}`);
jest.mock("expo-linking", () => ({ createURL: (...a: unknown[]) => createURL(...a) }));

jest.mock("../src/lib/toast", () => ({ toast: jest.fn() }));

afterEach(() => {
  jest.resetModules();
  delete process.env.EXPO_PUBLIC_JOIN_LINK_DOMAIN;
  share.mockClear();
  createURL.mockClear();
});

test("builds an https join link when the domain is configured", async () => {
  process.env.EXPO_PUBLIC_JOIN_LINK_DOMAIN = "courtside-links.vercel.app";
  const { shareJoinLink } = require("../src/lib/shareJoin");
  await shareJoinLink("join/club/abc", "Join Smash Club on CourtSide:");
  expect(share).toHaveBeenCalledWith({
    message: "Join Smash Club on CourtSide: https://courtside-links.vercel.app/join/club/abc",
  });
});

test("falls back to the custom scheme when no domain is configured", async () => {
  const { shareJoinLink } = require("../src/lib/shareJoin");
  await shareJoinLink("join/club/abc", "Join Smash Club on CourtSide:");
  expect(createURL).toHaveBeenCalledWith("join/club/abc");
  expect(share).toHaveBeenCalledWith({
    message: "Join Smash Club on CourtSide: badminton://join/club/abc",
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- shareJoin`
Expected: FAIL — first test gets a `badminton://` message because the domain isn't read yet.

- [ ] **Step 3: Implement**

Replace `src/lib/shareJoin.ts`:

```ts
import { Share } from "react-native";
import * as Linking from "expo-linking";
import { toast } from "./toast";

/**
 * Vercel-hosted domain for join links. Falls back to the badminton:// custom
 * scheme when unset, so sharing keeps working before the Vercel site exists —
 * see docs/superpowers/specs/2026-08-05-share-links-design.md.
 */
const JOIN_LINK_DOMAIN = process.env.EXPO_PUBLIC_JOIN_LINK_DOMAIN;

/**
 * Turn a join path into a shareable link and hand it to the OS share sheet.
 * Shared by the club and tournament screens so the two cannot drift.
 * Failures are toasted, not thrown — a failed share is not worth a crash.
 */
export async function shareJoinLink(path: string, message: string): Promise<void> {
  try {
    const url = JOIN_LINK_DOMAIN ? `https://${JOIN_LINK_DOMAIN}/${path}` : Linking.createURL(path);
    await Share.share({ message: `${message} ${url}` });
  } catch (e) {
    toast((e as Error).message || "Could not share the link", "error");
  }
}
```

Add to `.env.example`, after the Sentry block:
```
# Optional: domain hosting join-link fallback pages (Vercel project
# "courtside-links"). Without this, shared links use the badminton:// custom
# scheme, which does not render as a tappable link in chat apps. See
# docs/superpowers/specs/2026-08-05-share-links-design.md.
EXPO_PUBLIC_JOIN_LINK_DOMAIN=courtside-links.vercel.app
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- shareJoin`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shareJoin.ts .env.example tests/shareJoin.test.ts
git commit -m "feat: share real https join links instead of the custom scheme"
```

---

### Task 3: `tournament_spectator_view` RPC + repo function

**Files:**
- Create: `supabase/migrations/0017_tournament_spectator_view.sql`
- Modify: `src/repos/tournamentStaffRepo.ts`
- Test: `tests/tournamentSpectator.test.ts` (new)

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts` (existing pattern, same as
  `getTournamentPreview` in the same file).
- Produces:
  ```ts
  export type SpectatorBracketCell = {
    round: number; idx: number; matchId: string | null;
    entrantA: string | null; entrantB: string | null; winnerEntrant: string | null;
    entrantAName: string | null; entrantBName: string | null;
  };
  export type SpectatorView = { name: string; status: string; cells: SpectatorBracketCell[] };
  export async function getTournamentSpectatorView(tournamentId: string): Promise<SpectatorView | null>
  ```
  Task 4's spectator screen consumes `getTournamentSpectatorView` and both exported types.

- [ ] **Step 1: Write the failing tests**

Create `tests/tournamentSpectator.test.ts`:

```ts
const rpc = jest.fn();
jest.mock("../src/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { getTournamentSpectatorView } from "../src/repos/tournamentStaffRepo";

beforeEach(() => rpc.mockReset());

test("maps bracket cells from the RPC response", async () => {
  rpc.mockResolvedValue({
    data: [
      {
        name: "Smash Cup", status: "live", round: 1, idx: 0, match_id: "m-1",
        entrant_a: "e1", entrant_b: "e2", winner_entrant: null,
        entrant_a_name: "Ann", entrant_b_name: "Bo",
      },
    ],
    error: null,
  });

  const view = await getTournamentSpectatorView("t-1");

  expect(rpc).toHaveBeenCalledWith("tournament_spectator_view", { p_tournament_id: "t-1" });
  expect(view).toEqual({
    name: "Smash Cup",
    status: "live",
    cells: [
      {
        round: 1, idx: 0, matchId: "m-1",
        entrantA: "e1", entrantB: "e2", winnerEntrant: null,
        entrantAName: "Ann", entrantBName: "Bo",
      },
    ],
  });
});

test("returns an empty cell list for a tournament with no bracket yet", async () => {
  rpc.mockResolvedValue({
    data: [{
      name: "Smash Cup", status: "draft", round: null, idx: null, match_id: null,
      entrant_a: null, entrant_b: null, winner_entrant: null,
      entrant_a_name: null, entrant_b_name: null,
    }],
    error: null,
  });

  expect(await getTournamentSpectatorView("t-1")).toEqual({ name: "Smash Cup", status: "draft", cells: [] });
});

test("returns null when the tournament doesn't exist", async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  expect(await getTournamentSpectatorView("nope")).toBeNull();
});

test("throws instead of swallowing an RPC error", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
  await expect(getTournamentSpectatorView("t-1")).rejects.toThrow("permission denied");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tournamentSpectator`
Expected: FAIL — `getTournamentSpectatorView is not a function`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0017_tournament_spectator_view.sql`:

```sql
-- Read-only bracket view for the spectator join link. No membership or
-- approval required — the link itself is the access grant, scoped to
-- exactly the tournament id passed in (not a table-wide RLS relaxation).
create or replace function public.tournament_spectator_view(p_tournament_id uuid)
returns table (
  name text,
  status text,
  round int,
  idx int,
  match_id uuid,
  entrant_a uuid,
  entrant_b uuid,
  winner_entrant uuid,
  entrant_a_name text,
  entrant_b_name text
)
language sql security definer stable set search_path = public as $$
  select
    t.name,
    t.status,
    b.round,
    b.idx,
    b.match_id,
    b.entrant_a,
    b.entrant_b,
    b.winner_entrant,
    pa.name as entrant_a_name,
    pb.name as entrant_b_name
  from tournaments t
  left join bracket_matches b on b.tournament_id = t.id
  left join tournament_entrants ea on ea.id = b.entrant_a
  left join club_players pa on pa.id = ea.club_player_id
  left join tournament_entrants eb on eb.id = b.entrant_b
  left join club_players pb on pb.id = eb.club_player_id
  where t.id = p_tournament_id
  order by b.round, b.idx;
$$;

grant execute on function public.tournament_spectator_view(uuid) to authenticated;
```

- [ ] **Step 4: Implement the repo function**

Add to `src/repos/tournamentStaffRepo.ts`, after `getTournamentPreview`:

```ts
export type SpectatorBracketCell = {
  round: number; idx: number; matchId: string | null;
  entrantA: string | null; entrantB: string | null; winnerEntrant: string | null;
  entrantAName: string | null; entrantBName: string | null;
};
export type SpectatorView = { name: string; status: string; cells: SpectatorBracketCell[] };

/** Read-only bracket for the spectator join link. No membership required. */
export async function getTournamentSpectatorView(tournamentId: string): Promise<SpectatorView | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("tournament_spectator_view", { p_tournament_id: tournamentId });
  if (error) throw new Error(error.message);
  const rows = (data as {
    name: string; status: string; round: number | null; idx: number | null; match_id: string | null;
    entrant_a: string | null; entrant_b: string | null; winner_entrant: string | null;
    entrant_a_name: string | null; entrant_b_name: string | null;
  }[] | null) ?? [];
  if (rows.length === 0) return null;
  return {
    name: rows[0].name,
    status: rows[0].status,
    // A tournament with no bracket yet still returns one row (left join),
    // with round/idx null — that's "not started", not "not found".
    cells: rows[0].round == null ? [] : rows.map((r) => ({
      round: r.round as number, idx: r.idx as number, matchId: r.match_id,
      entrantA: r.entrant_a, entrantB: r.entrant_b, winnerEntrant: r.winner_entrant,
      entrantAName: r.entrant_a_name, entrantBName: r.entrant_b_name,
    })),
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tournamentSpectator`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0017_tournament_spectator_view.sql src/repos/tournamentStaffRepo.ts tests/tournamentSpectator.test.ts
git commit -m "feat: add tournament_spectator_view RPC and repo function"
```

**Note for the human operator:** this migration still needs `npx supabase db push` —
the assistant does not run it.

---

### Task 4: Spectator join screen

**Files:**
- Create: `app/join/tournament/[id]/spectator.tsx`

**Interfaces:**
- Consumes: `getTournamentSpectatorView`, `SpectatorView` (Task 3); `BracketView` from
  `src/components/BracketView.tsx` (existing, props `{ bracket: BracketMatch[], entrants: Entrant[], onCellPress? }`
  — omitting `onCellPress` makes it read-only, cells are `disabled` per its own
  `disabled={!onCellPress || ...}` check); `BracketMatch`, `Entrant` types from
  `src/tournament/types.ts` (existing).
- Produces: the route `/join/tournament/[id]/spectator`, reachable via
  `joinRouteFor` (Task 1) and `_layout.tsx`/`welcome.tsx` (Task 5).

This is a screen-only task — no unit test (the existing `join/tournament/[id].tsx` this
mirrors has none either; RN screens in this codebase are verified manually, per
`app/join/tournament/[id].tsx`'s lack of a test file).

- [ ] **Step 1: Create the screen**

Create `app/join/tournament/[id]/spectator.tsx`:

```tsx
import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getTournamentSpectatorView, type SpectatorView } from "../../../../src/repos/tournamentStaffRepo";
import type { BracketMatch, Entrant } from "../../../../src/tournament/types";
import BracketView from "../../../../src/components/BracketView";
import { toast } from "../../../../src/lib/toast";
import Logo from "../../../../src/components/Logo";
import PressableScale from "../../../../src/components/PressableScale";
import { C, F } from "../../../../src/theme";

export default function JoinTournamentSpectator() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [view, setView] = useState<SpectatorView | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    getTournamentSpectatorView(id)
      .then(setView)
      .catch((e: Error) => toast(e.message || "Could not load that tournament", "error"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={C.red} /></View>;
  }
  if (!view) {
    return (
      <View style={s.center}>
        <Logo size={44} />
        <Text style={s.title}>Tournament not found</Text>
        <Text style={s.sub}>This link may be out of date. Ask for a fresh one.</Text>
        <PressableScale style={s.ghost} onPress={() => router.replace("/")}>
          <Text style={s.ghostText}>Back to CourtSide</Text>
        </PressableScale>
      </View>
    );
  }

  const bracket: BracketMatch[] = view.cells.map((c) => ({
    id: `${c.round}:${c.idx}`, tournamentId: id!, round: c.round, index: c.idx,
    matchId: c.matchId, entrantA: c.entrantA, entrantB: c.entrantB,
    winnerEntrant: c.winnerEntrant, court: null, scoredBy: null,
  }));

  const entrantMap = new Map<string, Entrant>();
  for (const c of view.cells) {
    if (c.entrantA && c.entrantAName) {
      entrantMap.set(c.entrantA, { id: c.entrantA, clubPlayerId: "", name: c.entrantAName, seed: 0, partnerClubPlayerId: null });
    }
    if (c.entrantB && c.entrantBName) {
      entrantMap.set(c.entrantB, { id: c.entrantB, clubPlayerId: "", name: c.entrantBName, seed: 0, partnerClubPlayerId: null });
    }
  }

  return (
    <View style={s.root}>
      <View style={s.hero}>
        <Logo size={40} />
        <Text style={s.eyebrow}>SPECTATING</Text>
        <Text style={s.title}>{view.name}</Text>
      </View>
      {bracket.length === 0 ? (
        <Text style={s.sub}>This tournament hasn't started yet.</Text>
      ) : (
        <ScrollView contentContainerStyle={s.bracketWrap}>
          <BracketView bracket={bracket} entrants={[...entrantMap.values()]} />
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, padding: 16, gap: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24, backgroundColor: C.bg },
  hero: { alignItems: "center", gap: 8 },
  eyebrow: { color: C.text3, fontFamily: F.medium, fontSize: 11, letterSpacing: 2.4 },
  title: { color: C.text, fontFamily: F.display, fontSize: 22, textAlign: "center" },
  sub: { color: C.text2, fontFamily: F.body, fontSize: 14.5, textAlign: "center", lineHeight: 21 },
  bracketWrap: { paddingVertical: 8 },
  ghost: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  ghostText: { color: C.accent, fontFamily: F.medium, fontSize: 15 },
});
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add app/join/tournament/[id]/spectator.tsx
git commit -m "feat: add read-only spectator join screen"
```

---

### Task 5: Wire routing and the share button

**Files:**
- Modify: `app/_layout.tsx`
- Modify: `app/welcome.tsx`
- Modify: `src/components/TournamentConfigTab.tsx`

**Interfaces:**
- Consumes: `joinRouteFor` (Task 1); `buildTournamentSpectatorJoinPath` (Task 1);
  `shareJoinLink` (Task 2, signature unchanged).
- Produces: nothing new — this task only wires existing pieces together.

- [ ] **Step 1: Replace the duplicated route-suffix logic in `app/_layout.tsx`**

Change the import line:
```ts
import { parseJoinTarget } from "../src/lib/joinLink";
```
to:
```ts
import { joinRouteFor, parseJoinTarget } from "../src/lib/joinLink";
```

Change:
```ts
      router.replace(
        target
          ? `/join/${target.kind}/${target.id}${target.role === "scorer" ? "/scorer" : ""}`
          : "/",
      );
```
to:
```ts
      router.replace(target ? joinRouteFor(target) : "/");
```

- [ ] **Step 2: Same change in `app/welcome.tsx`**

Change the import line:
```ts
import { parseJoinTarget } from "../src/lib/joinLink";
```
to:
```ts
import { joinRouteFor, parseJoinTarget } from "../src/lib/joinLink";
```

Change:
```ts
      router.replace(
        target
          ? `/join/${target.kind}/${target.id}${target.role === "scorer" ? "/scorer" : ""}`
          : "/",
      );
```
to:
```ts
      router.replace(target ? joinRouteFor(target) : "/");
```

- [ ] **Step 3: Add the spectator share button to `TournamentConfigTab.tsx`**

Change the import line:
```ts
import { buildTournamentJoinPath, buildTournamentScorerJoinPath } from "../lib/joinLink";
```
to:
```ts
import { buildTournamentJoinPath, buildTournamentScorerJoinPath, buildTournamentSpectatorJoinPath } from "../lib/joinLink";
```

After the existing `onShareScorer` definition, add:
```ts
  const onShareSpectator = () =>
    shareJoinLink(buildTournamentSpectatorJoinPath(tournament.id), `Watch "${tournament.name}" live on CourtSide:`);
```

In the read-only (`!isAdmin || !isDraft`) branch, after the existing "Share join link" button, add:
```tsx
        <Pressable style={s.share} onPress={onShareSpectator}>
          <Icon name="share-social-outline" color={C.text} size={18} />
          <Text style={s.shareText}>Share spectator link</Text>
        </Pressable>
```

In the admin/draft branch, after the existing "Share scorer link" button, add the same:
```tsx
      <Pressable style={s.share} onPress={onShareSpectator}>
        <Icon name="share-social-outline" color={C.text} size={18} />
        <Text style={s.shareText}>Share spectator link</Text>
      </Pressable>
```

- [ ] **Step 4: Verify types and existing tests still pass**

Run: `npx tsc --noEmit && npm test`
Expected: PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add app/_layout.tsx app/welcome.tsx src/components/TournamentConfigTab.tsx
git commit -m "feat: wire spectator routing and share button"
```

---

### Task 6: Android App Links + Vercel static site

**Files:**
- Modify: `app.json`
- Create: `web/vercel.json`
- Create: `web/.well-known/assetlinks.json`
- Create: `web/join/index.html`

**Interfaces:**
- Consumes: nothing — this task is infrastructure config, independent of the other five.
- Produces: the deployable `web/` directory and the `android.intentFilters` config that
  makes `https://courtside-links.vercel.app/join/...` open the app.

This task has no automated test — it's static config and markup verified by manual
device testing (see Testing section below) and by the Play Console / Vercel dashboards,
neither of which the assistant has access to.

- [ ] **Step 1: Add the Android intent filter**

In `app.json`, inside `"android"`, add `"intentFilters"` (after `"predictiveBackGestureEnabled"`):

```json
      "predictiveBackGestureEnabled": false,
      "intentFilters": [
        {
          "action": "VIEW",
          "autoVerify": true,
          "data": [{ "scheme": "https", "host": "courtside-links.vercel.app", "pathPrefix": "/join" }],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
```

- [ ] **Step 2: Create the Vercel config**

Create `web/vercel.json`:

```json
{
  "rewrites": [
    { "source": "/join/(.*)", "destination": "/join/index.html" }
  ],
  "headers": [
    {
      "source": "/.well-known/assetlinks.json",
      "headers": [{ "key": "Content-Type", "value": "application/json" }]
    }
  ]
}
```

- [ ] **Step 3: Create the asset links file**

Create `web/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.navalo.courtside",
      "sha256_cert_fingerprints": ["REPLACE_WITH_PLAY_APP_SIGNING_SHA256"]
    }
  }
]
```

`REPLACE_WITH_PLAY_APP_SIGNING_SHA256` must be replaced with the real fingerprint from
Play Console → your app → Setup → App integrity → App signing key certificate, SHA-256
field — before this file is deployed. This is a value only the account owner can
retrieve; it is not derivable from anything in this repo.

- [ ] **Step 4: Create the fallback landing page**

Create `web/join/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>CourtSide</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #0C0E12; color: #fff; font-family: -apple-system, Roboto, sans-serif; padding: 24px; }
  .card { max-width: 360px; text-align: center; }
  h1 { font-size: 22px; margin-bottom: 8px; }
  p { color: #9BA3B2; font-size: 15px; line-height: 1.5; margin-bottom: 24px; }
  a.cta { display: inline-block; background: #FF3B30; color: #fff; text-decoration: none;
    padding: 14px 28px; border-radius: 12px; font-weight: 700; }
</style>
</head>
<body>
  <div class="card">
    <h1>Open this in CourtSide</h1>
    <p>This link opens the CourtSide app. If it didn't open automatically, get the app
    from Google Play, then tap the link again.</p>
    <a class="cta" href="https://play.google.com/store/apps/details?id=com.navalo.courtside">Get it on Google Play</a>
  </div>
</body>
</html>
```

- [ ] **Step 5: Verify `app.json` is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('app.json', 'utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 6: Commit**

```bash
git add app.json web/vercel.json web/.well-known/assetlinks.json web/join/index.html
git commit -m "feat: add Android App Links config and Vercel fallback site"
```

**Notes for the human operator (not doable by the assistant):**
- Create the Vercel project named `courtside-links`, pointing at the `web/` directory,
  and deploy it (`vercel --cwd web` or via the Vercel dashboard/GitHub integration).
- Replace `REPLACE_WITH_PLAY_APP_SIGNING_SHA256` in `web/.well-known/assetlinks.json`
  with the real fingerprint before or immediately after the first deploy.
- After deploy, a new native build is required for `app.json`'s `intentFilters` to take
  effect (`expo prebuild` regenerates the Android manifest from it) — this doesn't ship
  to existing installs until the next Play release.

---

## Testing

- Tasks 1–3 are covered by Jest (`npm test`), following this repo's existing
  logic-only test convention (no RN component-test harness).
- Task 4 (the new screen) and Task 6 (App Links + Vercel) need manual verification on a
  real Android device once the Vercel site is deployed and a new build installed:
  1. Share a club, player, scorer, and spectator link from the app.
  2. On another device (or after uninstalling), tap each link from a chat app — confirm
     it renders as a tappable blue link (not plain text).
  3. With the app installed, confirm tapping opens CourtSide directly (no browser flash).
  4. Without the app installed, confirm the Vercel fallback page loads with a working
     Google Play button.
  5. Open a spectator link and confirm the bracket renders read-only, with no
     "Request to join" button and no `tournament_staff`/`tournament_join_requests` row
     created for that user.
