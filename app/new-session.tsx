import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { toast } from "../src/lib/toast";
import { useRouter } from "expo-router";
import { listRealClubs, type Club } from "../src/repos/clubRepo";
import { createSession } from "../src/repos/sessionRepo";
import DatePicker, { startOfDay } from "../src/components/DatePicker";
import TimePicker from "../src/components/TimePicker";
import BusyButton from "../src/components/BusyButton";
import FormScreen from "../src/components/FormScreen";
import Stepper from "../src/components/Stepper";
import CalendarIcon from "../src/components/CalendarIcon";
import { useScreenInsets } from "../src/hooks/useScreenInsets";
import { C } from "../src/theme";

/** Default club-night slot: 6:00 PM on the chosen day, as minutes-since-midnight. */
const DEFAULT_TIME_MINUTES = 18 * 60;

/** "6:00 PM" from minutes-since-midnight. */
function formatTime(minutes: number): string {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const period = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute.toString().padStart(2, "0")} ${period}`;
}

export default function NewSession() {
  const router = useRouter();
  const { ctaPadding } = useScreenInsets();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubId, setClubId] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [courts, setCourts] = useState(1);
  const [day, setDay] = useState<Date>(() => startOfDay(new Date()));
  const [timeMinutes, setTimeMinutes] = useState(DEFAULT_TIME_MINUTES);
  const [saving, setSaving] = useState(false);
  // Mutually-exclusive accordions: at most one of club list / calendar / time picker open at a time.
  const [openPanel, setOpenPanel] = useState<"club" | "calendar" | "time" | null>(null);
  const togglePanel = (panel: "club" | "calendar" | "time") =>
    setOpenPanel((v) => (v === panel ? null : panel));

  useEffect(() => {
    void listRealClubs().then((items) => {
      const adminClubs = items.filter((c) => c.role === "owner" || c.role === "admin");
      setClubs(adminClubs);
      setClubId(adminClubs[0]?.id ?? null);
    });
  }, []);

  const today = startOfDay(new Date());
  const tomorrow = startOfDay(new Date(Date.now() + 86400000));
  const sameDay = (a: Date, b: Date) => a.getTime() === b.getTime();

  const save = async () => {
    if (!clubId) { toast("Create or select a club before planning a session.", "info"); return; }
    setSaving(true);
    try {
      const hour = Math.floor(timeMinutes / 60);
      const minute = timeMinutes % 60;
      const startsAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute).getTime();
      const id = await createSession({ clubId, startsAt, location: location.trim() || "Badminton hall", courts });
      router.replace(`/(app)/sessions/${id}`);
    } catch (e) {
      toast((e as Error).message || "Could not create session", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormScreen contentContainerStyle={[s.content, { paddingBottom: ctaPadding }]}>
      <Text style={s.intro}>Set up the court night. Players can check in from the session screen.</Text>
      {clubs.length === 0 ? (
        <Text style={s.hint}>You need to be an admin of a club to plan a session.</Text>
      ) : (
        <>
          <Text style={s.label}>Club</Text>
          <Pressable style={s.dropdown} onPress={() => togglePanel("club")}>
            <Text style={s.dropdownText}>{clubs.find((c) => c.id === clubId)?.name ?? "Select a club"}</Text>
            <Text style={[s.dropdownChevron, openPanel === "club" && s.dropdownChevronOpen]}>⌄</Text>
          </Pressable>
          {openPanel === "club" && (
            <View style={s.dropdownList}>
              {clubs.map((club) => (
                <Pressable
                  key={club.id}
                  style={[s.dropdownItem, club.id === clubId && s.dropdownItemOn]}
                  onPress={() => { setClubId(club.id); setOpenPanel(null); }}
                >
                  <Text style={[s.dropdownItemText, club.id === clubId && s.dropdownItemTextOn]}>{club.name}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <View style={s.whereRow}>
            <View style={s.whereInput}>
              <Text style={s.label}>Where</Text>
              <TextInput style={s.input} value={location} onChangeText={setLocation} placeholder="Badminton hall" placeholderTextColor={C.text2} />
            </View>
            <View>
              <Text style={s.label}>Courts</Text>
              <Stepper value={courts} min={1} max={8} onChange={setCourts} />
            </View>
          </View>
          <Text style={s.label}>When</Text>
          <View style={s.chips}>
            <Pressable
              style={[s.chip, sameDay(day, today) && openPanel !== "calendar" && s.chipOn]}
              onPress={() => { setDay(today); setOpenPanel(null); }}
            >
              <Text style={s.chipText}>Today</Text>
            </Pressable>
            <Pressable
              style={[s.chip, sameDay(day, tomorrow) && openPanel !== "calendar" && s.chipOn]}
              onPress={() => { setDay(tomorrow); setOpenPanel(null); }}
            >
              <Text style={s.chipText}>Tomorrow</Text>
            </Pressable>
            <Pressable
              style={[s.chip, s.iconChip, (openPanel === "calendar" || (!sameDay(day, today) && !sameDay(day, tomorrow))) && s.chipOn]}
              onPress={() => togglePanel("calendar")}
              accessibilityLabel="Pick a date"
            >
              <CalendarIcon size={16} color={C.text} />
            </Pressable>
            <Pressable style={[s.chip, openPanel === "time" && s.chipOn]} onPress={() => togglePanel("time")}>
              <Text style={s.chipText}>{formatTime(timeMinutes)}</Text>
            </Pressable>
          </View>
          {openPanel === "calendar" && (
            <DatePicker value={day} onChange={(d) => { setDay(d); setOpenPanel(null); }} />
          )}
          <Text style={s.hint}>
            {day.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
          </Text>
          {openPanel === "time" && <TimePicker value={timeMinutes} onChange={setTimeMinutes} />}
          <BusyButton busy={saving} style={s.cta} onPress={save}>
            <Text style={s.ctaText}>Create session</Text>
          </BusyButton>
        </>
      )}
    </FormScreen>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 }, content: { padding: 16, gap: 10 },
  intro: { color: C.text2, fontSize: 15, lineHeight: 22, marginBottom: 8 },
  label: { color: C.text, fontSize: 16, fontWeight: "800", marginTop: 5 },
  input: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, color: C.text, paddingHorizontal: 14, fontSize: 16 },
  hint: { color: C.text2, fontSize: 12, lineHeight: 17 },
  dropdown: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dropdownText: { color: C.text, fontSize: 16, fontWeight: "700" },
  dropdownChevron: { color: C.text2, fontSize: 16, fontWeight: "800" },
  dropdownChevronOpen: { transform: [{ rotate: "180deg" }] },
  dropdownList: { borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, overflow: "hidden" },
  dropdownItem: { minHeight: 46, paddingHorizontal: 14, justifyContent: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  dropdownItemOn: { backgroundColor: C.cardHi },
  dropdownItemText: { color: C.text, fontSize: 15, fontWeight: "600" },
  dropdownItemTextOn: { color: C.red, fontWeight: "800" },
  whereRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  whereInput: { flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minWidth: 54, minHeight: 42, paddingHorizontal: 14, justifyContent: "center", alignItems: "center", borderRadius: 21, backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  iconChip: { minWidth: 42, paddingHorizontal: 10 },
  chipOn: { backgroundColor: C.cardHi, borderColor: C.lineHi }, chipText: { color: C.text, fontWeight: "700" },
  cta: { minHeight: 56, marginTop: 18, borderRadius: 14, backgroundColor: C.red, alignItems: "center", justifyContent: "center" }, ctaText: { color: C.text, fontSize: 18, fontWeight: "900" },
});
