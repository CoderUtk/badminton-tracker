import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getTournamentSpectatorView, type SpectatorView } from "../../../../src/repos/tournamentStaffRepo";
import type { BracketMatch, Entrant } from "../../../../src/tournament/types";
import type { BracketLiveScore } from "../../../../src/components/BracketView";
import TournamentView from "../../../../src/components/TournamentView";
import { formatOrDefault } from "../../../../src/tournament/formats";
import { toast } from "../../../../src/lib/toast";
import Logo from "../../../../src/components/Logo";
import OpenInAppBanner from "../../../../src/components/OpenInAppBanner";
import PressableScale from "../../../../src/components/PressableScale";
import Icon from "../../../../src/components/Icon";
import { C, F } from "../../../../src/theme";

const POLL_MS = 15000;

export default function JoinTournamentSpectator() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [view, setView] = useState<SpectatorView | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setView(await getTournamentSpectatorView(id));
    } catch (e) {
      toast((e as Error).message || "Could not load that tournament", "error");
    }
  }, [id]);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    load().finally(() => setLoading(false));
    const interval = setInterval(() => { void load(); }, POLL_MS);
    return () => clearInterval(interval);
  }, [id, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={C.red} /></View>;
  }
  if (!view) {
    return (
      <View style={s.center}>
        <Logo size={44} />
        <Text style={s.title}>Tournament not found</Text>
        <Text style={s.sub}>This link may be out of date. Ask for a fresh one.</Text>
        <PressableScale accessibilityRole="button" style={s.ghost} onPress={() => router.replace("/")}>
          <Text style={s.ghostText}>Back to CourtSide</Text>
        </PressableScale>
      </View>
    );
  }

  // The routing edges come through (0054). They are opaque here — `id` below
  // is a synthetic "round:idx", not the bracket_match uuid these point at, and
  // nothing dereferences them — but splitDoubleElimRounds only ever tests them
  // for null, which is all it needs to tell the winners bracket, the losers
  // bracket and the grand final apart. Without them a double-elimination
  // spectator got one flat tree over deliberately non-contiguous rounds: a
  // four-entrant draw drawn as "ROUND 1 / ROUND OF 16 / QUARTERS / SEMIS /
  // FINAL". Against a pre-0054 server they are null and the flat-tree fallback
  // still applies.
  const bracket: BracketMatch[] = view.cells.map((c) => ({
    id: `${c.round}:${c.idx}`, tournamentId: id!, round: c.round, index: c.idx,
    matchId: c.matchId, entrantA: c.entrantA, entrantB: c.entrantB,
    winnerEntrant: c.winnerEntrant, court: c.court, scoredBy: null,
    winToMatchId: c.winToMatchId, winToSlot: null,
    lossToMatchId: c.lossToMatchId, lossToSlot: null,
    groupIdx: c.groupIdx, srcA: c.srcA, srcB: c.srcB,
  }));

  const liveScores = new Map<string, BracketLiveScore>();
  for (const c of view.cells) {
    if (c.matchId && c.matchStatus) {
      liveScores.set(c.matchId, { status: c.matchStatus, scoreSummary: c.scoreSummary });
    }
  }

  const entrantMap = new Map<string, Entrant>();
  for (const c of view.cells) {
    if (c.entrantA && c.entrantAName) {
      entrantMap.set(c.entrantA, { id: c.entrantA, clubPlayerId: "", name: c.entrantAName, seed: 0, partnerClubPlayerId: null });
    }
    if (c.entrantB && c.entrantBName) {
      entrantMap.set(c.entrantB, { id: c.entrantB, clubPlayerId: "", name: c.entrantBName, seed: 0, partnerClubPlayerId: null });
    }
  }

  return (
    <View style={s.root}>
      <View style={s.hero}>
        <Logo size={40} />
        <Text style={s.eyebrow}>SPECTATING</Text>
        <View style={s.titleRow}>
          <Text style={s.title}>{view.name}</Text>
          <PressableScale accessibilityRole="button" style={s.refreshBtn} onPress={onRefresh} disabled={refreshing}>
            {refreshing
              ? <ActivityIndicator size="small" color={C.text2} />
              : <Icon name="sync-outline" color={C.text2} size={16} />}
          </PressableScale>
        </View>
        <OpenInAppBanner />
      </View>
      {bracket.length === 0 ? (
        <Text style={s.sub}>This tournament hasn't started yet.</Text>
      ) : (
        <ScrollView contentContainerStyle={s.bracketWrap}>
          <TournamentView
            format={formatOrDefault(view.format).id}
            bracket={bracket}
            entrants={[...entrantMap.values()]}
            liveScores={liveScores}
          />
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  hero: { alignItems: "center", gap: 8 },
  eyebrow: { color: C.text3, fontFamily: F.medium, fontSize: 11, letterSpacing: 2.4 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: C.text, fontFamily: F.display, fontSize: 22, textAlign: "center" },
  refreshBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: C.card },
  sub: { color: C.text2, fontFamily: F.body, fontSize: 14.5, textAlign: "center", lineHeight: 21 },
  bracketWrap: { paddingVertical: 8 },
  ghost: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  ghostText: { color: C.accent, fontFamily: F.medium, fontSize: 15 },
});
