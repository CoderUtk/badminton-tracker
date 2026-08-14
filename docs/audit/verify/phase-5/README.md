# Phase 5 verification — M5, M7, P1, P3, P5, P7, P10, P11, P13, P18

**Date:** 2026-08-14
**Branch:** `worktree-mobile-ux-phase-5` (worktree)
**Plan:** `.superpowers/sdd/2026-08-14-mobile-ux-phase-5/` (task briefs 1-12)
**Device:** adb id `007517460425921a`, confirmed live and used for this entire pass.

Suite at verification: **67 suites / 456 tests passing**, `npx tsc --noEmit`
**clean** (exit 0, no output). Unchanged from Phase 4's count, as the plan
anticipated (no new pure-function `src/lib/` code landed this phase).

## Device availability

The device stayed available for the whole verification pass. Nine of the ten
findings got real, live on-device screenshots captured in this session. One
finding (P5) fell back to a code-confirmed screenshot rather than the exact
empty-state capture the brief specifies — see P5 below for why.

One unrelated hiccup: a stray tap during navigation (going for the Matches
tab) landed on a home-screen notification/widget and briefly opened
Instagram instead of the app. This was not app misbehavior — recovered by
relaunching CourtSide via `adb shell am start -n com.navalo.courtside/.MainActivity`
and continuing. No app data or state was affected.

## Result — evidence per finding

| Finding | Capture | Device evidence | Verdict |
|---|---|---|---|
| **M5** | `m5-achievement-grid.png` | Live screenshot, Profile tab scrolled to Achievements | **PASS** |
| **M7** | `m7-reminders-switch.png` | Live screenshot, Profile tab scrolled to Notifications | **PASS** |
| **P1** | `p1-stat-tiles.png`\* | Live screenshot, Home | **PASS** |
| **P3** | `p3-display-name.png` | Live screenshot, Profile tab top | **PASS** |
| **P5** | `p5-matches-with-data.png` (not the brief's empty-state capture) | Live screenshot, Matches tab — see below | **CODE-CONFIRMED, PARTIAL DEVICE EVIDENCE** |
| **P7** | `p7-club-detail-header.png` | Live screenshot, Club detail (owner path) | **PASS (owner path only — see below)** |
| **P10** | `p10-friends-search.png` | Live screenshot, Friends screen, mid-type "utk" | **PASS** |
| **P11** | `p11-roster-rows.png` | Live screenshot, Manage players | **PASS** |
| **P13** | `p13-entrant-rows.png` | Live screenshot, New tournament → Entrants tab, zero picks | **PASS** |
| **P18** | `p18-home-club-row.png`\* | Live screenshot, Home | **PASS** |

\* `p1-stat-tiles.png` and `p18-home-club-row.png` are the same capture of
the Home screen, reused because it satisfies both findings' checks (aligned
stat tiles and no invite code in the club row) in one shot.

## Explicit call-outs (per brief Step 3)

### P7 — back chevron: code change was needed, not already closed

Task 5 found this was a **real bug**, not already-closed as the brief's own
hypothesis suspected. `app/(app)/clubs/_layout.tsx`'s `initialRouteName: "[id]"`
setting makes `canGoBack` structurally false within the isolated `clubs`
Stack even though `router.back()` genuinely works (there is history one
level up, from Home). Task 5 fixed `app/(app)/clubs/[id].tsx:69-86` to force
the chevron unconditionally and wire it directly to `router.back()`, for both
the owner (`HeaderLogoLeft`) and non-owner (inline `Pressable` + `Icon`)
header paths.

This pass re-confirms the **owner path** live: `p7-club-detail-header.png`
shows the chevron rendering before the "Club" logo/title on the "Weekend"
club (owned by the test account), and it was tapped and confirmed to
navigate back to Home correctly.

The **non-owner path** was not visually verified live in this pass either,
for the same reason Task 5 recorded: the only club reachable on this device
belongs to the real production account (`utkarshg08@gmail.com`) as owner.
Creating a second account and joining as a member just to capture this
screenshot would write real membership data into the user's actual club, so
it was skipped. This closes on code-path parity (identical fix mechanism for
both branches, confirmed by direct code read this pass) plus the passing
`npx tsc --noEmit`, same as Task 5's own verification note.

### P5 — filter chips: could not reach a true empty-match state live

The device's test account has 15+ completed matches from real prior usage
(23 shown in the "Completed" filter alone). Reaching the brief's specified
zero-total-matches state would require deleting real match history from the
production account, which was avoided as destructive to real user data —
the same category of constraint Task 5 hit with club roles.

What was captured instead (`p5-matches-with-data.png`) is a positive-control
screenshot: with matches present, the All/Live/Completed/Forfeited filter
chip row **does render**, confirming the `hasAnyMatches` conditional
(`app/(app)/matches/index.tsx:80,114-126`, Task 4) correctly shows chips on
the populated branch. The empty branch (chips hidden) was verified by code
read only — the conditional wraps exactly the filter-bar `View`, leaving the
`SectionList`/`ListEmptyComponent` untouched, and `npx tsc --noEmit` is
clean. This is recorded as a **gap**, not worked around: the pass/fail is
CODE-CONFIRMED for the actual "zero matches" scenario, not device-verified.

### M5 — locked-tile contrast: measured, passed, no fix needed

Task 1 Step 3 measured `text3` (`#838B9D`) against `C.bgElev` (`#12151B`),
the achievement grid's locked-tile description-text background:

**Contrast ratio ≈ 5.34:1** — passes the WCAG AA threshold of 4.5:1.

No color change was made as a result; `desc` text keeps `C.text3`. This
pass's live screenshot (`m5-achievement-grid.png`) shows the locked-tile
description text ("Win 10 matches", "Win 5 in a row", etc.) fully legible
against the tile background, consistent with the measured ratio.

### Anything that did not close

- **P5** did not get device evidence for its specific failure scenario (zero
  matches). The code fix itself is not in question — Task 4's conditional is
  simple and typecheck-clean — but the brief's exact capture (chips absent
  on an empty Matches screen) was not achievable without destructive data
  loss on the live account. Treated as CODE-CONFIRMED, not DEVICE-VERIFIED.
- **P7**'s non-owner path remains code-path-parity verified only, same
  constraint as Task 5's original implementation pass. Everything else in
  this phase (M5, M7, P1, P3, P10, P11, P13, P18) got full live-device
  evidence matching the brief's pass criteria.

## Files created

- `docs/audit/verify/phase-5/README.md` (this file)
- `docs/audit/verify/phase-5/m5-achievement-grid.png`
- `docs/audit/verify/phase-5/m7-reminders-switch.png`
- `docs/audit/verify/phase-5/p1-stat-tiles.png`
- `docs/audit/verify/phase-5/p3-display-name.png`
- `docs/audit/verify/phase-5/p5-matches-with-data.png`
- `docs/audit/verify/phase-5/p7-club-detail-header.png`
- `docs/audit/verify/phase-5/p10-friends-search.png`
- `docs/audit/verify/phase-5/p11-roster-rows.png`
- `docs/audit/verify/phase-5/p13-entrant-rows.png`
- `docs/audit/verify/phase-5/p18-home-club-row.png`
