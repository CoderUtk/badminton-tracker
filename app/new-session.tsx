import React, { useEffect, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { toast } from "../src/lib/toast";
import { useRouter } from "expo-router";
import { listRealClubs, type Club } from "../src/repos/clubRepo";
import { createSession } from "../src/repos/sessionRepo";
import DatePicker, { startOfDay } from "../src/components/DatePicker";
import BusyButton from "../src/components/BusyButton";
import FormScreen from "../src/components/FormScreen";
import { C } from "../src/theme";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";

/** Default club-night slot: 6:00 PM on the chosen day, as minutes-since-midnight. */
const DEFAULT_TIME_MINUTES = 18 * 60;

/** "6:00 PM", "11:30 AM", etc. from minutes-since-midnight. */
function formatTime(minutes: number): string {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const period = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute.toString().padStart(2, "0")} ${period}`;
}

export default function NewSession() {
  const router = useRouter();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubId, setClubId] = useState<string | null>(null);
  const [location, setLocation] = useState("Badminton hall");
  const [courts, setCourts] = useState(2);
  const [day, setDay] = useState<Date>(() => startOfDay(new Date()));
  const [timeMinutes, setTimeMinutes] = useState(DEFAULT_TIME_MINUTES);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void listRealClubs().then((items) => {
      const adminClubs = items.filter((c) => c.role === "owner" || c.role === "admin");
      setClubs(adminClubs);
      setClubId(adminClubs[0]?.id ?? null);
    });
  }, []);

  const timeAsDate = () => {
    const d = new Date(day);
    d.setHours(Math.floor(timeMinutes / 60), timeMinutes % 60, 0, 0);
    return d;
  };

  const onTimeChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setTimePickerOpen(false);
    if (event.type === "dismissed" || !selected) return;
    setTimeMinutes(selected.getHours() * 60 + selected.getMinutes());
  };

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
      const id = await createSession({ clubId, startsAt, location, courts });
      router.replace(`/(app)/sessions/${id}`);
    } catch (e) {
      toast((e as Error).message || "Could not create session", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormScreen contentContainerStyle={s.content}>
      <Text style={s.intro}>Set up the court night. Players can check in from the session screen.</Text>
      {clubs.length === 0 ? (
        <Text style={s.hint}>You need to be an admin of a club to plan a session.</Text>
      ) : (
        <>
          <Text style={s.label}>Club</Text>
          <View style={s.chips}>
            {clubs.map((club) => (
              <Pressable key={club.id} style={[s.chip, club.id === clubId && s.chipOn]} onPress={() => setClubId(club.id)}>
                <Text style={s.chipText}>{club.name}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.label}>Where</Text>
          <TextInput style={s.input} value={location} onChangeText={setLocation} placeholder="Venue" placeholderTextColor={C.text2} />
          <Text style={s.label}>When</Text>
          <View style={s.chips}>
            <Pressable style={[s.chip, sameDay(day, today) && s.chipOn]} onPress={() => setDay(today)}>
              <Text style={s.chipText}>Today</Text>
            </Pressable>
            <Pressable style={[s.chip, sameDay(day, tomorrow) && s.chipOn]} onPress={() => setDay(tomorrow)}>
              <Text style={s.chipText}>Tomorrow</Text>
            </Pressable>
          </View>
          <DatePicker value={day} onChange={setDay} />
          <Text style={s.hint}>
            {day.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
          </Text>
          <Text style={s.label}>Time</Text>
          <Pressable style={s.input} onPress={() => setTimePickerOpen(true)}>
            <Text style={s.timeText}>{formatTime(timeMinutes)}</Text>
          </Pressable>
          {timePickerOpen && Platform.OS === "android" && (
            <DateTimePicker mode="time" display="default" value={timeAsDate()} onChange={onTimeChange} />
          )}
          {Platform.OS === "ios" && (
            <Modal visible={timePickerOpen} transparent animationType="fade" onRequestClose={() => setTimePickerOpen(false)}>
              <Pressable style={s.sheetScrim} onPress={() => setTimePickerOpen(false)}>
                <Pressable style={s.sheet} onPress={() => {}}>
                  <DateTimePicker mode="time" display="spinner" value={timeAsDate()} onChange={onTimeChange} />
                  <Pressable style={s.sheetDone} onPress={() => setTimePickerOpen(false)}>
                    <Text style={s.sheetDoneText}>Done</Text>
                  </Pressable>
                </Pressable>
              </Pressable>
            </Modal>
          )}
          <Text style={s.label}>Courts</Text>
          <View style={s.chips}>
            {[1, 2, 3, 4].map((n) => (
              <Pressable key={n} style={[s.chip, courts === n && s.chipOn]} onPress={() => setCourts(n)}>
                <Text style={s.chipText}>{n}</Text>
              </Pressable>
            ))}
          </View>
          <BusyButton busy={saving} style={s.cta} onPress={save}>
            <Text style={s.ctaText}>Create session</Text>
          </BusyButton>
        </>
      )}
    </FormScreen>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg }, content: { padding: 16, gap: 10 },
  intro: { color: C.text2, fontSize: 15, lineHeight: 22, marginBottom: 8 },
  label: { color: C.text, fontSize: 16, fontWeight: "800", marginTop: 5 },
  input: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, color: C.text, paddingHorizontal: 14, fontSize: 16 },
  hint: { color: C.text2, fontSize: 12, lineHeight: 17 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minWidth: 54, minHeight: 42, paddingHorizontal: 14, justifyContent: "center", alignItems: "center", borderRadius: 21, backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  chipOn: { backgroundColor: C.red, borderColor: C.red }, chipText: { color: C.text, fontWeight: "700" },
  cta: { minHeight: 56, marginTop: 18, borderRadius: 14, backgroundColor: C.red, alignItems: "center", justifyContent: "center" }, ctaText: { color: C.text, fontSize: 18, fontWeight: "900" },
  timeText: { color: C.text, fontSize: 16, lineHeight: 52 },
  sheetScrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 },
  sheetDone: { marginTop: 8, alignItems: "center", paddingVertical: 12 },
  sheetDoneText: { color: C.red, fontSize: 16, fontWeight: "800" },
});
