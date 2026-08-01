import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { toast } from "../src/lib/toast";
import { useRouter } from "expo-router";
import { listClubs, type Club } from "../src/repos/clubRepo";
import { createSession } from "../src/repos/sessionRepo";
import DatePicker, { startOfDay } from "../src/components/DatePicker";
import FormScreen from "../src/components/FormScreen";
import { C } from "../src/theme";

/** Default club-night slot: 6:00 PM on the chosen day. */
const SLOT_HOUR = 18;

export default function NewSession() {
  const router = useRouter();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubId, setClubId] = useState<string | null>(null);
  const [location, setLocation] = useState("Badminton hall");
  const [courts, setCourts] = useState(2);
  const [day, setDay] = useState<Date>(() => startOfDay(new Date()));

  useEffect(() => {
    void listClubs().then((items) => {
      setClubs(items);
      setClubId(items[0]?.id ?? null);
    });
  }, []);

  const today = startOfDay(new Date());
  const tomorrow = startOfDay(new Date(Date.now() + 86400000));
  const sameDay = (a: Date, b: Date) => a.getTime() === b.getTime();

  const save = async () => {
    if (!clubId) { toast("Create or select a club before planning a session.", "info"); return; }
    const startsAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), SLOT_HOUR).getTime();
    const id = await createSession({ clubId, startsAt, location, courts });
    router.replace(`/(app)/sessions/${id}`);
  };

  return (
    <FormScreen contentContainerStyle={s.content}>
      <Text style={s.intro}>Set up the court night. Players can check in from the session screen.</Text>
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
        {day.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })} · from 6:00 PM
      </Text>
      <Text style={s.label}>Courts</Text>
      <View style={s.chips}>
        {[1, 2, 3, 4].map((n) => (
          <Pressable key={n} style={[s.chip, courts === n && s.chipOn]} onPress={() => setCourts(n)}>
            <Text style={s.chipText}>{n}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={s.cta} onPress={save}><Text style={s.ctaText}>Create session</Text></Pressable>
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
