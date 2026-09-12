# CourtSide — consolidated improvement report

**Date:** 2026-09-12 · **Branch:** master @ `6d4f9a6` · **Live:** Play `com.navalo.courtside` (Sports, 5+ installs, 0 ratings) + PWA `courtside-links.vercel.app`

Four phases: feature shortlist → marketing/ASO → Play Store assets → frontend critique.
Nothing in `src/` or `app/` was modified. New files: `docs/store-assets/*` and this report.

---

## Phase 0 — context

Verified surface: event-sourced BWF scoring engine (`src/engine`), sessions + attendance + cost split (`src/session`), clubs (`src/repos/clubRepo.ts`), tournaments + ops console (`src/tournament`), realtime spectating (`src/realtime`), guest mode (`app/guest*`, migrations `0043`/`0044`), club-scoped Elo rating + rating-balanced matchmaking (`src/matchmaking`, `0047_player_rating.sql`), achievements + share cards (`src/achievements`, `src/lib/share`).

Three facts that shaped everything below:

1. **Push infrastructure exists and fires once.** `0035_push_notifications.sql` ships `push_to()` + `register_push_token()`, wired to `src/lib/push.ts` / `notificationRoute.ts`, but only `notify_friend_request` uses it. Session reminders are local-only (`src/lib/reminders.ts`), so they can never reach a phone that stopped opening the app. Largest unexploited asset in the repo.
2. **Player rating shipped invisible.** `0047` writes `club_players.rating` on every completed match; nothing in the UI shows the *change*. Retention machinery built and not switched on.
3. **The engine records rallies, not shots.** `MatchEvent` is four variants; `MatchState.rallies: TeamId[]` is persisted. That is the hard boundary that kills the shot-analytics family of ideas — and is enough for match narrative at zero scorer cost.

---

## Phase 1 — feature shortlist (ranked by value ÷ effort)

**1. Server push for session lifecycle — S/M.** A club night only exists for people who open the app; the "you're in for Thursday" signal is still a WhatsApp message the organiser sends by hand, and a lapsed player is unreachable by design. Cheapest feature here because the delivery path is already built: triggers on `club_sessions` insert and `attendance` insert mirroring `notify_friend_request()` in `0035`, reusing `push_to()`, routed through `src/lib/notificationRoute.ts` into `app/(app)/sessions/[id].tsx`, plus a profile toggle next to the existing reminder setting. Highest retention value on the list and the only feature that can reach someone who stopped launching the app.

**2. Rating moments: post-match delta, ladder movement, shareable rank card — S.** Rating moves ±12 and the app never mentions it; the leaderboard in `app/(app)/clubs/[id].tsx` shows a static order with no sense of climb. Data is already there — `0047` sets `matches.rated` and updates `club_players.rating`, `clubRepo.ts` returns rating in the leaderboard query and exposes `listClubRatings()`. Missing: store pre-match rating on the match row for the delta, a `+12 → 1523, #3 in Riverside` line on the post-match screen, and a rank card reusing `src/components/share/CardShell.tsx` + the `BadgeSharePopup` pattern. One small migration, rest is UI. Retention (visible ladder) plus growth (rank screenshots are the most shareable artefact a racquet app has, and the share pipeline is already shipped).

**3. Recurring club night / session templates — S/M.** Organisers retype the same Thursday 7pm, same venue, same court cost every week in `app/new-session.tsx`. `createSession()` in `sessionRepo.ts` already takes the full input struct, so this is a `recurrence` column plus a `pg_cron` materialiser — and `pg_cron` is already enabled in prod for `purge-guest-matches` from `0044`. `planSessionReminders()` already caps at `MAX_SESSION_REMINDERS` and absorbs generated sessions unchanged. The organiser is the keystone user: if they stop creating sessions the whole club churns at once, so friction removed here has leverage far beyond its DAU count. Pairs with #1 — recurring session + push = a club night that runs itself.

**4. Cost settle-up: payment deep links + unsettled nudges — S.** `splitCost()` / `setAttendanceSettled()` plus `src/components/SessionCost.tsx` and `src/lib/money.ts` already compute who owes what and track a settled flag; collection is still the organiser chasing six people in a group chat. Lazy version: render a UPI intent (`upi://pay?…`) per unsettled share from amounts already computed, plus a push (reusing #1) to anyone unsettled 24h after the session. No payment processing, no PCI surface, no custody of funds — deep links only. Becomes the weekly obligation that reopens the app.

**5. Match momentum recap — S.** Match detail (`src/lib/matchDetail.ts`) shows a final score; the story — the 8-point run, the comeback from 14–19, who held serve through deuce — sits unused in `MatchState.rallies`. Pure derivation over existing events: biggest lead, longest run, lead changes, rally sparkline, rendered in match detail and dropped into the existing share card. No new event types, no scorer burden, no threat to offline-first. Best effort-to-shareability ratio available; also gives the `comebackKid` / `nailBiter` rules in `src/achievements/rules.ts` real evidence instead of a boolean.

**6. Guest → account conversion funnel — M.** Guest mode lets anonymous users score real matches, and `0044` then purges that history on a daily cron with no prompt to save it. Work: surface remaining-days on the guest match list, prompt at high-value moments (3rd match, first achievement via the existing `evaluateBadges` path), and migrate local rows into `matchRepo` on sign-in — `matchRepo.web.ts` and the guest storage layer already speak the same `MatchRecord` shape. M only because migrate-on-upgrade needs care around identity and idempotency. Guest + PWA is the cheapest acquisition channel and it currently leaks every user it earns.

**7. Public web player profile at `/u/username` — M.** Usernames shipped in `0029` and drive friend-add and join links, but there is no public artefact to point at — every share is an image, so zero inbound link surface. A public route on the existing Vercel deployment rendering record, `listClubRatings()`, `evaluateBadges()` and `playerAnalytics()` — all pure functions over data the repos already fetch — opt-in, exposing nothing that isn't already on a share card. The computation is free; the work is the public-read RLS surface, which is security-sensitive and must be designed deliberately rather than by loosening existing policies. Ranked last because the payoff is slow and the RLS work is the one place here where a mistake is expensive.

**Suggested order:** 1 → 2 → 3 as one retention arc (they compound), then 5 or 6 depending on whether the next push is shareability or funnel.

### Rejected

| Idea | Why |
|---|---|
| Shot-level analytics, serve placement, error tagging | Breaks the event model at its foundation and taxes the scoring UX — five taps per rally instead of one. #5 captures most of the insight for free. |
| Court booking / venue marketplace | Already a non-goal in `2026-09-09-open-sessions-design.md`. Needs a supply side the app can't bootstrap. Playo/Playtomic own it. |
| In-app chat | Out of scope in the v2 roadmap and should stay there. Every club already lives in WhatsApp; a second inferior inbox splits the conversation and drags in moderation. #1 delivers the actual need. |
| Cross-club global leaderboard | `apply_match_rating` validates every cited `club_player_id` belongs to the match's club — a deliberate security boundary. Global ladders compare incomparable pools and invite throwaway-club manipulation. |
| Double-elimination brackets | L effort in `bracket.ts` + `draw.ts` with realtime and ops implications, for a slice of a feature whose single-elim path is still young. Revisit on a real organiser request. |
| Video capture / AI line calling / shuttle sensors | Each is a new platform competency bolted onto an app whose advantage is working offline on a cheap phone in a sweaty hall. |
| Ads | Out of scope in the roadmap; RevenueCat-gated premium analytics is the better plan. |
| Availability polls as a feature | Redundant — `attendance` already carries `in / maybe / out`. It's a UI nudge inside #1. |

---

## Phase 2 — marketing

### Positioning

> CourtSide helps club organisers and weekly players run badminton nights — scoring, attendance, fair matchups, cost splitting — by replacing the WhatsApp group, the paper scoresheet and the spreadsheet with one free app that works offline.

Short form: **CricHeroes, but for badminton.**

Value props, ranked:
1. Club night runs itself: check players in, the app builds rating-balanced rounds, nobody sits out twice and no court is a mismatch.
2. Every player gets a real rating from real matches — club-scoped, automatic, with stats and a leaderboard behind it.
3. Full BWF scoring offline with no account, plus a share link so anyone watches live without installing anything.

Audiences in priority order: **(1)** club/session organisers — the person who does the admin, **(2)** competitive social players who care about rating/stats, **(3)** local tournament organisers. The organiser is the keystone: acquire one and they bring 16 players.

### GTM shape

Channel bias is badminton-community, not app-marketing: r/badminton, badminton Facebook groups (target *admin-heavy* organiser groups, they convert better than player groups), club WhatsApp forwards, Instagram reels. Ceiling of two Reddit posts in four weeks before it reads as a campaign. The PWA is the low-friction top of funnel — "open it in your browser" removes the install objection entirely; the install ask comes after the first session is run.

### ASO audit — live Play listing

**Tier:** Challenger (5+ installs, 0 ratings) → scored strictly against best practice.

| # | Dimension | Weight | Score | Note |
|---|---|---|---|---|
| 1 | Title & short description | 20% | 8/10 | `CourtSide: Badminton Scorer` (27/30) carries the high-intent keyword. Short desc 72/80, covers scoring + club + stats + offline. |
| 2 | Full description | 15% | **3/10** | ~390 of 4,000 chars used. Google indexes this field heavily — ~90% of the app's only keyword surface is empty. The long draft in `docs/PLAY_LISTING.md` was never applied to the live listing. |
| 3 | Visual assets | 25% | **4/10** | See below. |
| 4 | Ratings & reviews | 20% | **1/10** | 0 ratings. No in-app review prompt. |
| 5 | Metadata & freshness | 10% | 7/10 | Updated today, Sports is the right category, data safety complete, single locale is fine for the current market. |
| 6 | Conversion signals | 10% | 5/10 | Free, no ads, no IAP — all good; zero social proof. |

**Weighted: 44/100 — grade D.** Driven almost entirely by #2, #3, #4.

Visual asset findings (live listing, 6 phone screenshots + feature graphic):
- Screenshot **1** is a raw, unframed capture of an **empty** Home screen ("No clubs yet") with no caption. Play shows the first 2–3 in search results — this is the single worst slot in the listing to spend on an empty state.
- Styles are mixed: one raw portrait, one landscape scoring capture, five framed device mockups. The landscape image breaks the carousel rhythm.
- Captions on the framed set are **feature labels** ("Home", "Matches", "Sessions"), not benefits.
- **The hero feature — rating-balanced matchmaking — does not appear in any screenshot.**
- Feature graphic is brand-only (shuttlecock + wordmark); no value proposition.
- No preview video. Low priority on Play — only ~6% of users tap play.

**Content accuracy:** "best of 1/3/5" in the live listing is **correct** — `MatchConfig.bestOf` is `1 | 3 | 5` (`src/engine/types.ts:11`) and `app/new-match.tsx:548` renders all three. The stale claim is in `README.md` ("single game or best of 3"). `docs/PLAY_LISTING.md` named package `com.utkarsh.courtside`; live is `com.navalo.courtside` — **fixed**.

**Quick wins, in order:**
1. Paste the full description below (~2,750 chars) into Play Console. Biggest single ASO gain available, ~15 minutes.
2. Replace the screenshot set with `docs/store-assets/screenshot-01..08.png` — hero feature first, consistent frames, benefit captions.
3. Replace the feature graphic with `docs/store-assets/feature-graphic.png` (carries a value prop, not just the logo).
4. Nothing to fix on best-of — 1/3/5 is accurate. (`README.md` is the file that understates it.)
5. Add an in-app review prompt after a *won* match or a finished session (never mid-scoring). Zero ratings is 20% of the ASO score sitting at 1/10, and it is the cheapest number to move at this install count.

### Listing copy — paste-ready

**Title options** (≤30): `CourtSide: Badminton Scorer` (27, recommended — highest-intent keyword) · `CourtSide Badminton Club App` (28) · `CourtSide: Badminton Club` (25)

**Short description options** (≤80):
- A — `BWF scoring, club nights, fair matchups by rating. Works offline, no signup.` (76)
- B — `Score badminton by BWF rules, run club nights, track every player's rating.` (75)
- C — `Run club night: check-in, rating-balanced rounds, live scoring, cost split.` (75)

Run a Store Listing Experiment: A (breadth) vs C (organiser-specific). C should win on organiser traffic, A on generic "badminton scorer" search.

**Full description** (~2,750 / 4,000):

```
Every club night has the same problem: four good players end up on one court
and the game is over in nine minutes, while the court next to it is a 21-4.
CourtSide fixes that.

RATING-BALANCED MATCHMAKING
Every player carries a rating inside your club, worked out from the matches
they actually play. When you generate a round, CourtSide balances both the
courts and the teams by rating — so the games are close, and the strong
players aren't all stacked on court one. Nobody has to do the mental maths
at the door anymore.

RUN YOUR CLUB NIGHT
• Plan a session, check players in as they arrive
• Auto-generate doubles rounds so nobody sits out twice
• Split the session cost across whoever actually turned up
• Replaces the WhatsApp thread, the paper sheet and the spreadsheet

LIVE SCORING, FULL BWF RULES
• Singles and doubles, 11 / 15 / 21 points, best of 1, 3 or 5
• Automatic serve rotation and side switching
• A court diagram that shows you who serves next, and from where
• Undo any point when someone calls it wrong
• Works completely offline — sports halls have bad signal, this doesn't care

NO ACCOUNT NEEDED
Open the app and score a match as a guest. No signup wall, no email, no
"create your team" screen before you're allowed to keep score.

PLAYER STATS
Win percentage, club leaderboard, and achievements that come with a badge
card you can share in the group chat. Your rating moves with your results,
not with who shouts loudest.

LIVE SPECTATING
Share a link and people watch the score update live in their browser. No
install, no account. Good for the people waiting on the bench, and for
whoever couldn't make it.

TOURNAMENTS
Brackets, an ops console for the person running the desk, and separate join
links for scorers and spectators. Run a club championship or a local open
without a laptop and a printer.

WHO IT'S FOR
• The person who runs club night and does all the admin
• Players who want to know if they're actually improving
• Local tournament organisers who currently run it on paper

CourtSide is free. No ads. Works offline. There's also a web version at
courtside-links.vercel.app if you want to try it before installing anything.

Download it, take it to your next club night, and see how the courts look
when the app picks the teams.
```

**Screenshot captions** (order matters — hero first, objection last):

1. Rounds balanced by player rating ← hero
2. Club night, without the clipboard
3. Check players in as they arrive
4. Nobody sits out twice
5. Full BWF scoring, singles and doubles
6. The diagram shows who serves
7. Share a link. They watch live.
8. Free. Offline. No account needed.

### Launch playbook — rating-balanced matchmaking release

**Play release note / in-app "What's new"** (412 chars):

```
Rating-balanced matchmaking is here.

Every player now has a rating inside your club, built from the matches they
play. When you generate a round, CourtSide balances both the courts and the
teams by rating — so games are close instead of lopsided. The sit-out
tracking works exactly as before.

Also in this release: rating shown on player profiles and the club
leaderboard.

Take it to Tuesday and tell us how the courts looked.
```

**r/badminton post** — title: *The "everyone plays everyone" round robin is why half of club night is 21-6*. Problem-led, no link in the body (link in a comment only if asked), ends on a genuine question to the community so it reads as discussion rather than promotion. Post Tuesday or Wednesday morning. Full draft in the campaign copy section below.

**Club WhatsApp message** (written to be forwarded verbatim by an organiser):

```
Quick one for Tuesday — I've moved our sessions onto an app called
CourtSide. Two things change for you:

1. Check in on arrival instead of me shouting names at the door.
2. The rounds are now picked by rating, so the courts should be a lot
   closer. No more 21-5 while the next court goes to three ends.

Your rating just comes from the games you play here, it's not a public
thing, and nobody needs to sign up for anything. It's free and works
without signal in the hall.

Android: search "CourtSide badminton" on the Play Store
Or just open it in your browser: courtside-links.vercel.app

If you don't want to install it that's fine, I can check you in manually.
```

The last line is deliberate — it removes the social pressure that makes people ignore group-chat app requests.

**Instagram caption:**

```
Club night maths, solved.

Every player in your club has a rating that comes from the matches they
actually play. Hit generate, and CourtSide splits the courts AND the teams
by rating — so court one isn't the all-star game and court four isn't a
walkover.

It still tracks who's sat out. It still works with no signal. You still
don't need an account.

Free on Android, or open it in your browser. Link in bio.

#badminton #badmintonclub #badmintonlife #clubnight #badmintonindia
#badmintonuk #shuttlecock #badmintonplayer
```

**X / Twitter:**

```
New in CourtSide: every player has a club rating built from their actual
results, and the round generator now balances the courts AND the teams by
it.

Fewer 21-6s. Same "nobody sits out twice" rule.

Free, offline, no account: courtside-links.vercel.app
```

**Full r/badminton draft:**

```
Something I noticed running our Tuesday night for about two years: the
fairest-sounding way to make rounds is also the one that produces the worst
games.

You rotate people so everyone gets a turn with everyone. Sounds right. In
practice you get a court where two of the strongest players are partnered
together against two beginners, it's 21-6 in eleven minutes, and now four
people are annoyed — two of them bored, two of them embarrassed. Meanwhile
the court beside it is a genuine three-setter that nobody wants to end.

What actually makes club night good isn't equal rotation, it's close games.
Those are different problems. Equal rotation is about who plays. Close games
are about how the four are arranged once you've picked them.

The manual fix is what most organizers already do in their head: keep a
rough mental tier list, split the strong players across courts, don't stack
a team. That works until you have 24 people, six of them new, and three
regulars who've quietly got a lot better since January.

So I built the boring version of that. Every player has a rating inside the
club that updates from the matches they actually play (Elo-style, nothing
exotic). When you generate a round, it balances both the courts and the two
teams on each court, while still tracking who's already sat out. It shipped
this week in the app I use for our sessions, CourtSide — free, Android or
browser, works offline because our hall has no signal.

Full disclosure, I wrote it, so take the pitch with a pinch of salt. What
I'm actually curious about is the rest of you: how do you handle mixed-level
club nights? Fixed tiers? Separate courts by level? Random and accept it?
I've seen clubs do all three and I'm not convinced mine is the best one.
```

### Four-week content calendar

Arc: W1 problem recognition → W2 the feature → W3 proof and stats → W4 organiser recruitment.

| # | When | Channel | Hook | Format | Dependency |
|---|---|---|---|---|---|
| 1 | W1 Tue | r/badminton | "The 'everyone plays everyone' round robin is why half of club night is 21-6" | Text | draft above |
| 2 | W1 Wed | Instagram Reel | "Nine-minute game. Four annoyed people." | Reel (script 1) | hall footage |
| 3 | W1 Fri | Club WhatsApp | "Moving our sessions onto this from Tuesday" | Text | message above |
| 4 | W2 Mon | Instagram carousel | "How 16 players get sorted onto 4 courts" | 5 slides | screen recording of generate |
| 5 | W2 Wed | Badminton FB groups (organiser-heavy) | "How do you handle mixed-level club nights?" | Text + 1 screenshot | ask first, answer in comments |
| 6 | W2 Fri | Instagram Reel | "Press this button, stop doing the maths" | Reel (script 2) | footage |
| 7 | W3 Tue | r/badminton | "Six weeks of club ratings — here's what the curve actually looks like" | Text + chart | **needs real anonymised data** |
| 8 | W3 Thu | Instagram carousel | "Your win % is lying to you" | 4 slides | stats screenshots |
| 9 | W3 Sat | X + IG story | "Badge card drop: 10-match win streak" | Image | badge card render |
| 10 | W4 Mon | Instagram Reel | "Everyone in the hall watching the same score" | Reel (script 3) | live link footage |
| 11 | W4 Wed | FB groups + WhatsApp | "Running a club championship this season? Read this before you print the bracket" | Text | bracket + ops screenshots |
| 12 | W4 Fri | r/badminton comments + X | "What's still broken about your club night?" | Text | — |

Posts 1, 5, 7, 12 carry no link in the body. If post 7's real data doesn't exist by W3, swap in a second organiser-workflow carousel — do not fabricate the chart.

### Video scripts (shot lists)

**Script 1 — "The mismatch" (22s).** 0:00–0:03 court-level, a smash lands untouched, scoreboard 18-3, caption `Nine minutes. 18-3.`, ambient only, no music. 0:03–0:07 pan to the losing pair, hands on hips, `This is the fair rotation.` 0:07–0:12 cut to the next court, long rally, `This is the game everyone wanted.` 0:12–0:17 phone screen, tap Generate, rounds populate with ratings beside names, `Balanced by rating.` 0:17–0:22 wide shot, four courts all mid-rally, `CourtSide. Free, offline.` — Real hall, real players, real app footage at 0:12. The silence under the first seven seconds sells the dead game.

**Script 2 — "The generate button" (17s).** 0:00–0:03 crumpled paper list, names crossed out, `The Tuesday night list.` 0:03–0:07 paper down, phone up, check-in screen, names tapping green, `Check in.` 0:07–0:12 tap Generate, slow zoom on two courts with near-identical combined ratings, `Courts and teams, balanced.` 0:12–0:17 first serve of a rally, `Nobody sits out twice.` — One continuous hand-and-phone shot if possible. The paper in shot 1 does more work than any headline.

**Script 3 — "Watch from the bench" (25s).** 0:00–0:04 four people on a bench craning at court 3, `Three courts away.` 0:04–0:09 one opens a link, live score appears, `No app. Just a link.` 0:09–0:15 over-shoulder, score ticks 19-18, bench reacts, `19-18.` 0:15–0:20 tournament desk running ops on a tablet, `Scorer links. Spectator links.` 0:20–0:25 wide hall, bracket overlay, `CourtSide. Free on Android and web.` — The reaction shot is the whole video; don't fake the score update.

---

## Phase 3 — Play Store assets

Generated in `docs/store-assets/`, rendered from `assets.html` with headless Chromium at exact Play dimensions, using the real `src/theme.ts` tokens (`#0C0E12` ground, `#FF3B30` primary, `#22D3EE` accent, Russo One / Chakra Petch).

| File | Size | Use |
|---|---|---|
| `feature-graphic.png` | 1024×500 | Play feature graphic — hero is rating-balanced matchmaking, with a live court card showing a 4-point team gap |
| `screenshot-01..08.png` | 1080×1920 | Play phone screenshots, in caption order above |
| `promo-banner.png` | 1200×628 | Social / link-preview banner for the launch posts |
| `assets.html` | — | Source. `?s=s1..s8`, `?s=fg`, `?s=pb`. Edit and re-render to change copy. |

Re-render command:

```bash
CH="$LOCALAPPDATA/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe"
"$CH" --window-size=1080,1920 --virtual-time-budget=4000 --screenshot=screenshot-01.png "file:///.../assets.html?s=s1"
```

These are **designed mockups built to the real design system**, not captures of the running app. Screens 1, 3 and 4 depict UI that is close to but not pixel-identical to the shipped app — review them against the real screens before upload, and treat the round-generator layout in screenshot 1 as a design proposal as much as a store asset. Play policy requires screenshots to represent actual app functionality; every feature shown here ships today.

### Blocked — needs your account, cannot be done from here

- **Figma** (`figma-generate-design`) — the Figma MCP server is listed as requiring authorization and this session cannot run the OAuth flow. If you want real editable Figma frames rather than HTML, authorize the connector and say so; the HTML above ports cleanly.
- **Canva** — skipped per your instruction.
- **Play Console upload** — assets and copy are ready; uploading the listing, running the Store Listing Experiment, and publishing the release are yours to do.
- `plugin:ecc:chrome-devtools` MCP failed to connect this session (cached failure, retries in ~15 min). Nothing here depended on it.

---

## Phase 4 — frontend audit

Four passes (impeccable → design-critique → apple-design → web-design-guidelines), cross-checked against `docs/audit/2026-08-12-ux-audit/AUDIT.md` so nothing already fixed is re-reported (H1–H6, M1, M2, M4, M7–M10, A3, A8, P1, P3, P5, P16, P17 verified fixed and excluded).

**Health: 11/20** — accessibility 2/4, performance 3/4, theming 3/4, platform conformance 2/4, adaptivity 1/4. The theme layer is genuinely strong; six screens were written before it and never migrated onto it.

### P0

| # | Location | Problem | Fix |
|---|---|---|---|
| 1 | `src/components/Icon.tsx:43` | Decorative icon glyphs aren't hidden from screen readers. Every card, row, chip and button embeds `Icon`, so TalkBack reads a glyph or empty string before the real label — root cause of prior finding A1, patched only at the tab bar. | `accessible={false} importantForAccessibility="no"` inside `Icon`. One change clears it app-wide. |
| 2 | `app/(auth)/sign-in.tsx:157,196` | No password recovery anywhere in the app (`resetPasswordForEmail` never called) and no `autoComplete`/`textContentType` on the password field, so keychains neither fill nor save. A user who forgets their password is locked out permanently. | Add the autocomplete attributes and a "Forgot password?" link. |

### P1

**Accessibility**
- `app/(app)/profile/index.tsx` +19 more — **171 of 202 `Pressable`s have no `accessibilityRole`.** Worst: profile (22/0), `tournaments/new.tsx` (10/0), `sessions/[id].tsx` (10/0), `matches/index.tsx` (8/0), `new-match.tsx` (7/0). Add the role; lint with `eslint-plugin-react-native-a11y`.
- `src/components/Toaster.tsx:17` — the app's only error channel (30+ `toast(…, "error")` call sites) has no `accessibilityLiveRegion`, so failures are silent for screen-reader users. Add `"assertive"` for errors, `"polite"` for success.
- `src/screens/MatchScreen.tsx:349` — score changes aren't announced on the most-used screen. `accessibilityLiveRegion="polite"` + a label of the form `"12 – 9, {team} serving"`.
- `app/(app)/matches/index.tsx:126` and `app/new-match.tsx:454,535` — filter chips and the Doubles/Singles + Points/Games segments are bare pressables with colour-only selection: a regression of prior finding A4, in files that already import (or could import) `Chip` / `SegmentedControl`. `new-match.tsx` uses `SegmentedControl` correctly *elsewhere in the same file*. Replace the local ones.
- `src/components/BracketView.tsx` — bracket cells announce as raw data (`"3, —"`, `"C1, Jjjj, Utkarsh"`); prior A2 still open. Composite label per cell: `"Round 2, match 3: Jjjj versus Utkarsh, Utkarsh won"`.

**Touch targets** (theme defines `MIN_TOUCH = 48`)
- `src/screens/MatchScreen.tsx:478,504,507` — undo / redo / orientation are 46×40, End is 40 tall, none with `hitSlop`. Mis-tapping End during a live match is destructive.
- `app/(app)/tournaments/[id].tsx:448` — bracket refresh is **28×28** with no `hitSlop`, and it's the control a spectator taps most.
- `app/new-match.tsx:593,607` — points and best-of chips are 40 tall, 4 dp apart, on the primary setup screen.

**Responsive / PWA**
- **Zero visible focus states in the entire web build** — no focus ring anywhere in scope. On `courtside-links.vercel.app` a keyboard user has no idea what is focused. WCAG 2.4.7 failure. Add a shared `focusRing` in `theme.ts`, applied via `Pressable`'s `focused` state on web.
- `app/guest.tsx:75` — the PWA front door can't scroll (`flex:1` + `justifyContent:"center"`, no `ScrollView`). At 200% text scale, in landscape, or in a short desktop window, content overflows unreachably.
- `app/(app)/index.tsx:246`, `matches/index.tsx:241`, `sessions/index.tsx`, `profile/index.tsx:242` — no max-width container on any list screen, so a desktop PWA stretches a match card to 1600px. `app.json` also sets `supportsTablet: true` with no size-class branching. Add a `Screen` wrapper at `maxWidth: 640`.
- `src/components/FormScreen.tsx:19` — two conflicting keyboard strategies, and the shared one is the weaker. `FormScreen` (sign-in, welcome, profile edit) relies on `adjustResize`, which `app/_layout.tsx:267` itself documents as ignored under Android 15 edge-to-edge — which is why `new-match.tsx` uses `KeyboardProvider` instead. The password field can still sit behind the IME: the original H1 failure mode. Move `FormScreen` onto `KeyboardAwareScrollView`; the provider is already mounted at the root.

**Consistency**
- **~70 style rules across 22 files declare `fontWeight` with no `fontFamily`.** `F.bold` etc. are separate Chakra Petch families — RN will not synthesise them from a weight, so roughly a third of the app renders in Roboto: Matches, Sessions, Session detail, Profile, Club detail, New match and Guest matches, while Home, dialogs and the scoreboard render in the brand faces. `fontWeight: "900"` is additionally a no-op on most Android system fonts. Replace every `fontWeight` with the matching `F.*`; ban `fontWeight` in `StyleSheet.create` via lint.
- Four competing implementations of one control: `SegmentedControl.tsx`, `Chip.tsx`, `new-match.tsx:592`, `matches/index.tsx:246`. The two components are correct and documented; the two ad-hoc ones are the drift (and the source of the a11y regressions above). Delete them.
- `app/(app)/tournaments/[id].tsx:371` — four identically styled buttons, two different behaviours: Config/Players/Scorers open a panel in place, Ops navigates away. Give Ops a chevron and visual separation.

**Motion**
- `src/components/PressableScale.tsx:28` — the app's universal press animation ignores Reduce Motion, while six other components (`Sheet`, `BottomPanel`, `BracketView`, `Toaster`, `AnimatedSplash`, `tour`) gate correctly. Add `useReducedMotion()`; keep the opacity dim.

**Empty / error / loading**
- **No pull-to-refresh anywhere** — zero `RefreshControl` in the repo. Data reloads only on `useFocusEffect`, so someone watching a live session can't force a refresh without leaving the tab. Wire it on the four tab lists to the existing `refreshClubs` / `refreshSessions` / `syncNow`.
- `app/(app)/index.tsx:150` — Home renders a blank void while loading (`status === "pending" ? null : …`), no skeleton, no spinner. First impression on a cold start.

**Copy**
- `app/(auth)/sign-in.tsx:196` — placeholder legal text ("By continuing you agree to keep it friendly on court.") sits exactly where Terms and Privacy links belong, on the account-creation screen. Both Play and the PWA require a reachable privacy policy at that point, and `public/privacy.html` already exists, unlinked. Replace with real links.

### P2 (polish)

`tournaments/[id].tsx:450` tab buttons ~38dp · `Stepper.tsx:41` 44×44 (4dp short on Android) · `sessions/[id].tsx:493` pairing chips 36dp (use `Chip`, already imported in that file) · `StatTile.tsx:30` `minHeight:38` calibrated at 1× font scale only · `app.json:41` `predictiveBackGestureEnabled:false` with no rationale · `AppDialog.tsx:40` and `welcome.tsx:41` unguarded entrance animations · `sessions/[id].tsx:497` two raw hex values (`#211819`, `#5B2524`) outside the token system · `Icon.tsx:10` two icon families mixed at the same optical size · `sessions/[id].tsx:192` renders the raw DB enum (`SCHEDULED` / `DONE`) as the hero eyebrow · `sign-in.tsx:114` sign-up accepts a password the server will reject (`length > 0` vs the promised 6) · `guest.tsx:19` the PWA's only CTA opens the Play Store unconditionally, a dead end on desktop and iOS.

### Where the passes disagreed

- **Brand font vs platform font.** apple-design argues for the system font by default, which would make the 70 unstyled `fontWeight` rules an improvement. impeccable and design-critique score it as a consistency failure. Filed as P1 with impeccable: the split is accidental, not chosen, and the same screen mixes both faces.
- **Mixed icon families.** impeccable rates it P1 platform-conformance drift; design-critique rates it minor at 16–22pt. Filed P2.
- **Title Case (web-design-guidelines) vs the app's sentence case.** Not filed — the guideline is web-idiomatic, the app's convention is internally consistent and correct for native.
- **Springs everywhere (apple-design) vs Reduce Motion.** Both right; the fix is the gate, not removing the spring.

**Genuinely strong:** `src/theme.ts` (the `selected`/`danger` split, `carved`, `BLOOM`, `SCOREBOARD_TYPE` — each carries the audit finding it answers), `Chip` / `SegmentedControl` / `AppDialog` / `Toaster`, the orientation-lock ownership in `MatchScreen.tsx:114`, and the epoch-guarding in `app/(app)/index.tsx:44`.

---

## Recommended next moves

1. **Today, 30 minutes, no code:** paste the full description, swap the screenshots and feature graphic. Moves the ASO score from 44 to roughly 70.
2. **One small PR:** P0 #1 (`Icon` a11y, one line) + the `fontWeight` → `F.*` sweep + `PressableScale` reduced-motion. Highest ratio of user-visible improvement to diff size in the audit.
3. **Next feature:** #1 session push. It unblocks #3 and #4, and it's the only item that can reach a lapsed user.
4. **Before any marketing push:** add the in-app review prompt. Driving installs onto a listing with zero ratings wastes the traffic.
