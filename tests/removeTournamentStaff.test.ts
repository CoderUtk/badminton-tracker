const rpc = jest.fn();
jest.mock("../src/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { removeStaff } from "../src/repos/tournamentStaffRepo";

beforeEach(() => rpc.mockReset());

test("removeStaff calls the RPC with the staff id", async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  await expect(removeStaff("staff-1")).resolves.toBeUndefined();
  expect(rpc).toHaveBeenCalledWith("remove_tournament_staff", { p_staff_id: "staff-1" });
});

test("removeStaff surfaces the RPC's error message", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "Cannot remove a tournament admin" } });
  await expect(removeStaff("staff-1")).rejects.toThrow("Cannot remove a tournament admin");
});
