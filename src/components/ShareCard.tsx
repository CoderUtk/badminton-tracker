import React, { forwardRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Logo from "./Logo";
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
 * Private to ShareCard: decoupled from the home screen's StatTile so this card's
 * layout budget can't shift under it (see StatTile's minHeight history) and so the
 * capture fallback's `const S = 3` scale-everything trick can reach it. Value is
 * rendered above the label per spec §8 — the opposite order of StatTile.
 */
function Tile({
  label, value, valueColor = C.text,
}: {
  label: string; value: string; valueColor?: string;
}) {
  return (
    <View style={s.tile}>
      <Text
        style={[s.tileValue, { color: valueColor }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </Text>
      <Text style={s.tileLabel} numberOfLines={2}>{label}</Text>
    </View>
  );
}

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
        <Tile label="TIME" value={formatShortDuration(stats.durationMs)} />
        <Tile label="RALLIES" value={String(stats.rallies)} />
        <Tile label="STREAK" value={String(stats.streak)} valueColor={C.accent} />
        <Tile label="LEAD CHANGES" value={String(stats.leadChanges)} />
      </View>

      <View style={s.footer}>
        <Logo size={14} showWordmark={false} />
        <View style={s.footerTextRow}>
          <Text style={s.footerText}>{dateLabel}</Text>
          {domain !== null && <Text style={s.footerLink}>{domain}</Text>}
        </View>
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
  tile: {
    flex: 1, backgroundColor: C.card, borderRadius: radius.md,
    paddingVertical: 10, paddingHorizontal: 6, alignItems: "center", gap: 4,
    minHeight: 66,
  },
  tileValue: { fontFamily: F.display, fontSize: 22, fontVariant: ["tabular-nums"] },
  // C.text2, never C.text3 — #5C6472 on C.bg is ~2.9:1, below WCAG AA (see StatTile).
  tileLabel: {
    color: C.text2, fontFamily: F.medium, fontSize: 8, letterSpacing: 0.5,
    textTransform: "uppercase", textAlign: "center",
  },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  footerTextRow: { alignItems: "center", gap: 2 },
  footerText: { color: C.text3, fontFamily: F.medium, fontSize: 10, letterSpacing: 1 },
  footerLink: { color: C.text2, fontFamily: F.medium, fontSize: 10, letterSpacing: 1 },
});
