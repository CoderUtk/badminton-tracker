const rpc = jest.fn();
jest.mock("../src/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
// refreshClubs() short-circuits when getDb() resolves null — keeps this test
// off expo-sqlite, same pattern as tests/tournamentEntrants.test.ts.
jest.mock("../src/db/db", () => ({ getDb: async () => null }));

import { leaveClub } from "../src/repos/clubRepo";

beforeEach(() => rpc.mockReset());

test("leaveClub calls the RPC with the club id", async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  await expect(leaveClub("club-1")).resolves.toBeUndefined();
  expect(rpc).toHaveBeenCalledWith("leave_club", { p_club_id: "club-1" });
});

test("leaveClub surfaces the RPC's error message", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "Club owner cannot leave — delete the club instead" } });
  await expect(leaveClub("club-1")).rejects.toThrow("Club owner cannot leave — delete the club instead");
});
