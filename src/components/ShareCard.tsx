import React, { forwardRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Logo from "./Logo";
import StatTile from "./StatTile";
import { formatGameScores, truncateName } from "../lib/share/cardData";
import { formatShortDuration } from "../lib/share/matchStats";
import { joinLinkDisplayDomain } from "../lib/shareJoin";
import { C, F, GRAD, radius, textGlow } from "../theme";

export type ShareCardStats = {
  durationMs: number;
  rallies: number;
  streak: number;
  leadChanges: number;
};

export type ShareCardProps = {
  teamA: string;
  teamB: string;
  /** Non-nullable: the share control is gated to decided matches. */
  winner: "A" | "B";
  games: { A: number; B: number }[];
  stats: ShareCardStats;
  dateLabel: string;
  /** Reserved for the upcoming profile-picture feature. Intentionally unused. */
  avatarUrl?: string | null;
};

/**
 * Fixed-size story card (9:16) captured off-screen for sharing. Render it in an
 * absolutely-positioned, off-viewport wrapper and pass its ref to captureRef,
 * which scales this 360×640 layout up to Instagram's 1080×1920.
 *
 * The 84pt vertical padding is the spec's safe zone: Instagram overlays its own
 * chrome on roughly the top and bottom eighth of a story, so nothing but the
 * background gradient is allowed to live out there.
 */
const ShareCard = forwardRef<View, ShareCardProps>(function ShareCard(
  { teamA, teamB, winner, games, stats, dateLabel }, ref,
) {
  const winnerName = truncateName(winner === "A" ? teamA : teamB);
  const loserName = truncateName(winner === "A" ? teamB : teamA);
  const chips = formatGameScores({ games });

  // Hero numerals come from the last game played: the point that ended it.
  const last = games[games.length - 1];
  const heroScore = last ? (winner === "A" ? last.A : last.B) : 0;
  const foilScore = last ? (winner === "A" ? last.B : last.A) : 0;

  const domain = joinLinkDisplayDomain();

  return (
    <View ref={ref} collapsable={false} style={s.card}>
      <LinearGradient colors={GRAD.court} style={StyleSheet.absoluteFill} />

      <View style={s.header}>
        <Logo size={26} />
      </View>

      <View style={s.body}>
        <Text style={s.eyebrow}>MATCH WON</Text>
        <Text style={s.hero}>{heroScore}</Text>
        <Text style={s.foil}>{foilScore}</Text>
        <View style={s.rule} />
        <Text style={s.winner} numberOfLines={2}>{winnerName}</Text>
        <Text style={s.loser} numberOfLines={2}>def. {loserName}</Text>

        <View style={s.chipRow}>
          {chips.map((score, i) => {
            const g = games[i];
            const wonIt = winner === "A" ? g.A > g.B : g.B > g.A;
            return (
              <View key={i} style={[s.chip, wonIt ? s.chipWon : s.chipLost]}>
                <Text style={s.chipText}>{score}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={s.statRow}>
        <StatTile label="TIME" value={formatShortDuration(stats.durationMs)} />
        <StatTile label="RALLIES" value={String(stats.rallies)} />
        <StatTile label="STREAK" value={String(stats.streak)} valueColor={C.accent} />
        <StatTile label="LEAD CHANGES" value={String(stats.leadChanges)} />
      </View>

      <View style={s.footer}>
        <Text style={s.footerText}>{dateLabel}</Text>
        {domain !== null && <Text style={s.footerLink}>{domain}</Text>}
      </View>
    </View>
  );
});

export default ShareCard;

const s = StyleSheet.create({
  card: {
    width: 360, height: 640, backgroundColor: C.bg,
    paddingHorizontal: 28, paddingVertical: 84, justifyContent: "space-between",
  },
  header: { alignItems: "center" },
  body: { flex: 1, justifyContent: "center", alignItems: "center" },
  eyebrow: { color: C.red, fontFamily: F.medium, fontSize: 11, letterSpacing: 2 },
  hero: {
    color: C.text, fontFamily: F.display, fontSize: 108, lineHeight: 116,
    fontVariant: ["tabular-nums"], ...textGlow(C.accent, 18),
  },
  // Decorative foil for the hero numeral. C.ghost fails AA by design, which is
  // why the same value is repeated accessibly in the chip strip below.
  foil: {
    color: C.ghost, fontFamily: F.display, fontSize: 40, lineHeight: 44,
    fontVariant: ["tabular-nums"],
  },
  rule: { width: 28, height: 1, backgroundColor: C.line, marginVertical: 14 },
  winner: { color: C.text, fontFamily: F.semibold, fontSize: 17, textAlign: "center" },
  loser: { color: C.text2, fontFamily: F.medium, fontSize: 13, textAlign: "center", marginTop: 4 },
  chipRow: { flexDirection: "row", gap: 6, marginTop: 18, flexWrap: "wrap", justifyContent: "center" },
  chip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.sm, backgroundColor: C.card, borderWidth: 1 },
  chipWon: { borderColor: C.accent },
  chipLost: { borderColor: C.line },
  chipText: { color: C.text2, fontFamily: F.medium, fontSize: 11, fontVariant: ["tabular-nums"] },
  statRow: { flexDirection: "row", gap: 6 },
  footer: { alignItems: "center", gap: 2 },
  footerText: { color: C.text3, fontFamily: F.medium, fontSize: 10, letterSpacing: 1 },
  footerLink: { color: C.text2, fontFamily: F.medium, fontSize: 10, letterSpacing: 1 },
});
