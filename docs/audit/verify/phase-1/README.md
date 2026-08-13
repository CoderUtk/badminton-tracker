# Phase 1 verification — 2026-08-13

Device: realme NARZO 80 Lite (RMX5313), Android 15, serial `007517460425921a` — same handset the 2026-08-12 audit ran on.
Build: EAS development build, `react-native-keyboard-controller@1.18.5` linked, branch `feat/mobile-ux-phase-01` @ commit `0737bfa` (tasks 9-15 complete).
Account: signed in as `utkarshg08@gmail.com` (UtkarshAgrawal), club "Weekend", real match/session history. Guest mode was tried first but cannot reach any of the auth-gated screens Tasks 10-15 touch (no club, no sessions, no sheets) — verification below required the signed-in pass.

## Leftover audit test data

The audit's fixture match `Ut / UtkarshAgrawal 1 – 0 Utki / Soham Deo` is present in the "Weekend" club's recent matches (visible on Profile → Recent matches, top entry). This account now also carries the user's own real match history, so nothing was deleted — the fixture is retained as-is per the plan's "either is fine" allowance. No unexplained diff: it's the same fixture the audit itself created.

## Evidence

| Finding | Baseline | Capture | Result |
|---|---|---|---|
| H1 (keyboard occludes the New match player field) | `20-new-match-player-picker.png`, `21-new-match-typing.png` | `h3-19-new-match.png` (ready state, see also live verification below) | **PASS**. Task 9's on-device check (before Task 16, same session): tapped Player 1, typed "Alex" — field and caret stayed visible above the IME, no crash. Re-confirmed live during this pass while testing H2 (typed into Player 4's field with the keyboard open, field stayed visible). |
| H2 (roster suggestion panel reads as a collision) | `23-new-match-club-roster.png`, `24-new-match-club-filled.png` | `h2-23-new-match-club-roster.png` | **PASS**. Switched scope to club "Weekend", tapped Player 4, typed "bhj" — "Add bhj" panel appeared without a keyboard collision. Functionally verified the covered box (Utki, opposite row) is inert: tapping directly on it while the panel was open produced no response (no editor opened, panel stayed put) — confirms `disabled`/`pointerEvents: none` are active, not just the accessibility-tree label. Panel stayed within the visible area above the IME. |
| H3 (Start scoring CTA clipped under the nav bar) | `19-new-match.png`, `25-new-match-ready.png` | `h3-19-new-match.png` | **PASS**. Full "Start scoring" label visible above the nav bar with the keyboard dismissed, both in guest mode (Task 9's original check) and signed-in (this pass). |
| M4 / A4 (attendance chips under 48dp, selection colour-only) | `03-session-detail.png`, `04-session-games-empty.png` | `m4-a4-03-session-detail.png`, `a4-04-session-games-empty.png` | **PASS**. Opened session "Badminton hall" (Sun 9 Aug) → Attendance. Chips are visibly larger; accessibility tree confirms 96×96px boxes at 2x density = 48dp exactly. "Out" selected for Soham Deo renders with the neutral elevated `cardHi`/`lineHi` treatment, not a red fill. Tree reports per-player disambiguated labels ("In, Soham Deo", "Out, Soham Deo", etc.) — A4's screen-reader gap is closed. SegmentedControl (Attendance | Games) is visibly taller and switches correctly between tabs; indicator still tracks at the new height (still red — that repaint is Phase 4's job, correctly untouched). |
| M10 (sheets drew under the tab bar) | `08-tournament-players.png`, `38-club-create-join.png` | `m10-38-club-create-join.png` | **PASS**. Opened the clubs "+" sheet from Home. The bottom tab bar (Home/Sessions/Matches/Cups/Profile) is fully covered — not visible at all behind the sheet, confirming the `Modal` wrap. Close (✕) button present top-right and dismisses the sheet. `08-tournament-players.png`'s tournament-players sheet was not independently re-captured (no live tournament in this account to reach it), but it shares the exact same `Sheet`/`BottomPanel` component and code path verified here and in Task 11's clean review — no separate risk. |
| P4 (Profile content clipped by the tab bar) | `13-profile.png` | `p4-13-profile-bottom.png` | **PASS**. Scrolled Profile to the true bottom (past achievements, recent form, stats, recent matches) — "Sign out" is the last element and clears the tab bar with visible padding beneath it. |

## Extra spot-check (Task 14's sweep, not in the original finding table)

Task 14 fixed 4 docked-CTA screens beyond New match. One was spot-checked live: `app/new-session.tsx` ("Plan session") — "Create session" CTA sits fully clear of the nav bar with a visible gap. The other three (`guest/spectate.tsx`, `welcome.tsx`, `join/tournament/[id].tsx`) were not independently re-verified on-device in this pass; all four were reviewed clean against the exact Task 9 pattern in Task 14's task-scoped review, which is the standard of evidence the rest of this plan's non-headline fixes (Tasks 12, 13, 15) were also closed on.

## Suite

`npx jest` — 406/406 passing, 58 suites, pristine output (one benign Jest worker-teardown warning, not a test failure).
`npx tsc --noEmit` — clean, no errors.

## Summary

All six Phase 1 headline findings (H1, H2, H3, M4, M10, A4) plus P4 are closed and confirmed on-device on the audit's original handset. No findings survived. Guest-mode-only verification (Tasks 10-15, prior to this pass) is superseded by this signed-in evidence.
