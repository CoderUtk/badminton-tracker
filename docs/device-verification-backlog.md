# Device verification backlog

Manual checks that no automated test in this repo can cover. Jest runs with
`testEnvironment: "node"` and has never rendered a React Native component, so
every item below is invisible to `npx jest` — passing tests say nothing about
any of it.

Recovered from four SDD ledgers before those workspaces were deleted on
2026-08-18. The first three cover work shipped in **1.2.0 (17)**, built and
uploaded without these checks having been run.

Tick items off and delete them as they pass.

## 1. Avatars on share cards — the capture race

The sharpest item here. `Avatar` renders a network `<Image>` and `captureRef`
fires synchronously on tap, so an undecoded image bakes an empty circle into the
shared PNG. `preloadAvatars` (`src/lib/share/avatars.ts`) exists solely to close
that race, and a race cannot be proven by one pass.

- [ ] **The race.** Cold-start the app, open a match, tap share IMMEDIATELY. The
      PNG must contain the photo, not an empty circle. **Repeat 3×.**
- [ ] Photos actually appear on all five share surfaces.
- [ ] Airplane mode still shares — initials, no hang, no error toast.
- [ ] Two rostered players sharing a display name show DIFFERENT photos.
      (This is what re-keying `aggregate()` off `playerStatId` was for.)
- [ ] Roster-only players show initials, not blank circles.
- [ ] Doubles avatar overlap reads as one unit and does not collide with the name.

## 2. Card design tokens and convergence

- [ ] Scannable QR on all five share surfaces.
- [ ] Every shared PNG is 1080×1920, nothing clipped.
- [ ] The four cards read as one family side by side.
- [ ] Best-of-5 chip row does not overflow.
- [ ] A match over an hour shows `1h 04′` untruncated.
- [ ] Long doubles names truncate without pushing the stat row out of frame.

## 3. Share card redesign

Its ledger called this "the acceptance gate for the 1080×1920 capture approach".
The branch was merged and pushed with the gate still open.

- [ ] Verify on physical Android **and** iOS hardware — `captureRef`'s
      width/height is documented as output size but has historically behaved as a
      crop on some Android versions.

## 4. Achievements section redesign

- [ ] Tap an earned badge: the share popup's card must be the SAME cyan as the
      chip that opened it. This colour match is the contradiction the redesign
      existed to fix, and nothing automated can see it.
- [ ] A fresh account (0 of 22) shows the encouragement line, a zero summary bar,
      and a populated Next up. This is what most new installs see first.
- [ ] The Locked disclosure expands and collapses, and announces its state to a
      screen reader.
- [ ] Locked chips show the lock glyph — state legible with colour ignored.
- [ ] A long badge title in a Next up row truncates without pushing the
      percentage off screen.

## Parked finding — home dashboard

Not a device check; recorded here because its ledger is gone.

`tests/homeDashboard.test.ts` exercises `resolveMyPlayerName` over a hand-built
ordered array, so it would still pass if the `order by name` at
`src/repos/clubRepo.ts:150` were reverted. The production code is correct and
verified; only the test's regression value is weak. A real guard needs
repo-layer tests against SQLite, which this repo does not have — the same infra
gap already accepted for components.
