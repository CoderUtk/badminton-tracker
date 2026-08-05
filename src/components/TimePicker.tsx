import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { C } from "../theme";

const SLOTS: number[] = [];
for (let m = 0; m < 24 * 60; m += 30) SLOTS.push(m);

/** "6:00 PM", "11:30 AM", etc. from minutes-since-midnight. */
function formatSlot(minutes: number): string {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const period = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute.toString().padStart(2, "0")} ${period}`;
}

/**
 * Single 24-hour time picker: one wrapping grid of half-hour slots.
 * Pure RN, no native module — works in Expo Go offline, matches DatePicker.
 */
export default function TimePicker({
  value,
  onChange,
}: {
  value: number; // minutes since midnight
  onChange: (minutes: number) => void;
}) {
  return (
    <ScrollView style={s.scroll} nestedScrollEnabled>
      <View style={s.grid}>
        {SLOTS.map((m) => (
          <Pressable key={m} style={[s.chip, m === value && s.chipOn]} onPress={() => onChange(m)}>
            <Text style={[s.chipText, m === value && s.chipTextOn]}>{formatSlot(m)}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { maxHeight: 220, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 10 },
  chip: {
    minWidth: 76, minHeight: 40, paddingHorizontal: 10, justifyContent: "center", alignItems: "center",
    borderRadius: 20, backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.line,
  },
  chipOn: { backgroundColor: C.red, borderColor: C.red },
  chipText: { color: C.text, fontWeight: "700", fontSize: 13 },
  chipTextOn: { color: C.text },
});
