import { LocalBackend } from "../src/realtime/backend";
import type { MatchEvent } from "../src/engine/types";

const ev = (): MatchEvent => ({ type: "POINT_SCORED", side: "A", at: 1 } as any);

test("subscribe receives published events", async () => {
  const b = new LocalBackend();
  const got: MatchEvent[] = [];
  const off = b.subscribe("m1", (e) => got.push(e));
  await b.publishEvent("m1", ev());
  expect(got).toHaveLength(1);
  off();
  await b.publishEvent("m1", ev());
  expect(got).toHaveLength(1); // unsubscribed
});

test("events are scoped per match", async () => {
  const b = new LocalBackend();
  const got: MatchEvent[] = [];
  b.subscribe("m1", (e) => got.push(e));
  await b.publishEvent("m2", ev());
  expect(got).toHaveLength(0);
});

test("live-match list updates notify subscribers", async () => {
  const b = new LocalBackend();
  const seen: number[] = [];
  b.onLiveMatchesChange("c1", (list) => seen.push(list.length));
  b.setLive({ matchId: "m1", clubId: "c1", teamA: ["A"], teamB: ["B"], scoreSummary: "0-0" });
  expect(await b.listLiveMatches("c1")).toHaveLength(1);
  b.clearLive("m1");
  expect(await b.listLiveMatches("c1")).toHaveLength(0);
  expect(seen).toEqual([1, 0]);
});
