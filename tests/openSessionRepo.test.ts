const rpc = jest.fn();
jest.mock("../src/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
jest.mock("../src/db/db", () => ({ getDb: async () => null }));

import {
  getSessionOpenPreview, joinOpenSession, leaveOpenSession, setSessionOpenJoin,
} from "../src/repos/sessionRepo";

beforeEach(() => rpc.mockReset());

test("maps a preview row into camelCase", async () => {
  rpc.mockResolvedValue({
    data: [{
      session_id: "s-1", club_name: "Sunrise", location: "Court 3",
      starts_at: "2026-09-10T12:30:00.000Z", status: "scheduled",
      checked_in: 4, max_players: 12, already_in: false,
    }],
    error: null,
  });
  await expect(getSessionOpenPreview("s-1")).resolves.toEqual({
    sessionId: "s-1", clubName: "Sunrise", location: "Court 3",
    startsAt: Date.parse("2026-09-10T12:30:00.000Z"), status: "scheduled",
    checkedIn: 4, maxPlayers: 12, alreadyIn: false,
  });
  expect(rpc).toHaveBeenCalledWith("session_open_preview", { p_session_id: "s-1" });
});

test("a closed session previews as null rather than throwing", async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  await expect(getSessionOpenPreview("s-1")).resolves.toBeNull();
});

test("joinOpenSession returns the club_player_id", async () => {
  rpc.mockResolvedValue({ data: "cp-9", error: null });
  await expect(joinOpenSession("s-1")).resolves.toBe("cp-9");
  expect(rpc).toHaveBeenCalledWith("join_open_session", { p_session_id: "s-1" });
});

test("joinOpenSession surfaces the RPC message verbatim", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "This session is full" } });
  await expect(joinOpenSession("s-1")).rejects.toThrow("This session is full");
});

test("leaveOpenSession calls through", async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  await expect(leaveOpenSession("s-1")).resolves.toBeUndefined();
  expect(rpc).toHaveBeenCalledWith("leave_open_session", { p_session_id: "s-1" });
});

test("setSessionOpenJoin passes a null cap through unchanged", async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  await setSessionOpenJoin("s-1", { open: true, maxPlayers: null });
  expect(rpc).toHaveBeenCalledWith("set_session_open_join", {
    p_session_id: "s-1", p_open: true, p_max_players: null,
  });
});

test("setSessionOpenJoin clamps a cap into the 1..100 the column allows", async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  await setSessionOpenJoin("s-1", { open: true, maxPlayers: 999 });
  expect(rpc).toHaveBeenCalledWith("set_session_open_join", {
    p_session_id: "s-1", p_open: true, p_max_players: 100,
  });
});
