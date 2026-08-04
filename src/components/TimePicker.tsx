import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { C } from "../theme";

const START_HOUR = 6; // 6:00 AM
const END_HOUR = 23; // 11:00 PM
const HOURS: number[] = [];
for (let h = START_HOUR; h <= END_HOUR; h++) HOURS.push(h);

/** "6 AM", "12 PM", "11 PM", etc. from a 24-hour value. */
function formatHour(hour24: number): string {
  const period = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12} ${period}`;
}

/**
 * Time-of-day picker: an hour grid (wraps, like DatePicker's day grid —
 * no scrolling, everything visible at once) plus a :00/:30 toggle. A
 * single scrolling row of 35 half-hour chips read as "very long" with
 * nothing else on screen to anchor it; this fits entirely in view.
 * Pure RN, no native module, so it works in Expo Go offline like DatePicker.
 */
export default function TimePicker({
  value,
  onChange,
}: {
  value: number; // minutes since midnight
  onChange: (minutes: number) => void;
}) {
  const hour = Math.floor(value / 60);
  const minute = value % 60;

  return (
    <View style={s.wrap}>
      <View style={s.grid}>
        {HOURS.map((h) => (
          <Pressable key={h} style={[s.chip, h === hour && s.chipOn]} onPress={() => onChange(h * 60 + minute)}>
            <Text style={[s.chipText, h === hour && s.chipTextOn]}>{formatHour(h)}</Text>
          </Pressable>
        ))}
      </View>
      <View style={s.minuteRow}>
        {[0, 30].map((m) => (
          <Pressable key={m} style={[s.minuteChip, m === minute && s.chipOn]} onPress={() => onChange(hour * 60 + m)}>
            <Text style={[s.chipText, m === minute && s.chipTextOn]}>:{m.toString().padStart(2, "0")}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minWidth: 58, minHeight: 42, paddingHorizontal: 12, justifyContent: "center", alignItems: "center",
    borderRadius: 21, backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
  },
  minuteRow: { flexDirection: "row", gap: 8 },
  minuteChip: {
    flex: 1, minHeight: 42, justifyContent: "center", alignItems: "center",
    borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
  },
  chipOn: { backgroundColor: C.red, borderColor: C.red },
  chipText: { color: C.text, fontWeight: "700" },
  chipTextOn: { color: C.text },
});
