const publishEvent = jest.fn().mockResolvedValue(undefined);
const setLive = jest.fn();
const clearLive = jest.fn();
jest.mock("../src/realtime", () => ({
  getRealtimeBackend: () => ({
    publishEvent, setLive, clearLive,
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
}));
jest.mock("../src/sync/runner", () => ({ syncNow: jest.fn(), startSyncListener: jest.fn() }));

import { useMatchStore } from "../src/stores/matchStore";
import { defaultConfig, replay } from "../src/engine";
import type { MatchEvent } from "../src/engine";

test("scoring a point publishes the event to the realtime backend", () => {
  const started: MatchEvent = {
    type: "MATCH_STARTED",
    config: defaultConfig({ matchType: "singles", teams: { A: [{ id: "a", name: "A" }], B: [{ id: "b", name: "B" }] } }),
    at: 0,
  };
  useMatchStore.setState({ matchId: "m1", events: [started], state: replay([started]), redoStack: [] });

  const rally: MatchEvent = { type: "RALLY_WON", by: "A", at: 1 };
  useMatchStore.getState().dispatch(rally);

  expect(publishEvent).toHaveBeenCalledWith("m1", rally);
});
