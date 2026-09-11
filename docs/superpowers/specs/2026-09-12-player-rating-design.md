# Player skill rating (ELO)

**Date:** 2026-09-12
**Status:** Approved, not yet implemented

## Problem

CourtSide has no skill rating. [`src/lib/winRate.ts`](../../../src/lib/winRate.ts) shows a raw win/loss percentage, which treats a win over a beginner the same as a win over the club champion. Competing badminton apps (UBR, EloSmash, Elo Challenge, "Ranking – Badminton ELO", Smash Champs) are frequently built around exactly this gap — an opponent-strength-aware rating is one of the few features CourtSide's competitors have that it doesn't.

The schema already anticipated this: `public.club_players.rating int not null default 1500` has existed since [`0001_init.sql`](../../../supabase/migrations/0001_init.sql) and is written by nothing and read by nothing (confirmed by a full-repo grep for `rating`). This spec wires it up.

## Goal

Every completed match with two real (non-guest) sides updates both sides' `club_players.rating` via a standard ELO formula, computed once, server-side, as the single source of truth. The rating surfaces on the player's profile screen, per club.

## Non-goals

- A cross-club / global rating. `club_players.rating` is scoped to `(club_id, profile_id)` by its existing unique constraint — a player who belongs to two clubs has two independent ratings, same as they have two independent `club_players` rows today. No aggregate "overall rating" is computed; that would need a different data model entirely.
- Guest matches. `public.guest_matches` rows have `club_player_id: null` in `side_a`/`side_b` — there is no `club_players` row to update, so guests are structurally excluded, not policy-excluded.
- Forfeited matches. No rallies were played; including them would let a walkover swing rating.
- A client-side / JS implementation of the ELO math. It lives once, in the Postgres trigger, so there is nothing to keep in sync.
- Re-rating on match edits or undo. `matchRepo.ts` has no path that un-completes a match once `status = 'completed'` is written, so this is not handled.
- A leaderboard / club roster ranking view. Deferred — profile display only, per the approved design.
- Provisional-rating gating (hiding the number under N matches, like `MIN_MATCHES_FOR_RATES` does for win-rate). Every reference competitor app shows the number starting at 1500; hiding it here would be the odd one out.

## Architecture

### 1. Migration `supabase/migrations/0047_player_rating.sql`

```sql
alter table public.matches add column rated boolean not null default false;

create or replace function public.apply_match_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k constant numeric := 32;
  ids_a uuid[];
  ids_b uuid[];
  rating_a numeric;
  rating_b numeric;
  expected_a numeric;
  actual_a numeric;
  delta numeric;
begin
  if new.status <> 'completed' or old.rated or new.winner is null then
    return new;
  end if;

  select array_agg((p->>'club_player_id')::uuid) into ids_a
    from jsonb_array_elements(new.side_a) p;
  select array_agg((p->>'club_player_id')::uuid) into ids_b
    from jsonb_array_elements(new.side_b) p;

  -- Guest/quick matches or any side missing a club_player_id can't be rated.
  if ids_a is null or ids_b is null
     or array_position(ids_a, null) is not null
     or array_position(ids_b, null) is not null then
    new.rated := true;
    return new;
  end if;

  select avg(rating) into rating_a from public.club_players where id = any(ids_a);
  select avg(rating) into rating_b from public.club_players where id = any(ids_b);

  expected_a := 1 / (1 + power(10, (rating_b - rating_a) / 400));
  actual_a := case when new.winner = 'A' then 1 else 0 end;
  delta := round(k * (actual_a - expected_a));

  update public.club_players set rating = rating + delta where id = any(ids_a);
  update public.club_players set rating = rating - delta where id = any(ids_b);

  new.rated := true;
  return new;
end;
$$;

revoke execute on function public.apply_match_rating() from public, anon, authenticated;

create trigger matches_apply_rating
  before update on public.matches
  for each row
  when (new.status = 'completed' and not old.rated)
  execute function public.apply_match_rating();
```

- `rated` guards against double-application: a device can resend `status = 'completed'` on sync retry (`matchRepo.ts` sets `synced = 0` on the same update), and the trigger's own `WHEN` clause plus the `old.rated` check make that a no-op the second time.
- `BEFORE UPDATE` (not `AFTER`) so the function can set `new.rated` directly instead of issuing a second `UPDATE ... WHERE id = new.id`, which would recurse into the same trigger.
- Forfeited matches never reach this trigger's `WHEN` clause differently than any other non-`'completed'` status change — forfeits set `status = 'forfeited'`, not `'completed'` (see the `matches` check constraint), so they're excluded automatically, no extra branch needed.
- `security definer` + pinned `search_path`, `execute` revoked from all three roles — matches the convention already established in [`0046_open_sessions.sql`](../../../supabase/migrations/0046_open_sessions.sql) for functions that must run with elevated privilege regardless of which club member's client triggered the update (`club_players` has no RLS policy letting a member update another member's `rating` directly).
- Rating is unbounded (can go below 1500 or, in principle, negative over enough losses). No floor is applied — YAGNI until real data shows it's a problem worth a design decision.

### 2. Profile screen — `app/(app)/profile/index.tsx`

Add a rating row below the existing win-rate `StatTile`, one per club the player belongs to (their `club_players` rows), each labeled with the club name: `<StatTile label={club.name} value={String(club.rating)} />`. This is a new per-club query (`club_players` joined to `clubs`, filtered by the signed-in profile), separate from `getPlayerAnalytics` in [`statsRepo.ts`](../../../src/repos/statsRepo.ts), which is deliberately cross-club and name-matched from local match history — the two data sources are not merged, since rating is server-authoritative per club and win-rate is a local, lifetime, cross-club figure. A single-club player sees one row; a multi-club player sees one row per club.

### 3. Testing

Following the pattern in [`tests/schema.openSessions.test.ts`](../../../tests/schema.openSessions.test.ts) (text-pattern assertions against the raw migration SQL, since there's no live Postgres in the test run):

- `rated` column added, `not null default false`.
- The trigger function is `security definer` with `set search_path = public`.
- `execute` is revoked from `public`, `anon`, and `authenticated`.
- The trigger fires `before update`, with the `when (new.status = 'completed' and not old.rated)` clause present.
- The ELO formula string (`1 / (1 + power(10, ...`) is present, so a future edit can't silently swap in a different (wrong) formula unnoticed.

A profile-screen rendering test is out of scope unless the screen already has one for the win-rate tile (skim `app/(app)/profile/` tests before adding — if none exists, a render-smoke test is not requested and out of scope, same call `CardShell.tsx` got in the web-deploy-consolidation spec).

## File-change summary

| Path | Change |
|---|---|
| `supabase/migrations/0047_player_rating.sql` | new — `rated` column, ELO trigger function + trigger |
| `tests/schema.playerRating.test.ts` | new — text-pattern assertions against the migration SQL |
| `app/(app)/profile/index.tsx` | add per-club rating row(s) below the win-rate tile |
