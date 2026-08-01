# Phase 3 (Clubs) — Join by ID / URL + Approval — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Share a club by link or ID so anyone signed in can request to join, and let an owner/admin approve or deny that request from an in-app queue.

**Architecture:** A new `club_join_requests` table holds pending requests. Because the existing RLS forbids non-members from reading a club and forbids anyone from inserting a `club_members` row for themselves, every cross-boundary step goes through a `security definer` RPC (`club_preview`, `request_club_join`, `approve_club_join`, `deny_club_join`) rather than direct table access. A pure link module builds and parses `badminton://join/club/<id>`, and a pending-link buffer survives the sign-in redirect so a signed-out user who taps a share link lands on the right screen after authenticating.

**Tech Stack:** Expo SDK 54, expo-router v6, expo-linking, Supabase (Postgres + RLS), Jest. No new dependencies.

## Global Constraints

- `src/engine/*` untouched.
- No new dependencies.
- App is online-only; a Supabase session is guaranteed inside `(app)`.
- The existing instant invite-code join (`join_club` RPC) **stays**. Request-by-ID is an additional path, not a replacement.
- Every migration statement must be re-runnable (`if not exists` / `create or replace`), because `src/db/db.ts` replays a migration wholesale if it half-applies.
- Follow theme tokens (`C`, `F`, `GRAD`, `glow`, `press`), and use `Icon`, `PressableScale`, `FormScreen`, `validateName`, and `toast` rather than new primitives or native alerts.
- Pure logic is unit-tested; screens are `tsc`-gated.
- Gate every task on `npx tsc --noEmit && npm test`.

## Global Constraints — user-provided

`supabase/migrations/0004_club_join_requests.sql` must be run in the Supabase SQL Editor before Tasks 3–6 work end-to-end. Verifying approval needs **two accounts** (the seeded dummy users in `supabase/seed_dummy_players.sql` are usable).

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/joinLink.ts` (new) | Pure: build/parse `badminton://join/club/<id>`. No I/O. |
| `src/lib/pendingLink.ts` (new) | Pure-ish: in-memory buffer holding a deep-link path across the sign-in redirect. |
| `supabase/migrations/0004_club_join_requests.sql` (new) | Table, RLS, and the four `security definer` RPCs. |
| `src/repos/membershipRepo.ts` (new) | Sole client-side surface for join requests. Wraps the RPCs. |
| `app/join/club/[id].tsx` (new) | Deep-link landing: club preview + "Request to join". |
| `app/(app)/clubs/requests/[clubId].tsx` (new) | Admin queue: approve / deny. |
| `app/_layout.tsx` (modify) | Register the two routes; preserve the deep link across the auth gate. |
| `app/(auth)/sign-in.tsx` (modify) | Consume the pending link after sign-in. |
| `app/(app)/clubs/[id].tsx` (modify) | Share-link button; admin-only "Pending requests" entry. |

`app/(app)/clubs/[id].tsx` is a file, not a directory. `app/(app)/clubs/requests/[clubId].tsx` adds a static `requests` segment that expo-router matches ahead of the dynamic `[id]`, so no restructuring is needed.

---

## Task 1: Pure join-link helpers

**Files:**
- Create: `src/lib/joinLink.ts`
- Test: `tests/joinLink.test.ts`

**Interfaces:**
- Produces:
  - `buildClubJoinPath(clubId: string): string` — returns `join/club/<id>` (no scheme; callers pass it to `Linking.createURL`).
  - `parseJoinTarget(url: string): { kind: "club"; id: string } | null` — parses a full deep link or a bare path.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/joinLink.test.ts
import { buildClubJoinPath, parseJoinTarget } from "../src/lib/joinLink";

test("builds a club join path without a scheme", () => {
  expect(buildClubJoinPath("abc-123")).toBe("join/club/abc-123");
});

test("parses a custom-scheme deep link", () => {
  expect(parseJoinTarget("badminton://join/club/abc-123")).toEqual({ kind: "club", id: "abc-123" });
});

test("parses an https link and a bare path", () => {
  expect(parseJoinTarget("https://example.com/join/club/xyz")).toEqual({ kind: "club", id: "xyz" });
  expect(parseJoinTarget("join/club/xyz")).toEqual({ kind: "club", id: "xyz" });
});

test("ignores query strings and trailing slashes", () => {
  expect(parseJoinTarget("badminton://join/club/xyz/?ref=share")).toEqual({ kind: "club", id: "xyz" });
});

test("returns null for unrelated or malformed links", () => {
  expect(parseJoinTarget("badminton://score/123")).toBeNull();
  expect(parseJoinTarget("badminton://join/club/")).toBeNull();
  expect(parseJoinTarget("badminton://join/tournament/1")).toBeNull();
  expect(parseJoinTarget("")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/joinLink.test.ts`
Expected: FAIL — "Cannot find module '../src/lib/joinLink'"

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/joinLink.ts

/** Path segment for a club join link. Callers wrap it with Linking.createURL. */
export function buildClubJoinPath(clubId: string): string {
  return `join/club/${clubId}`;
}

/**
 * Extract a join target from a deep link. Accepts a full URL with any scheme
 * or a bare path, so the same helper serves Linking callbacks and router
 * segments. Only clubs are supported — tournaments are local-only until
 * tournament cloud sync exists.
 */
export function parseJoinTarget(url: string): { kind: "club"; id: string } | null {
  if (!url) return null;
  const withoutQuery = url.split("?")[0].split("#")[0];
  // Drop any scheme + authority, e.g. "badminton://" or "https://example.com".
  const path = withoutQuery.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/]*\/?/, "");
  const parts = path.split("/").filter(Boolean);
  const at = parts.indexOf("join");
  if (at === -1) return null;
  const kind = parts[at + 1];
  const id = parts[at + 2];
  if (kind !== "club" || !id) return null;
  return { kind: "club", id };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/joinLink.test.ts && npx tsc --noEmit`
Expected: PASS, 5 tests. tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/joinLink.ts tests/joinLink.test.ts
git commit -m "feat(join): pure club join-link build/parse helpers"
```

---

## Task 2: Pending-link buffer (survives the sign-in redirect)

A signed-out user who taps a share link is bounced to `/sign-in` by the root `Gate`, which loses the destination. This buffer holds it so sign-in can resume.

**Files:**
- Create: `src/lib/pendingLink.ts`
- Test: `tests/pendingLink.test.ts`

**Interfaces:**
- Produces:
  - `setPendingLink(path: string): void`
  - `consumePendingLink(): string | null` — returns the stored path and clears it (single-use).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/pendingLink.test.ts
import { setPendingLink, consumePendingLink } from "../src/lib/pendingLink";

beforeEach(() => { consumePendingLink(); });

test("returns null when nothing is pending", () => {
  expect(consumePendingLink()).toBeNull();
});

test("returns the stored path exactly once", () => {
  setPendingLink("join/club/abc");
  expect(consumePendingLink()).toBe("join/club/abc");
  expect(consumePendingLink()).toBeNull();
});

test("the newest path wins", () => {
  setPendingLink("join/club/first");
  setPendingLink("join/club/second");
  expect(consumePendingLink()).toBe("join/club/second");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/pendingLink.test.ts`
Expected: FAIL — "Cannot find module '../src/lib/pendingLink'"

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/pendingLink.ts

/**
 * A deep link tapped while signed out. The root Gate redirects to sign-in and
 * would otherwise drop the destination, so it parks here and is replayed once
 * after authentication. In-memory only: a cold start delivers the URL again
 * through Linking.getInitialURL, so nothing needs to persist.
 */
let pending: string | null = null;

export function setPendingLink(path: string): void {
  pending = path;
}

/** Read and clear the pending path. Single-use so a link never replays twice. */
export function consumePendingLink(): string | null {
  const value = pending;
  pending = null;
  return value;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/pendingLink.test.ts && npx tsc --noEmit`
Expected: PASS, 3 tests. tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pendingLink.ts tests/pendingLink.test.ts
git commit -m "feat(join): buffer a deep link across the sign-in redirect"
```

---

## Task 3: Migration — join-request table, RLS, and RPCs

**Files:**
- Create: `supabase/migrations/0004_club_join_requests.sql`

**Interfaces:**
- Produces (callable via `supabase.rpc`):
  - `club_preview(p_club_id uuid) -> table(id uuid, name text, member_count int)`
  - `request_club_join(p_club_id uuid) -> text` — returns `'member' | 'pending' | 'denied'`
  - `approve_club_join(p_request_id uuid) -> void`
  - `deny_club_join(p_request_id uuid) -> void`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0004_club_join_requests.sql
-- Request-to-join by club ID, with owner/admin approval. The existing
-- invite-code path (join_club) is unchanged and still joins instantly.

create table if not exists public.club_join_requests (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (club_id, profile_id)
);

create index if not exists club_join_requests_club_status
  on public.club_join_requests (club_id, status);

alter table public.club_join_requests enable row level security;

-- A requester sees only their own row; admins see their club's whole queue.
drop policy if exists "requester reads own request" on public.club_join_requests;
create policy "requester reads own request" on public.club_join_requests
  for select to authenticated using (profile_id = auth.uid());

drop policy if exists "admins read club queue" on public.club_join_requests;
create policy "admins read club queue" on public.club_join_requests
  for select to authenticated using (is_club_admin(club_id));

-- Writes go exclusively through the security-definer RPCs below, so no
-- insert/update/delete policies are granted to authenticated users.

-- Non-members cannot select from clubs (RLS is is_club_member(id)), so a
-- prospective joiner needs this narrow window to see what they are joining.
create or replace function public.club_preview(p_club_id uuid)
returns table (id uuid, name text, member_count int)
language sql security definer stable set search_path = public as $$
  select c.id, c.name, (select count(*)::int from club_members m where m.club_id = c.id)
  from clubs c where c.id = p_club_id;
$$;

-- Record a pending request. Idempotent: re-requesting reports current state
-- rather than stacking rows (the unique constraint would reject them anyway).
create or replace function public.request_club_join(p_club_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not exists (select 1 from clubs where id = p_club_id) then
    raise exception 'Club not found';
  end if;
  if is_club_member(p_club_id) then
    return 'member';
  end if;
  select status into v_status
  from club_join_requests where club_id = p_club_id and profile_id = auth.uid();
  if v_status = 'denied' then
    return 'denied';
  end if;
  if v_status is null then
    insert into club_join_requests (club_id, profile_id) values (p_club_id, auth.uid());
  end if;
  return 'pending';
end $$;

-- Approving inserts the real membership + player rows. Mirrors join_club so an
-- approved member is indistinguishable from an invite-code member.
create or replace function public.approve_club_join(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_club_id uuid; v_profile_id uuid;
begin
  select club_id, profile_id into v_club_id, v_profile_id
  from club_join_requests where id = p_request_id and status = 'pending';
  if v_club_id is null then
    raise exception 'Request not found or already decided';
  end if;
  if not is_club_admin(v_club_id) then
    raise exception 'Only a club admin can approve requests';
  end if;
  insert into club_members (club_id, profile_id, role)
  values (v_club_id, v_profile_id, 'member')
  on conflict do nothing;
  insert into club_players (club_id, profile_id, name)
  select v_club_id, v_profile_id, coalesce(p.display_name, 'Player')
  from profiles p where p.id = v_profile_id
  on conflict (club_id, profile_id) do nothing;
  update club_join_requests
  set status = 'approved', decided_at = now() where id = p_request_id;
end $$;

create or replace function public.deny_club_join(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_club_id uuid;
begin
  select club_id into v_club_id
  from club_join_requests where id = p_request_id and status = 'pending';
  if v_club_id is null then
    raise exception 'Request not found or already decided';
  end if;
  if not is_club_admin(v_club_id) then
    raise exception 'Only a club admin can deny requests';
  end if;
  update club_join_requests
  set status = 'denied', decided_at = now() where id = p_request_id;
end $$;
```

- [ ] **Step 2: Apply it**

Paste the file into the Supabase SQL Editor and run it. Expect "Success. No rows returned."

- [ ] **Step 3: Verify the guard rails in the SQL Editor**

```sql
-- Should return one row with the club's name and member count.
select * from public.club_preview((select id from public.clubs limit 1));
```

Expected: one row. If it errors, the RPC did not create — re-check Step 1 before continuing.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0004_club_join_requests.sql
git commit -m "feat(db): club join requests with approval RPCs"
```

---

## Task 4: membershipRepo

**Files:**
- Create: `src/repos/membershipRepo.ts`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase`, `refreshClubs` from `src/repos/clubRepo`.
- Produces:
  - `type ClubPreview = { id: string; name: string; memberCount: number }`
  - `type JoinRequest = { id: string; clubId: string; profileId: string; displayName: string; createdAt: string }`
  - `type RequestOutcome = "member" | "pending" | "denied"`
  - `getClubPreview(clubId: string): Promise<ClubPreview | null>`
  - `requestJoinClub(clubId: string): Promise<RequestOutcome>`
  - `listPendingRequests(clubId: string): Promise<JoinRequest[]>`
  - `approveRequest(requestId: string): Promise<void>`
  - `denyRequest(requestId: string): Promise<void>`

- [ ] **Step 1: Write the implementation**

```typescript
// src/repos/membershipRepo.ts
import { supabase } from "../lib/supabase";
import { refreshClubs } from "./clubRepo";

export type ClubPreview = { id: string; name: string; memberCount: number };
export type RequestOutcome = "member" | "pending" | "denied";
export type JoinRequest = {
  id: string;
  clubId: string;
  profileId: string;
  displayName: string;
  createdAt: string;
};

/** Club name + size for someone who is not a member yet. Null if it is gone. */
export async function getClubPreview(clubId: string): Promise<ClubPreview | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("club_preview", { p_club_id: clubId });
  if (error) throw new Error(error.message);
  const row = (data as { id: string; name: string; member_count: number }[] | null)?.[0];
  if (!row) return null;
  return { id: row.id, name: row.name, memberCount: row.member_count ?? 0 };
}

/** Ask to join. Idempotent — re-requesting reports the current state. */
export async function requestJoinClub(clubId: string): Promise<RequestOutcome> {
  if (!supabase) throw new Error("Sign in to request access");
  const { data, error } = await supabase.rpc("request_club_join", { p_club_id: clubId });
  if (error) throw new Error(error.message);
  return data as RequestOutcome;
}

/**
 * The admin queue. Joined to profiles for a human name; RLS already limits the
 * rows to clubs the caller administers.
 */
export async function listPendingRequests(clubId: string): Promise<JoinRequest[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("club_join_requests")
    .select("id, club_id, profile_id, created_at, profiles(display_name)")
    .eq("club_id", clubId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const row = r as unknown as {
      id: string; club_id: string; profile_id: string; created_at: string;
      profiles: { display_name: string | null } | { display_name: string | null }[] | null;
    };
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      id: row.id,
      clubId: row.club_id,
      profileId: row.profile_id,
      displayName: profile?.display_name || "Player",
      createdAt: row.created_at,
    };
  });
}

export async function approveRequest(requestId: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to manage requests");
  const { error } = await supabase.rpc("approve_club_join", { p_request_id: requestId });
  if (error) throw new Error(error.message);
  // The approved member gains a club_members row; refresh so caches agree.
  await refreshClubs();
}

export async function denyRequest(requestId: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to manage requests");
  const { error } = await supabase.rpc("deny_club_join", { p_request_id: requestId });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/repos/membershipRepo.ts
git commit -m "feat(join): membership repo wrapping join-request RPCs"
```

---

## Task 5: Join landing screen + deep-link routing

**Files:**
- Create: `app/join/club/[id].tsx`
- Modify: `app/_layout.tsx`, `app/(auth)/sign-in.tsx`

**Interfaces:** Consumes `getClubPreview`, `requestJoinClub` (Task 4); `parseJoinTarget` (Task 1); `setPendingLink`, `consumePendingLink` (Task 2).

- [ ] **Step 1: Build the landing screen**

```tsx
// app/join/club/[id].tsx
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { getClubPreview, requestJoinClub, type ClubPreview, type RequestOutcome } from "../../../src/repos/membershipRepo";
import { toast } from "../../../src/lib/toast";
import FormScreen from "../../../src/components/FormScreen";
import Logo from "../../../src/components/Logo";
import PressableScale from "../../../src/components/PressableScale";
import { C, F, GRAD, glow } from "../../../src/theme";

export default function JoinClub() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [club, setClub] = useState<ClubPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [outcome, setOutcome] = useState<RequestOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    getClubPreview(id)
      .then(setClub)
      .catch((e: Error) => toast(e.message || "Could not load that club", "error"))
      .finally(() => setLoading(false));
  }, [id]);

  const onRequest = async () => {
    if (!id) return;
    setBusy(true);
    try {
      const result = await requestJoinClub(id);
      setOutcome(result);
      if (result === "member") {
        toast("You are already a member", "info");
        router.replace("/");
      }
    } catch (e) {
      toast((e as Error).message || "Could not send the request", "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={C.red} /></View>;
  }
  if (!club) {
    return (
      <View style={s.center}>
        <Logo size={44} />
        <Text style={s.title}>Club not found</Text>
        <Text style={s.sub}>This link may be out of date. Ask for a fresh one.</Text>
        <PressableScale style={s.ghost} onPress={() => router.replace("/")}>
          <Text style={s.ghostText}>Back to CourtSide</Text>
        </PressableScale>
      </View>
    );
  }

  const decided = outcome === "pending" || outcome === "denied";

  return (
    <FormScreen contentContainerStyle={s.scroll}>
      <View style={s.hero}>
        <Logo size={52} />
        <Text style={s.eyebrow}>CLUB INVITATION</Text>
        <Text style={s.title}>{club.name}</Text>
        <Text style={s.sub}>
          {club.memberCount} {club.memberCount === 1 ? "member" : "members"}
        </Text>
      </View>

      <View style={s.card}>
        {outcome === "pending" ? (
          <>
            <Text style={s.stateTitle}>Request sent</Text>
            <Text style={s.sub}>A club admin will review it. You will see the club once approved.</Text>
          </>
        ) : outcome === "denied" ? (
          <>
            <Text style={s.stateTitle}>Request declined</Text>
            <Text style={s.sub}>An admin declined this request. Ask them directly if you think that was a mistake.</Text>
          </>
        ) : (
          <>
            <Text style={s.sub}>Ask a club admin to let you in. They approve every request.</Text>
            <PressableScale style={[s.ctaWrap, busy && s.off]} disabled={busy} onPress={onRequest}>
              <LinearGradient colors={GRAD.redCTA} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.cta}>
                <Text style={s.ctaText}>{busy ? "SENDING…" : "REQUEST TO JOIN"}</Text>
              </LinearGradient>
            </PressableScale>
          </>
        )}
        {decided ? (
          <PressableScale style={s.ghost} onPress={() => router.replace("/")}>
            <Text style={s.ghostText}>Back to CourtSide</Text>
          </PressableScale>
        ) : null}
      </View>
    </FormScreen>
  );
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: "center", padding: 22, gap: 22 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24, backgroundColor: C.bg },
  hero: { alignItems: "center", gap: 10 },
  eyebrow: { color: C.text3, fontFamily: F.medium, fontSize: 11, letterSpacing: 2.4 },
  title: { color: C.text, fontFamily: F.display, fontSize: 27, textAlign: "center", letterSpacing: 0.2 },
  sub: { color: C.text2, fontFamily: F.body, fontSize: 14.5, textAlign: "center", lineHeight: 21 },
  card: { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.line, padding: 20, gap: 12 },
  stateTitle: { color: C.text, fontFamily: F.display, fontSize: 19, textAlign: "center" },
  ctaWrap: { borderRadius: 14, marginTop: 4, ...glow(C.red, 16, 0.45) },
  cta: { borderRadius: 14, minHeight: 54, alignItems: "center", justifyContent: "center" },
  ctaText: { color: C.text, fontFamily: F.display, fontSize: 15, letterSpacing: 1.2 },
  off: { opacity: 0.45 },
  ghost: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  ghostText: { color: C.accent, fontFamily: F.medium, fontSize: 15 },
});
```

- [ ] **Step 2: Register the route and preserve the link across the gate.**

In `app/_layout.tsx`, add the screen inside `<Stack>`, next to the existing `welcome` entry:

```tsx
<Stack.Screen name="join/club/[id]" options={{ headerShown: false }} />
```

Then, in the `Gate` component, park the destination before bouncing an unauthenticated visitor. Replace the existing unauthenticated branch inside the redirect effect:

```tsx
if (!session) { if (!inAuth) router.replace("/sign-in"); return; }
```

with:

```tsx
if (!session) {
  if (!inAuth) {
    // Remember where they were headed; sign-in replays it once done.
    if (segments[0] === "join") setPendingLink(segments.join("/"));
    router.replace("/sign-in");
  }
  return;
}
```

and add the import:

```tsx
import { setPendingLink } from "../src/lib/pendingLink";
```

- [ ] **Step 3: Consume the pending link after sign-in.**

In `app/(auth)/sign-in.tsx`, add the imports:

```tsx
import { consumePendingLink } from "../../src/lib/pendingLink";
import { parseJoinTarget } from "../../src/lib/joinLink";
```

`completeAuth` already handles the OAuth callback, and `SessionProvider` drives the redirect to `/`. To send a returning visitor to their join screen instead, add this effect inside the `SignIn` component, after the existing `Linking` effect:

```tsx
  const router = useRouter();

  // A deep link tapped while signed out was parked by the Gate. Once a session
  // exists, replay it so the user lands where the link pointed.
  useEffect(() => {
    if (!supabase) return;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s) return;
      const path = consumePendingLink();
      const target = path ? parseJoinTarget(path) : null;
      if (target) router.replace(`/join/club/${target.id}`);
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);
```

Add `useRouter` to the existing `expo-router` import (`import { useRouter } from "expo-router";`).

- [ ] **Step 4: Typecheck and verify on device**

Run: `npx tsc --noEmit && npm test`
Expected: clean; all tests pass.

Manual, with the app running:

```bash
npx uri-scheme open "badminton://join/club/<a-real-club-id>" --android
```

Expected: signed in and not a member → club name, member count, and a working "Request to join". Signed out → sign-in first, then the join screen after authenticating.

- [ ] **Step 5: Commit**

```bash
git add "app/join/club/[id].tsx" app/_layout.tsx "app/(auth)/sign-in.tsx"
git commit -m "feat(join): club join landing screen reachable by deep link"
```

---

## Task 6: Admin approval queue + share entry points

**Files:**
- Create: `app/(app)/clubs/requests/[clubId].tsx`
- Modify: `app/(app)/clubs/[id].tsx`, `app/_layout.tsx`

**Interfaces:** Consumes `listPendingRequests`, `approveRequest`, `denyRequest` (Task 4); `buildClubJoinPath` (Task 1).

- [ ] **Step 1: Build the queue screen**

```tsx
// app/(app)/clubs/requests/[clubId].tsx
import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { approveRequest, denyRequest, listPendingRequests, type JoinRequest } from "../../../../src/repos/membershipRepo";
import { toast } from "../../../../src/lib/toast";
import Icon from "../../../../src/components/Icon";
import PressableScale from "../../../../src/components/PressableScale";
import { C, F } from "../../../../src/theme";

export default function ClubRequests() {
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!clubId) return;
    try {
      setRequests(await listPendingRequests(clubId));
    } catch (e) {
      toast((e as Error).message || "Could not load requests", "error");
    } finally {
      setLoading(false);
    }
  }, [clubId]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const decide = async (request: JoinRequest, approve: boolean) => {
    setBusyId(request.id);
    try {
      if (approve) await approveRequest(request.id);
      else await denyRequest(request.id);
      // Drop the row locally so the queue responds without a round trip.
      setRequests((cur) => cur.filter((r) => r.id !== request.id));
      toast(approve ? `${request.displayName} joined` : "Request declined", approve ? "success" : "info");
    } catch (e) {
      toast((e as Error).message || "Could not update the request", "error");
      void reload();
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <View style={s.center}><ActivityIndicator color={C.red} /></View>;

  return (
    <FlatList
      style={s.root}
      contentContainerStyle={s.content}
      data={requests}
      keyExtractor={(r) => r.id}
      ListEmptyComponent={<Text style={s.empty}>No pending requests. Share the club link to invite players.</Text>}
      renderItem={({ item }) => (
        <View style={s.row}>
          <View style={s.avatar}><Text style={s.avatarText}>{item.displayName.slice(0, 1).toUpperCase()}</Text></View>
          <Text style={s.name} numberOfLines={1}>{item.displayName}</Text>
          <PressableScale
            style={[s.btn, s.deny, busyId === item.id && s.off]}
            disabled={busyId === item.id}
            onPress={() => decide(item, false)}
          >
            <Icon name="close" color={C.text2} size={18} />
          </PressableScale>
          <PressableScale
            style={[s.btn, s.approve, busyId === item.id && s.off]}
            disabled={busyId === item.id}
            onPress={() => decide(item, true)}
          >
            <Icon name="checkmark" color={C.text} size={18} />
          </PressableScale>
        </View>
      )}
    />
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg },
  empty: { color: C.text2, fontSize: 15, lineHeight: 22, padding: 24, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.line },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.cardHi, alignItems: "center", justifyContent: "center" },
  avatarText: { color: C.text, fontFamily: F.display, fontSize: 16 },
  name: { flex: 1, color: C.text, fontSize: 16, fontFamily: F.semibold },
  btn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  deny: { backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.line },
  approve: { backgroundColor: C.green },
  off: { opacity: 0.45 },
});
```

- [ ] **Step 2: Register the route.** In `app/_layout.tsx`, inside `<Stack>`:

```tsx
<Stack.Screen name="(app)/clubs/requests/[clubId]" options={{ title: "Pending requests" }} />
```

- [ ] **Step 3: Add the share + queue entry points to the club screen.**

In `app/(app)/clubs/[id].tsx`, add the imports:

```tsx
import { Share } from "react-native";
import * as Linking from "expo-linking";
import { buildClubJoinPath } from "../../../src/lib/joinLink";
import { toast } from "../../../src/lib/toast";
```

Inside `ClubDetail`, above the `return`, add:

```tsx
  const isAdmin = club?.role === "owner" || club?.role === "admin";

  const shareLink = async () => {
    if (!club) return;
    try {
      const url = Linking.createURL(buildClubJoinPath(club.id));
      await Share.share({ message: `Join ${club.name} on CourtSide: ${url}` });
    } catch (e) {
      toast((e as Error).message || "Could not share the link", "error");
    }
  };
```

Then, in the `ListHeaderComponent` hero `View`, directly after the existing "Start a match" `Pressable`, add:

```tsx
            <Pressable style={s.secondary} onPress={shareLink}>
              <Text style={s.secondaryText}>Share join link</Text>
            </Pressable>
            {isAdmin ? (
              <Pressable
                style={s.secondary}
                onPress={() => router.push(`/(app)/clubs/requests/${club.id}`)}
              >
                <Text style={s.secondaryText}>Pending requests</Text>
              </Pressable>
            ) : null}
```

And add to the `StyleSheet`:

```tsx
  secondary: { backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.line, borderRadius: 12, minHeight: 46, alignItems: "center", justifyContent: "center", marginTop: 8 },
  secondaryText: { color: C.text, fontSize: 15, fontWeight: "700" },
```

`Club.role` is already populated by `refreshClubs()` from `club_members`, so no repo change is needed.

- [ ] **Step 4: Typecheck and verify with two accounts**

Run: `npx tsc --noEmit && npm test`
Expected: clean; all tests pass.

Manual (two accounts):
1. Account A (club owner) → club screen → "Share join link" → copy the URL.
2. Account B opens it → sees the club name → "Request to join" → "Request sent".
3. Account A → "Pending requests" → B is listed → approve.
4. Account B relaunches → the club now appears on Home.
5. Repeat with deny → B sees "Request declined" and gains no membership.
6. Non-admin account C opens the club screen → no "Pending requests" button.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/clubs/requests/[clubId].tsx" "app/(app)/clubs/[id].tsx" app/_layout.tsx
git commit -m "feat(join): admin approval queue and club share link"
```

---

## Self-Review

**Spec coverage (Phase 3, club scope):**
- Shareable identity — stable club ID + `badminton://join/club/<id>` deep link → Tasks 1, 5, 6. ✅
- A route handles the deep link and shows "Request to join" → Task 5. ✅
- Approval flow — `club_join_requests` with `pending|approved|denied`, RLS so a requester sees only their own row and admins see their queue → Task 3. ✅
- Approving inserts the real `club_members` row; denying marks the request → Task 3 (`approve_club_join` / `deny_club_join`). ✅
- Admin UI reachable from the club screen → Task 6. ✅
- Coexistence — `join_club` invite-code RPC untouched → confirmed in Task 3's header comment; no task modifies it. ✅

**Deliberately out of scope (recorded, not silently dropped):**
- **Tournament join + approval.** `tournamentRepo` is SQLite-only and `sync/runner.ts` syncs only `matches`/`match_events`, so a tournament exists on one device and cannot be joined by ID. Needs a tournament cloud-sync plan first, which must also add the Phase 2 columns (`match_type`, `bestof`, `finals_bestof`, `club_player_id_2`) to the server schema.
- Human short codes — the existing invite code already fills that role; the spec's "human short code" for the approval path adds a second namespace for no gain.
- Realtime admin queue — the spec calls realtime "optional"; the queue reloads on focus.

**Type consistency:** `ClubPreview`, `JoinRequest`, and `RequestOutcome` are defined once in Task 4 and consumed unchanged in Tasks 5 and 6. `buildClubJoinPath`/`parseJoinTarget` (Task 1) keep identical signatures in Tasks 5 and 6. `setPendingLink`/`consumePendingLink` (Task 2) match their Task 5 callers. The four RPC names in Task 3 match the four `supabase.rpc` calls in Task 4 exactly (`club_preview`, `request_club_join`, `approve_club_join`, `deny_club_join`).

**Placeholder scan:** none — every SQL statement, component, and style block is written out in full.

**Ordering:** Tasks 1 and 2 are pure and independent. Task 3 must be applied in Supabase before Tasks 4–6 do anything at runtime. Task 4 precedes Tasks 5 and 6. Task 5 precedes Task 6 only for the shared `_layout.tsx` edit.

**Migration numbering:** `0003` is taken by `display_name_set`, so this is `0004`. Note the local SQLite `MIGRATIONS` array is unrelated and unchanged — nothing here touches the on-device schema.

**Constraint check:** `approve_club_join` relies on `on conflict (club_id, profile_id) do nothing` for `club_players`, copying `join_club`. Verified — `0001_init.sql:51` declares `unique (club_id, profile_id)` on that table, so the clause resolves.
