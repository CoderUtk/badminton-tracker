import { settleGroups, settleByes, srcToken } from "../src/tournament/formats/gate";
import { groupsKnockout } from "../src/tournament/formats/groupsKnockout";
import { advanceWinner } from "../src/tournament/bracket";
import type { BracketMatch, Entrant } from "../src/tournament/types";

const ents = (n: number): Entrant[] => Array.from({ length: n }, (_, i) => ({
  id: `e${i + 1}`, clubPlayerId: `p${i + 1}`, name: `P${i + 1}`,
  seed: i + 1, partnerClubPlayerId: null,
}));
const build = (n = 12) => {
  let k = 0;
  return groupsKnockout.build({
    entrants: ents(n), tournamentId: "t1", gen: () => `m${++k}`,
    groupSize: 4, advancePerGroup: 2,
  });
};
// Lower entrant number always wins, so standings are deterministic by hand.
const playAll = (b: BracketMatch[], groupIdx?: number): BracketMatch[] =>
  b.map((m) => {
    if (m.groupIdx === null) return m;
    if (groupIdx !== undefined && m.groupIdx !== groupIdx) return m;
    const [a, c] = [m.entrantA!, m.entrantB!];
    const winner = Number(a.slice(1)) < Number(c.slice(1)) ? a : c;
    return { ...m, winnerEntrant: winner, matchId: m.id };
  });

test("no fills while a group is unfinished", () => {
  expect(settleGroups(build(), ents(12))).toEqual([]);
});

test("a complete group fills only its own dependent slots", () => {
  const b = playAll(build(), 0);
  const fills = settleGroups(b, ents(12));
  expect(fills.length).toBe(2); // advancePerGroup
  for (const f of fills) {
    const target = b.find((m) => m.id === f.matchId)!;
    const token = f.slot === "a" ? target.srcA : target.srcB;
    expect(token).toBe(srcToken(0, token === srcToken(0, 1) ? 1 : 2));
  }
});

// Two phones offline, same results, must produce identical fills or the
// knockout draw forks on sync.
test("fills are deterministic across repeated and shuffled input", () => {
  const b = playAll(build());
  const once = settleGroups(b, ents(12));
  const twice = settleGroups(b, ents(12));
  const shuffled = settleGroups([...b].reverse(), [...ents(12)].reverse());
  expect(twice).toEqual(once);
  expect([...shuffled].sort((x, y) => x.matchId.localeCompare(y.matchId)))
    .toEqual([...once].sort((x, y) => x.matchId.localeCompare(y.matchId)));
});

test("is idempotent — a slot already filled is not filled again", () => {
  const b = playAll(build());
  const fills = settleGroups(b, ents(12));
  // Apply EVERY returned fill, not just the first per match: with 3 groups
  // finishing together, some matches get both slots resolved in one pass
  // (3 groups x 2 ranks = 6 real tokens into 4 first-round matches with only
  // 2 byes, so at least two matches hold two real tokens each) and both must
  // be written back before re-running settleGroups.
  const applied = b.map((m) => {
    const own = fills.filter((x) => x.matchId === m.id);
    if (own.length === 0) return m;
    let next = m;
    for (const f of own) {
      next = f.slot === "a" ? { ...next, entrantA: f.entrantId } : { ...next, entrantB: f.entrantId };
    }
    return next;
  });
  expect(settleGroups(applied, ents(12))).toEqual([]);
});

test("every filled entrant actually played in the group it came from", () => {
  const b = playAll(build());
  const fills = settleGroups(b, ents(12));
  for (const f of fills) {
    const target = b.find((m) => m.id === f.matchId)!;
    const token = f.slot === "a" ? target.srcA! : target.srcB!;
    const group = Number(token.slice(1, token.indexOf("#")));
    const inGroup = new Set(b.filter((m) => m.groupIdx === group)
      .flatMap((m) => [m.entrantA!, m.entrantB!]));
    expect(inGroup.has(f.entrantId)).toBe(true);
  }
});

// FIX ROUND 1, finding 1: without bye resolution, a knockout with unfilled
// byes (e.g. 6 qualifiers into an 8-slot draw) stalls forever — the entrant
// with no opponent never gets a winner, so the tree never advances past
// round one. This is a full end-to-end playout: play every real match
// (lower entrant number always wins), run the gate and the bye resolver
// after every result, and check the tournament actually reaches "done".
function playToDone(n: number, groupSize: number, advancePerGroup: number) {
  let k = 0;
  const entrants = ents(n);
  let bracket = groupsKnockout.build({
    entrants, tournamentId: "t1", gen: () => `m${++k}`, groupSize, advancePerGroup,
  });

  const applyFills = (b: BracketMatch[]): BracketMatch[] => {
    const fills = settleGroups(b, entrants);
    return fills.reduce((acc, f) => acc.map((m) => {
      if (m.id !== f.matchId) return m;
      return f.slot === "a" ? { ...m, entrantA: f.entrantId } : { ...m, entrantB: f.entrantId };
    }), b);
  };
  const applyByes = (b: BracketMatch[]): BracketMatch[] => {
    const wins = settleByes(b);
    return wins.reduce((acc, w) => advanceWinner(acc, w.matchId, w.winnerEntrant), b);
  };

  let guard = 0;
  for (;;) {
    guard++;
    if (guard > 500) throw new Error("playout did not terminate — bracket is stuck");

    const status = groupsKnockout.status(bracket, entrants);
    if (status.status === "done") return { bracket, entrants, champion: status.champion };

    const playable = bracket.find((m) => m.entrantA && m.entrantB && !m.winnerEntrant);
    const before = bracket;
    if (playable) {
      const winner = Number(playable.entrantA!.slice(1)) < Number(playable.entrantB!.slice(1))
        ? playable.entrantA! : playable.entrantB!;
      bracket = advanceWinner(bracket, playable.id, winner);
    }
    bracket = applyFills(bracket);
    bracket = applyByes(bracket);

    if (bracket === before) throw new Error("playout made no progress — bracket is stuck");
  }
}

test.each([[12, 4, 2], [16, 4, 2]])(
  "full playout of %i entrants (groupSize %i, advancePerGroup %i) reaches done",
  (n, groupSize, advancePerGroup) => {
    const { bracket, entrants, champion } = playToDone(n, groupSize, advancePerGroup);
    expect(groupsKnockout.status(bracket, entrants)).toEqual({ status: "done", champion });
    expect(champion).not.toBeNull();
    const knockout = bracket.filter((m) => m.groupIdx === null);
    expect(knockout.every((m) => m.winnerEntrant !== null)).toBe(true);
  },
);
