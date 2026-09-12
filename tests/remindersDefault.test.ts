/**
 * The notification default is a one-line rule with three states and four
 * call sites, and getting it wrong silently disables every push the app
 * sends — so it gets a test even though it is small.
 */
const store = new Map<string, string>();

jest.mock("../src/db/db", () => ({
  getDb: async () => ({
    getFirstAsync: async (_sql: string, key: string) =>
      store.has(key) ? { value: store.get(key) } : null,
    runAsync: async () => undefined,
  }),
}));

import { remindersEnabled, remindersUndecided, REMINDERS_KEY } from "../src/repos/settingsRepo";

beforeEach(() => store.clear());

test("a fresh install has notifications ON", async () => {
  await expect(remindersEnabled()).resolves.toBe(true);
  await expect(remindersUndecided()).resolves.toBe(true);
});

test("only an explicit \"0\" turns them off", async () => {
  store.set(REMINDERS_KEY, "0");
  await expect(remindersEnabled()).resolves.toBe(false);
  await expect(remindersUndecided()).resolves.toBe(false);
});

test("an explicit \"1\" is on and counts as decided", async () => {
  store.set(REMINDERS_KEY, "1");
  await expect(remindersEnabled()).resolves.toBe(true);
  await expect(remindersUndecided()).resolves.toBe(false);
});

test("a stored value that is neither is treated as on, not off", async () => {
  // Guards the old `=== "1"` shape: any unexpected value must not silently
  // disable push.
  store.set(REMINDERS_KEY, "true");
  await expect(remindersEnabled()).resolves.toBe(true);
});
