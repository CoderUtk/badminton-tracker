import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { C, F } from "../theme";

/** Strip a date to local midnight (date-only comparisons). */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

/**
 * Compact month calendar. Date-only selection; days before `min` are disabled.
 * No native module — pure RN so it works in Expo Go offline.
 */
export default function DatePicker({
  value,
  onChange,
  min = startOfDay(new Date()),
}: {
  value: Date;
  onChange: (d: Date) => void;
  min?: Date;
}) {
  const [view, setView] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const minTime = startOfDay(min).getTime();
  const selTime = startOfDay(value).getTime();

  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const shift = (delta: number) => setView(new Date(year, month + delta, 1));

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Pressable accessibilityRole="button" style={s.nav} onPress={() => shift(-1)} hitSlop={8}><Text style={s.navText}>‹</Text></Pressable>
        <Text style={s.month}>{MONTHS[month]} {year}</Text>
        <Pressable accessibilityRole="button" style={s.nav} onPress={() => shift(1)} hitSlop={8}><Text style={s.navText}>›</Text></Pressable>
      </View>
      <View style={s.grid}>
        {WEEKDAYS.map((d, i) => (
          <View key={`h${i}`} style={s.cell}><Text style={s.weekday}>{d}</Text></View>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <View key={`e${i}`} style={s.cell} />;
          const t = new Date(year, month, day).getTime();
          const disabled = t < minTime;
          const selected = t === selTime;
          return (
            <Pressable accessibilityRole="button"
              key={`d${i}`}
              style={s.cell}
              disabled={disabled}
              onPress={() => onChange(new Date(year, month, day))}
            >
              <View style={[s.day, selected && s.daySel]}>
                <Text style={[s.dayText, disabled && s.dayDisabled, selected && s.daySelText]}>{day}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 10 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 6, paddingVertical: 4 },
  nav: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: C.cardHi },
  navText: { color: C.text, fontSize: 22, fontFamily: F.bold, lineHeight: 24 },
  month: { color: C.text, fontSize: 16, fontFamily: F.bold },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  weekday: { color: C.text2, fontSize: 12, fontFamily: F.bold },
  day: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  daySel: { backgroundColor: C.red },
  dayText: { color: C.text, fontSize: 15, fontFamily: F.bold },
  dayDisabled: { color: "#4A4A4A" },
  daySelText: { color: C.text },
});
