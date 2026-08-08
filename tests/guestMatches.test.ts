// node test env can't parse the real react-native package (Flow/ESM syntax);
// stub just enough for guestMatches's Platform.OS check to take the native
// (SecureStore) branch, matching what the mock below exercises.
jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

const store = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: (key: string) => Promise.resolve(store.get(key) ?? null),
  setItemAsync: (key: string, value: string) => { store.set(key, value); return Promise.resolve(); },
  deleteItemAsync: (key: string) => { store.delete(key); return Promise.resolve(); },
}));

import { recordGuestMatch, getGuestMatchIds, clearGuestMatchIds } from "../src/lib/guestMatches";

beforeEach(() => store.clear());

test("returns an empty list when nothing has been recorded", async () => {
  expect(await getGuestMatchIds()).toEqual([]);
});

test("records a match id and returns it", async () => {
  await recordGuestMatch("m-1");
  expect(await getGuestMatchIds()).toEqual(["m-1"]);
});

test("newest recorded match comes first", async () => {
  await recordGuestMatch("m-1");
  await recordGuestMatch("m-2");
  expect(await getGuestMatchIds()).toEqual(["m-2", "m-1"]);
});

test("clear empties the list", async () => {
  await recordGuestMatch("m-1");
  await clearGuestMatchIds();
  expect(await getGuestMatchIds()).toEqual([]);
});

test("caps the stored list at 40 ids, dropping the oldest", async () => {
  for (let i = 0; i < 41; i++) await recordGuestMatch(`m-${i}`);
  const ids = await getGuestMatchIds();
  expect(ids).toHaveLength(40);
  expect(ids[0]).toBe("m-40");
  expect(ids).not.toContain("m-0");
});
