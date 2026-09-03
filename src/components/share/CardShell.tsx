import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import QRCode from "react-native-qrcode-svg";
import Logo from "../Logo";
import { joinLinkDisplayDomain } from "../../lib/shareJoin";
import { C, F, GRAD, radius } from "../../theme";

const CANVAS_W = 1080;
const CANVAS_H = 1920;
const TOP_MARGIN = 130;
const BOTTOM_MARGIN = 360;

export default function CardShell({ children }: { children: React.ReactNode }) {
  const domain = joinLinkDisplayDomain();

  return (
    <View style={s.canvas}>
      <LinearGradient colors={GRAD.court} style={StyleSheet.absoluteFill} />
      <View style={s.topBar}>
        <Logo size={44} />
      </View>
      <View style={s.safeZone}>{children}</View>
      {domain && (
        <View style={s.watermark}>
          <View style={s.qrBox}>
            <QRCode value={`https://${domain}`} size={140} color={C.bg} backgroundColor={C.text} />
          </View>
          <Text style={s.link}>{domain}</Text>
          <Text style={s.linkSub}>Scan to join CourtSide</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  canvas: { width: CANVAS_W, height: CANVAS_H },
  topBar: { position: "absolute", top: 56, left: 0, right: 0, alignItems: "center" },
  safeZone: {
    position: "absolute",
    top: TOP_MARGIN,
    left: 60,
    right: 60,
    height: CANVAS_H - TOP_MARGIN - BOTTOM_MARGIN,
    alignItems: "center",
    justifyContent: "center",
  },
  watermark: {
    position: "absolute",
    bottom: 90,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 10,
  },
  qrBox: { backgroundColor: C.text, padding: 12, borderRadius: radius.md },
  link: { color: C.text, fontFamily: F.semibold, fontSize: 24 },
  linkSub: { color: C.text3, fontFamily: F.body, fontSize: 18 },
});
