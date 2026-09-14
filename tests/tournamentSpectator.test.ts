const rpc = jest.fn();
jest.mock("../src/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { getTournamentSpectatorView } from "../src/repos/tournamentStaffRepo";

beforeEach(() => rpc.mockReset());

test("maps bracket cells from the RPC response, including group routing", async () => {
  rpc.mockResolvedValue({
    data: [
      {
        name: "Smash Cup", status: "live", format: "groups_knockout", round: 1, idx: 0, match_id: "m-1",
        entrant_a: "e1", entrant_b: "e2", winner_entrant: null,
        entrant_a_name: "Ann", entrant_b_name: "Bo",
        court: null, match_status: null, score_summary: null,
        group_idx: 1, src_a: null, src_b: null,
      },
    ],
    error: null,
  });

  const view = await getTournamentSpectatorView("t-1");

  expect(rpc).toHaveBeenCalledWith("tournament_spectator_view", { p_tournament_id: "t-1" });
  expect(view).toEqual({
    name: "Smash Cup",
    status: "live",
    format: "groups_knockout",
    cells: [
      {
        round: 1, idx: 0, matchId: "m-1",
        entrantA: "e1", entrantB: "e2", winnerEntrant: null,
        entrantAName: "Ann", entrantBName: "Bo",
        court: null, matchStatus: null, scoreSummary: null,
        groupIdx: 1, srcA: null, srcB: null,
        winToMatchId: null, lossToMatchId: null,
      },
    ],
  });
});

test("maps a knockout slot's src tokens through, so an unfilled slot can name its seed", async () => {
  rpc.mockResolvedValue({
    data: [
      {
        name: "Smash Cup", status: "live", format: "groups_knockout", round: 3, idx: 0, match_id: null,
        entrant_a: null, entrant_b: null, winner_entrant: null,
        entrant_a_name: null, entrant_b_name: null,
        court: null, match_status: null, score_summary: null,
        group_idx: null, src_a: "G0#1", src_b: "G1#1",
      },
    ],
    error: null,
  });

  const view = await getTournamentSpectatorView("t-1");
  expect(view?.cells[0]).toMatchObject({ groupIdx: null, srcA: "G0#1", srcB: "G1#1" });
});

test("a server without 0053 applied yet (no format or group columns) defaults them all", async () => {
  rpc.mockResolvedValue({
    data: [
      {
        name: "Smash Cup", status: "live", round: 1, idx: 0, match_id: "m-1",
        entrant_a: "e1", entrant_b: "e2", winner_entrant: null,
        entrant_a_name: "Ann", entrant_b_name: "Bo",
        court: null, match_status: null, score_summary: null,
        // no `format`, `group_idx`, `src_a` or `src_b` keys at all — mirrors
        // an RPC response from before 0053.
      },
    ],
    error: null,
  });

  const view = await getTournamentSpectatorView("t-1");
  expect(view?.format).toBe("single_elim");
  expect(view?.cells[0]).toMatchObject({ groupIdx: null, srcA: null, srcB: null });
});

test("a null format (0053 applied, tournament row predates it) also defaults to single_elim", async () => {
  rpc.mockResolvedValue({
    data: [
      {
        name: "Smash Cup", status: "live", format: null, round: 1, idx: 0, match_id: "m-1",
        entrant_a: "e1", entrant_b: "e2", winner_entrant: null,
        entrant_a_name: "Ann", entrant_b_name: "Bo",
        court: null, match_status: null, score_summary: null,
      },
    ],
    error: null,
  });

  const view = await getTournamentSpectatorView("t-1");
  expect(view?.format).toBe("single_elim");
});

test("carries court and live score through for a match in progress", async () => {
  rpc.mockResolvedValue({
    data: [
      {
        name: "Smash Cup", status: "live", format: "single_elim", round: 1, idx: 0, match_id: "m-1",
        entrant_a: "e1", entrant_b: "e2", winner_entrant: null,
        entrant_a_name: "Ann", entrant_b_name: "Bo",
        court: "2", match_status: "live",
        score_summary: { games: [], current: { A: 11, B: 7 } },
        group_idx: null, src_a: null, src_b: null,
      },
    ],
    error: null,
  });

  const view = await getTournamentSpectatorView("t-1");

  expect(view?.cells[0]).toEqual({
    round: 1, idx: 0, matchId: "m-1",
    entrantA: "e1", entrantB: "e2", winnerEntrant: null,
    entrantAName: "Ann", entrantBName: "Bo",
    court: "2", matchStatus: "live",
    scoreSummary: { games: [], current: { A: 11, B: 7 } },
    groupIdx: null, srcA: null, srcB: null,
    winToMatchId: null, lossToMatchId: null,
  });
});

test("returns an empty cell list for a tournament with no bracket yet", async () => {
  rpc.mockResolvedValue({
    data: [{
      name: "Smash Cup", status: "draft", format: "groups_knockout", round: null, idx: null, match_id: null,
      entrant_a: null, entrant_b: null, winner_entrant: null,
      entrant_a_name: null, entrant_b_name: null,
      court: null, match_status: null, score_summary: null,
    }],
    error: null,
  });

  expect(await getTournamentSpectatorView("t-1")).toEqual({
    name: "Smash Cup", status: "draft", format: "groups_knockout", cells: [],
  });
});

test("returns null when the tournament doesn't exist", async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  expect(await getTournamentSpectatorView("nope")).toBeNull();
});

test("throws instead of swallowing an RPC error", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
  await expect(getTournamentSpectatorView("t-1")).rejects.toThrow("permission denied");
});

// A double-elimination spectator saw one flat tree — a four-entrant draw drawn
// as "ROUND 1 / ROUND OF 16 / QUARTERS / SEMIS / FINAL" — because the view
// returned no routing edges and splitDoubleElimRounds had nothing to split on.
// 0054 adds them; they are opaque ids here, tested only for null.
test("carries the routing edges through so a double-elim bracket can be split", async () => {
  rpc.mockResolvedValue({
    data: [
      {
        name: "DEVerify", status: "live", format: "double_elim", round: 1, idx: 0, match_id: "m-1",
        entrant_a: "e1", entrant_b: "e2", winner_entrant: null,
        entrant_a_name: "Ann", entrant_b_name: "Bo",
        court: null, match_status: null, score_summary: null,
        group_idx: null, src_a: null, src_b: null,
        win_to_match_id: "b-9", loss_to_match_id: "b-7",
      },
    ],
    error: null,
  });

  const view = await getTournamentSpectatorView("t-1");

  expect(view?.cells[0]).toMatchObject({ winToMatchId: "b-9", lossToMatchId: "b-7" });
});

// A server that has not had 0054 applied omits the columns entirely. That must
// read as "no routing data" — the flat-tree fallback — not crash.
test("a pre-0054 server without the routing columns still maps", async () => {
  rpc.mockResolvedValue({
    data: [
      {
        name: "Old", status: "live", format: "double_elim", round: 1, idx: 0, match_id: null,
        entrant_a: null, entrant_b: null, winner_entrant: null,
        entrant_a_name: null, entrant_b_name: null,
        court: null, match_status: null, score_summary: null,
        group_idx: null, src_a: null, src_b: null,
      },
    ],
    error: null,
  });

  const view = await getTournamentSpectatorView("t-1");

  expect(view?.cells[0]).toMatchObject({ winToMatchId: null, lossToMatchId: null });
});
