import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { C, F, glow } from "../../theme";

/** Deterministic accent pick so the same name always gets the same ring color. */
const RING_COLORS = [C.red, C.accent, C.blue, C.amber, C.green] as const;
function ringColorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return RING_COLORS[hash % RING_COLORS.length];
}

export default function Avatar({
  name,
  avatarUrl,
  size = 40,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const ring = ringColorFor(name || "?");
  const dim = { width: size, height: size, borderRadius: size / 2 };
  const ringStyle = { borderColor: ring, borderWidth: Math.max(2, size * 0.05), ...glow(ring, size * 0.3, 0.5) };

  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={[s.image, dim, ringStyle]} />;
  }
  return (
    <View style={[s.fallback, dim, ringStyle]}>
      <Text style={[s.initial, { fontSize: size * 0.44, color: ring }]}>{initial}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  image: { backgroundColor: C.cardHi },
  fallback: { backgroundColor: C.bgElev, alignItems: "center", justifyContent: "center" },
  initial: { fontFamily: F.display },
});
