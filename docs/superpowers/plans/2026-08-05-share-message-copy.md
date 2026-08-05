# Share Link Message Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace generic share-link text with role-distinct, punchier copy, and put the
URL on its own line instead of appended after a space.

**Architecture:** One separator change in `shareJoinLink` (space → newline), plus five
call-site text updates across four files.

**Tech Stack:** TypeScript, React Native, Jest.

## Global Constraints

- One 🏸 emoji per message, at the start only — not an in-app UI icon, this is external
  share text, doesn't conflict with the project's no-emoji-icons convention.
- `npx tsc --noEmit && npm test` must stay green after the task.
- Stage only the files this task lists — never `git add -A`.

---

### Task 1: Update share message copy and separator

**Files:**
- Modify: `src/lib/shareJoin.ts`
- Modify: `app/(app)/clubs/[id].tsx`
- Modify: `src/components/TournamentConfigTab.tsx`
- Modify: `src/components/TournamentScorersTab.tsx`
- Test: `tests/shareJoin.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `shareJoinLink(path: string, message: string): Promise<void>` — same
  signature, only the joined output string changes (newline instead of space).

- [ ] **Step 1: Update the failing tests**

In `tests/shareJoin.test.ts`, change both `expect(share).toHaveBeenCalledWith(...)`
message strings from a space before the URL to a newline:

```ts
test("builds an https join link when the domain is configured", async () => {
  process.env.EXPO_PUBLIC_JOIN_LINK_DOMAIN = "courtside-links.vercel.app";
  const { shareJoinLink } = require("../src/lib/shareJoin");
  await shareJoinLink("join/club/abc", "Join Smash Club on CourtSide:");
  expect(share).toHaveBeenCalledWith({
    message: "Join Smash Club on CourtSide:\nhttps://courtside-links.vercel.app/join/club/abc",
  });
});

test("falls back to the custom scheme when no domain is configured", async () => {
  const { shareJoinLink } = require("../src/lib/shareJoin");
  await shareJoinLink("join/club/abc", "Join Smash Club on CourtSide:");
  expect(createURL).toHaveBeenCalledWith("join/club/abc");
  expect(share).toHaveBeenCalledWith({
    message: "Join Smash Club on CourtSide:\nbadminton://join/club/abc",
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- shareJoin`
Expected: FAIL — current code still joins with a space, not `\n`.

- [ ] **Step 3: Change the separator in `shareJoin.ts`**

In `src/lib/shareJoin.ts`, change:
```ts
    await Share.share({ message: `${message} ${url}` });
```
to:
```ts
    await Share.share({ message: `${message}\n${url}` });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- shareJoin`
Expected: PASS.

- [ ] **Step 5: Update the club share message**

In `app/(app)/clubs/[id].tsx`, change:
```tsx
              onPress={() => shareJoinLink(buildClubJoinPath(club.id), `Join ${club.name} on CourtSide:`)}
```
to:
```tsx
              onPress={() => shareJoinLink(buildClubJoinPath(club.id), `🏸 ${club.name} wants you on the roster — join on CourtSide:`)}
```

- [ ] **Step 6: Update the tournament player/scorer/spectator share messages**

In `src/components/TournamentConfigTab.tsx`, change:
```ts
  const onSharePlayer = () =>
    shareJoinLink(buildTournamentJoinPath(tournament.id), `Join "${tournament.name}" on CourtSide:`);
  const onShareScorer = () =>
    shareJoinLink(buildTournamentScorerJoinPath(tournament.id), `Score "${tournament.name}" on CourtSide:`);
  const onShareSpectator = () =>
    shareJoinLink(buildTournamentSpectatorJoinPath(tournament.id), `Watch "${tournament.name}" live on CourtSide:`);
```
to:
```ts
  const onSharePlayer = () =>
    shareJoinLink(buildTournamentJoinPath(tournament.id), `🏸 You're invited to compete in "${tournament.name}" — join on CourtSide:`);
  const onShareScorer = () =>
    shareJoinLink(buildTournamentScorerJoinPath(tournament.id), `🏸 Help run "${tournament.name}" — score it live on CourtSide:`);
  const onShareSpectator = () =>
    shareJoinLink(buildTournamentSpectatorJoinPath(tournament.id), `🏸 "${tournament.name}" is live — watch the bracket on CourtSide:`);
```

- [ ] **Step 7: Update the duplicate scorer share message**

In `src/components/TournamentScorersTab.tsx`, change:
```ts
  const onShareScorer = () =>
    shareJoinLink(buildTournamentScorerJoinPath(tournamentId), `Score "${tournamentName}" on CourtSide:`);
```
to:
```ts
  const onShareScorer = () =>
    shareJoinLink(buildTournamentScorerJoinPath(tournamentId), `🏸 Help run "${tournamentName}" — score it live on CourtSide:`);
```

This must stay byte-for-byte identical in wording to Step 6's scorer message — same
role, two entry points, one message.

- [ ] **Step 8: Verify everything**

Run: `npx tsc --noEmit && npm test`
Expected: PASS, no regressions.

- [ ] **Step 9: Commit**

```bash
git add src/lib/shareJoin.ts "app/(app)/clubs/[id].tsx" src/components/TournamentConfigTab.tsx src/components/TournamentScorersTab.tsx tests/shareJoin.test.ts
git commit -m "feat: role-specific, punchier share link message copy"
```

---

## Testing

Covered entirely by `tests/shareJoin.test.ts` (separator) plus `npx tsc --noEmit` for
the four call-site string edits, which have no independent test coverage of their own
(same as before this change — the messages were never asserted anywhere except through
`shareJoinLink`'s own tests).
