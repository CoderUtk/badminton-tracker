import React from "react";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { C } from "../theme";

/**
 * Single icon entry point for the app so every glyph is consistent and swapping
 * a set is a one-line change. Names map to Ionicons unless listed in MCI
 * (MaterialCommunityIcons — e.g. the badminton shuttle and trophy).
 */
const MCI = new Set([
  "badminton",
  "trophy",
  "trophy-outline",
  "shuffle-variant",
  "account-group",
  "account-plus",
  "scoreboard-outline",
]);

export type IconName =
  // Ionicons
  | "home" | "home-outline"
  | "calendar" | "calendar-outline"
  | "person" | "person-outline"
  | "people-outline"
  | "play" | "pause" | "stop" | "flag"
  | "time-outline"
  | "arrow-undo" | "arrow-redo"
  | "chevron-forward" | "add" | "close"
  | "log-out-outline" | "swap-horizontal" | "swap-vertical"
  | "ellipse" | "trash-outline"
  // MaterialCommunityIcons
  | "badminton" | "trophy" | "trophy-outline"
  | "shuffle-variant" | "account-group" | "account-plus"
  | "scoreboard-outline";

export default function Icon({
  name,
  size = 20,
  color = C.text,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  if (MCI.has(name)) {
    return <MaterialCommunityIcons name={name as never} size={size} color={color} />;
  }
  return <Ionicons name={name as never} size={size} color={color} />;
}
