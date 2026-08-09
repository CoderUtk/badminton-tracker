### Task 1: Add `longestWinStreak` to player analytics

The existing `winStreak` is the *current* streak — it stops accumulating after
the first loss (`winStreakBroken`). The stat tile needs the longest run over
full history. Matches arrive newest-first, but the maximum run length is
unchanged by reversal, so a single pass works regardless of direction.

**Files:**
- Modify: `src/analytics/player.ts` (interface ~line 40, counters ~line 92, loop ~line 156, return ~line 234)
- Test: `tests/player.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `PlayerAnalytics.longestWinStreak: number` — consumed by Task 2's `statTileValues`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/player.test.ts`, at the end of the file:

```ts
describe("longestWinStreak", () => {
  const wl = (results: ("W" | "L")[]): MatchRecord[] =>
    // newest-first, matching how listAllMatches returns rows
    results.map((r, i) =>
      match(
        `x${i}`,
        ["Utkarsh"],
        ["Rival"],
        r === "W" ? "A" : "B",
        [{ A: 21, B: 10 }],
        1000 - i
      )
    );

  test("no matches -> 0", () => {
    expect(playerAnalytics([], "Utkarsh").longestWinStreak).toBe(0);
  });

  test("all losses -> 0", () => {
    expect(playerAnalytics(wl(["L", "L", "L"]), "Utkarsh").longestWinStreak).toBe(0);
  });

  test("finds the best run even when it is not the current one", () => {
    // newest-first: current run is 1, but there is a run of 3 further back
    const a = playerAnalytics(wl(["W", "L", "W", "W", "W", "L"]), "Utkarsh");
    expect(a.winStreak).toBe(1);
    expect(a.longestWinStreak).toBe(3);
  });

  test("equals winStreak when the best run is the current one", () => {
    const a = playerAnalytics(wl(["W", "W", "W", "W", "L", "W"]), "Utkarsh");
    expect(a.winStreak).toBe(4);
    expect(a.longestWinStreak).toBe(4);
  });

  test("ignores matches the player did not play in", () => {
    const mine = wl(["W", "W"]);
    const theirs = [match("o1", ["Soham"], ["Meera"], "A", [{ A: 21, B: 5 }], 500)];
    expect(playerAnalytics([...mine, ...theirs], "Utkarsh").longestWinStreak).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest tests/player.test.ts -t longestWinStreak
```

Expected: FAIL — `longestWinStreak` is `undefined`, so every `toBe(...)` mismatches.

- [ ] **Step 3: Add the field to the interface**

In `src/analytics/player.ts`, directly below the existing `winStreak` line in `PlayerAnalytics`:

```ts
  winStreak: number; // current win streak over full history (form is capped at 8 for display)
  longestWinStreak: number; // best win run over full history, current or not
```

- [ ] **Step 4: Add the counters**

Next to the existing `let winStreak = 0;` / `let winStreakBroken = false;` declarations:

```ts
  let longestWinStreak = 0;
  let currentRun = 0;
```

- [ ] **Step 5: Update the match loop**

Inside the `if (m.winner)` block, extend the existing win/loss branches:

```ts
      if (won) {
        wins += 1;
        if (!winStreakBroken) winStreak += 1;
        currentRun += 1;
        if (currentRun > longestWinStreak) longestWinStreak = currentRun;
      } else {
        losses += 1;
        winStreakBroken = true;
        currentRun = 0;
      }
```

- [ ] **Step 6: Add it to the returned object**

In the `return { ... }` block, immediately after `winStreak,`:

```ts
    winStreak,
    longestWinStreak,
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
npx jest tests/player.test.ts
```

Expected: PASS, including the pre-existing `playerAnalytics` cases.

- [ ] **Step 8: Fix the achievements test fixture**

`tests/achievements.test.ts` builds a `base` object listing every
`PlayerAnalytics` field. Add `longestWinStreak: 0,` next to `winStreak: 0,` in
that fixture so the shape stays honest.

- [ ] **Step 9: Verify the whole suite and typecheck**

```bash
npx jest && npx tsc --noEmit
```

Expected: all tests PASS, tsc silent.

- [ ] **Step 10: Commit**

```bash
git add src/analytics/player.ts tests/player.test.ts tests/achievements.test.ts
git commit -m "feat(analytics): add longestWinStreak to player analytics"
```

---

