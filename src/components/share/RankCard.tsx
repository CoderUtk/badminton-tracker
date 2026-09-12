import React, { forwardRef } from "react";
import CardShell from "./CardShell";
import Avatar from "./Avatar";
import { StyleSheet, Text, View } from "react-native";
import { C, F, CARD_TYPE, textGlow } from "../../theme";

/**
 * Shareable club rank card. Same shell, avatar and type scale as
 * BadgeResultCard — the two are meant to read as one family in a feed.
 *
 * Takes formatted values rather than a RatingMoment so the off-screen capture
 * never triggers a fetch: everything is already on screen when the user taps
 * share.
 */
export type RankCardProps = {
  playerName: string;
  avatarUrl?: string | null;
  rank: number;
  players: number;
  rating: number;
  clubName: string;
  /** Omitted on the profile card, present straight after a rated match. */
  delta?: number | null;
};

// forwardRef, like ShareCard: the ref is what react-native-view-shot captures.
const RankCard = forwardRef<View, RankCardProps>(function RankCard({
  playerName, avatarUrl = null, rank, players, rating, clubName, delta,
}, ref) {
  return (
    // The ref wraps CardShell, not its children: the capture has to include the
    // 1080x1920 canvas, gradient and watermark, not just the text block.
    <View ref={ref} collapsable={false}>
      <CardShell>
        <View style={s.root}>
          <Text style={s.rank}>#{rank}</Text>
          <Text style={s.of}>of {players} in {clubName}</Text>
          <View style={s.ratingRow}>
            <Text style={s.rating}>{rating}</Text>
            {delta != null && delta !== 0 && (
              <Text style={[s.delta, { color: delta > 0 ? C.green : C.red }]}>
                {delta > 0 ? "+" : "−"}{Math.abs(delta)}
              </Text>
            )}
          </View>
          <View style={s.playerRow}>
            <Avatar name={playerName} avatarUrl={avatarUrl} size={72} />
            <Text style={s.name}>{playerName}</Text>
          </View>
        </View>
      </CardShell>
    </View>
  );
});

export default RankCard;

const s = StyleSheet.create({
  root: { width: "100%", alignItems: "center", gap: 16 },
  rank: { color: C.text, fontFamily: F.display, fontSize: 220, lineHeight: 240, ...textGlow(C.accent, 32) },
  of: { color: C.text2, fontFamily: F.body, fontSize: CARD_TYPE.body, textAlign: "center" },
  ratingRow: { flexDirection: "row", alignItems: "baseline", gap: 18, marginTop: 20 },
  rating: { color: C.text, fontFamily: F.display, fontSize: CARD_TYPE.title, letterSpacing: 1 },
  delta: { fontFamily: F.display, fontSize: CARD_TYPE.subtitle },
  playerRow: { flexDirection: "row", alignItems: "center", gap: 20, marginTop: 28 },
  name: { color: C.text3, fontFamily: F.medium, fontSize: CARD_TYPE.subtitle },
});
