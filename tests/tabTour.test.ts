// node test env can't parse the real react-native package (Flow/ESM syntax);
// stub just enough for tabTour's Platform.OS check to take the native
// (SecureStore) branch, matching the mock below — same pattern as guestMatches.test.ts.
jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

const store = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: (key: string) => Promise.resolve(store.get(key) ?? null),
  setItemAsync: (key: string, value: string) => { store.set(key, value); return Promise.resolve(); },
  deleteItemAsync: (key: string) => { store.delete(key); return Promise.resolve(); },
}));

import { hasSeenTabTour, setSeenTabTour } from "../src/lib/tabTour";

beforeEach(() => store.clear());

test("returns false when the flag has never been set", async () => {
  expect(await hasSeenTabTour()).toBe(false);
});

test("returns true after setSeenTabTour resolves", async () => {
  await setSeenTabTour();
  expect(await hasSeenTabTour()).toBe(true);
});

test("persists across repeated reads", async () => {
  await setSeenTabTour();
  expect(await hasSeenTabTour()).toBe(true);
  expect(await hasSeenTabTour()).toBe(true);
});
