# Play Console — Store Listing & Declarations

Answers/declarations for CourtSide on Google Play.

App package: `com.navalo.courtside`

> **This document was rewritten on 2026-09-12.** The previous version described
> an offline-only build with no accounts and declared "Data collected: None" —
> stale, since the app now has Supabase accounts, cloud sync, avatar uploads and
> Sentry crash reporting.
>
> **The Play Console itself was already up to date when this was checked on
> 2026-09-12** — Data safety answers "Yes" to collection and to encryption in
> transit with 9 personal-info data types declared, the feature graphic is in
> place, and the live full description is already the optimised copy. Only this
> document was out of date. Treat what follows as a record of what the app
> actually collects, useful for re-checking the console against the code — not
> as a form that still needs filing from scratch. Each claim names its source
> file.

---

## App content → Data safety

**Does your app collect or share any of the required user data types?** → **Yes**

Nothing is *shared* with third parties for advertising or analytics resale. Data
is *collected* (transmitted off-device to Supabase, and to Sentry for crashes).

| Data type | Collected | Shared | Purpose | Linked to user | Optional? | Source |
|---|---|---|---|---|---|---|
| Email address | Yes | No | Account management, authentication | Yes | No (unless guest) | Supabase auth |
| Name / username | Yes | No | App functionality (display name on matches, clubs) | Yes | No | `src/repos/profileRepo.ts` |
| Photos | Yes | No | App functionality (profile picture) | Yes | **Yes** | `uploadAvatar`, `profileRepo.ts:184` |
| App activity — other user-generated content | Yes | No | App functionality (matches, sessions, clubs, attendance, tournaments) | Yes | No | match/session/club repos |
| Crash logs | Yes | No | Diagnostics | No | No | `src/lib/observability.ts` |

Supporting answers:

- **Is all user data encrypted in transit?** → **Yes** (Supabase over HTTPS).
- **Do you provide a way for users to request that their data be deleted?** →
  **Yes.** In-app: Profile → Delete account (`app/(app)/profile/index.tsx:624`),
  which also removes the avatar from storage (`profileRepo.ts:254`).
- **Crash logs and PII:** Sentry runs with `sendDefaultPii: false` and a
  `beforeSend` scrubber that strips usernames/emails, and console breadcrumbs are
  dropped entirely (`observability.ts`). Declare crash logs as **not** linked to
  the user.

### Two things worth confirming

1. **Avatars are world-readable.** `uploadAvatar` calls `getPublicUrl` on the
   `avatars` bucket, so a profile picture is served from an unauthenticated URL.
   That is legitimate, but it is *sharing* in the plain-English sense and the
   privacy policy should say profile pictures are publicly accessible by link.
2. **Guest mode.** Guest sessions are anonymous Supabase users — local matches
   still sync under an anonymous id, so "no data leaves the device" is not an
   accurate description of guest mode either.

## App content → Privacy policy

**URL:** `https://courtside-links.vercel.app/privacy`

This is live and is the same URL linked from the sign-in screen
(`app/(auth)/sign-in.tsx`). The old GitHub Pages / raw-file suggestions in the
previous version of this doc are obsolete.

Check the policy text actually covers: email, display name, avatar (and that it
is public), match/session/club content, and Sentry crash logs. If it still
describes an offline-only app it needs updating — the listing is already live.

## App content → Content rating (IARC questionnaire)

- Category: **Utility / Reference / Other** (or Sports)
- Violence / sexual / language / controlled substances: **No** to all
- **User-generated content shared with others: Yes.** Club names, session
  locations, display names and avatars are visible to other members, and
  tournaments can be shared by link. This answer changed from the old doc —
  answering "No" here with clubs shipped would be inaccurate.
- Expected rating: **Everyone / PEGI 3**

## App content → Target audience and content

- Target age group: **13+** (not designed for children)
- Appeals to children: **No**

## App content → Ads

- Contains ads: **No**

## App content → Government apps / News / COVID

- **No** to all.

## App access

**Not** "all functionality available without special access" any more. Clubs,
sessions, tournaments and stats require an account.

Provide Play with test credentials, or point reviewers at **Continue as guest**
on the sign-in screen, which reaches quick match + spectate without a login.
Safest is to supply a real test account so the reviewer can see club/tournament
screens; otherwise those flows look broken to them.

## Permissions to sanity-check on the release AAB

The locally generated debug manifest declares `RECORD_AUDIO` and
`SYSTEM_ALERT_WINDOW`, which are almost certainly pulled in by `expo-dev-client`
and should **not** appear in a release build. Before upload:

```bash
bundletool dump manifest --bundle=app-release.aab | grep uses-permission
```

Expected in release: `INTERNET`, `VIBRATE`, and storage/media for avatar picking.
If `RECORD_AUDIO` or `SYSTEM_ALERT_WINDOW` survive into the AAB, Play will ask
you to justify them — track down the module that declares them first.

---

## Store listing copy

- **App name (30 max):** `CourtSide: Badminton Scorer` — 27 chars
- **Short description (80 max):**
  `Live badminton scoring, club sessions, and player stats — works offline.` — 72 chars
- **Full description (4000 max, and Google DOES index this):**
  ```
  CourtSide is the badminton app for clubs, leagues, and casual players who
  want more than a paper scoresheet. Run your club sessions, score matches
  with real BWF rules, and see who's actually winning — all in one badminton
  scoring and club management app.

  LIVE MATCH SCORING
  • Full BWF rules — singles & doubles, best of 1/3/5
  • Automatic serve rotation and side-switching
  • Match history saved automatically, no scorebook needed

  CLUB SESSIONS
  • Plan sessions, check players in, track attendance
  • Auto-generate fair matchups so nobody sits out twice
  • Built for weekly club nights, drop-in play, and coaching groups

  TOURNAMENTS & BRACKETS
  • Run a tournament bracket for your club or league
  • Track standings and share results with players

  PLAYER STATS & RATINGS
  • Win %, form, best partner, and a player rating that updates as you play
  • See your improvement match over match

  WORKS OFFLINE
  • No account required to start scoring, no signup wall
  • Full scoring and stats work without a connection — sync later if you want

  Whether you're running a badminton club, organizing a local tournament, or
  just keeping score with friends, CourtSide replaces the spreadsheet and the
  scorebook. Download CourtSide free and start your next match.
  ```

## Graphics — all produced, in `docs/store-assets/`

| Play slot | File | Size | Required |
|---|---|---|---|
| Feature graphic | `feature-graphic.png` | 1024×500 | Yes |
| Phone screenshots | `screenshot-01..08.png` | 1080×1920 | Min 2, **max 8** |
| Matchmaking (device captures) | `matchmaking-*.png` | device | Optional extras |
| Promo banner (off-Play marketing) | `promo-banner.png` | 1200×628 | Not a Play slot |

App icon 512×512 is taken from the existing adaptive icon assets.

Play accepts a maximum of 8 phone screenshots, and `screenshot-01..08` is
exactly 8 — so the `matchmaking-*.png` captures cannot also be uploaded as phone
screenshots. Swap them in for weaker frames if you prefer real device captures
over the rendered ones; do not try to upload all eleven.

---

## What is actually left to do

Checked against the live console on 2026-09-12. Most of this listing is already
done; what follows is only the remainder.

**Outstanding:**

1. **Phone screenshots — 5 of 8 filled.** All eight `screenshot-01..08.png` are
   already uploaded to the Play asset library, so this is Add assets → select
   the eight → Save. No re-upload needed.
2. **Full description — one line.** The live copy reads "No account required, no
   signup wall"; it should read "No account required to start scoring, no signup
   wall", since clubs, sessions and tournaments all need an account.
3. **Verify the privacy policy text** at `https://courtside-links.vercel.app/privacy`
   still matches the app — in particular that it covers the public avatar URL.
   The URL is set correctly in the console; only the wording is unverified.
4. **Check the release AAB's permissions** (see the section above) before the
   next upload.

> Attempts to make changes 1 and 2 through browser automation on 2026-09-12
> failed twice: the edits staged cleanly and Save reported success, but nothing
> persisted and Publishing overview showed no pending change. Cause unknown —
> worth checking whether the signed-in account has store-listing edit rights.
> Doing it by hand in the console is the reliable route.

**Already done, confirmed in the console — do not redo:**

- Data safety questionnaire (collection Yes, encrypted in transit Yes, 9
  personal-info data types)
- Feature graphic
- Privacy policy URL
- App name and short description
- The rest of the full description copy

Note that managed publishing is **off**, so a saved change goes to review and
publishes on its own — there is no manual gate to hold it back.
