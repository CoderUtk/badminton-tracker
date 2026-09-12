import React, { useEffect, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { C, F } from "../theme";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1–12
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 00,05,…,55
const PERIODS = ["AM", "PM"] as const;
const ITEM_HEIGHT = 40; // s.item minHeight (36) + vertical margin (2+2)
const COLUMN_HEIGHT = 140; // s.column maxHeight

function toParts(minutes: number): { hour12: number; minute: number; period: "AM" | "PM" } {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const period: "AM" | "PM" = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, minute, period };
}

function toMinutes(hour12: number, minute: number, period: "AM" | "PM"): number {
  const hour24 = period === "AM" ? (hour12 % 12) : (hour12 % 12) + 12;
  return hour24 * 60 + minute;
}

function Column<T extends number | string>({
  items,
  selected,
  onSelect,
  format,
}: {
  items: readonly T[];
  selected: T;
  onSelect: (v: T) => void;
  format: (v: T) => string;
}) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const index = items.indexOf(selected);
    if (index < 0) return;
    const y = Math.max(0, index * ITEM_HEIGHT - (COLUMN_HEIGHT / 2 - ITEM_HEIGHT / 2));
    scrollRef.current?.scrollTo({ y, animated: false });
    // Scroll to the selected value once on open only — not on every selection change,
    // otherwise picking a new value would yank the list back to itself mid-tap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScrollView ref={scrollRef} style={s.column} nestedScrollEnabled showsVerticalScrollIndicator={false}>
      {items.map((item) => (
        <Pressable accessibilityRole="button"
          key={String(item)}
          style={[s.item, item === selected && s.itemOn]}
          onPress={() => onSelect(item)}
        >
          <Text style={[s.itemText, item === selected && s.itemTextOn]}>{format(item)}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/**
 * Simple three-column time picker: hour / minute / AM-PM.
 * Pure RN, no native module — works in Expo Go offline, matches DatePicker.
 */
export default function TimePicker({
  value,
  onChange,
}: {
  value: number; // minutes since midnight
  onChange: (minutes: number) => void;
}) {
  const { hour12, minute, period } = toParts(value);
  const nearestMinute = MINUTES.reduce((a, b) => (Math.abs(b - minute) < Math.abs(a - minute) ? b : a));

  return (
    <View style={s.row}>
      <Column items={HOURS} selected={hour12} onSelect={(h) => onChange(toMinutes(h, nearestMinute, period))} format={(h) => String(h)} />
      <Text style={s.colon}>:</Text>
      <Column items={MINUTES} selected={nearestMinute} onSelect={(m) => onChange(toMinutes(hour12, m, period))} format={(m) => m.toString().padStart(2, "0")} />
      <Column items={PERIODS} selected={period} onSelect={(p) => onChange(toMinutes(hour12, nearestMinute, p))} format={(p) => p} />
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", gap: 6, padding: 8,
    backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line,
  },
  column: { flex: 1, maxHeight: 140 },
  colon: { color: C.text2, fontSize: 16, fontFamily: F.bold },
  item: {
    minHeight: 36, justifyContent: "center", alignItems: "center",
    borderRadius: 10, marginVertical: 2,
  },
  itemOn: { backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.lineHi },
  itemText: { color: C.text, fontFamily: F.bold, fontSize: 14 },
  itemTextOn: { color: C.text },
});
