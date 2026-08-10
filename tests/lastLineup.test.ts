// node test env can't parse the real react-native package (Flow/ESM syntax);
// stub just enough for the Platform.OS check to take the native branch.
jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

const store = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: (key: string) => Promise.resolve(store.get(key) ?? null),
  setItemAsync: (key: string, value: string) => { store.set(key, value); return Promise.resolve(); },
  deleteItemAsync: (key: string) => { store.delete(key); return Promise.resolve(); },
}));

import {
  EMPTY_LINEUP, LastLineup, clearLastLineup, loadLastLineup,
  resolveInitialLineup, saveLastLineup,
} from "../src/lib/lastLineup";

const lineup = (over: Partial<LastLineup> = {}): LastLineup => ({
  doubles: true,
  namesDoubles: ["Ana", "Bo", "Cy", "Dee"],
  namesSingles: ["Ana", "Bo"],
  points: 21,
  bestOf: 3,
  clubId: "club-1",
  ...over,
});

beforeEach(() => store.clear());

test("returns null when nothing has been saved", async () => {
  expect(await loadLastLineup()).toBeNull();
});

test("round-trips a saved lineup", async () => {
  await saveLastLineup(lineup());
  expect(await loadLastLineup()).toEqual(lineup());
});

test("clear removes the saved lineup", async () => {
  await saveLastLineup(lineup());
  await clearLastLineup();
  expect(await loadLastLineup()).toBeNull();
});

test("a corrupt stored value reads as null instead of throwing", async () => {
  store.set("last_lineup_v1", "{not json");
  expect(await loadLastLineup()).toBeNull();
});

test("a stored value of the wrong shape reads as null", async () => {
  store.set("last_lineup_v1", JSON.stringify({ doubles: true }));
  expect(await loadLastLineup()).toBeNull();
});

test("falls back to empty defaults with no params and nothing persisted", () => {
  expect(resolveInitialLineup({}, null, false)).toEqual(EMPTY_LINEUP);
});

test("uses the persisted lineup when there are no route params", () => {
  expect(resolveInitialLineup({}, lineup(), false)).toEqual(lineup());
});

test("guests never restore a persisted club", () => {
  expect(resolveInitialLineup({}, lineup(), true).clubId).toBeNull();
});

test("route params win over the persisted lineup", () => {
  const out = resolveInitialLineup(
    { teamA: "Kim,Lee", teamB: "Mia,Nia", clubId: "club-2" },
    lineup(),
    false,
  );
  expect(out.doubles).toBe(true);
  expect(out.namesDoubles).toEqual(["Kim", "Lee", "Mia", "Nia"]);
  expect(out.clubId).toBe("club-2");
});

test("two route names select singles and fill only the singles slots", () => {
  const out = resolveInitialLineup({ teamA: "Kim", teamB: "Lee" }, lineup(), false);
  expect(out.doubles).toBe(false);
  expect(out.namesSingles).toEqual(["Kim", "Lee"]);
  // the persisted doubles group is untouched, so toggling back restores it
  expect(out.namesDoubles).toEqual(["Ana", "Bo", "Cy", "Dee"]);
});

test("route names are trimmed and blanks dropped", () => {
  const out = resolveInitialLineup({ teamA: " Kim , ", teamB: "Lee" }, null, false);
  expect(out.doubles).toBe(false);
  expect(out.namesSingles).toEqual(["Kim", "Lee"]);
});

test("points and games come from the persisted lineup when params are present", () => {
  const out = resolveInitialLineup({ teamA: "Kim", teamB: "Lee" }, lineup({ points: 15, bestOf: 1 }), false);
  expect(out.points).toBe(15);
  expect(out.bestOf).toBe(1);
});
