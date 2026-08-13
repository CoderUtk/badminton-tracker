# Courtside — UI/UX Audit (Android)

**Date:** 2026-08-12
**Build:** `com.navalo.courtside` dev client, Metro bundle from `master` @ `93b5b9b`
**Device:** realme NARZO 80 Lite (RMX5313), Android 15, 720 × 1600 px (≈360 × 800 dp, 2× density)
**Method:** mobile-mcp over ADB. Per screen: accessibility tree dump (`mobile_list_elements_on_screen`) + screenshot. Coordinates below are device pixels.
**Account state:** signed in as `UtkarshAgrawal`, 1 club (`Weekend`, 3 members), 3 sessions, 3 tournaments, 0 matches at start.

This document is **observations only** — no fixes proposed. Screenshots live in `screens/` and are referenced by filename.

---

## 1. Coverage

| # | Screen / flow | Screenshot | Reached via |
|---|---|---|---|
| 1 | Home | `01-home.png` | launch |
| 2 | Sessions list | `02-sessions.png` | tab |
| 3 | Session detail — Attendance | `03-session-detail.png` | tap session card |
| 4 | Session detail — Games (empty) | `04-session-games-empty.png` | Games segment |
| 5 | Matches (empty) | `05-matches.png` | tab |
| 6 | Cups / Tournaments list | `06-cups.png` | tab |
| 7 | Tournament bracket (LIVE) | `07-tournament-live.png` | tap card |
| 8 | Tournament → Players sheet | `08-tournament-players.png` | Players button |
| 9 | Tournament → Config (no-op) | `09-tournament-config.png` | Config button |
| 10 | Tournament → Scorers (no-op) | `10-tournament-scorers.png` | Scorers button |
| 11 | Tournament → Ops (no-op) | `11-tournament-ops.png` | Ops button |
| 12 | Tournament → overflow actions | `12-tournament-overflow.png` | ⋮ |
| 13 | Profile (top) | `13-profile.png` | tab |
| 14 | Profile — achievements | `14-profile-scrolled.png` | scroll |
| 15 | Profile — bottom / settings | `15-profile-bottom.png` | scroll |
| 16 | Friends | `16-friends.png` | Profile → Friends |
| 17 | Club detail | `17-club-detail.png` | Home → club card |
| 18 | Club → Manage players | `18-club-manage-players.png` | Manage players |
| 19 | New match (empty) | `19-new-match.png` | Home → Start a match |
| 20 | New match — slot focused, keyboard up | `20-new-match-player-picker.png` | tap player slot |
| 21 | New match — typing blind | `21-new-match-typing.png` | type "Ut" |
| 22 | New match — save-scope sheet | `22-new-match-scope-picker.png` | Personal ▾ |
| 23 | New match — club roster suggestions | `23-new-match-club-roster.png` | scope = Weekend |
| 24 | New match — suggestion overlap | `24-new-match-club-filled.png` | — |
| 25 | New match — ready | `25-new-match-ready.png` | — |
| 26 | Live scoring (landscape) | `26-scoring.png` | Start scoring |
| 27 | Live scoring — after 1 point | `27-scoring-point.png` | +1 |
| 28 | Home in landscape (after pause) | `28-scoring-paused.png` | pause button |
| 29 | Matches in landscape | `29-matches-live-landscape.png` | tab |
| 30 | Matches — live card | `30-matches-live.png` | rotate to portrait |
| 31 | End match dialog | `31-end-match-dialog.png` | End |
| 32 | Matches — completed | `32-matches-completed.png` | confirm |
| 33 | Match detail | `33-match-detail.png` | tap card |
| 34 | Plan session | `34-plan-session.png` | Sessions → Plan a session |
| 35 | New tournament — Config | `35-new-tournament.png` | Cups → New tournament |
| 36 | New tournament — Entrants | `36-new-tournament-entrants.png` | Entrants tab |
| 37 | New tournament — entrant selected | `37-entrant-selected.png` | tap entrant |
| 38 | Clubs create/join sheet | `38-club-create-join.png` | Home → + |

**Not covered:** sign-in / onboarding / sign-up (would have destroyed the live session), notification permission flow, share-to-story output, session Start/Finish and auto game generation (would mutate real club data), club invite share sheet, delete flows (tournament, session, friend, club member).

---

## 2. Blocking / high-severity findings

### H1 — Player name field is completely hidden behind the keyboard (New match)
`20-new-match-player-picker.png`, `21-new-match-typing.png`

Tapping any player slot focuses an inline `EditText` at **y ≈ 966**. The IME occupies from **y ≈ 940** down. The field, its caret, and its text are 100 % occluded; the court does not scroll, pan, or resize. Typing "Ut" produced no visible feedback anywhere on screen — the user is typing blind into the app's single most-used entry point.

Confirmed in the a11y tree: `{"type":"android.widget.EditText","text":"Player 1","coordinates":{"x":58,"y":966,...},"focused":true}` while the keyboard is up.

### H2 — Club roster suggestion list is also occluded, and overlaps the adjacent slot
`23-new-match-club-roster.png`, `24-new-match-club-filled.png`

With save-scope set to a club, typing surfaces a roster suggestion dropdown. Only the first row (`Soham Deo`) peeks above the keyboard; the rest is off-screen. When the keyboard is dismissed, the dropdown renders **on top of the Player 4 slot** rather than beside or below it, so the suggestion list and the target field visually collide.

### H3 — "Start scoring" CTA is clipped by the system navigation bar
`19-new-match.png`, `25-new-match-ready.png`

Button bounds: `y 1456 → 1568`. Navigation bar background starts at `y 1504`. The bottom **64 px (≈32 dp)** of the primary CTA sits underneath the nav bar, and the label "Start scoring" is visually cut. Bottom safe-area inset is not applied on this screen.

### H4 — Three of four tournament tool buttons are dead
`09-tournament-config.png`, `10-tournament-scorers.png`, `11-tournament-ops.png`

On a LIVE tournament, **Config**, **Scorers**, and **Ops** produce no response — no sheet, no navigation, no toast, no disabled styling. Each was tapped twice at its reported centre. **Players** on the same row works, so it is not a hit-target problem. If these are intentionally locked once a bracket goes live, nothing communicates that; all four render identically.

### H5 — Club header reports 0 players while the roster holds 3
`17-club-detail.png`, `18-club-manage-players.png`

Club `Weekend` shows `0 matches · 0 games · 0 players`. Opening **Manage players** on the same club lists **Soham Deo, UtkarshAgrawal, Utki**. The matches/games counters also read 0, which is separately contradicted by the club having sessions attached. The header stat block is stale or querying the wrong source.

### H6 — Pause exits the match and strands the app in landscape
`28-scoring-paused.png`, `29-matches-live-landscape.png`

Tapping the pause control in the scoring toolbar navigates all the way back to the **Home tab**, not to a paused state. Worse, the orientation lock is not released: Home, Matches, and the tab bar all render in landscape, where they are badly broken — content clipped on the right by the nav bar, the primary CTA running under system chrome, cards truncated mid-row at the bottom edge. Every screen except live scoring is portrait-only by design but is reachable in landscape. Recovery required an external orientation change.

### H7 — "Semis onward" and "Courts" controls overlap (New tournament)
`35-new-tournament.png`

Three control groups (`Games / match`, `Semis onward`, `Courts`) are laid out in a single row on a 720 px screen. The `5` chip of "Semis onward" is physically overlapped by the `−` button of the Courts stepper. Additionally the "Games / match" label wraps to two lines, pushing its chip row ~50 px below the other two groups, so nothing is on a shared baseline.

---

## 3. Medium-severity findings

### M1 — Native Material alert breaks the design language at a destructive moment
`31-end-match-dialog.png`

"End match?" is an unstyled Android `AlertDialog`: grey `#666`-ish surface, teal `CANCEL` / `END MATCH` text buttons, default Roboto. Every other surface in the app is near-black with red accents and the Chakra Petch / Russo One type stack. This is also the only confirmation guarding an irreversible action, so it is the worst place to drop out of the design system.

### M2 — Five competing accent colours with no consistent semantics

| Colour | Where |
|---|---|
| Red `#FF3B30`-ish | brand primary, selected segment, primary CTA, **and** destructive (Delete tournament, trash icons) |
| Green | LIVE tournaments, live match card, winner name, Resume |
| Cyan | DRAFT tournament, **and** selected entrant + seed number |
| Amber | SCHEDULED session |
| Grey | DONE / completed |

Two collisions matter: (a) red means both "primary action" and "destructive" — `12-tournament-overflow.png` shows a red "Delete tournament" button that is the same hue family as "Start a match"; (b) selection is red on New match / New tournament Config, but cyan on the Entrants list (`37-entrant-selected.png`).

### M3 — Tab label does not match the screen it opens
`06-cups.png`

Tab reads **Cups**; the screen title reads **Tournaments**; the create button reads **New tournament**; the detail screen title reads **Bracket**. Four names for one concept.

### M4 — Attendance chips are below the minimum touch target
`03-session-detail.png`

`In` / `Maybe` / `Out` measure **86 × 64 px = 43 × 32 dp**. Android's minimum is 48 × 48 dp; these fail on both axes and sit 8 px apart, so mis-taps set the wrong RSVP. Their a11y labels are also state-free — a selected `In` announces identically to an unselected one.

### M5 — Achievement grid truncates both titles and descriptions
`14-profile-scrolled.png`

At 3 columns on a 360 dp screen each tile is ~100 dp wide. Observed clipping: `Weekend …`, `Monthly R…`, `Flawless Vi…`, `Court Leg…`, `Setting Up…`, `Reach a 60% win rate (min …`, `Play 100 completed m…`, `Log a match played befor…`. Roughly half the achievement set is unreadable. Progress bars carry no numeric value, and locked-tile text is very low contrast on the near-black card.

### M6 — Match detail exposes developer-facing text and omits the promised rally history
`33-match-detail.png`

The detail screen shows `Total rallies: 1` and `Status: completed` as raw key-value strings — lowercase enum value, no formatting. There is no date, no duration, no per-rally timeline, and no serve history, despite Home advertising "Track points, serve orientation, **rally history**, and set points". No edit or delete affordance either.

### M7 — Notifications control does not communicate state
`15-profile-bottom.png`

A large filled red pill labelled **ON**. It is ambiguous whether "ON" reports the current state or is the button that turns notifications on. A platform `Switch` would be unambiguous; a labelled pill is not.

### M8 — Score is not the dominant element on the scoreboard
`26-scoring.png`, `27-scoring-point.png`

In landscape scoring, the score digits are roughly the same size as the player names and visually smaller than the `+1` buttons and the elapsed-time chip. For a scoreboard read from across a court, the score should dominate. Separately, the `0` glyph renders as a filled coloured rounded rectangle while `1` renders as a plain numeral, so `1 – 0` reads as two different kinds of object.

### M9 — Layout stacking hides that scoring surfaces are different control types
`04-session-games-empty.png`

Three horizontal control rows stack with identical red-fill-selected styling: `Attendance | Games` (navigation), `Auto | Manual pair` (mode), `Doubles | Singles` + `Generate` (format + action). A segmented control, a mode toggle, and a plain button are indistinguishable, and `Generate` sits inside what looks like a third segment group.

### M10 — Bottom sheets do not cover the tab bar
`08-tournament-players.png`, `38-club-create-join.png`

Modal sheets render above the content but below the bottom tab bar, which stays fully interactive. A user can tab away mid-modal, and the sheet has no explicit close button — dismissal is drag-only.

---

## 4. Accessibility findings

| ID | Finding | Evidence |
|---|---|---|
| A1 | Every tab has a leading empty label: `", Home"`, `", Sessions"`, `"󰡑, Matches"`, `"󰔸, Cups"`, `", Profile"`. Icon-font glyphs leak into the label or contribute an empty string plus a comma. | all tree dumps |
| A2 | Bracket nodes announce as `"3, —"` and `"C1, Jjjj, Utkarsh"` — no "match", "round", "vs", or "winner" semantics. | `07-tournament-live.png` |
| A3 | Bracket refresh button has an **empty** label: `{"label":"","coordinates":{"x":640,"y":221,...}}`. | `07-tournament-live.png` |
| A4 | Selection state is never exposed. `Doubles`, `21`, `3`, `In` all announce as bare text with no selected/checked state. | `19-new-match.png`, `03-session-detail.png` |
| A5 | Player slots announce `", Player 2"` with no role and no hint that they open a picker. | `19-new-match.png` |
| A6 | Court swap controls are labelled (`Swap team A players`, `Swap sides`) but visually are three near-identical unlabeled arrow circles; the red serve dot has no label at all. | `19-new-match.png` |
| A7 | `uiautomator dump` fails on the scoring screen with `ERROR: could not get idle state` — the always-running match timer never lets the view hierarchy go idle. This breaks automation and is a re-render/battery smell on the one screen that stays open longest. | §26–27 |
| A8 | Low-contrast text throughout on unselected/locked states — `Singles`, `Manual pair`, `Doubles` unselected labels; the four tournament tool buttons; locked achievement descriptions. These need measuring against 4.5:1. | multiple |

---

## 5. Lower-severity / polish

- **P1** Home stat tiles misalign: `Longest Streak` wraps to two lines, dropping its value ~30 px below the values in `Matches` and `Win Rate`. (`01-home.png`)
- **P2** Empty-state inconsistency: Home shows `—` for Win Rate with 0 matches; Profile shows `0%` for the same condition. (`01-home.png` vs `13-profile.png`)
- **P3** Display name wraps mid-word — `UtkarshAgra / wal` — and the edit pencil then floats against the second line. (`13-profile.png`)
- **P4** Profile content scrolls under the tab bar; the first achievement row is clipped at rest. (`13-profile.png`)
- **P5** Matches empty state still renders `All / Live / Completed / Forfeited` filter chips with nothing to filter. (`05-matches.png`)
- **P6** Cups list shows `8-player` for a tournament whose Players sheet says `6 entrants → 8 draw, 2 byes`; the card reports draw size as entrant count. `Test2` shows `0-player`, which is also awkward grammar. (`06-cups.png`, `08-tournament-players.png`)
- **P7** Club detail is the only sub-screen with no back chevron in the header (Session, Friends, Players, Match, Plan session, New tournament all have one). (`17-club-detail.png`)
- **P8** Club detail stacks four full-width buttons (`Start a match`, `Live now`, `Pending requests`, `Manage players`) with only fill colour separating primary from the rest. (`17-club-detail.png`)
- **P9** The Clubs sheet gives `Create` and `Join` identical red primary styling, and both are tappable with empty inputs. (`38-club-create-join.png`)
- **P10** Friends has no field label (placeholder-only), requires an exact username with no search or suggestion, and shows no pending-requests section despite the Profile entry promising "manage requests". (`16-friends.png`)
- **P11** Club roster rows show no role (owner vs member) and no avatars; the owner's own row carries the same trash icon as everyone else's. (`18-club-manage-players.png`)
- **P12** Switching save-scope from Personal to a club silently discards text already typed into a player slot — "Ut" survived in slot 1 while slots 2 and 3 were overwritten with club members, leaving a stray free-text player mixed with roster players. (`22`→`24`)
- **P13** New tournament: entrant rows carry no checkbox or chevron, so they don't read as selectable; the validation hint `Add at least 4 players to start` only appears after the first selection, not at zero. (`36`, `37`)
- **P14** New tournament: `Create bracket` in its disabled state is dark red at reduced opacity, which reads as a styled-but-live button rather than a disabled one. (`35-new-tournament.png`)
- **P15** Plan session: `Badminton hall` in the "Where" field is styled identically whether it is a prefilled value or a placeholder; the Courts `−` stepper at its floor is only distinguishable by a slight opacity drop. (`34-plan-session.png`)
- **P16** Tab bar icons are multicolour emoji-style glyphs (house, calendar, rackets, trophy, person) that clash with the flat red-on-black system used everywhere else in the app.
- **P17** Tapping the Cups tab restores its previous deep stack (the Bracket screen) rather than returning to the tournament list — the tab has no reset-to-root on re-tap. (`35` first attempt)
- **P18** Home surfaces the club invite code (`code 3E80128C`) directly in the club list row. It is also on the club detail screen with a dedicated share button, so the list row exposes a shareable secret without the user asking.

---

## 6. What worked well

- Empty states on Matches and the club leaderboard are well written and carry a next action (`05-matches.png`, `17-club-detail.png`).
- The live-match card with `Resume` / `End` is a strong recovery affordance after the app is backgrounded (`30-matches-live.png`).
- Court-shaped player assignment is a genuinely good metaphor, and side/partner swap controls are the right idea (`25-new-match-ready.png`).
- Scoring correctly rotated the serving player between quadrants after a point, and the `Ut to serve. 1–0.` callout is a nice touch (`27-scoring-point.png`).
- `6 entrants → 8 draw, 2 byes` and `First to 2 games · best of 3` are clear derived-state summaries (`08`, `19`).
- Save-scope picker (`Personal` / club) is well framed — "Save this match to" with "Not saved to a club" as the Personal subtitle (`22-new-match-scope-picker.png`).
- Landscape lock on the scoring screen is the right call for the use case.

---

## 7. Environment notes for the follow-up session

- The installed APK is a **dev client** and needs Metro: `adb reverse tcp:8081 tcp:8081` then `npx expo start --dev-client --port 8081`. First bundle took ~93 s (2630 modules).
- A dev-only `Refreshing…` banner overlaps the header on `19`–`24`. Disregard it — it is not part of the release UI.
- `mobile-mcp` loses the device handle intermittently; `adb kill-server && adb start-server` restores it.
- `mobile_list_elements_on_screen` cannot dump the scoring screen (see A7), so screens 26–29 were audited from screenshots only.
- Test data left behind by this audit: one completed doubles match `Ut / UtkarshAgrawal 1 – 0 Utki / Soham Deo` saved to the `Weekend` club, and a free-text player named `Ut`. One entrant was selected on the New tournament screen but the bracket was never created.
