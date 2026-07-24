# 🏸 CourtSide

An offline-first, cross-platform **badminton club app** — live scoring, sessions & attendance, and club stats. Think CricHeroes, but for badminton. Built with Expo (SDK 54) + React Native + TypeScript.

## Features

- **Live scoring** with full BWF rules — 21 / win-by-2 / cap at 30, mid-game interval, and correct **doubles service rotation** and **singles side-switching**. The court diagram shows who serves next.
- **Configurable matches** — singles/doubles, 11/15/21 points, single game or best of 3, first server, and **pre-match position swapping** with a live court preview.
- **Pause / resume / end** matches at any time; live matches surface in the Matches tab.
- **Sessions & attendance** — plan a club night, check players in, and auto-generate fair doubles rounds.
- **Finish a session** to close all its matches and see a **summary** (leaderboard, matches/games played).
- **Club stats** — lifetime leaderboard with W–L and win% per player.
- **Offline-first** — scoring works with no network; an event-sourced log syncs to Supabase when signed in and online. Runs fully offline with seeded demo data when no backend is configured.
- **Animated splash** + badminton shuttlecock branding.

## Architecture

- **Event-sourced scoring engine** ([`src/engine`](src/engine)) — pure TypeScript, zero React. The match event log is the single source of truth; state is derived via `replay(events)`, and undo just drops the last event. Fully unit-tested.
- **Local persistence** ([`src/db`](src/db), [`src/repos`](src/repos)) — `expo-sqlite` is the local source of truth; rows carry `synced` flags.
- **Sync** ([`src/sync`](src/sync)) — append-only `(match_id, seq)` log pushed idempotently on reconnect; no conflict resolution needed.
- **Backend** ([`supabase/migrations`](supabase/migrations)) — Postgres with Row-Level Security, security-definer helpers, and `join_club` / `create_club` RPCs. Auth via email OTP + Google OAuth.
- **Navigation** — `expo-router` with a tab shell and nested stacks per section; scoring is a full-screen landscape modal.
- **State** — Zustand for the live match store, React Context for the auth session.

```
src/engine     pure scoring rules + selectors (tested)
src/db         sqlite schema + migrations
src/repos      match / club / session data access
src/sync       offline→cloud push
src/stores     zustand match store + session context
src/screens    MatchScreen (live scoring)
src/components  Court, DatePicker, AnimatedSplash
src/matchmaking fair doubles round generator (tested)
app/           expo-router routes (tabs, modals)
supabase/      Postgres migrations + RLS
tests/         jest suites (engine, sync, generator)
```

## Getting started

```bash
npm install
npm start        # then press a / i / w, or scan the QR in Expo Go (SDK 54)
```

The app runs **offline-only** out of the box with a seeded demo club and players — no backend required to try scoring, sessions, and stats.

### Enable the cloud backend (optional)

1. Create a free [Supabase](https://supabase.com) project.
2. Run the SQL in [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
3. Copy `.env.example` → `.env` and fill in your project URL and anon key:

   ```
   EXPO_PUBLIC_SUPABASE_URL=...
   EXPO_PUBLIC_SUPABASE_ANON_KEY=...
   ```

   > `.env` is gitignored — never commit real credentials.

## Scripts

| Command | Description |
|---|---|
| `npm start` | Start the Expo dev server |
| `npm run android` / `ios` / `web` | Launch on a target platform |
| `npm test` | Run the Jest suites |

Both `npx tsc --noEmit` and `npm test` are expected to pass before committing.

## Tech stack

Expo SDK 54 · React Native 0.81 · TypeScript · expo-router · expo-sqlite · Zustand · Supabase · Jest
