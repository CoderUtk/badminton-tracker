import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { getMatch, loadEvents, MatchRecord, SidePlayer } from "../../../src/repos/matchRepo";
import { listMyClubPlayers, ClubPlayer } from "../../../src/repos/clubRepo";
import type { MatchEvent } from "../../../src/engine";
import { formatElapsed } from "../../../src/lib/elapsed";
import {
  buildRallyTimeline,
  formatMatchDate,
  formatMatchStatus,
  matchDurationMs,
} from "../../../src/lib/matchDetail";
import { leadChanges, longestStreak, totalRallies } from "../../../src/lib/share/matchStats";
import { avatarMap, preloadAvatars } from "../../../src/lib/share/avatars";
import PressableScale from "../../../src/components/PressableScale";
import ShareCard from "../../../src/components/ShareCard";
import Icon from "../../../src/components/Icon";
import { shareMatchCard } from "../../../src/lib/shareMatch";
import { toast } from "../../../src/lib/toast";
import { C, F } from "../../../src/theme";

export default function MatchDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [match, setMatch] = useState<MatchRecord | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [roster, setRoster] = useState<ClubPlayer[]>([]);
  const cardRef = useRef<View>(null);

  useEffect(() => {
    if (!id) return;
    getMatch(id).then(setMatch);
    loadEvents(id).then(setEvents);
    listMyClubPlayers().then(setRoster);
  }, [id]);

  const avatars = useMemo(() => avatarMap(roster), [roster]);
  const withAvatars = (side: SidePlayer[]) =>
    side.map((p) => ({ name: p.name, avatarUrl: p.club_player_id ? avatars[p.club_player_id] ?? null : null }));

  if (!match) return <View style={s.root} />;
  const names = (side: { name: string }[]) => side.map((p) => p.name).join(" / ");
  // The share card renders a decided match: no winner means no share control,
  // which is why ShareCardProps.winner is non-nullable.
  const games = match.score_summary?.games ?? [];
  const canShare = match.status === "completed" && match.winner !== null && games.length > 0 && events.length > 0;
  const onShare = async () => {
    try {
      await preloadAvatars([...withAvatars(match.side_a), ...withAvatars(match.side_b)].map((p) => p.avatarUrl));
      await shareMatchCard(cardRef);
    } catch {
      toast("Couldn't share", "error");
    }
  };
  const timeline = buildRallyTimeline(events);

  return (
    <ScrollView style={s.root} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View style={s.card}>
        <Text style={[s.team, match.winner === "A" && s.win]}>{names(match.side_a)}</Text>
        <Text style={s.vs}>vs</Text>
        <Text style={[s.team, match.winner === "B" && s.win]}>{names(match.side_b)}</Text>
      </View>
      {match.score_summary?.games.map((g, i) => (
        <View key={i} style={s.gameRow}>
          <Text style={s.gameLbl}>Game {i + 1}</Text>
          <Text style={s.gameScore}>{g.A} – {g.B}</Text>
        </View>
      ))}
      <View style={s.card}>
        <Text style={s.meta}>{formatMatchDate(match.created_at)} · {formatMatchStatus(match.status)}</Text>
        {events.length > 0 && (
          <Text style={s.meta}>Duration {formatElapsed(matchDurationMs(events))}</Text>
        )}
      </View>

      {timeline.length > 0 && (
        <View style={s.card}>
          <Text style={s.timelineTitle}>Rally history</Text>
          {timeline.map((g) => (
            <View key={g.game} style={s.timelineRow}>
              <Text style={s.timelineGame}>Game {g.game}</Text>
              <View style={s.timelineDots}>
                {g.rallies.map((t, i) => (
                  <View key={i} style={[s.timelineDot, { backgroundColor: t === "A" ? C.red : C.blue }]} />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      {canShare && (
        <PressableScale accessibilityRole="button" style={s.shareBtn} onPress={onShare}>
          <Icon name="trophy" color={C.text} size={18} />
          <Text style={s.shareText}>Share to story</Text>
        </PressableScale>
      )}

      {/* Off-screen card captured for sharing. */}
      {canShare && (
        <View style={s.offscreen} pointerEvents="none">
          <ShareCard
            ref={cardRef}
            teamA={names(match.side_a)}
            teamB={names(match.side_b)}
            sideA={withAvatars(match.side_a)}
            sideB={withAvatars(match.side_b)}
            winner={match.winner as "A" | "B"}
            games={games}
            stats={{
              durationMs: matchDurationMs(events),
              rallies: totalRallies(events),
              streak: longestStreak(events, match.winner as "A" | "B"),
              leadChanges: leadChanges(events),
            }}
            dateLabel={formatMatchDate(match.created_at)}
          />
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 16, gap: 4 },
  team: { color: C.text, fontSize: 18, fontFamily: F.bold },
  win: { color: C.green },
  vs: { color: C.text2, fontSize: 13 },
  gameRow: {
    flexDirection: "row", justifyContent: "space-between",
    backgroundColor: C.card, borderRadius: 12, padding: 14,
  },
  gameLbl: { color: C.text2, fontSize: 15 },
  gameScore: { color: C.text, fontSize: 16, fontFamily: F.bold, fontVariant: ["tabular-nums"] },
  meta: { color: C.text2, fontSize: 14 },
  timelineTitle: { color: C.text, fontSize: 14, fontFamily: F.semibold, marginBottom: 6 },
  timelineRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  timelineGame: { color: C.text2, fontSize: 13, width: 56 },
  timelineDots: { flexDirection: "row", flexWrap: "wrap", gap: 4, flex: 1 },
  timelineDot: { width: 8, height: 8, borderRadius: 4 },
  shareBtn: { flexDirection: "row", gap: 8, backgroundColor: C.red, borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center", marginTop: 4 },
  shareText: { color: C.text, fontFamily: F.semibold, fontSize: 16 },
  offscreen: { position: "absolute", left: -10000, top: 0 },
});
