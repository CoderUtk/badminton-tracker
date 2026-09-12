import React from "react";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { C } from "../theme";

/**
 * Single icon entry point for the app so every glyph is consistent and swapping
 * a set is a one-line change. Names map to Ionicons unless listed in MCI
 * (MaterialCommunityIcons — e.g. the badminton shuttle and trophy).
 *
 * Every icon is hidden from the accessibility tree. The vector sets render a
 * <Text> node holding a private-use codepoint, so a visible icon makes TalkBack
 * read a garbage glyph (or an empty string) ahead of the real label on every
 * card, row, chip and button in the app. The label belongs on the pressable
 * that wraps the icon, never on the glyph.
 */
/**
 * MaterialCommunityIcons is only reached for glyphs Ionicons genuinely lacks —
 * the shuttle, the shuffle, the scoreboard, the rotation arrows. Everything
 * else was mixing two icon families on the same screen (an MCI trophy beside
 * an Ionicons chevron), which read as two different apps at a glance.
 */
const MCI = new Set([
  "badminton",
  "shuffle-variant",
  "scoreboard-outline",
  "screen-rotation",
]);

/**
 * MCI-flavoured names kept at the call sites (19 of them) but drawn from
 * Ionicons, so renaming stays a one-line change here rather than a sweep.
 */
const IONICON_ALIAS: Record<string, string> = {
  "account-group": "people",
  "account-plus": "person-add",
};

export type IconName =
  // Ionicons
  | "home" | "home-outline"
  | "calendar" | "calendar-outline"
  | "person" | "person-outline" | "person-add"
  | "cog"
  | "people-outline"
  | "play" | "pause" | "stop" | "flag"
  | "time-outline"
  | "arrow-undo" | "arrow-redo"
  | "chevron-forward" | "chevron-back" | "chevron-down" | "add" | "close"
  | "log-out-outline" | "swap-horizontal" | "swap-vertical"
  | "share-social-outline" | "create-outline"
  | "ellipse" | "trash-outline"
  | "information-circle-outline" | "hand-left-outline" | "lock-closed-outline"
  | "phone-portrait-outline" | "phone-landscape-outline" | "sync-outline"
  | "checkmark" | "checkmark-circle" | "wallet-outline" | "location-outline"
  // MaterialCommunityIcons
  | "badminton" | "trophy" | "trophy-outline"
  | "shuffle-variant" | "account-group" | "account-plus"
  | "scoreboard-outline" | "screen-rotation";

export default function Icon({
  name,
  size = 20,
  color = C.text,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const a11y = { accessible: false, importantForAccessibility: "no" as const };
  if (MCI.has(name)) {
    return <MaterialCommunityIcons name={name as never} size={size} color={color} {...a11y} />;
  }
  return <Ionicons name={(IONICON_ALIAS[name] ?? name) as never} size={size} color={color} {...a11y} />;
}
