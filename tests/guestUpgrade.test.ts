const getUser = jest.fn();
const updateUser = jest.fn();
jest.mock("../src/lib/supabase", () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUser(...a), updateUser: (...a: unknown[]) => updateUser(...a) } },
}));
jest.mock("expo-linking", () => ({ createURL: (p: string) => `badminton:///${p}` }));

import { upgradeGuestAccount } from "../src/repos/guestUpgradeRepo";

beforeEach(() => {
  getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1", is_anonymous: true } } });
  updateUser.mockReset().mockResolvedValue({ error: null });
});

test("sends a redirect back into the app, or the confirmation link strands the user on the web", async () => {
  await upgradeGuestAccount(" a@b.co ", "hunter22");
  expect(updateUser).toHaveBeenCalledWith(
    { email: "a@b.co", password: "hunter22" },
    { emailRedirectTo: "badminton:///auth" },
  );
});

test("refuses a session that already has an account", async () => {
  getUser.mockResolvedValue({ data: { user: { id: "u1", is_anonymous: false } } });
  await expect(upgradeGuestAccount("a@b.co", "hunter22")).rejects.toThrow("already have an account");
  expect(updateUser).not.toHaveBeenCalled();
});
