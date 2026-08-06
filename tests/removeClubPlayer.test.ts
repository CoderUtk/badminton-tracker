const rpc = jest.fn();
jest.mock("../src/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
// refreshClubs() short-circuits when getDb() resolves null — keeps this test
// off expo-sqlite, same pattern as tests/tournamentEntrants.test.ts.
jest.mock("../src/db/db", () => ({ getDb: async () => null }));

import { removePlayer } from "../src/repos/clubRepo";

beforeEach(() => rpc.mockReset());

test("removePlayer calls the RPC with the player id", async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  await expect(removePlayer("cp-1")).resolves.toBeUndefined();
  expect(rpc).toHaveBeenCalledWith("remove_club_player", { p_club_player_id: "cp-1" });
});

test("removePlayer surfaces the RPC's error message", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "Player has tournament history — remove them from tournaments first" } });
  await expect(removePlayer("cp-1")).rejects.toThrow("Player has tournament history — remove them from tournaments first");
});
