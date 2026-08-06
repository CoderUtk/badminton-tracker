import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { C, F } from "../../theme";

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
  const dim = { width: size, height: size, borderRadius: size / 2 };

  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={[s.image, dim]} />;
  }
  return (
    <View style={[s.fallback, dim]}>
      <Text style={[s.initial, { fontSize: size * 0.42 }]}>{initial}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  image: { backgroundColor: C.cardHi },
  fallback: { backgroundColor: C.cardHi, alignItems: "center", justifyContent: "center" },
  initial: { color: C.text, fontFamily: F.display },
});
