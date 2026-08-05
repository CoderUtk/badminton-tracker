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
import { C } from "../src/theme";

/** Default club-night slot: 6:00 PM on the chosen day, as minutes-since-midnight. */
const DEFAULT_TIME_MINUTES = 18 * 60;

export default function NewSession() {
  const router = useRouter();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubId, setClubId] = useState<string | null>(null);
  const [location, setLocation] = useState("Badminton hall");
  const [courts, setCourts] = useState(1);
  const [day, setDay] = useState<Date>(() => startOfDay(new Date()));
  const [showCalendar, setShowCalendar] = useState(false);
  const [timeMinutes, setTimeMinutes] = useState(DEFAULT_TIME_MINUTES);
  const [saving, setSaving] = useState(false);

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
            <Pressable
              style={[s.chip, sameDay(day, today) && !showCalendar && s.chipOn]}
              onPress={() => { setDay(today); setShowCalendar(false); }}
            >
              <Text style={s.chipText}>Today</Text>
            </Pressable>
            <Pressable
              style={[s.chip, sameDay(day, tomorrow) && !showCalendar && s.chipOn]}
              onPress={() => { setDay(tomorrow); setShowCalendar(false); }}
            >
              <Text style={s.chipText}>Tomorrow</Text>
            </Pressable>
            <Pressable
              style={[s.chip, (showCalendar || (!sameDay(day, today) && !sameDay(day, tomorrow))) && s.chipOn]}
              onPress={() => setShowCalendar((v) => !v)}
            >
              <Text style={s.chipText}>Pick a date</Text>
            </Pressable>
          </View>
          {showCalendar && (
            <DatePicker value={day} onChange={(d) => { setDay(d); setShowCalendar(false); }} />
          )}
          <Text style={s.hint}>
            {day.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
          </Text>
          <Text style={s.label}>Time</Text>
          <TimePicker value={timeMinutes} onChange={setTimeMinutes} />
          <Text style={s.label}>Courts</Text>
          <Stepper value={courts} min={1} max={8} onChange={setCourts} />
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
});
