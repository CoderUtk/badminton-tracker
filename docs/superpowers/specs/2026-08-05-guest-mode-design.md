# Guest Mode Design

## Purpose

Let a person use the app without creating an account. A guest can do exactly two things:

1. Play and score a quick match. Matches are stored locally on the phone only — never synced to the cloud.
2. Spectate a tournament, given a share link or the tournament's raw id, pasted or typed in.

Nothing else is reachable in guest mode: no clubs, no sessions, no joining a tournament as a player or scorer, no profile.

## Guest identity: Supabase anonymous auth

Guest mode is backed by `supabase.auth.signInAnonymously()`. This creates a real (but anonymous) Supabase user and session.

Why: every guest-reachable read today (the tournament spectator RPC) is already granted to the `authenticated` Postgres role, not `anon`. An anonymous session satisfies that grant with zero backend changes. The alternative — a true no-session guest — would require auditing and loosening RLS/grants for every guest-reachable query, now and in the future, which is a wider and easier-to-get-wrong surface than one `signInAnonymously()` call.

An anonymous Supabase session is a `Session` like any other; `session.user.is_anonymous === true` distinguishes it from a real signed-in user.

## Entry point

`app/(auth)/sign-in.tsx` gets a new "Continue as guest" pressable, below the existing Google button. On press:

```ts
await supabase.auth.signInAnonymously();
```

`Gate` (see below) picks up the new anonymous session and routes to `/guest` automatically — no separate navigation call needed in the button handler beyond awaiting the call and letting the auth-state-change listener in `SessionProvider` do its job.

## Gate changes (`app/_layout.tsx`)

`Gate` currently has three states: no session → `/sign-in`; session but no display name → `/welcome`; session with display name → app routes. It gains a fourth: anonymous session.

- Anonymous sessions skip the display-name/`/welcome` step entirely (guests never see it — quick match and spectate don't need a stored display name).
- Anonymous sessions are confined to an allowlist of route prefixes:
  - `/guest`
  - `/new-match`
  - `/score/[matchId]`
  - `/join/tournament/[id]/spectator`
- Any other path (all of `(app)`, `/join/club/[id]`, `/join/tournament/[id]` player-join, `/join/tournament/[id]/scorer`) redirects an anonymous session to `/guest`. This includes deep links: if a guest taps a player-join or scorer-join link, they land on `/guest` instead of the join screen.

Real signed-in users are unaffected — this is purely a new branch keyed on `session.user.is_anonymous`.

## Guest shell (`app/guest.tsx`, new)

A single new screen, not part of the `(app)` tab group. Three actions:

1. **Quick match** → navigates to the existing `/new-match` screen, unchanged.
2. **Spectate a tournament** → navigates to a new small screen (see below).
3. **My matches** → navigates to a new local-history screen (see below).

Plus a "Sign in" link/button that calls `supabase.auth.signOut()` (ending the anonymous session) and replaces to `/sign-in`.

## Quick match (reused, unchanged)

`app/new-match.tsx` and `app/score/[matchId].tsx` require no changes:

- `createMatch(config, sideA, sideB, clubId, sessionId)` already accepts `clubId: null` and writes straight to the local SQLite `matches` table — no network call, no auth check.
- `listRealClubs()` queries clubs the current user belongs to; for an anonymous user this naturally returns `[]`, so the "Save to club" section in `new-match.tsx` simply doesn't render. No guest-specific branching needed.
- `sync/runner.ts`'s `unsyncedMatches()` query filters `where synced = 0 and club_id is not null` — a guest's `club_id = null` match is never picked up for push to Supabase, satisfying "stored locally on the phone" automatically, for guests and signed-in users alike.

## Spectate entry (`app/guest/spectate.tsx`, new)

A single text input ("Paste a tournament link or code") and a "Go" button. On submit:

```ts
const target = parseJoinTarget(input.trim());
if (target?.kind === "tournament") {
  router.push(joinRouteFor({ ...target, role: "spectator" }));
} else {
  toast("Couldn't find a tournament there. Check the link and try again.", "error");
}
```

`parseJoinTarget` and `joinRouteFor` are the existing helpers in `src/lib/joinLink.ts`, unchanged. Notably, `parseJoinTarget` already accepts a bare id as well as a full link (it splits on `/` and looks for a `join/tournament/{id}` shape, but a raw UUID with no `join/tournament/` prefix will *not* match today) — pasting the full share link works out of the box; pasting a bare UUID does not currently resolve. This is addressed in the implementation plan by extending `parseJoinTarget` to also accept a bare UUID as a tournament id when nothing else matches, since the spec's stated entry point is "link / tournament code" (and there is no separate short-code system — see design conversation).

Always forces `role: "spectator"` regardless of what's embedded in the pasted link, so a guest pasting a scorer or player link still only ever reaches the spectator view (defense in depth alongside the Gate allowlist).

`app/join/tournament/[id]/spectator.tsx` itself requires no changes — it already calls `getTournamentSpectatorView`, which hits the `tournament_spectator_view` RPC granted to `authenticated`, satisfied by the anonymous session.

## Guest match history (`app/guest/matches.tsx`, new, and `src/lib/guestMatches.ts`, new)

Problem: the local `matches` SQLite table has no owner/user column. `matchRepo.listMatches()` returns every match ever scored on that physical device, regardless of which account was signed in at the time. A naive guest history screen built on `listMatches()` would leak a previous signed-in user's matches to whoever taps "Continue as guest" next on a shared device.

Fix: track only the match ids created *during the current guest session* in AsyncStorage, and scope the history screen to those.

`src/lib/guestMatches.ts`:

```ts
const KEY = "guest_match_ids";

export async function recordGuestMatch(matchId: string): Promise<void> {
  const ids = await getGuestMatchIds();
  await AsyncStorage.setItem(KEY, JSON.stringify([matchId, ...ids]));
}

export async function getGuestMatchIds(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as string[]) : [];
}

export async function clearGuestMatchIds(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
```

- `new-match.tsx`'s `start()` calls `recordGuestMatch(id)` right after `createMatch` succeeds, but only when the active session is anonymous (checked via `useSession()`).
- `clearGuestMatchIds()` is called on the "Sign in" action in the guest shell, so a fresh guest session (or a real signed-in session afterward) starts with empty history. It is guest-session-scoped, not permanent local storage of guest identity — signing out of guest and back in as a *new* guest does not carry over the old list.
- `app/guest/matches.tsx` calls `getGuestMatchIds()`, then `matchRepo.getMatch(id)` for each, and renders them with the same list-item styling `app/(app)/matches/index.tsx` already uses (no new visual pattern).

## Out of scope (explicitly deferred, per brainstorming conversation)

- No upsell/prompt to create a real account after a guest quick match.
- No account upgrade/migration path (guest → real account keeping local data) — a guest who later signs in for real starts fresh; their guest quick-match data stays in local SQLite (never deleted) but is not surfaced anywhere once they're signed in normally, since it was never club-scoped.
- No short human-readable tournament join code — "tournament code" in the guest spectate flow means the existing UUID tournament id, pasted or (per the `parseJoinTarget` extension above) typed directly.
- No stripped/hidden version of the normal `(app)` tab bar — guest gets a fully separate, minimal shell instead, so no route in `(app)` needs a per-tab guest guard.

## Testing

- `parseJoinTarget` bare-UUID extension: unit tests in `tests/joinLink.test.ts` for a plain UUID input (no `join/tournament/` prefix) resolving to `{ kind: "tournament", id, role: "player" }` by default (role is overridden to `"spectator"` by the caller in `guest/spectate.tsx`, not by the parser).
- `guestMatches.ts`: unit tests for record/get/clear against a mocked AsyncStorage.
- `Gate`: existing test coverage (if any) extended for the anonymous-session branch — allowlisted paths pass through, everything else redirects to `/guest`, and the welcome/display-name step is skipped.
