# Phase 3 verification — H4, H5, M6, P2, P6, P12, P17

**Date:** 2026-08-14
**Branch:** `mobile-ux-phase-3` (worktree) @ `1e79b6a`
**Plan:** `.superpowers/sdd/2026-08-14-mobile-ux-phase-3/` (task briefs 1-9)
**Device:** realme NARZO 80 Lite (`007517460425921a`), Android 15 — same physical
device used throughout Phases 1-2.

Suite at verification: **67 suites / 455 tests passing**, `npx tsc --noEmit`
**clean** (no output, exit 0).

## Device access: one attempt made, result ambiguous — no phase-3 device evidence captured

`adb devices` returned immediately and cleanly: the device is online
(`007517460425921a`, `realme RMX5313`, `device` state). That part of the
environment was not the problem this time.

`netstat` showed a Metro process already listening on `127.0.0.1:8081` with
six established connections to it (PID 25676, a process this session did not
start). A screenshot of the device (`mobile_take_screenshot`, no Metro restart,
no port change, no app kill) showed the stock Expo Router scaffold —
**"Welcome to Expo / Start by creating a file in the app directory / touch
app/index.tsx"** — not this app's Home screen, even though this worktree's
`app/index.tsx` exists and is not a fresh scaffold.

This is the exact same signal Task 8 recorded during its own device attempt:
Metro up, connected to the device, but serving something that isn't this
build. Per the brief's instruction to treat that as evidence of a concurrent
session and not disturb it — no restart of Metro, no port override, no
force-reload of the dev client, no `adb kill-server` — device work was
stopped after this one read-only check. **No phase-3 screenshots exist.** None
of the `h4-*.png`, `h5-*.png`, `m6-*.png`, `p2-*.png`, `p6-*.png`,
`p12-*.png`, `p17-*.png` files the brief's Step 3 table calls for were
captured, and this directory contains no images.

This mirrors every task-level report in Phases 3: Tasks 1, 2, 3, 4, 5, 6
skipped device verification outright (mobile-mcp/adb reported unreachable or
timing out during their windows); Task 7 got one clean pre-fix repro window on
this same device before it went ambiguous; Task 8 hit the identical
scaffold-screen signal this verification pass just reproduced. The device has
not been in an unambiguously-available state for this worktree at any point
across Phase 3's nine tasks.

## Result — what evidence actually exists, per finding

| Finding | Device evidence | What stands in for it | Verdict |
|---|---|---|---|
| **H4** | None | Code read (Task 1 Step 2) for Config/Players; the Scorers empty-state fix (`TournamentScorersTab.tsx`) is a 5-line conditional matching the existing pattern in the same component family; `tsc --noEmit` clean | **CODE+TYPECHECK ONLY** |
| **H5** | None | `tests/clubStats.test.ts` (2/2 passing) pins the boundary condition; club header change is a one-field swap (`stats?.players.length` → `roster.length` from `listPlayers`) | **CODE+TEST ONLY** |
| **M6** | None | `tests/matchDetail.test.ts` (8/8 passing) covers date/status/duration/rally-timeline formatting; screen wiring (`app/(app)/matches/[id].tsx`) typechecks | **CODE+TEST ONLY** |
| **P2** | None | `tests/winRate.test.ts` (4/4) + unchanged `tests/homeDashboard.test.ts` (34/34) prove the shared rule preserves Home's existing behavior and now applies to Profile | **CODE+TEST ONLY** |
| **P6** | None | `tests/entrantLabel.test.ts` (3/3) covers the 0/1/plural grammar; `tournamentRepo.ts` batch-query change typechecks | **CODE+TEST ONLY** |
| **P12** | **Yes — pre-fix, Task 7** | `tests/matchLineup.test.ts` (3/3) encodes the exact reproduced scenario (variant 3) | **DEVICE-CONFIRMED BUG, CODE+TEST-CONFIRMED FIX** |
| **P17** | None | `tests/tabReset.test.ts` (3/3) + manual trace of the `tabPress` handler in Task 8's report | **CODE+TEST ONLY, ONE UNCONFIRMED CASE** |

No finding in this phase has a post-fix on-device screenshot. This is stated
plainly rather than worked around: per the plan's own standard ("a finding
that did not fully close is a fact to record, not a failure to hide"), phase 3
closes on code-and-test evidence for six of seven findings, plus a device
reproduction of the *pre-fix* bug for the seventh.

### H4 — Config/Players panels: already closed before this phase, unconfirmed by device either way

Task 1's Step 2 (`src/components/TournamentConfigTab.tsx:101-116`,
`src/components/TournamentPlayersTab.tsx:105-142`) found both panels always
render non-empty content by direct code read — no code change was made to
either file, and per the brief's "Not in this plan" section this is recorded
as closed by Phase 0-2's incidental refactors, not by phase-3 work. **This
reading was never confirmed or overturned by a device check** — Task 1's own
device attempt failed before it could run, and this verification pass's one
attempt landed on the concurrent-session scaffold screen before a real
in-app screenshot was possible. The claim rests entirely on the code read.

The one panel that genuinely needed a fix — `TournamentScorersTab.tsx`'s
empty-staff case for a non-admin viewer — got a 5-line conditional
(`staff.length === 0 && !isAdmin` → "No scorers assigned yet.") added in
commit `65e1653`. That fix is also unconfirmed on-device.

### H5 — matches/games were already correct; only `players` needed a change

`tests/clubStats.test.ts` (Task 2) documents that `SessionStats.matchCount`
and `.gameCount` already count every completed match regardless of winner —
consistent with the brief's claim that the sync-pull commits (`8a3c895`,
`053ad20`, `cadaf9b`, 2026-08-13, all predating this phase) already fixed the
matches/games half of audit finding H5. Only the `players` count needed a
code change: `app/(app)/clubs/[id].tsx` now reads roster size from
`listPlayers(clubId)` instead of `stats.players.length` (which is built only
from completed matches with a recorded winner, so it read 0 for a club with
members but no finished matches). This is confirmed by the test's stated
purpose and the diff's shape, not by a device screenshot of the `Weekend`
club header.

### P12 — reproduced, variant 3, existing guard needed the fix

Task 7 ran all three reproduction variants against a live device
(`007517460425921a`) before writing any code:

- **Variant 1** (one typed name, two empty slots, switch to club): preserved. Existing `n.trim() ? n : players[i]?.name ?? ""` guard (predates the audit, commit `6db6414`) already handled it.
- **Variant 2** (all four slots typed, switch to club): preserved.
- **Variant 3** (switch to club, then clear a filled slot back to empty, then switch clubs again): **bug reproduced** — the deliberately-cleared slot was silently repopulated from the roster.

This determines that **`src/lib/matchLineup.ts` does exist in the final
diff** — `fillEmptySlots(prev, touched, players)` replaces the trim-based
guard with explicit touched-slot tracking, wired into `app/new-match.tsx` via
new `touchedDoubles`/`touchedSingles` state. `tests/matchLineup.test.ts`
encodes the exact variant-3 scenario and passes (3/3), and
`tests/lastLineup.test.ts` (16/16 combined) shows no regression in the
adjacent lineup-restore logic.

The screenshots this variant-3 repro produced
(`variant1-after-club-switch.png`, `variant2-after-club-switch.png`,
`variant3-bug-reproduced.png`, referenced in Task 7's report) were saved to
that task's session scratchpad, which is not part of this worktree and is not
retrievable from this session — they are not present in this directory. The
pre-fix bug is device-confirmed per Task 7's report; the fix itself has not
been re-verified on-device (Task 7's own post-fix attempt hit a dev-client
routing glitch and did not complete; this pass's attempt never reached the
app at all).

### M6, P2, P6, P17 — code and test evidence only

- **M6**: `src/lib/matchDetail.ts` (pure formatting, 8 unit tests) + `app/(app)/matches/[id].tsx` wiring (loads raw events, renders formatted date/status/duration and a rally-history timeline). No raw `Status: completed` string remains in the source. Not screenshotted.
- **P2**: `src/lib/winRate.ts` (`formatWinRate`, `MIN_MATCHES_FOR_RATES = 5`) now backs both `src/home/dashboard.ts` and `app/(app)/profile/index.tsx`. Existing `homeDashboard.test.ts` passing unchanged is the strongest evidence Home's behavior didn't shift; Profile's changed line is a one-call swap. Not screenshotted.
- **P6**: `src/lib/entrantLabel.ts` (`formatEntrantLabel`) + a batched entrant-count query in `tournamentRepo.ts` back the Cups card's "N entrants" text, replacing `{item.size}-player`. Not screenshotted.
- **P17**: `src/lib/tabReset.ts` (`shouldResetTabStack`) + a `tabPress` listener in `app/(app)/_layout.tsx`. Task 8's manual trace found the handler correctly resets on a genuine re-tap of the already-focused Cups tab (the literal case in the brief's finding), but flagged that the *"switch to another tab, then back to Cups"* case does not reset by this code's logic (`isFocused` is false at the moment the switch-back tap fires, so the reset guard never runs). This is worth a manual check next time the device is unambiguously available — not confirmed either way here.

## Test data

Not confirmed this pass — the device check did not get past the concurrent
scaffold screen, so the `Weekend` club's fixture match and free-text player
`Ut` were not re-inspected. Per Phase 1/2's READMEs they were retained
through both prior phases; nothing in this phase's diffs touches match or
player deletion, so there is no code-level reason to expect them gone, but
this is an inference, not a device confirmation.

## Suite and typecheck (Step 5)

```
Test Suites: 67 passed, 67 total
Tests:       455 passed, 455 total
```

`npx tsc --noEmit` — clean, no output.

## Summary

| Finding | Real device confirmation | Code+test confirmation |
|---|---|---|
| H4 | No (neither the Config/Players "already closed" reading nor the Scorers empty-state fix) | Yes |
| H5 | No | Yes |
| M6 | No | Yes |
| P2 | No | Yes |
| P6 | No | Yes |
| P12 | **Yes, pre-fix bug only** (Task 7); fix itself not re-confirmed on-device | Yes |
| P17 | No | Yes, with one traced-but-unconfirmed case (switch-away-and-back) |

Phase 3 closes on code and test evidence for all seven findings, with one
(P12) additionally carrying a genuine device reproduction of the pre-fix
defect. No finding in this phase has a post-fix on-device screenshot — the
device was reachable but never unambiguously available to this worktree
across all nine tasks, consistently showing signs (a live Metro process,
established connections, but the wrong screen) of a concurrent session using
the same physical device. This matches the plan's own instruction not to
disturb that session, and is recorded here as an honest gap rather than
worked around.
