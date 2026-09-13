import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { getMatch, loadEvents, MatchRecord, SidePlayer } from "../../../src/repos/matchRepo";
import { listMyClubPlayers, ClubPlayer } from "../../../src/repos/clubRepo";
import type { MatchEvent } from "../../../src/engine";
import { formatElapsed } from "../../../src/lib/elapsed";
import {
  formatMatchDate,
  formatMatchStatus,
  matchDurationMs,
} from "../../../src/lib/matchDetail";
import { buildMomentum, momentumHeadline } from "../../../src/lib/matchMomentum";
import { matchRatingMoment, RatingMoment } from "../../../src/repos/ratingRepo";
import MomentumChart from "../../../src/components/MomentumChart";
import RankCard from "../../../src/components/share/RankCard";
import { leadChanges, longestStreak, totalRallies } from "../../../src/lib/share/matchStats";
import { avatarMap, preloadAvatars } from "../../../src/lib/share/avatars";
import PressableScale from "../../../src/components/PressableScale";
import ShareCard from "../../../src/components/ShareCard";
import Icon from "../../../src/components/Icon";
import { shareMatchCard } from "../../../src/lib/shareMatch";
import { toast } from "../../../src/lib/toast";
import { C, F, MIN_TOUCH } from "../../../src/theme";

export default function MatchDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [match, setMatch] = useState<MatchRecord | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [roster, setRoster] = useState<ClubPlayer[]>([]);
  const [rating, setRating] = useState<RatingMoment | null>(null);
  const cardRef = useRef<View>(null);
  const rankRef = useRef<View>(null);

  useEffect(() => {
    if (!id) return;
    getMatch(id).then(setMatch);
    loadEvents(id).then(setEvents);
    listMyClubPlayers().then(setRoster);
    // Null until the match has synced and the server has rated it, so this can
    // legitimately stay null forever on a quick match. See ratingRepo.
    matchRatingMoment(id).then(setRating);
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
  const onShareRank = async () => {
    try {
      await preloadAvatars([rating?.avatarUrl ?? null]);
      await shareMatchCard(rankRef);
    } catch {
      toast("Couldn't share", "error");
    }
  };
  const onShare = async () => {
    try {
      await preloadAvatars([...withAvatars(match.side_a), ...withAvatars(match.side_b)].map((p) => p.avatarUrl));
      await shareMatchCard(cardRef);
    } catch {
      toast("Couldn't share", "error");
    }
  };
  const momentum = buildMomentum(events, match.winner);
  const teamName = (side: "A" | "B") => names(side === "A" ? match.side_a : match.side_b);
  const headline = momentumHeadline(momentum, teamName);
  // One vertical scale across every game — see MomentumChart.
  const momentumScale = momentum.games.reduce(
    (max, g) => Math.max(max, ...g.diff.map(Math.abs)), 1);

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

      {rating && (
        <View style={s.card}>
          <Text style={s.timelineTitle}>Your rating</Text>
          <View style={s.ratingRow}>
            <Text
              style={[s.ratingDelta, { color: rating.delta >= 0 ? C.green : C.red }]}
              accessibilityLabel={`${rating.delta >= 0 ? "Up" : "Down"} ${Math.abs(rating.delta)} points`}
            >
              {rating.delta >= 0 ? "+" : "−"}{Math.abs(rating.delta)}
            </Text>
            <Text style={s.ratingValue}>{rating.rating}</Text>
          </View>
          <Text style={s.meta}>
            #{rating.rank} of {rating.players} in {rating.clubName}
          </Text>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Share rank card"
            style={s.rankShare}
            onPress={onShareRank}
          >
            <Icon name="share-social-outline" color={C.text2} size={16} />
            <Text style={s.rankShareText}>Share rank</Text>
          </PressableScale>
        </View>
      )}

      {momentum.games.length > 0 && (
        <View style={s.card}>
          <Text style={s.timelineTitle}>How it went</Text>
          {headline && <Text style={s.headline}>{headline}</Text>}
          {momentum.games.map((g) => (
            <View key={g.game} style={s.timelineRow}>
              <Text style={s.timelineGame}>Game {g.game}</Text>
              <View style={{ flex: 1 }}>
                <MomentumChart game={g} scale={momentumScale} />
              </View>
            </View>
          ))}
          <Text style={s.meta}>
            {momentum.biggestLead
              ? `Biggest lead ${momentum.biggestLead.points} (${teamName(momentum.biggestLead.side)})`
              : "Level throughout"}
            {momentum.longestRun ? ` · Longest run ${momentum.longestRun.points}` : ""}
            {` · ${leadChanges(events)} lead change${leadChanges(events) === 1 ? "" : "s"}`}
          </Text>
        </View>
      )}

      {canShare && (
        <PressableScale accessibilityRole="button" style={s.shareBtn} onPress={onShare}>
          <Icon name="trophy" color={C.text} size={18} />
          <Text style={s.shareText}>Share to story</Text>
        </PressableScale>
      )}

      {rating && (
        <View style={s.offscreen} pointerEvents="none">
          <RankCard
            ref={rankRef}
            playerName={rating.playerName}
            avatarUrl={rating.avatarUrl}
            rank={rating.rank}
            players={rating.players}
            rating={rating.rating}
            clubName={rating.clubName}
            delta={rating.delta}
          />
        </View>
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
  headline: { color: C.text, fontSize: 15, fontFamily: F.semibold, marginBottom: 8 },
  ratingRow: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  ratingDelta: { fontSize: 28, fontFamily: F.display },
  ratingValue: { color: C.text, fontSize: 20, fontFamily: F.bold, fontVariant: ["tabular-nums"] },
  rankShare: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    marginTop: 10, minHeight: MIN_TOUCH, borderRadius: 10,
    borderWidth: 1, borderColor: C.line,
  },
  rankShareText: { color: C.text2, fontFamily: F.semibold, fontSize: 14 },
  shareBtn: { flexDirection: "row", gap: 8, backgroundColor: C.red, borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center", marginTop: 4 },
  shareText: { color: C.text, fontFamily: F.semibold, fontSize: 16 },
  offscreen: { position: "absolute", left: -10000, top: 0 },
});
