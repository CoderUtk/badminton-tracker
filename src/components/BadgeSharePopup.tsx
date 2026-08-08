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
// (46) + close button (30) + 3 gaps of 14 (42) + panel's own vertical
// padding (40) + center wrapper's own vertical padding (48). The preview
// must shrink to leave this much room, or "Close" ends up pushed below
// the screen with no way to dismiss the popup — this exact bug shipped
// once already from an under-estimated constant here.
const CHROME_H = 24 + 46 + 30 + 42 + 40 + 48;
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
      <View style={s.center} pointerEvents="box-none">
        <View style={s.panel}>
          <Text style={s.title}>{badge.title}</Text>
          <View style={[s.previewClip, { width: previewW, height: previewH }]}>
            <View style={{ width: CARD_W, height: CARD_H, transform: [{ scale: previewScale }], transformOrigin: "0 0", position: "absolute", left: 0, top: 0 }}>
              <BadgeResultCard badge={badge} playerName={playerName} />
            </View>
          </View>
          <Pressable style={s.shareBtn} onPress={() => void captureAndShare(shareCardRef)}>
            <Icon name="share-social-outline" color={C.text} size={18} />
            <Text style={s.shareText}>Share to story</Text>
          </Pressable>
          <Pressable style={s.closeBtn} onPress={onClose}>
            <Text style={s.closeText}>Close</Text>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  panel: {
    backgroundColor: C.card, borderRadius: radius.lg, borderWidth: 1, borderColor: C.lineHi,
    padding: 20, alignItems: "center", gap: 14,
  },
  title: { color: C.text, fontFamily: F.display, fontSize: 20, textAlign: "center" },
  previewClip: { borderRadius: radius.md, overflow: "hidden" },
  shareBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.red, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 24,
  },
  shareText: { color: C.text, fontFamily: F.semibold, fontSize: 15 },
  closeBtn: { paddingVertical: 8 },
  closeText: { color: C.text2, fontFamily: F.medium, fontSize: 14 },
  offscreen: { position: "absolute", left: -9999, top: 0, width: CARD_W, height: CARD_H },
});
