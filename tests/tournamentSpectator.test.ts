const rpc = jest.fn();
jest.mock("../src/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { getTournamentSpectatorView } from "../src/repos/tournamentStaffRepo";

beforeEach(() => rpc.mockReset());

test("maps bracket cells from the RPC response", async () => {
  rpc.mockResolvedValue({
    data: [
      {
        name: "Smash Cup", status: "live", format: "round_robin", round: 1, idx: 0, match_id: "m-1",
        entrant_a: "e1", entrant_b: "e2", winner_entrant: null,
        entrant_a_name: "Ann", entrant_b_name: "Bo",
        court: null, match_status: null, score_summary: null,
      },
    ],
    error: null,
  });

  const view = await getTournamentSpectatorView("t-1");

  expect(rpc).toHaveBeenCalledWith("tournament_spectator_view", { p_tournament_id: "t-1" });
  expect(view).toEqual({
    name: "Smash Cup",
    status: "live",
    format: "round_robin",
    cells: [
      {
        round: 1, idx: 0, matchId: "m-1",
        entrantA: "e1", entrantB: "e2", winnerEntrant: null,
        entrantAName: "Ann", entrantBName: "Bo",
        court: null, matchStatus: null, scoreSummary: null,
      },
    ],
  });
});

test("a server without 0053 applied yet (no format column) defaults to single_elim", async () => {
  rpc.mockResolvedValue({
    data: [
      {
        name: "Smash Cup", status: "live", round: 1, idx: 0, match_id: "m-1",
        entrant_a: "e1", entrant_b: "e2", winner_entrant: null,
        entrant_a_name: "Ann", entrant_b_name: "Bo",
        court: null, match_status: null, score_summary: null,
        // no `format` key at all — mirrors an RPC response from before 0053.
      },
    ],
    error: null,
  });

  const view = await getTournamentSpectatorView("t-1");
  expect(view?.format).toBe("single_elim");
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
