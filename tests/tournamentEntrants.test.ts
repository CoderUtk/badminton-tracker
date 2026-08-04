const from = jest.fn();
const listClubs = jest.fn();

jest.mock("../src/lib/supabase", () => ({ supabase: { from: (...a: unknown[]) => from(...a) } }));
jest.mock("../src/repos/clubRepo", () => ({
  listClubs: () => listClubs(),
  addGuestPlayer: jest.fn(),
  listPlayers: jest.fn().mockResolvedValue([]),
}));
// Factory mocks stop the real modules loading at all. Both reach react-native
// or expo-sqlite at module scope, which ts-jest cannot parse in the node env,
// and neither is involved in editing entrants.
jest.mock("../src/db/db", () => ({ getDb: async () => null }));
jest.mock("../src/repos/matchRepo", () => ({ createMatch: jest.fn() }));

import { removeEntrant, pairEntrants } from "../src/repos/tournamentRepo";

/** Mimics the postgrest builder chain: .delete().eq().select() or .update().eq().select() resolves. */
const query = (result: { data?: unknown[]; error?: { message: string } | null }) => ({
  delete: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  select: jest.fn().mockResolvedValue(result),
});

beforeEach(() => { from.mockReset(); });

test("removeEntrant throws when the delete is policy-blocked (zero rows)", async () => {
  from.mockReturnValue(query({ data: [] }));
  await expect(removeEntrant("e1")).rejects.toThrow("Could not remove that player");
});

test("removeEntrant succeeds when a row is actually deleted", async () => {
  from.mockReturnValue(query({ data: [{ id: "e1" }] }));
  await expect(removeEntrant("e1")).resolves.toBeUndefined();
});

test("pairEntrants throws when the update is policy-blocked (zero rows)", async () => {
  from.mockReturnValue(query({ data: [] }));
  await expect(pairEntrants("e1", "p2")).rejects.toThrow("Could not update that pair");
});

test("pairEntrants succeeds when a row is actually updated", async () => {
  from.mockReturnValue(query({ data: [{ id: "e1" }] }));
  await expect(pairEntrants("e1", null)).resolves.toBeUndefined();
});
