import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { getRealtimeBackend } from "../../../src/realtime";
import * as repo from "../../../src/repos/matchRepo";
import { replay } from "../../../src/engine";
import type { MatchEvent, MatchState, TeamId } from "../../../src/engine";
import { C, F } from "../../../src/theme";

export default function WatchMatch() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const [state, setState] = useState<MatchState | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    if (!matchId) return;
    let events: MatchEvent[] = [];
    let off = () => {};
    let cancelled = false;
    (async () => {
      try {
        events = await repo.loadEvents(matchId);
        if (cancelled) return;
        if (events.length) setState(replay(events));
        off = getRealtimeBackend().subscribe(matchId, (e) => {
          events = [...events, e];
          try { setState(replay(events)); } catch { /* out-of-order event; keep last-known */ }
        });
      } catch {
        if (!cancelled) setReconnecting(true);
      }
    })();
    return () => { cancelled = true; off(); };
  }, [matchId]);

  if (!state) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: C.text2, fontFamily: F.body }}>{reconnecting ? "Reconnecting…" : "Waiting for the match…"}</Text>
      </View>
    );
  }

  const name = (t: TeamId) => state.config.teams[t].map((p) => p.name).join(" / ");

  return (
    <View style={{ flex: 1, padding: 20, justifyContent: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 24 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: state.phase === "match_over" ? C.ghost : C.red }} />
        <Text style={{ color: state.phase === "match_over" ? C.text2 : C.red, fontFamily: F.medium }}>
          {state.phase === "match_over" ? "FINAL" : `LIVE · Game ${state.game} of ${state.config.bestOf}`}
        </Text>
      </View>
      {(["A", "B"] as const).map((t) => (
        <View
          key={t}
          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.card, borderRadius: 14, padding: 20, marginBottom: 12, borderColor: state.servingTeam === t && state.phase !== "match_over" ? C.accent : C.line, borderWidth: 1 }}
        >
          <Text style={{ color: C.text, fontFamily: F.semibold, fontSize: 18, flex: 1 }} numberOfLines={1}>
            {name(t)}{state.servingTeam === t && state.phase !== "match_over" ? "  •" : ""}
          </Text>
          <Text style={{ color: C.text, fontFamily: F.display, fontSize: 44 }}>{state.score[t]}</Text>
        </View>
      ))}
      <Text style={{ color: C.text2, textAlign: "center", marginTop: 12, fontFamily: F.body }}>
        Games {state.gamesWon.A}–{state.gamesWon.B}
      </Text>
    </View>
  );
}
