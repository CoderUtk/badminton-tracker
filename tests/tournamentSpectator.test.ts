const rpc = jest.fn();
jest.mock("../src/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { getTournamentSpectatorView } from "../src/repos/tournamentStaffRepo";

beforeEach(() => rpc.mockReset());

test("maps bracket cells from the RPC response", async () => {
  rpc.mockResolvedValue({
    data: [
      {
        name: "Smash Cup", status: "live", round: 1, idx: 0, match_id: "m-1",
        entrant_a: "e1", entrant_b: "e2", winner_entrant: null,
        entrant_a_name: "Ann", entrant_b_name: "Bo",
      },
    ],
    error: null,
  });

  const view = await getTournamentSpectatorView("t-1");

  expect(rpc).toHaveBeenCalledWith("tournament_spectator_view", { p_tournament_id: "t-1" });
  expect(view).toEqual({
    name: "Smash Cup",
    status: "live",
    cells: [
      {
        round: 1, idx: 0, matchId: "m-1",
        entrantA: "e1", entrantB: "e2", winnerEntrant: null,
        entrantAName: "Ann", entrantBName: "Bo",
      },
    ],
  });
});

test("returns an empty cell list for a tournament with no bracket yet", async () => {
  rpc.mockResolvedValue({
    data: [{
      name: "Smash Cup", status: "draft", round: null, idx: null, match_id: null,
      entrant_a: null, entrant_b: null, winner_entrant: null,
      entrant_a_name: null, entrant_b_name: null,
    }],
    error: null,
  });

  expect(await getTournamentSpectatorView("t-1")).toEqual({ name: "Smash Cup", status: "draft", cells: [] });
});

test("returns null when the tournament doesn't exist", async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  expect(await getTournamentSpectatorView("nope")).toBeNull();
});

test("throws instead of swallowing an RPC error", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
  await expect(getTournamentSpectatorView("t-1")).rejects.toThrow("permission denied");
});
