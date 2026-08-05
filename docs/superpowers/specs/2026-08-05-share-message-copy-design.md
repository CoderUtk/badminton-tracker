# Share Link Message Copy

**Date:** 2026-08-05

## Problem

Share messages are generic ("Join X on CourtSide:") and put the link on the same line
as the text, which reads worse in chat apps. Better, role-distinct copy with the link
on its own line should improve tap-through.

## Design

`shareJoinLink(path, message)` in `src/lib/shareJoin.ts` changes how it joins `message`
and `url` — newline instead of space:

```ts
await Share.share({ message: `${message}\n${url}` });
```

Callers are unaffected in shape (still pass a `message` string), only the text each
passes changes:

- Club join (`app/(app)/clubs/[id].tsx`):
  `` `🏸 ${club.name} wants you on the roster — join on CourtSide:` ``
- Tournament player join (`src/components/TournamentConfigTab.tsx`):
  `` `🏸 You're invited to compete in "${tournament.name}" — join on CourtSide:` ``
- Tournament scorer join — appears in **two** places that must stay identical:
  `src/components/TournamentConfigTab.tsx` and `src/components/TournamentScorersTab.tsx`:
  `` `🏸 Help run "${tournament.name}" — score it live on CourtSide:` ``
- Tournament spectator join (`src/components/TournamentConfigTab.tsx`):
  `` `🏸 "${tournament.name}" is live — watch the bracket on CourtSide:` ``

One 🏸 emoji at the start of each message, not scattered elsewhere — this is share-text
sent to external chat apps, not an in-app UI icon, so it doesn't conflict with this
project's "no emoji as interface icons" convention.

## Scope

Five call sites across four files, plus `shareJoin.ts`'s join character. No new files,
no interface changes beyond the message strings themselves and the separator in
`shareJoinLink`.

## Testing

`tests/shareJoin.test.ts` already asserts the exact joined message string — both
existing tests update their expected `message` value from a space-joined string to a
newline-joined one (`\n` instead of ` ` between the passed-in message and the URL).
