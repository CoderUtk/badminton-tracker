import React, { forwardRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Logo from "./Logo";
import { C, F, GRAD } from "../theme";

export type ShareCardProps = {
  teamA: string;
  teamB: string;
  winner: "A" | "B" | null;
  scoreLine: string;
  subtitle: string;
};

/**
 * Fixed-size story card (9:16) captured off-screen for sharing. Render it in an
 * absolutely-positioned, off-viewport wrapper and pass its ref to captureRef.
 */
const ShareCard = forwardRef<View, ShareCardProps>(function ShareCard(
  { teamA, teamB, winner, scoreLine, subtitle }, ref,
) {
  const Team = ({ name, side }: { name: string; side: "A" | "B" }) => (
    <View style={s.teamRow}>
      {winner === side ? <Text style={s.crown}>🏆</Text> : <Text style={s.crown}> </Text>}
      <Text style={[s.team, winner === side && s.win]} numberOfLines={2}>{name}</Text>
    </View>
  );
  return (
    <View ref={ref} collapsable={false} style={s.card}>
      <LinearGradient colors={GRAD.screen} style={StyleSheet.absoluteFill} />
      <View style={s.header}>
        <Logo size={34} />
      </View>
      <View style={s.body}>
        <Team name={teamA} side="A" />
        <Text style={s.vs}>VS</Text>
        <Team name={teamB} side="B" />
        <View style={s.scoreWrap}>
          <Text style={s.scoreLine}>{scoreLine}</Text>
        </View>
      </View>
      <Text style={s.subtitle}>{subtitle}</Text>
    </View>
  );
});

export default ShareCard;

const s = StyleSheet.create({
  card: { width: 360, height: 640, backgroundColor: C.bg, padding: 28, justifyContent: "space-between", borderRadius: 0 },
  header: { alignItems: "center", marginTop: 8 },
  body: { flex: 1, justifyContent: "center", gap: 14 },
  teamRow: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center" },
  crown: { fontSize: 22, width: 26, textAlign: "center" },
  team: { color: C.text2, fontFamily: F.display, fontSize: 26, textAlign: "center", flexShrink: 1, letterSpacing: 0.3 },
  win: { color: C.text },
  vs: { color: C.red, fontFamily: F.display, fontSize: 18, textAlign: "center", letterSpacing: 2 },
  scoreWrap: { marginTop: 18, alignItems: "center" },
  scoreLine: { color: C.accent, fontFamily: F.display, fontSize: 22, textAlign: "center", letterSpacing: 1, fontVariant: ["tabular-nums"] },
  subtitle: { color: C.text3, fontFamily: F.medium, fontSize: 13, textAlign: "center", letterSpacing: 1 },
});
