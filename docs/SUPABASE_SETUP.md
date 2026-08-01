# Supabase Setup — CourtSide

CourtSide runs **fully offline** with no backend. Supabase is optional and turns on three things:

1. **Accounts** — email + Google sign-in (the app already wires `src/lib/supabase.ts` and the session store).
2. **Cloud sync** — matches, sessions, and the append-only event log mirror to Postgres so a club's data appears on every member's device.
3. **Cross-device realtime** — a spectator on another phone/account watches a live match update point-by-point (see [Realtime score updates](#realtime-score-updates-across-accounts)).

Until the two env vars below are set, `supabase` is `null`, sync is disabled, and everything stays on-device. Nothing breaks.

---

## 1. Create the project

1. Sign in at [supabase.com](https://supabase.com) → **New project**.
2. Pick a name, a strong database password (save it), and the region closest to your users.
3. Wait for provisioning (~2 min).

## 2. Environment variables

Project → **Settings → API**. Copy:

- **Project URL** → `EXPO_PUBLIC_SUPABASE_URL`
- **anon / public** key → `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Create a `.env` in the repo root (already gitignored — never commit it):

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...your-anon-key...
```

The `EXPO_PUBLIC_` prefix is required — Expo only inlines env vars with that prefix into the client bundle. The **anon key is safe to ship**; Row Level Security (RLS) is what protects data, not key secrecy. Never put the **service_role** key in the app.

Restart Metro after adding `.env`:

```bash
npx expo start -c
```

## 3. Apply the database schema

The schema (tables, RLS, `create_club` / `join_club` RPCs, the profile trigger) lives in [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql).

**Option A — SQL editor (fastest):**
1. Supabase → **SQL Editor → New query**.
2. Paste the entire contents of `0001_init.sql`.
3. **Run**. It creates `profiles, clubs, club_members, club_players, sessions, attendance, matches, match_events`, enables RLS on all of them, and installs the `is_club_member` / `is_club_admin` helpers.

**Option B — Supabase CLI (repeatable, recommended for teams):**
```bash
npm i -g supabase
supabase login
supabase link --project-ref YOUR-REF
supabase db push          # applies everything under supabase/migrations/
```

### Tournament tables (needed for the tournaments feature)

The tournament tables currently exist **only in local SQLite** ([`src/db/schema.ts`](../src/db/schema.ts) `TOURNAMENT_DDL`). To sync tournaments across accounts, mirror them in Postgres. Create `supabase/migrations/0002_tournaments.sql`:

```sql
create table public.tournaments (
  id uuid primary key,
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null,
  format text not null default 'single_elim',
  size int not null,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);
create table public.tournament_entrants (
  id uuid primary key,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  club_player_id uuid not null references public.club_players (id) on delete cascade,
  seed int not null
);
create table public.bracket_matches (
  id uuid primary key,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  round int not null,
  idx int not null,
  match_id uuid references public.matches (id) on delete set null,
  entrant_a uuid, entrant_b uuid, winner_entrant uuid
);

alter table public.tournaments enable row level security;
alter table public.tournament_entrants enable row level security;
alter table public.bracket_matches enable row level security;

create policy "members read tournaments" on public.tournaments for select to authenticated using (is_club_member(club_id));
create policy "members write tournaments" on public.tournaments for insert to authenticated with check (is_club_member(club_id));
create policy "members update tournaments" on public.tournaments for update to authenticated using (is_club_member(club_id));

-- entrants + bracket cells inherit access from their tournament's club
create policy "members read entrants" on public.tournament_entrants for select to authenticated
  using (is_club_member((select club_id from tournaments where id = tournament_id)));
create policy "members write entrants" on public.tournament_entrants for insert to authenticated
  with check (is_club_member((select club_id from tournaments where id = tournament_id)));
create policy "members read bracket" on public.bracket_matches for select to authenticated
  using (is_club_member((select club_id from tournaments where id = tournament_id)));
create policy "members write bracket" on public.bracket_matches for insert to authenticated
  with check (is_club_member((select club_id from tournaments where id = tournament_id)));
create policy "members update bracket" on public.bracket_matches for update to authenticated
  using (is_club_member((select club_id from tournaments where id = tournament_id)));
```

Note the column is `idx` (not `index`) to match the local schema and the repo mapper.

## 4. Authentication

Supabase → **Authentication → Providers**.

**Email:** enabled by default. For frictionless testing, turn **off** "Confirm email" (Auth → Providers → Email) so sign-up logs in immediately; turn it back on before release.

**Google (OAuth):**
1. In [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services → Credentials**, create an **OAuth 2.0 Client ID** (type: Web application).
2. Add the Supabase callback as an **Authorized redirect URI**:
   `https://YOUR-REF.supabase.co/auth/v1/callback`
3. Copy the **Client ID** and **Client Secret** into Supabase → Auth → Providers → **Google**.
4. The app's deep-link scheme is `badminton` (see `app.json`). In Supabase → Auth → **URL Configuration**, add redirect URLs:
   - `badminton://` (native deep link back into the app)
   - your web origin if you run the web build.

The app opens the OAuth flow with `expo-web-browser` (already a dependency) and returns via the `badminton://` scheme.

## 5. Turn on Realtime

Supabase → **Database → Replication** (or **Realtime → tables**). Enable realtime for:

- `match_events` — the point-by-point event stream (the important one).
- `matches` — so the live-match list updates when a match starts/ends.

RLS still applies to realtime: a client only receives change events for rows it is allowed to `select`. Because `match_events` select is gated by `is_club_member`, **only club members receive a match's live events** — exactly the club-gating the app requires.

## 6. Run it

```bash
npx expo start -c
# or, for the reanimated-enabled dev client:
npx expo run:android
```

## 7. Verify

- Sign up two accounts on two devices/emulators.
- Account A: create a club, note the invite code.
- Account B: join with the code.
- A scores a match → B sees it in **Live** and the score updates in real time.
- A non-member account sees nothing (RLS working).

---

## Realtime score updates across accounts

### The key insight: a scored point is already a `MatchEvent`

The scoring engine is event-sourced. Every point is a `RALLY_WON` event appended to an **append-only log** (`match_events`, keyed by `(match_id, seq)`). The UI is a pure `replay(events)` of that log. So realtime is not "sync the score" — it is **"stream the event log, and every device replays it to the identical state."** No score-merging, no conflict resolution; the log is the single source of truth.

### The swappable seam

All realtime goes through one interface, [`RealtimeBackend`](../src/realtime/backend.ts). Today `getRealtimeBackend()` returns `LocalBackend` (an in-process event bus — same-device only, dummy data for demos). Going multi-account is **one file plus a one-line provider switch**, zero UI changes.

```
Scorer taps +1
  → matchStore.dispatch(RALLY_WON)
      → repo.appendEvent()            // SQLite first (never lost)
      → getRealtimeBackend()
          .publishEvent(matchId, ev)  // best-effort, non-blocking
```

### How `SupabaseBackend` works

Add `src/realtime/supabaseBackend.ts` implementing the same interface, then switch the provider in `src/realtime/index.ts`:

```ts
import { supabase } from "../lib/supabase";
import type { MatchEvent } from "../engine/types";
import type { LiveMatch, RealtimeBackend, Unsubscribe } from "./backend";

export class SupabaseBackend implements RealtimeBackend {
  // Publish = insert into the append-only log. The sync runner already does the
  // durable insert; this is the low-latency path. Idempotent on (match_id, seq).
  async publishEvent(matchId: string, event: MatchEvent): Promise<void> {
    if (!supabase) return;
    // seq derived from the local log length in matchStore; passed through sync.
    // (Insert handled by the existing sync runner; nothing extra needed here.)
  }

  // Subscribe = a Realtime channel on this match's rows. Every INSERT the server
  // accepts (RLS-gated to club members) is pushed to the spectator, who appends
  // it and re-runs replay(). Same code path the scorer uses.
  subscribe(matchId: string, cb: (e: MatchEvent) => void): Unsubscribe {
    if (!supabase) return () => {};
    const ch = supabase
      .channel(`match:${matchId}`)
      .on("postgres_changes",
          { event: "INSERT", schema: "public", table: "match_events", filter: `match_id=eq.${matchId}` },
          (payload) => cb(payload.new.event as MatchEvent))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }

  async listLiveMatches(clubId: string): Promise<LiveMatch[]> {
    if (!supabase) return [];
    const { data } = await supabase.from("matches")
      .select("id, club_id, side_a, side_b, score_summary")
      .eq("club_id", clubId).eq("status", "live");
    return (data ?? []).map((m) => ({
      matchId: m.id, clubId: m.club_id,
      teamA: (m.side_a as { name: string }[]).map((p) => p.name),
      teamB: (m.side_b as { name: string }[]).map((p) => p.name),
      scoreSummary: JSON.stringify(m.score_summary ?? {}),
    }));
  }

  onLiveMatchesChange(clubId: string, cb: (l: LiveMatch[]) => void): Unsubscribe {
    if (!supabase) return () => {};
    const ch = supabase
      .channel(`club-live:${clubId}`)
      .on("postgres_changes",
          { event: "*", schema: "public", table: "matches", filter: `club_id=eq.${clubId}` },
          async () => cb(await this.listLiveMatches(clubId)))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }

  setLive() {}   // no-op: presence is derived from matches.status = 'live'
  clearLive() {} // finishing the match flips status; the channel above notifies
}
```

```ts
// src/realtime/index.ts — the whole switch
import { supabase } from "../lib/supabase";
import { LocalBackend } from "./backend";
import { SupabaseBackend } from "./supabaseBackend";
let instance = null;
export function getRealtimeBackend() {
  if (!instance) instance = supabase ? new SupabaseBackend() : new LocalBackend();
  return instance;
}
```

### End-to-end flow, two accounts

```
Device A (scorer, account A, club member)      Device B (spectator, account B, same club)
--------------------------------------------   --------------------------------------------
tap +1
  append RALLY_WON to SQLite (seq n)
  insert into match_events (via sync)  ───────► Supabase Postgres
                                                   │  RLS: is_club_member? yes
                                                   ▼
                                                 Realtime broadcasts the INSERT
                                                   │
                                                   ▼
                                        subscribe() callback fires on B
                                        B appends event, replay(events)
                                        B's Court + score ribbon update  ✓
```

Because both devices replay the *same* ordered log, they reach byte-identical state. A spectator opening late calls `matchRepo.loadEvents` (pulled from Postgres) to catch up, then subscribes for the tail.

### Offline safety

`match_events.synced` (already in the migration) is the queue. If A is offline, points still append to SQLite with `synced = 0`; the sync runner flushes them in `(match_id, seq)` order on reconnect. Idempotent primary key means re-pushing a point is a no-op. **No point is ever lost, and order is preserved** — the log is append-only.

### Two realtime transports (pick per need)

| Transport | Use | Trade-off |
| --- | --- | --- |
| **Postgres Changes** (above) | Default. Durable, RLS-enforced, replays from the table. | ~100–500 ms latency; needs replication enabled on the table. |
| **Broadcast** (ephemeral channel) | Ultra-low-latency score ticks later. | Not persisted; you still write to `match_events` for durability + late joiners. |

Start with Postgres Changes — it reuses the append-only log the app is already built around and enforces club-gating through the same RLS. Add Broadcast only if point latency needs to drop further.

### What the user still owns (deferred)

- Create the Supabase project + paste the two env vars (Section 2).
- Apply `0001_init.sql` and `0002_tournaments.sql` (Section 3).
- Google OAuth client ID/secret (Section 4).
- Enable Realtime on `match_events` + `matches` (Section 5).
- Add `SupabaseBackend` + flip the provider (code above).
