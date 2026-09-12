import React from "react";
import { Platform, StyleSheet, Text } from "react-native";
import PressableScale from "./PressableScale";
import { androidIntentUrl } from "../lib/joinLink";
import { C, F } from "../theme";

/**
 * "Open in CourtSide" link, shown only on Android web. WhatsApp's in-app
 * browser (and similar) skips Android App Link resolution entirely, so a
 * join link tapped there always lands here instead of the app even when
 * it's installed. An `intent://` link works from inside that same browser
 * because it targets the package directly, no App Link verification needed.
 */
export default function OpenInAppBanner() {
  if (Platform.OS !== "web" || typeof navigator === "undefined" || !/Android/.test(navigator.userAgent)) {
    return null;
  }
  return (
    <PressableScale accessibilityRole="button"
      style={s.wrap}
      accessibilityLabel="Open in the CourtSide app"
      onPress={() => { window.location.href = androidIntentUrl(window.location.href); }}
    >
      <Text style={s.text}>Open in the CourtSide app</Text>
    </PressableScale>
  );
}

const s = StyleSheet.create({
  wrap: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  text: { color: C.accent, fontFamily: F.semibold, fontSize: 14 },
});
