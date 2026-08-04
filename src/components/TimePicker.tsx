import React, { useEffect, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { C } from "../theme";

const START_MINUTES = 6 * 60; // 6:00 AM
const END_MINUTES = 23 * 60; // 11:00 PM
const STEP_MINUTES = 30;
const CHIP_WIDTH = 78; // s.chip width + gap, used to scroll the selected chip into view

const SLOTS: number[] = [];
for (let m = START_MINUTES; m <= END_MINUTES; m += STEP_MINUTES) SLOTS.push(m);

/** "6:00 AM", "6:30 PM", etc. from minutes-since-midnight. */
function formatSlot(minutes: number): string {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const period = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute.toString().padStart(2, "0")} ${period}`;
}

/**
 * Half-hour time-of-day chips, 6:00 AM–11:00 PM, scrolling horizontally
 * rather than wrapping — 35 slots wrapped would produce a very tall block.
 * Pure RN, no native module, so it works in Expo Go offline like DatePicker.
 */
export default function TimePicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (minutes: number) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const index = SLOTS.indexOf(value);
    if (index < 0) return;
    // Center the selected chip roughly, so a 6 PM default well past the
    // 6 AM start of the row isn't hidden off-screen on first render.
    scrollRef.current?.scrollTo({ x: Math.max(0, index * CHIP_WIDTH - CHIP_WIDTH * 2), animated: false });
  }, []);

  return (
    <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
      {SLOTS.map((slot) => (
        <Pressable key={slot} style={[s.chip, slot === value && s.chipOn]} onPress={() => onChange(slot)}>
          <Text style={[s.chipText, slot === value && s.chipTextOn]}>{formatSlot(slot)}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row: { gap: 8, paddingVertical: 2 },
  chip: {
    minWidth: 70, minHeight: 42, paddingHorizontal: 14, justifyContent: "center", alignItems: "center",
    borderRadius: 21, backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
  },
  chipOn: { backgroundColor: C.red, borderColor: C.red },
  chipText: { color: C.text, fontWeight: "700" },
  chipTextOn: { color: C.text },
});
