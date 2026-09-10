import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "last_lineup_v1";

/**
 * The player names and match settings used for the most recent match, so the
 * same group can start again with one or two edits. Singles and doubles names
 * are kept apart, so toggling the format restores the right group.
 */
export type LastLineup = {
  doubles: boolean;
  /** Length 4: team A players 1-2, then team B players 1-2. */
  namesDoubles: string[];
  /** Length 2: player A, then player B. */
  namesSingles: string[];
  points: 11 | 15 | 21;
  bestOf: 1 | 3 | 5;
  clubId: string | null;
  /**
   * How the last match was entered: scored rally by rally, or filed as a
   * finished result. A host who logs results does it for every game of the
   * night, so the screen reopens the way they left it. Optional: lineups
   * stored before this existed still load, and read as "live".
   */
  mode?: "live" | "log";
};

export const EMPTY_LINEUP: LastLineup = {
  doubles: true,
  namesDoubles: ["", "", "", ""],
  namesSingles: ["", ""],
  points: 21,
  bestOf: 3,
  clubId: null,
  mode: "live",
};

// expo-secure-store has no native module on web, and the web build runs every
// visitor as a guest, so mirror the fallback used by guestMatches.ts. Player
// names are not secrets, but they are device-local either way.
const store = {
  async get(key: string): Promise<string | null> {
    return Platform.OS === "web" ? window.localStorage.getItem(key) : SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") window.localStorage.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    if (Platform.OS === "web") window.localStorage.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  },
};

function isLineup(x: unknown): x is LastLineup {
  const l = x as LastLineup | null;
  return (
    !!l &&
    typeof l.doubles === "boolean" &&
    Array.isArray(l.namesDoubles) && l.namesDoubles.length === 4 &&
    l.namesDoubles.every((n) => typeof n === "string") &&
    Array.isArray(l.namesSingles) && l.namesSingles.length === 2 &&
    l.namesSingles.every((n) => typeof n === "string") &&
    [11, 15, 21].includes(l.points) &&
    [1, 3, 5].includes(l.bestOf) &&
    (l.clubId === null || typeof l.clubId === "string") &&
    (l.mode === undefined || l.mode === "live" || l.mode === "log")
  );
}

/** Remember this lineup for the next match. Never throws — storage is best effort. */
export async function saveLastLineup(lineup: LastLineup): Promise<void> {
  try {
    await store.set(KEY, JSON.stringify(lineup));
  } catch {
    // A storage failure must never block starting a match.
  }
}

/** The lineup from the last match, or null when absent or unreadable. */
export async function loadLastLineup(): Promise<LastLineup | null> {
  try {
    const raw = await store.get(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isLineup(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Called when leaving guest mode so names don't leak across accounts on a shared device. */
export async function clearLastLineup(): Promise<void> {
  try {
    await store.remove(KEY);
  } catch {
    // Nothing useful to do; the next read simply returns whatever is there.
  }
}

const namesFromParams = (params: { teamA?: string; teamB?: string }): string[] =>
  [...(params.teamA?.split(",") ?? []), ...(params.teamB?.split(",") ?? [])]
    .map((name) => name.trim())
    .filter(Boolean);

/**
 * What the new-match screen opens with. Route params (a session or tournament
 * deep link) win outright, then the persisted lineup, then empty defaults.
 * Guests never restore a club, because they cannot save a match to one.
 */
export function resolveInitialLineup(
  params: { clubId?: string; teamA?: string; teamB?: string },
  persisted: LastLineup | null,
  isGuest: boolean,
): LastLineup {
  const base = persisted ?? EMPTY_LINEUP;
  const fromParams = namesFromParams(params);
  const pad = (names: string[], size: number) =>
    Array.from({ length: size }, (_, i) => names[i] ?? "");

  const doubles = fromParams.length ? fromParams.length > 2 : base.doubles;

  return {
    doubles,
    namesDoubles:
      fromParams.length && doubles ? pad(fromParams, 4) : pad(base.namesDoubles, 4),
    namesSingles:
      fromParams.length && !doubles ? pad(fromParams, 2) : pad(base.namesSingles, 2),
    points: base.points,
    bestOf: base.bestOf,
    clubId: isGuest ? null : params.clubId ?? base.clubId,
    mode: base.mode,
  };
}
