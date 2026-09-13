import { rowToBracketMatch, bracketMatchToRow, changedRows } from "../src/tournament/rows";
import type { BracketMatch, Entrant } from "../src/tournament/types";

test("row<->object maps idx to index", () => {
  const row = { id: "b1", tournament_id: "t1", round: 1, idx: 2, match_id: null, entrant_a: "e1", entrant_b: "e2", winner_entrant: null, court: null, scored_by: null, win_to_match_id: null, win_to_slot: null, loss_to_match_id: null, loss_to_slot: null, group_idx: null, src_a: null, src_b: null };
  const obj = rowToBracketMatch(row);
  expect(obj.index).toBe(2);
  expect(bracketMatchToRow(obj)).toEqual(row);
});

test("changedRows returns only rows whose fields differ", () => {
  const a: BracketMatch[] = [{ id: "1", tournamentId: "t", round: 1, index: 0, matchId: null, entrantA: "e1", entrantB: "e2", winnerEntrant: null, court: null, scoredBy: null, winToMatchId: null, winToSlot: null, lossToMatchId: null, lossToSlot: null, groupIdx: null, srcA: null, srcB: null }];
  const b: BracketMatch[] = [{ ...a[0], winnerEntrant: "e1" }];
  expect(changedRows(a, b).map((m) => m.id)).toEqual(["1"]);
});

// --- recordBracketResult ----------------------------------------------------
//
// tournamentRepo.ts also imports clubRepo/matchRepo/db, which reach
// react-native/expo-sqlite at module scope — factory-mocked here the same way
// tests/tournamentEntrants.test.ts does it, since recordBracketResult never
// touches any of them at runtime.
const rpc = jest.fn().mockResolvedValue({ error: null });
jest.mock("../src/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
jest.mock("../src/repos/clubRepo", () => ({
  listClubs: jest.fn(), addGuestPlayer: jest.fn(), listPlayers: jest.fn(),
}));
jest.mock("../src/db/db", () => ({ getDb: async () => null }));
jest.mock("../src/repos/matchRepo", () => ({ createMatch: jest.fn() }));

describe("recordBracketResult", () => {
  const { recordBracketResult } = require("../src/repos/tournamentRepo");

  const ent = (id: string, seed: number): Entrant =>
    ({ id, clubPlayerId: id, name: id, seed, partnerClubPlayerId: null });
  const blank = (over: Partial<BracketMatch> & { id: string }): BracketMatch => ({
    tournamentId: "t1", round: 1, index: 0, matchId: null,
    entrantA: null, entrantB: null, winnerEntrant: null, court: null, scoredBy: null,
    winToMatchId: null, winToSlot: null, lossToMatchId: null, lossToSlot: null,
    groupIdx: null, srcA: null, srcB: null, ...over,
  });

  beforeEach(() => { rpc.mockClear(); });

  test("non-group format: exactly one RPC call, with empty fills", async () => {
    // A single-elim round-1 match feeding a round-2 slot. No groupIdx/src
    // anywhere, so settleGroups and settleByes both see nothing to do.
    const m1 = blank({ id: "m1", round: 1, index: 0, entrantA: "e1", entrantB: "e2", winToMatchId: "m3", winToSlot: "a" });
    const m2 = blank({ id: "m2", round: 1, index: 1, entrantA: "e3", entrantB: "e4", winToMatchId: "m3", winToSlot: "b" });
    const m3 = blank({ id: "m3", round: 2, index: 0 });
    const bracket = [m1, m2, m3];
    const entrants = [ent("e1", 1), ent("e2", 2), ent("e3", 3), ent("e4", 4)];

    await recordBracketResult("m1", "e1", bracket, entrants);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("finish_bracket_match", {
      p_bracket_match_id: "m1", p_winner_entrant: "e1", p_slot_fills: [],
    });
  });

  test("groups_knockout: finishing the last group match fills the gate and cascades a bye in the same call", async () => {
    // Group 0 (e1/e2/e3): two matches already decided, g0m3 pending — this is
    // the call under test. Groups 1 and 2 are already fully resolved AND
    // already advanced into semi1 (mirrors state after earlier calls).
    const g0m1 = blank({ id: "g0m1", groupIdx: 0, entrantA: "e1", entrantB: "e2", winnerEntrant: "e1" });
    const g0m2 = blank({ id: "g0m2", groupIdx: 0, entrantA: "e1", entrantB: "e3", winnerEntrant: "e1" });
    const g0m3 = blank({ id: "g0m3", groupIdx: 0, entrantA: "e2", entrantB: "e3" }); // pending
    const g1 = blank({ id: "g1", groupIdx: 1, entrantA: "e4", entrantB: "e5", winnerEntrant: "e4" });
    const g2 = blank({ id: "g2", groupIdx: 2, entrantA: "e7", entrantB: "e8", winnerEntrant: "e7" });
    // Semi0: fed by G0#1 only — the other slot is a structural bye (srcB null).
    const semi0 = blank({
      id: "semi0", round: 2, index: 0, srcA: "G0#1", srcB: null,
      winToMatchId: "final", winToSlot: "a",
    });
    // Semi1: already fed from groups 1 and 2 (simulating those earlier calls),
    // real match still to be played.
    const semi1 = blank({
      id: "semi1", round: 2, index: 1, srcA: "G1#1", srcB: "G2#1",
      entrantA: "e4", entrantB: "e7", winToMatchId: "final", winToSlot: "b",
    });
    const final = blank({ id: "final", round: 3, index: 0 });
    const bracket = [g0m1, g0m2, g0m3, g1, g2, semi0, semi1, final];
    const entrants = [
      ent("e1", 1), ent("e2", 2), ent("e3", 3), ent("e4", 4), ent("e5", 5),
      ent("e7", 7), ent("e8", 8),
    ];

    await recordBracketResult("g0m3", "e2", bracket, entrants);

    // Call 1: the played result, carrying the gate fill it just unlocked.
    expect(rpc).toHaveBeenNthCalledWith(1, "finish_bracket_match", {
      p_bracket_match_id: "g0m3", p_winner_entrant: "e2",
      p_slot_fills: [{ matchId: "semi0", slot: "a", entrantId: "e1" }],
    });
    // Call 2: the bye that filling semi0's only slot just exposed.
    expect(rpc).toHaveBeenNthCalledWith(2, "finish_bracket_match", {
      p_bracket_match_id: "semi0", p_winner_entrant: "e1", p_slot_fills: [],
    });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
