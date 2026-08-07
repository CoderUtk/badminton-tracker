const rpc = jest.fn();
const getUser = jest.fn();
const maybeSingle = jest.fn();
const eq = jest.fn();
const select = jest.fn();
const from = jest.fn();

jest.mock("../src/lib/supabase", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    auth: { getUser: (...a: unknown[]) => getUser(...a) },
    from: (...a: unknown[]) => from(...a),
  },
}));
// profileRepo imports expo-file-system/legacy for the avatar functions; this
// test never exercises them, but the module must still resolve.
jest.mock("expo-file-system/legacy", () => ({
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: "base64" },
}));

import { setUsername, getMyProfile, subscribeProfile } from "../src/repos/profileRepo";

beforeEach(() => {
  rpc.mockReset();
  getUser.mockReset().mockResolvedValue({ data: { user: { id: "u-1" } } });
  maybeSingle.mockReset().mockResolvedValue({
    data: {
      id: "u-1",
      display_name: "Rahul",
      display_name_set: true,
      age: null,
      hand: null,
      avatar_url: null,
      username: "rahul_07",
    },
    error: null,
  });
  eq.mockReset().mockReturnValue({ maybeSingle });
  select.mockReset().mockReturnValue({ eq });
  from.mockReset().mockReturnValue({ select });
});

test("setUsername calls the RPC with a trimmed, lowercased handle", async () => {
  rpc.mockResolvedValue({ data: "rahul_07", error: null });
  await expect(setUsername("  Rahul_07 ")).resolves.toBe("rahul_07");
  expect(rpc).toHaveBeenCalledWith("set_username", { p_username: "rahul_07" });
});

test("setUsername surfaces the RPC's error message verbatim", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "That username is taken" } });
  await expect(setUsername("rahul")).rejects.toThrow("That username is taken");
});

test("setUsername notifies profile subscribers on success", async () => {
  rpc.mockResolvedValue({ data: "rahul_07", error: null });
  const cb = jest.fn();
  const unsub = subscribeProfile(cb);
  await setUsername("rahul_07");
  expect(cb).toHaveBeenCalled();
  unsub();
});

test("setUsername does not notify subscribers when the RPC fails", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "That username is taken" } });
  const cb = jest.fn();
  const unsub = subscribeProfile(cb);
  await expect(setUsername("rahul")).rejects.toThrow();
  expect(cb).not.toHaveBeenCalled();
  unsub();
});

test("getMyProfile maps username off the selected row", async () => {
  const p = await getMyProfile();
  expect(p?.username).toBe("rahul_07");
  expect(select).toHaveBeenCalledWith(expect.stringContaining("username"));
});
