import { rowToBracketMatch, bracketMatchToRow, type BracketRow } from "../src/tournament/rows";

const row: BracketRow = {
  id: "m1", tournament_id: "t1", round: 1, idx: 0, match_id: null,
  entrant_a: "e1", entrant_b: "e2", winner_entrant: null,
  court: "1", scored_by: null,
  win_to_match_id: "m9", win_to_slot: "a",
  loss_to_match_id: "m8", loss_to_slot: "b",
  group_idx: 2, src_a: "G1#1", src_b: "G2#2",
};

test("round-trips every routing field", () => {
  expect(bracketMatchToRow(rowToBracketMatch(row))).toEqual(row);
});

// Rows written before this migration have NULL in every new column, and older
// clients keep sending payloads without the keys at all.
test("a legacy row with no routing columns maps to nulls, not undefined", () => {
  const legacy = { ...row } as Record<string, unknown>;
  for (const k of ["win_to_match_id", "win_to_slot", "loss_to_match_id",
                   "loss_to_slot", "group_idx", "src_a", "src_b"]) delete legacy[k];
  const m = rowToBracketMatch(legacy as BracketRow);
  expect(m.winToMatchId).toBeNull();
  expect(m.winToSlot).toBeNull();
  expect(m.lossToMatchId).toBeNull();
  expect(m.groupIdx).toBeNull();
  expect(m.srcA).toBeNull();
  expect(bracketMatchToRow(m).win_to_match_id).toBeNull();
});
