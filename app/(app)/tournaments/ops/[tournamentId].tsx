import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { getTournament, assignBracketMatchCourt, claimBracketMatch } from "../../../../src/repos/tournamentRepo";
import { useSession } from "../../../../src/stores/session";
import type { BracketMatch, Entrant } from "../../../../src/tournament/types";
import { toast } from "../../../../src/lib/toast";
import Icon from "../../../../src/components/Icon";
import PressableScale from "../../../../src/components/PressableScale";
import { C, F } from "../../../../src/theme";

export default function TournamentOps() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const [entrants, setEntrants] = useState<Entrant[]>([]);
  const [bracket, setBracket] = useState<BracketMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const { session } = useSession();

  const reload = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const { entrants: e, bracket: b } = await getTournament(tournamentId);
      setEntrants(e);
      setBracket(b);
    } catch (e) {
      toast((e as Error).message || "Could not load ops dashboard", "error");
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const getEntrantName = (id: string | null) => {
    if (!id) return "TBD";
    return entrants.find((e) => e.id === id)?.name || "Unknown";
  };

  const onAssignCourt = async (match: BracketMatch, court: string) => {
    try {
      await assignBracketMatchCourt(match.id, court);
      void reload();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const onClaim = async (match: BracketMatch) => {
    if (!session?.user?.id) return;
    try {
      await claimBracketMatch(match.id, session.user.id);
      void reload();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  if (loading) return <View style={s.center}><ActivityIndicator color={C.red} /></View>;

  const activeMatches = bracket.filter((m) => !m.winnerEntrant && m.entrantA && m.entrantB);

  return (
    <View style={s.root}>
      <Text style={s.header}>Live Ops Dashboard</Text>
      <FlatList
        data={activeMatches}
        keyExtractor={(m) => m.id}
        contentContainerStyle={s.content}
        ListEmptyComponent={<Text style={s.empty}>No active matches ready to be played.</Text>}
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.row}>
              <Text style={s.entrant}>{getEntrantName(item.entrantA)}</Text>
              <Text style={s.vs}>vs</Text>
              <Text style={s.entrant}>{getEntrantName(item.entrantB)}</Text>
            </View>
            <View style={s.actions}>
              <Text style={s.label}>Court: {item.court || "None"}</Text>
              {/* Very simple court assignment UI for demo/ops purposes */}
              <View style={s.courts}>
                {["1", "2", "3", "4"].map((c) => (
                  <PressableScale key={c} style={[s.courtBtn, item.court === c && s.courtActive]} onPress={() => onAssignCourt(item, c)}>
                    <Text style={[s.courtBtnText, item.court === c && s.courtActiveText]}>{c}</Text>
                  </PressableScale>
                ))}
              </View>
              <View style={s.rule} />
              <View style={s.claimRow}>
                <Text style={s.label}>
                  Scorer: {item.scoredBy === session?.user?.id ? "You" : item.scoredBy ? "Claimed" : "Unclaimed"}
                </Text>
                {!item.scoredBy && (
                  <PressableScale style={s.claimBtn} onPress={() => onClaim(item)}>
                    <Text style={s.claimBtnText}>Claim</Text>
                  </PressableScale>
                )}
              </View>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg },
  header: { color: C.text, fontFamily: F.display, fontSize: 22, margin: 16, textAlign: "center" },
  content: { padding: 16, gap: 12 },
  empty: { color: C.text2, fontFamily: F.body, textAlign: "center", marginTop: 24 },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.line },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  entrant: { flex: 1, color: C.text, fontFamily: F.semibold, fontSize: 16, textAlign: "center" },
  vs: { color: C.text3, fontFamily: F.medium, marginHorizontal: 8 },
  actions: { gap: 12 },
  label: { color: C.text2, fontFamily: F.medium, fontSize: 14 },
  courts: { flexDirection: "row", gap: 8 },
  courtBtn: { width: 44, height: 44, borderRadius: 8, backgroundColor: C.cardHi, alignItems: "center", justifyContent: "center" },
  courtActive: { backgroundColor: C.red },
  courtBtnText: { color: C.text, fontFamily: F.bold, fontSize: 16 },
  courtActiveText: { color: C.text },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: C.line },
  claimRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  claimBtn: { backgroundColor: C.green, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  claimBtnText: { color: C.bg, fontFamily: F.bold },
});
