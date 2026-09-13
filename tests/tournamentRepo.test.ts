import { rowToBracketMatch, bracketMatchToRow, changedRows } from "../src/tournament/rows";
import type { BracketMatch } from "../src/tournament/types";

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
