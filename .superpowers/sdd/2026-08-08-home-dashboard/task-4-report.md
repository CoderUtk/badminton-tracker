# Task 4 Report: ClubSheet

## What was implemented

Created `src/components/ClubSheet.tsx` exactly as specified in the brief: a
`BottomPanel`-hosted component with two form groups — "Create a club" and
"Join with a code" — relocating the `onCreate`/`onJoin` mutation logic,
`validateName` check, and touched/error state verbatim from
`app/(app)/index.tsx`. Props: `{ visible: boolean; onClose: () => void;
onChanged: () => void }`. `onChanged()` fires before `onClose()` in both
`onCreate` and `onJoin`, after the mutation succeeds and local state
(`name`/`nameTouched` or `inviteCode`) is reset.

## BottomPanel's actual prop signature

```ts
{ visible: boolean; title: string; onClose: () => void; children: React.ReactNode }
```

This matches the brief's assumption exactly (`title` is required, not
optional, but the brief's call already passes `title="Clubs"`). No adaptation
was needed.

## Verification

- `npx tsc --noEmit` — silent (clean), matching baseline.
- `npx jest` — 42 suites passed, 253 tests passed, 0 failed. No test file was
  added for this component per the brief's constraint (no component-render
  test infra in this repo).

## Files changed

- Created: `src/components/ClubSheet.tsx` (114 lines)
- No other files touched. `app/(app)/index.tsx` left untouched, as instructed
  (Task 5 owns wiring this component in).

## Self-review

- Completeness: component created with exact prop signature; both forms
  present (create with name input + validation error text, join with invite
  code input); busy/disabled states preserved on both `BusyButton`s.
- Quality: reads consistently with sibling components (`BottomPanel`'s own
  consumer at `app/(app)/tournaments/[id].tsx`, `StatTile.tsx`) — same theme
  token usage (`C`, `F`), same `StyleSheet.create` pattern at file bottom.
- Discipline: nothing beyond the brief — no extra props, no shared-style
  extraction into `theme.ts`, no behavioural changes to the create/join logic.
  `app/(app)/index.tsx` was read only, never edited. Only
  `src/components/ClubSheet.tsx` was staged and committed (verified via
  `git status --short` before commit).
- Correctness: `onChanged()` is called before `onClose()` in both handlers,
  matching the brief's requirement ("`onChanged` fires after a successful
  create or join so the caller can reload"). State reset (`setName("")`,
  `setNameTouched(false)` / `setInviteCode("")`) happens before `onChanged()`
  is invoked, so a fresh open of the panel starts clean.

## Concerns

None. No raw hex colours were introduced; all colour/font values come from
`C.*`/`F.*` theme tokens matching the original screen code. No new animation
was added — `BottomPanel` supplies entrance/dismiss motion.

## Commit

`4273b45` — "feat(home): add ClubSheet hosting create and join forms" (no
Co-Authored-By trailer).
