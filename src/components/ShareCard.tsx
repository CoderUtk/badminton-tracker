import React, { forwardRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import Avatar from "./share/Avatar";
import CardShell from "./share/CardShell";
import { formatGameScores, truncateName } from "../lib/share/cardData";
import { formatShortDuration } from "../lib/share/matchStats";
import { C, CARD_TYPE, F, radius, textGlow } from "../theme";

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
  /** Per-side players, in display order, for avatar rendering. */
  sideA: { name: string; avatarUrl: string | null }[];
  sideB: { name: string; avatarUrl: string | null }[];
};

function TeamRow({ players, label, winning }: {
  players: { name: string; avatarUrl: string | null }[];
  label: string;
  winning: boolean;
}) {
  return (
    <View style={s.teamRow}>
      <View style={s.avatars}>
        {players.map((p, i) => (
          <View key={i} style={i > 0 ? s.avatarOverlap : undefined}>
            <Avatar name={p.name} avatarUrl={p.avatarUrl} size={96} />
          </View>
        ))}
      </View>
      <Text style={winning ? s.winner : s.loser} numberOfLines={2}>{label}</Text>
    </View>
  );
}

/** One stat tile. Local to this card on purpose: the home screen's StatTile is
 *  shared with a screen whose layout changes must not move this card. */
function Tile({ label, value, valueColor = C.text }: {
  label: string; value: string; valueColor?: string;
}) {
  return (
    <View style={s.tile}>
      <Text style={[s.tileValue, { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
      {/* C.text2, never C.text3 - #5C6472 on C.card is below WCAG AA. */}
      <Text style={s.tileLabel} numberOfLines={2}>{label}</Text>
    </View>
  );
}

const ShareCard = forwardRef<View, ShareCardProps>(function ShareCard(
  { teamA, teamB, winner, games, stats, dateLabel, sideA, sideB }, ref,
) {
  const winnerName = truncateName(winner === "A" ? teamA : teamB);
  const loserName = truncateName(winner === "A" ? teamB : teamA);
  const winningPlayers = winner === "A" ? sideA : sideB;
  const losingPlayers = winner === "A" ? sideB : sideA;
  const chips = formatGameScores({ games });

  const last = games[games.length - 1];
  const heroScore = last ? (winner === "A" ? last.A : last.B) : 0;
  const foilScore = last ? (winner === "A" ? last.B : last.A) : 0;

  return (
    <View ref={ref} collapsable={false}>
      <CardShell>
        <View style={s.root}>
          <Text style={s.eyebrow}>MATCH WON</Text>
          <Text style={s.hero}>{heroScore}</Text>
          <Text style={s.foil}>{foilScore}</Text>
          <View style={s.rule} />
          <TeamRow players={winningPlayers} label={winnerName} winning />
          <TeamRow players={losingPlayers} label={`def. ${loserName}`} winning={false} />
          <Text style={s.date}>{dateLabel}</Text>

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

          <View style={s.statRow}>
            <Tile label="TIME" value={formatShortDuration(stats.durationMs)} />
            <Tile label="RALLIES" value={String(stats.rallies)} />
            <Tile label="STREAK" value={String(stats.streak)} valueColor={C.accent} />
            <Tile label="LEAD CHANGES" value={String(stats.leadChanges)} />
          </View>
        </View>
      </CardShell>
    </View>
  );
});

export default ShareCard;

const s = StyleSheet.create({
  root: { width: "100%", alignItems: "center" },
  // C.red frames, per the accent rule in theme.ts.
  eyebrow: { color: C.red, fontFamily: F.medium, fontSize: CARD_TYPE.label, letterSpacing: 4 },
  // The one glowing element on this card.
  hero: {
    color: C.text, fontFamily: F.display, fontSize: CARD_TYPE.hero, lineHeight: CARD_TYPE.hero * 1.08,
    fontVariant: ["tabular-nums"], ...textGlow(C.accent, 36),
  },
  // Decorative foil. C.ghost fails AA by design; the same number is repeated
  // accessibly in the chip strip below.
  foil: {
    color: C.ghost, fontFamily: F.display, fontSize: CARD_TYPE.title,
    lineHeight: CARD_TYPE.title * 1.1, fontVariant: ["tabular-nums"],
  },
  rule: { width: 84, height: 2, backgroundColor: C.line, marginVertical: 36 },
  teamRow: { flexDirection: "row", alignItems: "center", gap: 24, marginTop: 12 },
  avatars: { flexDirection: "row" },
  // Doubles pairs overlap so two 96pt avatars read as one team unit rather
  // than as two unrelated players.
  avatarOverlap: { marginLeft: -32 },
  winner: { color: C.text, fontFamily: F.semibold, fontSize: CARD_TYPE.title, textAlign: "center" },
  loser: { color: C.text2, fontFamily: F.medium, fontSize: CARD_TYPE.subtitle, textAlign: "center" },
  date: { color: C.text3, fontFamily: F.medium, fontSize: CARD_TYPE.caption, letterSpacing: 2, marginTop: 18 },
  chipRow: { flexDirection: "row", gap: 16, marginTop: 48, flexWrap: "wrap", justifyContent: "center" },
  chip: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: radius.md, backgroundColor: C.card, borderWidth: 2 },
  chipWon: { borderColor: C.accent },
  chipLost: { borderColor: C.line },
  chipText: { color: C.text2, fontFamily: F.medium, fontSize: CARD_TYPE.body, fontVariant: ["tabular-nums"] },
  statRow: { flexDirection: "row", gap: 16, marginTop: 56, width: "100%" },
  tile: {
    flex: 1, backgroundColor: C.card, borderRadius: radius.lg,
    paddingVertical: 24, paddingHorizontal: 12, alignItems: "center", gap: 10,
  },
  tileValue: { fontFamily: F.display, fontSize: CARD_TYPE.title, fontVariant: ["tabular-nums"] },
  tileLabel: {
    color: C.text2, fontFamily: F.medium, fontSize: CARD_TYPE.label,
    letterSpacing: 1, textAlign: "center", minHeight: CARD_TYPE.label * 2.4,
  },
});
