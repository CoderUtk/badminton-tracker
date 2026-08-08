# Notifications — design

Date: 2026-08-08
Status: approved, ready for implementation planning

CourtSide ships one notification today: a local 7-day inactivity nudge in
`src/lib/reminders.ts`, gated by the `reminders_on` row in `app_settings` and
toggled from the profile screen. There is no push infrastructure of any kind —
no device-token table, no edge functions, and none of the 34 existing migrations
touch notifications.

This spec adds a small push surface for the two events where another person is
waiting on the user, plus a local scheduler for session reminders. It is
deliberately minimal: notifications are not a critical feature here, so the
design optimises for the least standing infrastructure rather than the most
delivery guarantees.

## Scope

**Push (server-triggered), 2 events:**

| Event | Target | Source |
| --- | --- | --- |
| Friend request received | `friendships.addressee_id` | insert on `friendships` |
| Club join request received | club owner + admins | insert on `club_join_requests` |

**Local (device-scheduled), 2 events:**

| Event | Timing | Source |
| --- | --- | --- |
| Session starts soon | `starts_at - 1h` | `sessions_cache` |
| Inactivity nudge | 7 days after last app open | existing behaviour |

**Explicitly out of scope**, each decided during design:

- Live-match and tournament notifications. Most urgent, but the hardest to
  target correctly and the most annoying when wrong.
- Session *creation* notifications. One organiser adding three sessions to a
  30-member club is 90 pushes; that pattern is what gets an app muted. Members
  discover new sessions in-app.
- Session cancellation notifications. Genuinely useful, but it is a push and
  the local-only decision for the Sessions group takes precedence. Revisit if
  users report showing up to cancelled sessions.
- Friend-request-accepted and join-request-approved/denied. Confirmations of
  the user's own action; they will see the result in-app.
- Weekly recap and abandoned-match reminders.
- An in-app notification centre. OS delivery only — nothing is persisted, so a
  missed notification is gone. Acceptable because both push events already have
  a screen that lists them (friends, and the club request queue).
- Per-category preferences and quiet hours. One master toggle.

## Architecture

### Delivery: trigger → pg_net → Expo, no worker

A Postgres trigger POSTs directly to `https://exp.host/--/api/v2/push/send` via
`pg_net`. No outbox table, no `pg_cron`, no edge function, and therefore no
deploy step or function secrets. This project has never deployed an edge
function; this design keeps it that way.

The cost of skipping a worker is that nothing polls Expo's receipts endpoint, so
`DeviceNotRegistered` tokens are never reported back. Instead of pruning dead
tokens, they are aged out: the client re-upserts its token on every launch, and
every send query filters to tokens seen within 60 days. A device that stops
launching the app stops receiving pushes 60 days later and its row is simply
never selected again. This removes the only recurring job the system would
otherwise need.

Rejected alternatives:

- **Outbox + `pg_cron` + edge function drain.** The reliable design — retries,
  batching, receipt handling, an inspectable queue. Rejected as disproportionate
  infrastructure for a non-critical feature.
- **Client-invoked edge function.** The acting client calls a function after its
  own mutation. Dies whenever the sender's app does, and is spoofable: any
  client could ask the server to push arbitrary text to arbitrary users.

### Prerequisite: Android FCM credentials

There is no `google-services.json` in the repo and no `android.googleServicesFile`
key in `app.json`. Android push in a standalone build requires a Firebase project
and its FCM V1 service-account key uploaded to EAS credentials.

**This is console work that gates the entire push half of this spec.** The local
half is unaffected and can ship without it. Implementation should sequence the
local work first so it is not blocked.

## Data model

Migration `0035_push_notifications.sql`.

```sql
create extension if not exists pg_net;

create table public.push_tokens (
  token       text primary key,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  platform    text not null check (platform in ('ios', 'android')),
  updated_at  timestamptz not null default now()
);

create index push_tokens_profile
  on public.push_tokens (profile_id, updated_at desc);
```

`token` is the primary key, not a surrogate id. When a device switches accounts
the upsert overwrites `profile_id` in place rather than leaving a second row
behind; without this, the previous user's friend requests keep arriving on a
phone they no longer own.

RLS restricts every operation to `profile_id = auth.uid()` and blocks anonymous
JWTs, consistent with `0018_anon_rls_restrictions.sql`.

There is no preferences table and no preferences column. With a single master
toggle, **the presence of a token row is the setting**: on registers, off
deletes. Every send query is a plain join against `push_tokens`.

## Send helper

```sql
create or replace function public.push_to(
  p_profile_ids uuid[], p_title text, p_body text, p_data jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare v_messages jsonb;
begin
  select jsonb_agg(jsonb_build_object(
           'to', t.token, 'title', p_title, 'body', p_body,
           'data', p_data, 'sound', 'default', 'channelId', 'default'))
    into v_messages
    from push_tokens t
   where t.profile_id = any (p_profile_ids)
     and t.updated_at > now() - interval '60 days';

  if v_messages is null then return; end if;

  perform net.http_post(
    url     := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := v_messages);
end $$;

revoke execute on function public.push_to(uuid[], text, text, jsonb)
  from public, anon, authenticated;
```

Two clauses are load-bearing:

- The **60-day filter** is the entire token-lifecycle strategy. Removing it
  reintroduces the need for a cleanup job.
- The **revoke** matters because the function is `SECURITY DEFINER` and reads
  every user's tokens. Without it, any authenticated client could push arbitrary
  text to arbitrary users. Only triggers may call it.

`net.http_post` is fire-and-forget: it queues the request and returns
immediately, so the trigger does not block the transaction on network latency.

## Triggers

**Friend request** — `after insert on public.friendships`, guarded on
`new.status = 'pending'`. Targets `new.addressee_id`. The actor's name comes from
`profiles`, falling back `display_name → username → 'Someone'`.

**Join request** — `after insert on public.club_join_requests`, guarded on
`new.status = 'pending'`. Targets
`club_members where club_id = new.club_id and role in ('owner', 'admin')`,
excluding the requester (who may already be a member in another role).

`is_club_admin()` cannot be reused for targeting: it is `auth.uid()`-based and
answers "am I an admin", not "who are the admins".

`request_club_join` only inserts on the pending path — an existing pending row
short-circuits and a denied row raises — so `after insert` covers every case and
no update trigger is needed.

Both trigger bodies end with:

```sql
exception when others then return new;
```

A raising trigger would roll back the transaction that fired it. A broken
notification must never prevent someone from sending a friend request.

## Client

### `src/lib/push.ts` (new)

Token lifecycle only.

- `registerPushToken()` — no-op on web. Checks permission, prompting only when
  the status is `undetermined`. Calls `getExpoPushTokenAsync({ projectId })`
  with the project id from `extra.eas.projectId` in `app.json`. Upserts
  `push_tokens` with `platform` and `updated_at = now()`.

  This runs on every launch when signed in and the toggle is on. That upsert is
  the heartbeat the 60-day staleness window depends on — if it stops running on
  launch, live devices age out and silently stop receiving pushes.

- `unregisterPushToken()` — deletes only *this device's* token row. The toggle
  lives in device-local `app_settings`, so it is per-device; deleting all of the
  user's rows would silently disable push on their other devices.

`unregisterPushToken()` has two call sites: the settings toggle, and sign-out.
The sign-out path is easy to miss and its failure mode is bad — the next person
to sign in on that device receives the previous user's notifications until they
happen to toggle the setting.

Two pieces of Expo setup fail silently if omitted:

- `setNotificationChannelAsync('default', { importance: HIGH })` on Android. The
  payload names `channelId: 'default'`; without the channel, Android 8+
  downgrades delivery.
- `setNotificationHandler`, without which nothing renders while the app is
  foregrounded.

### `src/lib/reminders.ts` (rewrite)

The current implementation calls `cancelAllScheduledNotificationsAsync()` on
every reschedule. That is incompatible with having more than one reminder type —
scheduling a session reminder would be wiped by the next inactivity reschedule.
This is why the file is rewritten rather than extended.

Replaced with stable identifiers:

- `"inactivity"` — the 7-day nudge, rescheduled from now on each app open.
- `"session:<sessionId>"` — one per upcoming session.

Cancellation becomes `cancelScheduledNotificationAsync(identifier)`, scoped to
what the caller owns.

`syncSessionReminders()` runs after session sync and on focus. It reads
`sessions_cache`, schedules a `DATE` trigger at `starts_at - 1h` for upcoming
non-cancelled sessions, and cancels identifiers for sessions that were cancelled
or have passed.

Capped at the **10 soonest** sessions. iOS silently drops scheduled
notifications past 64 pending, and a member of several active clubs would reach
that.

### Testability

This repo has no `@testing-library/react-native` and no `react-test-renderer`, so
component and Expo-API code is not reachable from jest. The scheduling decision
is therefore extracted into a pure module:

```ts
planSessionReminders(sessions, now, existingIds, max)
  → { toSchedule: ScheduledReminder[], toCancel: string[] }
```

Jest tests this directly: sessions already scheduled are not rescheduled,
cancelled sessions produce cancellations, the cap selects the soonest, and
sessions less than an hour out are skipped rather than scheduled in the past.

The Expo calls wrapping it stay thin enough to review by eye. SQL triggers have
no local Postgres harness in this project and are verified manually.

### Settings

`app/(app)/profile/index.tsx` already has the reminders toggle and a
permission-denied toast ("Enable notifications in Settings to get reminders").
Relabel to "Notifications". On enable: request permission, register the token,
schedule reminders. On disable: delete the token row, cancel owned identifiers.

### Deep links

`addNotificationResponseReceivedListener`, plus
`getLastNotificationResponseAsync()` to handle a cold start from a tapped
notification. Routes on `data.type`:

| `type` | Destination |
| --- | --- |
| `friend_request` | friends screen |
| `join_request` | `app/(app)/clubs/requests/[clubId].tsx` |
| `session` | `app/(app)/sessions/[id].tsx` |

The `badminton` scheme is already registered in `app.json`.

This lands in `app/_layout.tsx`, which has had uncommitted changes from a
concurrent session — check its state before editing.

## Copy

Voice derived from shipped strings ("Name updated", "You are already a member",
"Couldn't share"): sentence case, no emoji, no exclamation marks, contractions
fine, specific over clever. Name the actor — "Priya wants to be friends" beats
"New friend request".

| Event | Title | Body |
| --- | --- | --- |
| Friend request | Friend request | `{name} wants to be friends.` |
| Join request | Join request | `{name} wants to join {club}.` |
| Session soon | Session in an hour | `{club} at {time}.` |
| Inactivity | Miss the court? | `It's been a week. Start a match.` |

The inactivity title is unchanged — it is the one warm string in the app and it
is already in production.

## States and failure modes

| Condition | Behaviour |
| --- | --- |
| Permission denied | Nothing scheduled, no token registered. Toggle stays off, existing toast explains. |
| Toggle off | Token row deleted, all owned identifiers cancelled. Server naturally skips the user. |
| Signed out | No token registered. Existing rows are removed by `on delete cascade` only if the profile is deleted, so sign-out must explicitly unregister. |
| Web | Every entry point no-ops, as today. |
| No FCM credentials | Android push silently never arrives. Local reminders unaffected. |
| Expo push request fails | Lost silently. Accepted: no retry by design. |
| Token older than 60 days | Excluded from sends until the next launch re-upserts it. |
| Trigger raises | Swallowed by the exception handler; the originating insert still commits. |

## Verification

Automated (jest, pure logic): `planSessionReminders` across the cases listed
above.

Manual, on device:

1. Enable the toggle, confirm a token row appears with the right `profile_id`
   and `platform`.
2. Second account sends a friend request; confirm the banner arrives and the tap
   opens the friends screen.
3. Request to join a club; confirm every owner and admin receives it and the
   requester does not.
4. Create a session ~70 minutes out; confirm the reminder fires at `-1h` and
   that the inactivity nudge is still scheduled afterwards — this is the exact
   regression the identifier rewrite exists to prevent.
5. Cancel that session; confirm the reminder is cancelled.
6. Disable the toggle; confirm the token row is deleted and nothing arrives.
7. Sign out; confirm no token remains.
8. Cold start from a tapped notification lands on the right screen.

## Open items

- Firebase project and FCM V1 key upload to EAS. Blocks push; does not block
  local reminders.
- Confirm `pg_net` is available on this Supabase project before writing the
  migration.
- The friends screen route for deep linking needs to be confirmed during
  planning.
