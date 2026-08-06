const updateLiveScore = jest.fn().mockResolvedValue(undefined);
const syncNow = jest.fn().mockResolvedValue(undefined);
jest.mock("../src/realtime", () => ({
  getRealtimeBackend: () => ({
    publishEvent: jest.fn().mockResolvedValue(undefined),
    setLive: jest.fn(), clearLive: jest.fn(),
    subscribe: jest.fn(), listLiveMatches: jest.fn(), onLiveMatchesChange: jest.fn(),
  }),
}));
jest.mock("../src/repos/matchRepo", () => ({
  loadEvents: jest.fn().mockResolvedValue([]),
  appendEvent: jest.fn().mockResolvedValue(undefined),
  removeEventsAfter: jest.fn().mockResolvedValue(undefined),
  finalizeMatch: jest.fn().mockResolvedValue(undefined),
  endMatchEarly: jest.fn().mockResolvedValue(undefined),
  getMatch: jest.fn().mockResolvedValue(null),
  updateLiveScore,
}));
jest.mock("../src/sync/runner", () => ({ syncNow, startSyncListener: jest.fn() }));

import { useMatchStore } from "../src/stores/matchStore";
import { defaultConfig, replay } from "../src/engine";
import type { MatchEvent } from "../src/engine";

const started: MatchEvent = {
  type: "MATCH_STARTED",
  config: defaultConfig({ matchType: "singles", teams: { A: [{ id: "a", name: "A" }], B: [{ id: "b", name: "B" }] } }),
  at: 0,
};

beforeEach(() => {
  jest.useFakeTimers();
  updateLiveScore.mockClear();
  syncNow.mockClear();
  useMatchStore.setState({ matchId: null, events: [], redoStack: [], state: null, liveTimer: null });
});
afterEach(() => jest.useRealTimers());

test("ticks a live-score update every 15s while a match is in progress", () => {
  useMatchStore.setState({ matchId: "m1", events: [started], state: replay([started]), redoStack: [] });
  useMatchStore.getState().dispatch({ type: "RALLY_WON", by: "A", at: 1 });

  jest.advanceTimersByTime(15000);
  expect(updateLiveScore).toHaveBeenCalledTimes(1);
  expect(updateLiveScore.mock.calls[0][0]).toBe("m1");

  jest.advanceTimersByTime(15000);
  expect(updateLiveScore).toHaveBeenCalledTimes(2);
});

test("stops ticking once the store is closed", () => {
  useMatchStore.setState({ matchId: "m1", events: [started], state: replay([started]), redoStack: [] });
  useMatchStore.getState().dispatch({ type: "RALLY_WON", by: "A", at: 1 });
  useMatchStore.getState().close();

  jest.advanceTimersByTime(30000);
  expect(updateLiveScore).not.toHaveBeenCalled();
});
