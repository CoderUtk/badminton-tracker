import React, { useRef } from "react";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import BadgeResultCard from "./share/BadgeResultCard";
import Icon from "./Icon";
import type { EarnedBadge } from "../achievements/types";
import { captureAndShare } from "../lib/share/captureAndShare";
import { C, F, radius } from "../theme";

const CARD_W = 1080;
const CARD_H = 1920;
const PREVIEW_W = Math.min(Dimensions.get("window").width - 64, 320);
const PREVIEW_SCALE = PREVIEW_W / CARD_W;
const PREVIEW_H = CARD_H * PREVIEW_SCALE;

export default function BadgeSharePopup({
  badge, playerName, onClose,
}: {
  badge: EarnedBadge | null;
  playerName: string;
  onClose: () => void;
}) {
  const shareCardRef = useRef<View>(null);

  if (!badge) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={[StyleSheet.absoluteFill, s.backdrop]} onPress={onClose} accessibilityLabel="Dismiss" />
      <View style={s.center} pointerEvents="box-none">
        <View style={s.panel}>
          <Text style={s.title}>{badge.title}</Text>
          <View style={[s.previewClip, { width: PREVIEW_W, height: PREVIEW_H }]}>
            <View style={{ width: CARD_W, height: CARD_H, transform: [{ scale: PREVIEW_SCALE }], transformOrigin: "0 0", position: "absolute", left: 0, top: 0 }}>
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
