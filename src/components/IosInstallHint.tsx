import React, { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { shouldShowIosInstallHint, IOS_HINT_DISMISSED_KEY } from "../lib/pwa";
import { C, F } from "../theme";

/**
 * One-time, dismissible "Add to Home Screen" hint for iOS Safari visitors.
 * Android/desktop get the browser's own install prompt, so this is iOS-only.
 * Renders nothing on native or once installed/dismissed.
 */
export default function IosInstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(IOS_HINT_DISMISSED_KEY) === "1";
    } catch {
      // private mode / storage blocked — treat as not dismissed
    }
    const standalone =
      ("standalone" in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true) ||
      window.matchMedia?.("(display-mode: standalone)").matches === true;
    setShow(
      shouldShowIosInstallHint({ userAgent: window.navigator.userAgent, standalone, dismissed })
    );
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(IOS_HINT_DISMISSED_KEY, "1");
    } catch {
      // ignore — the hint just reappears next visit
    }
    setShow(false);
  };

  return (
    <View style={s.wrap} pointerEvents="box-none">
      <View style={s.sheet}>
        <Text style={s.title}>Add CourtSide to your home screen</Text>
        <View style={s.row}>
          <Text style={s.body}>Tap</Text>
          <Svg width={18} height={18} viewBox="0 0 24 24">
            {/* iOS Share glyph */}
            <Path
              d="M12 2l4 4h-3v9h-2V6H8l4-4zM5 10h3v2H6v8h12v-8h-2v-2h3a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V11a1 1 0 011-1z"
              fill={C.text}
            />
          </Svg>
          <Text style={s.body}>then “Add to Home Screen”.</Text>
        </View>
        <Pressable onPress={dismiss} style={s.btn} accessibilityRole="button">
          <Text style={s.btnText}>Got it</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center",
    paddingHorizontal: 12, paddingTop: 12, paddingBottom: 28,
  },
  sheet: {
    width: "100%", maxWidth: 420, backgroundColor: C.card, borderRadius: 16,
    borderWidth: 1, borderColor: C.line, padding: 16, gap: 10,
  },
  title: { color: C.text, fontFamily: F.semibold, fontSize: 15 },
  row: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  body: { color: C.text2, fontFamily: F.body, fontSize: 14 },
  btn: {
    alignSelf: "flex-end", backgroundColor: C.red, borderRadius: 10,
    paddingHorizontal: 18, paddingVertical: 10, marginTop: 2,
  },
  btnText: { color: C.text, fontFamily: F.semibold, fontSize: 14 },
});
