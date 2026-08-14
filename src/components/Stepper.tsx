import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { C } from "../theme";

export default function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const atMin = value <= min;
  const atMax = value >= max;
  return (
    <View style={s.row}>
      <Pressable
        style={[s.btn, atMin && s.btnDisabled]}
        disabled={atMin}
        onPress={() => onChange(value - 1)}
      >
        <Text style={s.btnText}>−</Text>
      </Pressable>
      <Text style={s.value}>{value}</Text>
      <Pressable
        style={[s.btn, atMax && s.btnDisabled]}
        disabled={atMax}
        onPress={() => onChange(value + 1)}
      >
        <Text style={s.btnText}>+</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 16 },
  btn: {
    width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
  },
  btnDisabled: { opacity: 0.4, backgroundColor: C.bgElev },
  btnText: { color: C.text, fontSize: 24, fontWeight: "800" },
  value: { color: C.text, fontSize: 24, fontWeight: "800", minWidth: 32, textAlign: "center" },
});
