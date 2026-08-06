import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Logo from "../Logo";
import { C, F, GRAD } from "../../theme";

const CANVAS_W = 1080;
const CANVAS_H = 1920;
const SAFE_MARGIN_V = 250;

export default function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <View style={s.canvas}>
      <LinearGradient colors={GRAD.court} style={StyleSheet.absoluteFill} />
      <View style={s.topBar}>
        <Logo size={40} />
      </View>
      <View style={s.safeZone}>{children}</View>
      <View style={s.watermark}>
        <Logo size={28} showWordmark={false} />
        <Text style={s.link}>courtside-links.vercel.app/join</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  canvas: { width: CANVAS_W, height: CANVAS_H },
  topBar: { position: "absolute", top: SAFE_MARGIN_V - 80, left: 0, right: 0, alignItems: "center" },
  safeZone: {
    position: "absolute",
    top: SAFE_MARGIN_V,
    left: 60,
    right: 60,
    height: CANVAS_H - SAFE_MARGIN_V * 2,
    alignItems: "center",
    justifyContent: "center",
  },
  watermark: {
    position: "absolute",
    bottom: SAFE_MARGIN_V - 100,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 6,
  },
  link: { color: C.text2, fontFamily: F.medium, fontSize: 20 },
});
