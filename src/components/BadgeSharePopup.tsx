import React, { useRef, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import BadgeResultCard from "./share/BadgeResultCard";
import Icon from "./Icon";
import type { EarnedBadge } from "../achievements/types";
import { captureAndShare } from "../lib/share/captureAndShare";
import { C, F, radius } from "../theme";

const CARD_W = 1080;
const CARD_H = 1920;
// Everything in the panel besides the preview: title (24) + share button
// (46) + 1 gap of 14 + panel's own vertical padding (40) + center
// wrapper's own vertical padding (48).
// The preview must shrink to leave this much room, or the panel
// overflows the available space.
//
// This budget is measured against the popup's OWN container size (via
// onLayout below), not the device window. `useWindowDimensions` reports
// the full physical window, but this popup mounts inside the Profile
// screen's content slot — already confined below the tab navigator's
// header and above its tab bar, neither of which is a safe-area inset.
// Sizing off the full window overestimated available room by that
// header+tab-bar height, so the centered, overflowing panel got clipped
// under the header and behind the tab bar. Measuring the real container
// fixes that regardless of what chrome surrounds it.
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
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);

  const onContainerLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setContainerSize({ w: width, h: height });
  };

  if (!badge) return null;

  // Nothing measured yet (first frame) — render off-screen-sized-zero
  // rather than flashing an oversized card before layout settles.
  const availW = (containerSize?.w ?? 0) - 64;
  const availH = (containerSize?.h ?? 0) - CHROME_H - CHROME_MARGIN;
  const previewScale = containerSize
    ? Math.min(availW / CARD_W, availH / CARD_H, 320 / CARD_W)
    : 0;
  const previewW = CARD_W * previewScale;
  const previewH = CARD_H * previewScale;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" onLayout={onContainerLayout}>
      <Pressable style={[StyleSheet.absoluteFill, s.backdrop]} onPress={onClose} accessibilityLabel="Dismiss" />
      {containerSize && (
        <View style={s.center} pointerEvents="box-none">
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
      )}
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
