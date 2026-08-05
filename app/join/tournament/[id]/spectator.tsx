import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getTournamentSpectatorView, type SpectatorView } from "../../../../src/repos/tournamentStaffRepo";
import type { BracketMatch, Entrant } from "../../../../src/tournament/types";
import BracketView from "../../../../src/components/BracketView";
import { toast } from "../../../../src/lib/toast";
import Logo from "../../../../src/components/Logo";
import PressableScale from "../../../../src/components/PressableScale";
import { C, F } from "../../../../src/theme";

export default function JoinTournamentSpectator() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [view, setView] = useState<SpectatorView | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    getTournamentSpectatorView(id)
      .then(setView)
      .catch((e: Error) => toast(e.message || "Could not load that tournament", "error"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={C.red} /></View>;
  }
  if (!view) {
    return (
      <View style={s.center}>
        <Logo size={44} />
        <Text style={s.title}>Tournament not found</Text>
        <Text style={s.sub}>This link may be out of date. Ask for a fresh one.</Text>
        <PressableScale style={s.ghost} onPress={() => router.replace("/")}>
          <Text style={s.ghostText}>Back to CourtSide</Text>
        </PressableScale>
      </View>
    );
  }

  const bracket: BracketMatch[] = view.cells.map((c) => ({
    id: `${c.round}:${c.idx}`, tournamentId: id!, round: c.round, index: c.idx,
    matchId: c.matchId, entrantA: c.entrantA, entrantB: c.entrantB,
    winnerEntrant: c.winnerEntrant, court: null, scoredBy: null,
  }));

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
        <Text style={s.title}>{view.name}</Text>
      </View>
      {bracket.length === 0 ? (
        <Text style={s.sub}>This tournament hasn't started yet.</Text>
      ) : (
        <ScrollView contentContainerStyle={s.bracketWrap}>
          <BracketView bracket={bracket} entrants={[...entrantMap.values()]} />
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, padding: 16, gap: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24, backgroundColor: C.bg },
  hero: { alignItems: "center", gap: 8 },
  eyebrow: { color: C.text3, fontFamily: F.medium, fontSize: 11, letterSpacing: 2.4 },
  title: { color: C.text, fontFamily: F.display, fontSize: 22, textAlign: "center" },
  sub: { color: C.text2, fontFamily: F.body, fontSize: 14.5, textAlign: "center", lineHeight: 21 },
  bracketWrap: { paddingVertical: 8 },
  ghost: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  ghostText: { color: C.accent, fontFamily: F.medium, fontSize: 15 },
});
