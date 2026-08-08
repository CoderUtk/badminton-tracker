const rpc = jest.fn();
jest.mock("../src/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
jest.mock("../src/db/db", () => ({ getDb: async () => null }));

import { addFriendToClub } from "../src/repos/clubRepo";

beforeEach(() => rpc.mockReset());

test("addFriendToClub calls the RPC with club and friend ids", async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  await expect(addFriendToClub("club-1", "friend-1")).resolves.toBeUndefined();
  expect(rpc).toHaveBeenCalledWith("add_friend_to_club", { p_club_id: "club-1", p_friend_id: "friend-1" });
});

test("addFriendToClub surfaces the RPC's error message", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "Not friends with that player" } });
  await expect(addFriendToClub("club-1", "friend-1")).rejects.toThrow("Not friends with that player");
});
