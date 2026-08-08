import React, { useRef } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BadgeResultCard from "./share/BadgeResultCard";
import Icon from "./Icon";
import type { EarnedBadge } from "../achievements/types";
import { captureAndShare } from "../lib/share/captureAndShare";
import { C, F, radius } from "../theme";

const CARD_W = 1080;
const CARD_H = 1920;
// Everything in the panel besides the preview: title (24) + share button
// (46) + 1 gap of 14 + panel's own vertical padding (40) + center
// wrapper's own vertical padding (48, applied as real insets-aware
// padding below so content never renders under the status bar/notch).
// The preview must shrink to leave this much room, or the panel
// overflows the visible screen — this exact bug shipped twice already
// from under-estimated constants here, so this is derived from the
// actual chrome elements rather than guessed.
const CHROME_H = 24 + 46 + 14 + 40 + 48;
const CHROME_MARGIN = 24; // small safety buffer against font-scaling/measurement drift

export default function BadgeSharePopup({
  badge, playerName, onClose,
}: {
  badge: EarnedBadge | null;
  playerName: string;
  onClose: () => void;
}) {
  const shareCardRef = useRef<View>(null);
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  if (!badge) return null;

  const availW = screenW - 64;
  const availH = screenH - insets.top - insets.bottom - CHROME_H - CHROME_MARGIN;
  // Scale to fit both width and height (never upscale past a 320pt-wide card).
  const previewScale = Math.min(availW / CARD_W, availH / CARD_H, 320 / CARD_W);
  const previewW = CARD_W * previewScale;
  const previewH = CARD_H * previewScale;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={[StyleSheet.absoluteFill, s.backdrop]} onPress={onClose} accessibilityLabel="Dismiss" />
      <View
        style={[s.center, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
        pointerEvents="box-none"
      >
        <View style={s.panel}>
          <Pressable style={s.closeBtn} onPress={onClose} accessibilityLabel="Close" hitSlop={8}>
            <Icon name="close" color={C.text2} size={18} />
          </Pressable>
          <Text style={s.title} numberOfLines={1}>{badge.title}</Text>
          <View style={[s.previewClip, { width: previewW, height: previewH }]}>
            <View style={{ width: CARD_W, height: CARD_H, transform: [{ scale: previewScale }], transformOrigin: "0 0", position: "absolute", left: 0, top: 0 }}>
              <BadgeResultCard badge={badge} playerName={playerName} />
            </View>
          </View>
          <Pressable style={s.shareBtn} onPress={() => void captureAndShare(shareCardRef)}>
            <Icon name="share-social-outline" color={C.text} size={18} />
            <Text style={s.shareText}>Share to story</Text>
          </Pressable>
        </View>
      </View>
      <View ref={shareCardRef} collapsable={false} style={s.offscreen}>
        <BadgeResultCard badge={badge} playerName={playerName} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(0,0,0,0.65)" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  panel: {
    backgroundColor: C.card, borderRadius: radius.lg, borderWidth: 1, borderColor: C.lineHi,
    padding: 20, paddingTop: 24, alignItems: "center", gap: 14, position: "relative",
  },
  closeBtn: {
    position: "absolute", top: 8, right: 8, zIndex: 1,
    backgroundColor: C.cardHi, borderRadius: 999, padding: 6,
  },
  title: { color: C.text, fontFamily: F.display, fontSize: 20, textAlign: "center", paddingHorizontal: 28 },
  previewClip: { borderRadius: radius.md, overflow: "hidden" },
  shareBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.red, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 24,
  },
  shareText: { color: C.text, fontFamily: F.semibold, fontSize: 15 },
  offscreen: { position: "absolute", left: -9999, top: 0, width: CARD_W, height: CARD_H },
});
