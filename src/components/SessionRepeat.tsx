import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import CarvedCard from "./CarvedCard";
import Icon from "./Icon";
import { setSessionRepeat, type ClubSession } from "../repos/sessionRepo";
import { toast } from "../lib/toast";
import { C, F, MIN_TOUCH, space } from "../theme";

/**
 * Organiser control for a weekly club night. Same CarvedCard shell and
 * toast-on-failure handling as SessionOpenJoin.
 *
 * The flag is on the occurrence, not on a separate template: the cron job in
 * 0050 clones the night that just finished into next week and carries the flag
 * with it. So "repeat weekly" on a future occurrence is also how you end the
 * series — turn it off there and nothing further is generated.
 *
 * Shown to the organiser only. A member seeing "repeats weekly" on a night
 * they cannot change is a promise the app has no way to let them keep.
 */
export default function SessionRepeat({
  session, canManage, onChanged,
}: {
  session: ClubSession;
  canManage: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  if (!canManage) return null;

  const on = session.repeat_weekly;

  const toggle = async () => {
    setSaving(true);
    try {
      await setSessionRepeat(session.id, !on);
      await onChanged();
    } catch (e) {
      toast((e as Error).message || "Could not change the repeat setting", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <CarvedCard style={s.card}>
      <View style={s.head}>
        <Icon name="calendar-outline" color={C.accent} size={18} />
        <Text style={s.headText}>REPEAT</Text>
      </View>
      {on && (
        <Text style={s.meta}>
          Next week&apos;s night is created the morning after this one is played.
        </Text>
      )}
      <Pressable
        style={[s.toggleRow, saving && s.dim]}
        disabled={saving}
        onPress={() => void toggle()}
        accessibilityRole="switch"
        accessibilityState={{ checked: on, disabled: saving }}
        accessibilityLabel={on ? "Stop repeating this session weekly" : "Repeat this session weekly"}
      >
        <Icon name={on ? "close" : "calendar-outline"} color={C.text2} size={17} />
        <Text style={s.toggleText}>{on ? "Stop repeating" : "Repeat weekly"}</Text>
      </Pressable>
    </CarvedCard>
  );
}

const s = StyleSheet.create({
  card: { padding: space.md, gap: space.sm, marginTop: space.sm },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  headText: { flex: 1, color: C.text, fontFamily: F.semibold, fontSize: 13, letterSpacing: 1 },
  meta: { color: C.text2, fontFamily: F.body, fontSize: 12 },
  toggleRow: {
    flexDirection: "row", gap: space.sm, minHeight: MIN_TOUCH, alignItems: "center",
    paddingHorizontal: space.xs,
  },
  dim: { opacity: 0.6 },
  toggleText: { color: C.text2, fontFamily: F.medium, fontSize: 14 },
});
